"use client";

// INVENTORY - how many of each part and fluid are on the shelf.
//   - Count tiles: tracked, low, out, on the parts list
//   - Table: Part #, Description, Mfr, On hand, Reorder at, Status
//   - Type a new On hand or Reorder at number; it saves when you leave the box
//   - Stock comes out automatically when a service or repair is saved,
//     and goes back if that entry is deleted (the database does this)
//   - "Order low stock" starts an order with every LOW and OUT part

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, CatalogPart, InventoryItem, partKey } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { STOCK_STYLE, isFluid, stockStatus } from "@/lib/parts";
import type { Key } from "@/lib/i18n";
import { AppPage, ErrorText, Loading, Modal, btnOutline, btnPrimary, cardCls, inputCls } from "@/components/ui";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";

type Row = InventoryItem & { parts_catalog: CatalogPart | null };

const STATUS_KEY: Record<string, Key> = { ok: "stock_ok", low: "stock_low", out: "stock_out" };

export default function InventoryPage() {
  return (
    <AppPage wide>
      <Inventory />
    </AppPage>
  );
}

function Inventory() {
  const { farm, t } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [catalog, setCatalog] = useState<CatalogPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [inv, cat] = await Promise.all([
      supabase.from("inventory").select("*, parts_catalog(*)"),
      supabase.from("parts_catalog").select("*").order("part_key"),
    ]);
    setRows(sortRows((inv.data as Row[]) || []));
    setCatalog((cat.data as CatalogPart[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const key = partKey(search);
    if (!q) return rows;
    return rows.filter(({ parts_catalog: p }) =>
      p
        ? (key && p.part_key.includes(key)) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.manufacturer || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q)
        : false
    );
  }, [rows, search]);

  async function update(row: Row, change: Partial<Pick<InventoryItem, "on_hand" | "reorder_at">>) {
    setMessage("");
    const { error } = await supabase.from("inventory").update(change).eq("id", row.id);
    if (error) return setMessage(error.message);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...change } : r)));
  }

  async function remove(row: Row) {
    if (!window.confirm(t("remove_from_inventory_confirm", { part: row.parts_catalog?.part_number || "" }))) return;
    const { error } = await supabase.from("inventory").delete().eq("id", row.id);
    if (error) return setMessage(error.message);
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  }

  async function track(p: CatalogPart) {
    setMessage("");
    const { data, error } = await supabase
      .from("inventory")
      .insert({ farm_id: farm!.id, part_id: p.id, on_hand: 0, reorder_at: null })
      .select("*, parts_catalog(*)")
      .single();
    if (error && error.code !== "23505") return setMessage(error.message);
    if (data) setRows((rs) => sortRows([...rs, data as Row]));
  }

  if (loading) return <Loading />;

  const low = rows.filter((r) => stockStatus(r) === "low").length;
  const out = rows.filter((r) => stockStatus(r) === "out").length;
  const tiles: { label: Key; value: number; color: string }[] = [
    { label: "stat_tracked", value: rows.length, color: "text-safety" },
    { label: "stat_low", value: low, color: low ? "text-cautionInk" : "text-[#1F7A3E]" },
    { label: "stat_out", value: out, color: out ? "text-danger" : "text-[#1F7A3E]" },
    { label: "stat_catalog", value: catalog.filter((p) => !p.is_hidden).length, color: "text-faded" },
  ];

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={cardCls}>
            <p className="text-xs font-medium uppercase tracking-wide text-faded">{t(tile.label)}</p>
            <p className={`mt-1 font-mono text-3xl font-medium ${tile.color}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      <div className={cardCls}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">
            {t("inventory")} ({search ? `${shown.length} / ${rows.length}` : rows.length})
          </h1>
          <div className="flex flex-wrap gap-2">
            {low + out > 0 && (
              <Link href="/orders?low=1" className={`${btnOutline} flex items-center gap-1.5 py-2 text-sm`}>
                <ShoppingCart size={16} aria-hidden="true" /> {t("order_low", { n: low + out })}
              </Link>
            )}
            <button onClick={() => setPicking(true)} className={`${btnPrimary} flex items-center gap-1.5 py-2 text-sm`}>
              <Plus size={16} aria-hidden="true" /> {t("add_to_inventory")}
            </button>
          </div>
        </div>
        <p className="mb-3 text-sm text-faded">{t("inv_hint")}</p>

        <ErrorText>{message}</ErrorText>

        {rows.length > 0 && (
          <input
            type="search"
            className={`${inputCls} mb-3 bg-field`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search_parts_hint")}
          />
        )}

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-faded">{t("inv_empty")}</p>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-faded">{t("no_matches")}</p>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-seam text-left text-xs uppercase tracking-wide text-faded">
                  <th className="px-4 py-2 font-semibold">{t("part_number")}</th>
                  <th className="hidden px-2 py-2 font-semibold sm:table-cell">{t("description")}</th>
                  <th className="hidden px-2 py-2 font-semibold md:table-cell">{t("mfr")}</th>
                  <th className="px-2 py-2 font-semibold">{t("on_hand")}</th>
                  <th className="hidden px-2 py-2 font-semibold sm:table-cell">{t("reorder_at")}</th>
                  <th className="px-2 py-2 font-semibold">{t("status")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const p = r.parts_catalog;
                  const st = stockStatus(r);
                  return (
                    <tr key={r.id} className="border-b border-seam">
                      <td className="px-4 py-2">
                        <span className="whitespace-nowrap font-mono font-semibold">{p?.part_number || "—"}</span>
                        <span className="block text-xs text-faded sm:hidden">
                          {p?.description}
                          {isFluid(p) ? ` (${p!.unit})` : ""}
                        </span>
                      </td>
                      <td className="hidden px-2 py-2 sm:table-cell">
                        {p?.description || "—"}
                        {isFluid(p) && <span className="ml-1 text-faded">({p!.unit})</span>}
                      </td>
                      <td className="hidden px-2 py-2 md:table-cell">
                        {p?.manufacturer ? (
                          <span className="rounded bg-tint px-1.5 py-0.5 font-mono text-[11px] font-semibold text-safety">
                            {p.manufacturer}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <NumberBox
                          value={Number(r.on_hand)}
                          label={`${p?.part_number} ${t("on_hand")}`}
                          onCommit={(v) => update(r, { on_hand: v ?? 0 })}
                        />
                      </td>
                      <td className="hidden px-2 py-2 sm:table-cell">
                        <NumberBox
                          value={r.reorder_at === null ? null : Number(r.reorder_at)}
                          label={`${p?.part_number} ${t("reorder_at")}`}
                          onCommit={(v) => update(r, { reorder_at: v })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${STOCK_STYLE[st]}`}>
                          {t(STATUS_KEY[st])}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right sm:px-4">
                        <button
                          onClick={() => remove(r)}
                          aria-label={t("remove")}
                          className="rounded bg-dangerSoft p-1.5 text-danger hover:bg-danger hover:text-white"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {picking && (
        <TrackPicker
          catalog={catalog}
          tracked={new Set(rows.map((r) => r.part_id))}
          onTrack={track}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

function sortRows(rs: Row[]): Row[] {
  return rs
    .slice()
    .sort((a, b) => (a.parts_catalog?.part_key || "").localeCompare(b.parts_catalog?.part_key || ""));
}

// A number box that saves when you leave it (or press Enter)
function NumberBox({
  value,
  label,
  onCommit,
}: {
  value: number | null;
  label: string;
  onCommit: (v: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);

  function commit() {
    const v = text.trim() === "" ? null : Number(text);
    if (v !== null && Number.isNaN(v)) return setText(value === null ? "" : String(value));
    if (v !== value) onCommit(v);
  }

  return (
    <input
      type="number"
      step="any"
      inputMode="decimal"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="w-20 rounded border border-seam bg-field px-2 py-1.5 text-center font-mono"
    />
  );
}

// Pick parts from the parts list to start tracking
function TrackPicker({
  catalog,
  tracked,
  onTrack,
  onClose,
}: {
  catalog: CatalogPart[];
  tracked: Set<string>;
  onTrack: (p: CatalogPart) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useSession();
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState("");

  const untracked = catalog.filter((p) => !p.is_hidden && !tracked.has(p.id));
  const q = search.trim().toLowerCase();
  const key = partKey(search);
  const list = q
    ? untracked.filter(
        (p) =>
          (key && p.part_key.includes(key)) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.manufacturer || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q)
      )
    : untracked;

  return (
    <Modal title={t("add_to_inventory")} onClose={onClose}>
      <p className="mb-3 text-sm text-faded">{t("inv_pick_hint")}</p>
      <input
        type="search"
        className={`${inputCls} mb-3`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("search_parts_hint")}
        autoFocus
      />
      {added && <p className="mb-2 text-sm font-semibold text-[#1F7A3E]">{added}</p>}
      {untracked.length === 0 ? (
        <p className="py-6 text-center text-sm text-faded">{t("inv_all_tracked")}</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-faded">{t("no_matches")}</p>
      ) : (
        <ul className="max-h-[50vh] divide-y divide-seam overflow-y-auto rounded-md border border-seam">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={async () => {
                  await onTrack(p);
                  setAdded(t("added_part", { part: p.part_number }));
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-field"
              >
                <span className="min-w-[6rem] font-mono text-sm font-semibold">{p.part_number}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {p.description}
                  {p.manufacturer ? ` — ${p.manufacturer}` : ""}
                </span>
                {p.category && <span className="shrink-0 text-xs text-faded">{p.category}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 text-right">
        <button onClick={onClose} className={btnOutline}>
          {t("done")}
        </button>
      </div>
    </Modal>
  );
}


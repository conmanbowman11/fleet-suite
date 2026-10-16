"use client";

// PARTS CATALOG - every part number once per farm.
// Parts are normally added while building kits, but they can be added,
// fixed, hidden, or deleted here. A part that's in a kit can be hidden
// but not deleted. Past log entries and orders keep their own copy of
// the part number, so history never changes.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, CatalogPart, partKey } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import {
  AppPage,
  ErrorText,
  Field,
  Loading,
  btnOutline,
  btnPrimary,
  btnQuiet,
  btnSecondary,
  cardCls,
  inputCls,
} from "@/components/ui";

export default function PartsPage() {
  return (
    <AppPage need="farm">
      <Catalog />
    </AppPage>
  );
}

function Catalog() {
  const { t } = useSession();
  const [parts, setParts] = useState<CatalogPart[]>([]);
  const [kitCounts, setKitCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const [cat, kits] = await Promise.all([
        supabase.from("parts_catalog").select("*").order("part_key"),
        supabase.from("kit_parts").select("part_id"),
      ]);
      const counts: Record<string, number> = {};
      for (const k of kits.data || []) counts[k.part_id] = (counts[k.part_id] || 0) + 1;
      setParts((cat.data as CatalogPart[]) || []);
      setKitCounts(counts);
      setLoading(false);
    })();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const key = partKey(search);
    return parts
      .filter((p) => showHidden || !p.is_hidden)
      .filter((p) => !q || (key && p.part_key.includes(key)) || (p.description || "").toLowerCase().includes(q));
  }, [parts, search, showHidden]);

  function upsert(p: CatalogPart) {
    setParts((ps) =>
      (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [...ps, p]).sort((a, b) =>
        a.part_key.localeCompare(b.part_key)
      )
    );
  }

  async function setHidden(p: CatalogPart, hidden: boolean) {
    const { data, error } = await supabase
      .from("parts_catalog")
      .update({ is_hidden: hidden })
      .eq("id", p.id)
      .select()
      .single();
    if (error) return setMessage(error.message);
    upsert(data as CatalogPart);
  }

  async function remove(p: CatalogPart) {
    setMessage("");
    if (!window.confirm(`${t("delete")} ${p.part_number}? ${t("cannot_undo")}`)) return;
    const { error } = await supabase.from("parts_catalog").delete().eq("id", p.id);
    if (error) return setMessage(error.code === "23503" ? t("in_use_hide") : error.message);
    setParts((ps) => ps.filter((x) => x.id !== p.id));
  }

  if (loading) return <Loading />;
  const hiddenCount = parts.filter((p) => p.is_hidden).length;

  return (
    <>
      <Link href="/settings" className={`${btnQuiet} mb-3 inline-block`}>
        ← {t("settings")}
      </Link>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {t("parts_catalog")} ({parts.length - hiddenCount})
        </h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className={`${btnPrimary} py-2 text-sm`}>
            + {t("add_part")}
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-faded">{t("parts_catalog_hint")}</p>
      <ErrorText>{message}</ErrorText>

      {adding && (
        <div className="mb-4">
          <PartForm
            onSaved={(p) => {
              upsert(p);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      <input
        type="search"
        className={`${inputCls} mb-3`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("search")}
      />

      <ul className={`${cardCls} divide-y divide-seam`}>
        {visible.length === 0 && <li className="py-3 text-sm text-faded">{t("no_matches")}</li>}
        {visible.map((p) =>
          editingId === p.id ? (
            <li key={p.id} className="py-2">
              <PartForm
                part={p}
                onSaved={(u) => {
                  upsert(u);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={p.id} className={"flex items-center gap-3 py-2 " + (p.is_hidden ? "opacity-50" : "")}>
              <span className="min-w-0 flex-1">
                <span className="font-mono font-semibold">{p.part_number}</span>
                <span className="block text-sm text-faded">
                  {p.description || "—"}
                  {kitCounts[p.id] ? ` · ${t("kit")}: ${kitCounts[p.id]}` : ""}
                  {p.is_hidden ? ` · ${t("hidden")}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 gap-3 text-sm">
                <button onClick={() => setEditingId(p.id)} className={btnQuiet}>
                  {t("edit")}
                </button>
                <button onClick={() => setHidden(p, !p.is_hidden)} className={btnQuiet}>
                  {p.is_hidden ? t("unhide") : t("hide")}
                </button>
                <button onClick={() => remove(p)} aria-label={t("delete")} className={`${btnQuiet} hover:text-safety`}>
                  ✕
                </button>
              </span>
            </li>
          )
        )}
      </ul>

      {hiddenCount > 0 && (
        <button onClick={() => setShowHidden(!showHidden)} className={`${btnQuiet} mt-3`}>
          {showHidden ? t("hide") : `${t("unhide")} (${hiddenCount})`}
        </button>
      )}
    </>
  );
}

function PartForm({
  part,
  onSaved,
  onCancel,
}: {
  part?: CatalogPart;
  onSaved: (p: CatalogPart) => void;
  onCancel: () => void;
}) {
  const { farm, t } = useSession();
  const [number, setNumber] = useState(part?.part_number ?? "");
  const [description, setDescription] = useState(part?.description ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!partKey(number)) return setMessage(t("required"));
    setBusy(true);
    const values = { part_number: number.trim(), description: description.trim() || null };
    const { data, error } = part
      ? await supabase.from("parts_catalog").update(values).eq("id", part.id).select().single()
      : await supabase.from("parts_catalog").insert({ ...values, farm_id: farm!.id }).select().single();
    setBusy(false);
    if (error) return setMessage(error.code === "23505" ? t("part_taken") : error.message);
    onSaved(data as CatalogPart);
  }

  return (
    <form onSubmit={save} className={`${cardCls} space-y-3 border-steel`}>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("part_number")}>
          <input
            className={inputCls}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <Field label={t("description")}>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <ErrorText>{message}</ErrorText>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`${btnSecondary} flex-1`}>
          {busy ? t("saving") : t("save")}
        </button>
        <button type="button" onClick={onCancel} className={btnOutline}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

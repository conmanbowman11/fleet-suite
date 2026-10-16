"use client";

// PARTS LIST - every part and fluid the farm uses, once each.
//   - Table: Part #, Description, Manufacturer, Category, Unit
//   - Search by part #, description, manufacturer, or category
//   - Tap a row to edit. Hide parts you no longer use, or delete one
//     that isn't used anywhere.
//   - Oil and other fluids are parts too, measured in gal or qt.
// PM templates pick only from this list. Past log entries and orders
// keep their own copy of the part number, so history never changes.

import { useEffect, useMemo, useState } from "react";
import { supabase, CatalogPart, partKey } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { CATEGORIES, MANUFACTURERS, UNITS, isFluid } from "@/lib/parts";
import {
  AppPage,
  ErrorText,
  Field,
  Loading,
  Modal,
  btnOutline,
  btnPrimary,
  btnQuiet,
  cardCls,
  inputCls,
} from "@/components/ui";
import { Plus } from "lucide-react";

export default function PartsPage() {
  return (
    <AppPage wide>
      <PartsList />
    </AppPage>
  );
}

function PartsList() {
  const { t } = useSession();
  const [parts, setParts] = useState<CatalogPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [form, setForm] = useState<CatalogPart | "new" | null>(null);

  useEffect(() => {
    supabase
      .from("parts_catalog")
      .select("*")
      .order("part_key")
      .then(({ data }) => {
        setParts((data as CatalogPart[]) || []);
        setLoading(false);
      });
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const key = partKey(search);
    return parts
      .filter((p) => showHidden || !p.is_hidden)
      .filter(
        (p) =>
          !q ||
          (key && p.part_key.includes(key)) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.manufacturer || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q)
      );
  }, [parts, search, showHidden]);

  function upsert(p: CatalogPart) {
    setParts((ps) =>
      (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [...ps, p]).sort((a, b) =>
        a.part_key.localeCompare(b.part_key)
      )
    );
  }

  if (loading) return <Loading />;
  const hiddenCount = parts.filter((p) => p.is_hidden).length;
  const total = parts.length - hiddenCount;

  return (
    <>
      <div className={cardCls}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">
            {t("parts_list")} ({search ? `${shown.length} / ${total}` : total})
          </h1>
          <button onClick={() => setForm("new")} className={`${btnPrimary} flex items-center gap-1.5 py-2 text-sm`}>
            <Plus size={16} aria-hidden="true" /> {t("add_part")}
          </button>
        </div>

        <input
          type="search"
          className={`${inputCls} mb-3 bg-field`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_parts_hint")}
        />

        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-faded">{parts.length ? t("no_matches") : t("no_kit")}</p>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-seam text-left text-xs uppercase tracking-wide text-faded">
                  <th className="px-4 py-2 font-semibold">{t("part_number")}</th>
                  <th className="px-2 py-2 font-semibold">{t("description")}</th>
                  <th className="px-2 py-2 font-semibold">{t("mfr")}</th>
                  <th className="hidden px-2 py-2 font-semibold md:table-cell">{t("category")}</th>
                  <th className="hidden px-2 py-2 font-semibold sm:table-cell">{t("unit")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setForm(p)}
                    className={"cursor-pointer border-b border-seam hover:bg-field " + (p.is_hidden ? "opacity-50" : "")}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono font-semibold">{p.part_number}</td>
                    <td className="px-2 py-2.5">
                      {p.description || "—"}
                      {p.is_hidden && <span className="ml-2 text-xs text-faded">({t("hidden")})</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      {p.manufacturer ? (
                        <span className="rounded bg-tint px-1.5 py-0.5 font-mono text-[11px] font-semibold text-safety">
                          {p.manufacturer}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="hidden px-2 py-2.5 text-faded md:table-cell">{p.category || "—"}</td>
                    <td className={"hidden px-2 py-2.5 sm:table-cell " + (isFluid(p) ? "font-semibold text-cautionInk" : "text-faded")}>
                      {p.unit || "each"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-sm font-semibold text-safety">{t("edit")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {hiddenCount > 0 && (
        <button onClick={() => setShowHidden(!showHidden)} className={`${btnQuiet} mt-3`}>
          {showHidden ? t("hide") : `${t("unhide")} (${hiddenCount})`}
        </button>
      )}

      {form && (
        <PartForm
          part={form === "new" ? undefined : form}
          onSaved={(p) => {
            upsert(p);
            setForm(null);
          }}
          onDeleted={(id) => {
            setParts((ps) => ps.filter((x) => x.id !== id));
            setForm(null);
          }}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

function PartForm({
  part,
  onSaved,
  onDeleted,
  onClose,
}: {
  part?: CatalogPart;
  onSaved: (p: CatalogPart) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const { farm, t } = useSession();
  const [number, setNumber] = useState(part?.part_number ?? "");
  const [description, setDescription] = useState(part?.description ?? "");
  const [manufacturer, setManufacturer] = useState(part?.manufacturer ?? "");
  const [category, setCategory] = useState(part?.category ?? "");
  const [unit, setUnit] = useState(part?.unit || "each");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!partKey(number)) return setMessage(`${t("part_number")}: ${t("required")}`);
    setBusy(true);
    const values = {
      part_number: number.trim(),
      description: description.trim() || null,
      manufacturer: manufacturer.trim() || null,
      category: category || null,
      unit: unit || "each",
    };
    const { data, error } = part
      ? await supabase.from("parts_catalog").update(values).eq("id", part.id).select().single()
      : await supabase.from("parts_catalog").insert({ ...values, farm_id: farm!.id }).select().single();
    setBusy(false);
    if (error) return setMessage(error.code === "23505" ? t("part_taken") : error.message);
    onSaved(data as CatalogPart);
  }

  async function setHidden(hidden: boolean) {
    if (!part) return;
    const { data, error } = await supabase
      .from("parts_catalog")
      .update({ is_hidden: hidden })
      .eq("id", part.id)
      .select()
      .single();
    if (error) return setMessage(error.message);
    onSaved(data as CatalogPart);
  }

  async function remove() {
    if (!part) return;
    setMessage("");
    if (!window.confirm(`${t("delete")} ${part.part_number}? ${t("cannot_undo")}`)) return;
    const { error } = await supabase.from("parts_catalog").delete().eq("id", part.id);
    if (error) return setMessage(error.code === "23503" ? t("in_use_hide") : error.message);
    onDeleted(part.id);
  }

  return (
    <Modal title={part ? t("edit_part") : t("add_part")} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("part_number")}>
            <input
              className={`${inputCls} font-mono`}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
          </Field>
          <Field label={t("manufacturer")}>
            <input
              className={inputCls}
              list="fs-manufacturers"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
            />
            <datalist id="fs-manufacturers">
              {MANUFACTURERS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label={t("description")}>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("category")}>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">—</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("unit")} hint={t("unit_hint")}>
            <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <ErrorText>{message}</ErrorText>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={busy} className={`${btnPrimary} flex-1`}>
            {busy ? t("saving") : t("save")}
          </button>
          <button type="button" onClick={onClose} className={btnOutline}>
            {t("cancel")}
          </button>
        </div>

        {part && (
          <div className="flex justify-end gap-4 border-t border-seam pt-3 text-sm">
            <button type="button" onClick={() => setHidden(!part.is_hidden)} className={btnQuiet}>
              {part.is_hidden ? t("unhide") : t("hide")}
            </button>
            <button type="button" onClick={remove} className={`${btnQuiet} hover:text-danger`}>
              {t("delete")}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

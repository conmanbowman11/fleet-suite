"use client";

// PART PICKER - search the farm's parts list and tap a part to use it.
// Typing searches part numbers (ignoring dashes, spaces, and capitals),
// descriptions, and manufacturers.
//   allowNew={false}  only parts already on the list (PM templates)
//   allowNew={true}   a part number that isn't on the list yet can be
//                     added on the spot (logging work). The database
//                     refuses duplicates even if two people try at once.

import { useMemo, useState } from "react";
import { supabase, CatalogPart, partKey } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { isFluid } from "@/lib/parts";
import { ErrorText, btnSecondary, inputCls } from "@/components/ui";

export default function PartPicker({
  catalog,
  onCatalogChange,
  onPick,
  placeholder,
  allowNew = true,
  autoFocus = false,
}: {
  catalog: CatalogPart[];
  onCatalogChange?: (part: CatalogPart) => void; // a part was added or un-hidden
  onPick: (part: CatalogPart) => void;
  placeholder?: string;
  allowNew?: boolean;
  autoFocus?: boolean;
}) {
  const { farm, t } = useSession();
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const key = partKey(text);
  const query = text.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!query) return [];
    return catalog
      .filter(
        (p) =>
          !p.is_hidden &&
          ((key && p.part_key.includes(key)) ||
            (p.description || "").toLowerCase().includes(query) ||
            (p.manufacturer || "").toLowerCase().includes(query))
      )
      .sort((a, b) => Number(b.part_key === key) - Number(a.part_key === key) || a.part_key.localeCompare(b.part_key))
      .slice(0, 10);
  }, [catalog, key, query]);

  const exact = catalog.find((p) => p.part_key === key && !p.is_hidden);

  function choose(p: CatalogPart) {
    onPick(p);
    setText("");
    setDescription("");
    setMessage("");
  }

  async function addNew() {
    if (!key) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase
      .from("parts_catalog")
      .insert({ farm_id: farm!.id, part_number: text.trim(), description: description.trim() || null })
      .select()
      .single();

    if (error && error.code === "23505") {
      // Already exists (maybe hidden, or just added on another device): use it
      const { data: existing } = await supabase.from("parts_catalog").select("*").eq("part_key", key).single();
      if (existing) {
        let part = existing as CatalogPart;
        if (part.is_hidden) {
          await supabase.from("parts_catalog").update({ is_hidden: false }).eq("id", part.id);
          part = { ...part, is_hidden: false };
        }
        onCatalogChange?.(part);
        choose(part);
      }
    } else if (error) {
      setMessage(error.message);
    } else {
      onCatalogChange?.(data as CatalogPart);
      choose(data as CatalogPart);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <input
        className={inputCls}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder || t("search_parts_list")}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
      />

      {query && (
        <div className="max-h-72 divide-y divide-seam overflow-y-auto rounded-md border border-seam bg-plate">
          {matches.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => choose(p)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-field"
            >
              <span className="min-w-[6rem] font-mono text-sm font-semibold">{p.part_number}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{p.description}</span>
              {isFluid(p) && <span className="text-xs text-cautionInk">{p.unit}</span>}
              {p.manufacturer && (
                <span className="shrink-0 rounded bg-tint px-1.5 py-0.5 font-mono text-[11px] font-semibold text-safety">
                  {p.manufacturer}
                </span>
              )}
            </button>
          ))}

          {matches.length === 0 && !allowNew && <p className="px-3 py-2 text-sm text-faded">{t("not_in_list")}</p>}

          {allowNew && !exact && key && (
            <div className="space-y-2 p-3">
              <p className="text-sm font-semibold">{t("part_new", { text: text.trim() })}</p>
              <input
                className={inputCls}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("description")}
              />
              <button type="button" disabled={busy} onClick={addNew} className={`${btnSecondary} w-full`}>
                {busy ? t("saving") : t("add_part")}
              </button>
            </div>
          )}
        </div>
      )}

      <ErrorText>{message}</ErrorText>
    </div>
  );
}

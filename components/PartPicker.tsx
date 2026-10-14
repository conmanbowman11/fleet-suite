"use client";

// PART PICKER - the guard against duplicate parts.
// Typing searches the catalog as you go (ignoring dashes, spaces, and
// capital letters). Tap an existing part to use it. Only a part number
// that isn't in the catalog yet can be added as new - and the database
// refuses duplicates even if two people try at once.

import { useMemo, useState } from "react";
import { supabase, CatalogPart, partKey } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { ErrorText, btnSecondary, inputCls } from "@/components/ui";

export default function PartPicker({
  catalog,
  onCatalogChange,
  onPick,
  placeholder,
}: {
  catalog: CatalogPart[];
  onCatalogChange: (part: CatalogPart) => void; // a part was added or un-hidden
  onPick: (part: CatalogPart) => void;
  placeholder?: string;
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
            (p.description || "").toLowerCase().includes(query))
      )
      .sort((a, b) => Number(b.part_key === key) - Number(a.part_key === key) || a.part_key.localeCompare(b.part_key))
      .slice(0, 8);
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
      const { data: existing } = await supabase
        .from("parts_catalog")
        .select("*")
        .eq("part_key", key)
        .single();
      if (existing) {
        let part = existing as CatalogPart;
        if (part.is_hidden) {
          await supabase.from("parts_catalog").update({ is_hidden: false }).eq("id", part.id);
          part = { ...part, is_hidden: false };
        }
        onCatalogChange(part);
        choose(part);
      }
    } else if (error) {
      setMessage(error.message);
    } else {
      onCatalogChange(data as CatalogPart);
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
        placeholder={placeholder || t("part_number")}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />

      {query && (
        <div className="divide-y divide-seam rounded border border-seam bg-plate">
          {matches.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => choose(p)}
              className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-field"
            >
              <span className="font-mono font-semibold">{p.part_number}</span>
              <span className="truncate text-sm text-faded">
                {p.description}
                {p.part_key === key ? ` · ${t("part_exists")}` : ""}
              </span>
            </button>
          ))}

          {!exact && key && (
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

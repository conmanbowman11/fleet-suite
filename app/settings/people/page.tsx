"use client";

// PEOPLE - the crew. Name, role, and language for each person.
//   Deactivate someone who left: they drop off "Who's working?" but their
//   name stays on everything they logged. Delete only works for someone
//   with no work on record.

import { useState } from "react";
import Link from "next/link";
import { supabase, Person } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import {
  AppPage,
  ErrorText,
  Field,
  btnOutline,
  btnPrimary,
  btnQuiet,
  btnSecondary,
  cardCls,
  inputCls,
  labelCls,
} from "@/components/ui";

export default function PeoplePage() {
  return (
    <AppPage need="farm">
      <PeopleList />
    </AppPage>
  );
}

function PeopleList() {
  const { people, t, refresh } = useSession();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const sorted = people
    .slice()
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));

  async function setActive(p: Person, active: boolean) {
    setMessage("");
    const { error } = await supabase.from("people").update({ is_active: active }).eq("id", p.id);
    if (error) return setMessage(error.message);
    await refresh();
  }

  async function remove(p: Person) {
    setMessage("");
    if (!window.confirm(`${t("delete")} ${p.name}? ${t("cannot_undo")}`)) return;
    const { error } = await supabase.from("people").delete().eq("id", p.id);
    if (error) {
      setMessage(error.code === "23503" ? t("person_has_history", { name: p.name }) : error.message);
      return;
    }
    await refresh();
  }

  return (
    <>
      <Link href="/settings" className={`${btnQuiet} mb-3 inline-block`}>
        ← {t("settings")}
      </Link>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("people")}</h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className={`${btnPrimary} py-2 text-sm`}>
            + {t("add_person")}
          </button>
        )}
      </div>

      <ErrorText>{message}</ErrorText>

      {adding && <PersonForm onDone={() => setAdding(false)} />}

      <ul className="space-y-2">
        {sorted.map((p) =>
          editingId === p.id ? (
            <li key={p.id}>
              <PersonForm person={p} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={p.id} className={`${cardCls} ${p.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <Link href={`/settings/people/${p.id}`} className="min-w-0">
                  <span className="block text-lg font-semibold underline decoration-seam">{p.name}</span>
                  <span className="block text-sm text-faded">
                    {t(p.role === "owner" ? "role_owner" : "role_mechanic")} ·{" "}
                    {t(p.language === "es" ? "lang_es" : "lang_en")}
                    {!p.is_active && ` · ${t("inactive")}`}
                  </span>
                </Link>
                <button onClick={() => setEditingId(p.id)} className={`${btnQuiet} shrink-0`}>
                  {t("edit")}
                </button>
              </div>
              <div className="mt-2 flex justify-end gap-4 border-t border-seam pt-2 text-sm">
                {p.is_active ? (
                  <button onClick={() => setActive(p, false)} className={btnQuiet}>
                    {t("deactivate")}
                  </button>
                ) : (
                  <button onClick={() => setActive(p, true)} className="font-bold text-steel">
                    {t("reactivate")}
                  </button>
                )}
                <button onClick={() => remove(p)} className={`${btnQuiet} hover:text-safety`}>
                  {t("delete")}
                </button>
              </div>
            </li>
          )
        )}
      </ul>
    </>
  );
}

function PersonForm({ person, onDone }: { person?: Person; onDone: () => void }) {
  const { farm, t, refresh } = useSession();
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState<Person["role"]>(person?.role ?? "mechanic");
  const [language, setLanguage] = useState<Person["language"]>(person?.language ?? "en");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMessage(t("name_required"));
    setBusy(true);
    const values = { name: name.trim(), role, language };
    const { error } = person
      ? await supabase.from("people").update(values).eq("id", person.id)
      : await supabase.from("people").insert({ ...values, farm_id: farm!.id });
    setBusy(false);
    if (error) return setMessage(error.message);
    await refresh();
    onDone();
  }

  function Choice<T extends string>({
    value,
    options,
    onChange,
  }: {
    value: T;
    options: { v: T; label: string }[];
    onChange: (v: T) => void;
  }) {
    return (
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            type="button"
            key={o.v}
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            className={
              "flex-1 rounded border p-3 font-bold " +
              (value === o.v ? "border-steel bg-steel text-white" : "border-seam bg-plate")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={save} className={`${cardCls} mb-3 space-y-3 border-steel`}>
      <Field label={t("name")}>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div>
        <span className={labelCls}>{t("role")}</span>
        <Choice
          value={role}
          onChange={(v) => setRole(v as Person["role"])}
          options={[
            { v: "mechanic", label: t("role_mechanic") },
            { v: "owner", label: t("role_owner") },
          ]}
        />
      </div>
      <div>
        <span className={labelCls}>{t("language")}</span>
        <Choice
          value={language}
          onChange={(v) => setLanguage(v as Person["language"])}
          options={[
            { v: "en", label: t("lang_en") },
            { v: "es", label: t("lang_es") },
          ]}
        />
      </div>
      <ErrorText>{message}</ErrorText>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`${btnSecondary} flex-1`}>
          {busy ? t("saving") : t("save")}
        </button>
        <button type="button" onClick={onDone} className={btnOutline}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

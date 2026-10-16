"use client";

// SERVICE NAMES - one spelling for every machine, with the Spanish.
//   Built-in names come translated and can't be changed here.
//   The farm's own names: add, edit English/Spanish, hide, or delete
//   (delete only if no machine uses the name).
//   Blank Spanish names stand out so none get missed during onboarding.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, ServiceName } from "@/lib/supabase";
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
  labelCls,
} from "@/components/ui";

type Category = "service" | "repair";

export default function NamesPage() {
  return (
    <AppPage need="farm">
      <NamesList />
    </AppPage>
  );
}

function NamesList() {
  const { t } = useSession();
  const [names, setNames] = useState<ServiceName[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase
      .from("service_names")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setNames((data as ServiceName[]) || []);
        setLoading(false);
      });
  }, []);

  async function setHidden(n: ServiceName, hidden: boolean) {
    const { error } = await supabase.from("service_names").update({ is_hidden: hidden }).eq("id", n.id);
    if (error) return setMessage(error.message);
    setNames((ns) => ns.map((x) => (x.id === n.id ? { ...x, is_hidden: hidden } : x)));
  }

  async function remove(n: ServiceName) {
    setMessage("");
    if (!window.confirm(`${t("delete")} "${n.name}"? ${t("cannot_undo")}`)) return;
    const { error } = await supabase.from("service_names").delete().eq("id", n.id);
    if (error) return setMessage(error.code === "23503" ? t("in_use_hide") : error.message);
    setNames((ns) => ns.filter((x) => x.id !== n.id));
  }

  if (loading) return <Loading />;

  const own = names.filter((n) => n.farm_id);
  const builtIn = names.filter((n) => !n.farm_id);

  function renderGroup(list: ServiceName[], editable: boolean) {
    return (["service", "repair"] as Category[]).map((cat) => {
      const items = list.filter((n) => n.category === cat);
      if (!items.length) return null;
      return (
        <div key={cat} className="mb-3">
          <p className="mb-1 text-xs text-faded">{t(cat === "service" ? "services" : "repairs")}</p>
          <ul className="divide-y divide-seam">
            {items.map((n) =>
              editable && editingId === n.id ? (
                <li key={n.id} className="py-2">
                  <NameForm
                    name={n}
                    onSaved={(u) => {
                      setNames((ns) => ns.map((x) => (x.id === u.id ? u : x)));
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={n.id} className={"grid grid-cols-2 gap-3 py-2 " + (n.is_hidden ? "opacity-50" : "")}>
                  <span className="font-semibold">
                    {n.name}
                    {n.is_hidden && <span className="ml-1 text-xs font-normal text-faded">({t("hidden")})</span>}
                  </span>
                  <span className="flex items-start justify-between gap-2">
                    {n.name_es ? (
                      <span>{n.name_es}</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 text-sm text-amber-800">—</span>
                    )}
                    {editable && (
                      <span className="flex shrink-0 gap-3 text-sm">
                        <button onClick={() => setEditingId(n.id)} className={btnQuiet}>
                          {t("edit")}
                        </button>
                        <button onClick={() => setHidden(n, !n.is_hidden)} className={btnQuiet}>
                          {n.is_hidden ? t("unhide") : t("hide")}
                        </button>
                        <button onClick={() => remove(n)} className={`${btnQuiet} hover:text-safety`}>
                          ✕
                        </button>
                      </span>
                    )}
                  </span>
                </li>
              )
            )}
          </ul>
        </div>
      );
    });
  }

  return (
    <>
      <Link href="/settings" className={`${btnQuiet} mb-3 inline-block`}>
        ← {t("settings")}
      </Link>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("service_names")}</h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className={`${btnPrimary} py-2 text-sm`}>
            + {t("add_name")}
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-faded">{t("service_names_hint")}</p>
      <ErrorText>{message}</ErrorText>

      {adding && (
        <div className="mb-4">
          <NameForm
            onSaved={(n) => {
              setNames((ns) => [...ns, n].sort((a, b) => a.name.localeCompare(b.name)));
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      <section className={`${cardCls} mb-4`}>
        <div className="mb-2 grid grid-cols-2 gap-3 text-xs font-semibold uppercase tracking-wider text-faded">
          <span>{t("name_english")}</span>
          <span>{t("name_spanish")}</span>
        </div>
        {own.length === 0 ? <p className="py-2 text-sm text-faded">{t("none")}</p> : renderGroup(own, true)}
      </section>

      <section className={cardCls}>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-faded">{t("builtin")}</h2>
        <p className="mb-3 text-xs text-faded">{t("builtin_note")}</p>
        {renderGroup(builtIn, false)}
      </section>
    </>
  );
}

function NameForm({
  name,
  onSaved,
  onCancel,
}: {
  name?: ServiceName;
  onSaved: (n: ServiceName) => void;
  onCancel: () => void;
}) {
  const { farm, t } = useSession();
  const [en, setEn] = useState(name?.name ?? "");
  const [es, setEs] = useState(name?.name_es ?? "");
  const [category, setCategory] = useState<Category>(name?.category ?? "service");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!en.trim()) return setMessage(t("name_required"));
    setBusy(true);
    const values = { name: en.trim(), name_es: es.trim() || null, category };
    const { data, error } = name
      ? await supabase.from("service_names").update(values).eq("id", name.id).select().single()
      : await supabase.from("service_names").insert({ ...values, farm_id: farm!.id }).select().single();
    setBusy(false);
    if (error) return setMessage(error.code === "23505" ? t("name_taken") : error.message);
    onSaved(data as ServiceName);
  }

  return (
    <form onSubmit={save} className={`${cardCls} space-y-3 border-steel`}>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("name_english")}>
          <input className={inputCls} value={en} onChange={(e) => setEn(e.target.value)} />
        </Field>
        <Field label={t("name_spanish")}>
          <input className={inputCls} value={es} onChange={(e) => setEs(e.target.value)} />
        </Field>
      </div>
      <div>
        <span className={labelCls}>{t("service")} / {t("repair")}</span>
        <div className="flex gap-2">
          {(["service", "repair"] as Category[]).map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={
                "flex-1 rounded border p-2 font-bold " +
                (category === c ? "border-steel bg-steel text-white" : "border-seam bg-plate")
              }
            >
              {t(c)}
            </button>
          ))}
        </div>
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

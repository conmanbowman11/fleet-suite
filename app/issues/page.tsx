"use client";

// ISSUES - every open problem across the fleet, urgent first.
//   Mark fixed: opens Log work for that machine; saving closes the issue
//               and links it to the repair entry
//   Edit or delete an issue
//   Show fixed: the history, each linked to the machine's log

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, Equipment, Issue } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { formatDate } from "@/lib/i18n";
import type { Key } from "@/lib/i18n";
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

const RANK = { urgent: 0, normal: 1, low: 2 } as const;
const PRIORITY: Record<Issue["priority"], { key: Key; cls: string }> = {
  urgent: { key: "priority_urgent", cls: "bg-safety text-white" },
  normal: { key: "priority_normal", cls: "bg-steel text-white" },
  low: { key: "priority_low", cls: "bg-seam text-faded" },
};

export default function IssuesPage() {
  return (
    <AppPage>
      <IssueList />
    </AppPage>
  );
}

function IssueList() {
  const { t, people } = useSession();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [machines, setMachines] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFixed, setShowFixed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const [iss, eq] = await Promise.all([
        supabase.from("issues").select("*").order("reported_at", { ascending: false }),
        supabase.from("equipment").select("*"),
      ]);
      setIssues((iss.data as Issue[]) || []);
      setMachines((eq.data as Equipment[]) || []);
      setLoading(false);
    })();
  }, []);

  const personName = (id: string | null) => people.find((p) => p.id === id)?.name || "—";
  const machineFor = (id: string) => machines.find((m) => m.id === id);

  async function remove(i: Issue) {
    if (!window.confirm(t("delete_issue_confirm"))) return;
    const { error } = await supabase.from("issues").delete().eq("id", i.id);
    if (error) return setMessage(error.message);
    setIssues((xs) => xs.filter((x) => x.id !== i.id));
  }

  if (loading) return <Loading />;

  const open = issues
    .filter((i) => i.status === "open")
    .sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.reported_at.localeCompare(a.reported_at));
  const fixed = issues
    .filter((i) => i.status === "fixed")
    .sort((a, b) => (b.fixed_at || "").localeCompare(a.fixed_at || ""));

  function MachineName({ id }: { id: string }) {
    const m = machineFor(id);
    if (!m) return null;
    return (
      <Link href={`/equipment/${m.id}`} className="text-sm font-semibold text-steel underline">
        {m.unit_number ? `#${m.unit_number} ` : ""}
        {m.nickname}
      </Link>
    );
  }

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">
        {t("issues")} ({open.length})
      </h1>
      <ErrorText>{message}</ErrorText>

      {open.length === 0 ? (
        <div className="rounded-lg border border-dashed border-seam p-8 text-center text-faded">
          {t("no_open_issues")}
        </div>
      ) : (
        <ul className="space-y-3">
          {open.map((i) =>
            editingId === i.id ? (
              <li key={i.id}>
                <IssueForm
                  issue={i}
                  onSaved={(u) => {
                    setIssues((xs) => xs.map((x) => (x.id === u.id ? u : x)));
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={i.id} className={cardCls}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold tracking-wider ${PRIORITY[i.priority].cls}`}
                  >
                    {t(PRIORITY[i.priority].key).toUpperCase()}
                  </span>
                  <MachineName id={i.equipment_id} />
                </div>
                <p className="text-lg font-semibold">{i.title}</p>
                {i.notes && <p className="whitespace-pre-line text-sm">{i.notes}</p>}
                <p className="mt-1 text-xs text-faded">
                  {t("reported_by_on", { name: personName(i.reported_by), date: formatDate(i.reported_at) })}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  {machineFor(i.equipment_id)?.is_active !== false && (
                    <Link
                      href={`/equipment/${i.equipment_id}/log-work?issue=${i.id}`}
                      className={`${btnPrimary} py-2 text-sm`}
                    >
                      {t("mark_fixed")}
                    </Link>
                  )}
                  <button onClick={() => setEditingId(i.id)} className={btnQuiet}>
                    {t("edit")}
                  </button>
                  <button onClick={() => remove(i)} className={`${btnQuiet} hover:text-safety`}>
                    {t("delete")}
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {fixed.length > 0 && (
        <section className="mt-6">
          <button onClick={() => setShowFixed(!showFixed)} className={`${btnQuiet} mb-3`}>
            {showFixed ? t("hide_fixed") : `${t("show_fixed")} (${fixed.length})`}
          </button>
          {showFixed && (
            <ul className={`${cardCls} divide-y divide-seam`}>
              {fixed.map((i) => (
                <li key={i.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">✓ {i.title}</span>
                    <MachineName id={i.equipment_id} />
                  </div>
                  <p className="text-xs text-faded">
                    {t("fixed_on", { date: formatDate(i.fixed_at) })} ·{" "}
                    {t("reported_by_on", { name: personName(i.reported_by), date: formatDate(i.reported_at) })}
                  </p>
                  <div className="mt-1 flex gap-4 text-sm">
                    {i.fixed_by_log && (
                      <Link href={`/equipment/${i.equipment_id}/log`} className={btnQuiet}>
                        {t("machine_log")}
                      </Link>
                    )}
                    <button onClick={() => remove(i)} className={`${btnQuiet} hover:text-safety`}>
                      {t("delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function IssueForm({
  issue,
  onSaved,
  onCancel,
}: {
  issue: Issue;
  onSaved: (i: Issue) => void;
  onCancel: () => void;
}) {
  const { t } = useSession();
  const [title, setTitle] = useState(issue.title);
  const [priority, setPriority] = useState(issue.priority);
  const [notes, setNotes] = useState(issue.notes || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setMessage(t("title_required"));
    setBusy(true);
    const { data, error } = await supabase
      .from("issues")
      .update({ title: title.trim(), priority, notes: notes.trim() || null })
      .eq("id", issue.id)
      .select()
      .single();
    setBusy(false);
    if (error) return setMessage(error.message);
    onSaved(data as Issue);
  }

  return (
    <form onSubmit={save} className={`${cardCls} space-y-3 border-steel`}>
      <Field label={t("whats_wrong")}>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <fieldset>
        <legend className={labelCls}>{t("priority")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["urgent", "normal", "low"] as const).map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setPriority(p)}
              aria-pressed={priority === p}
              className={
                "rounded border p-2 text-sm font-bold " +
                (priority === p ? "border-steel bg-steel text-white" : "border-seam bg-plate")
              }
            >
              {t(PRIORITY[p].key)}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label={t("notes")}>
        <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
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

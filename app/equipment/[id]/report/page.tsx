"use client";

// REPORT A PROBLEM - about 10 seconds.
// What's wrong, how urgent, optional notes. It shows up on the machine's
// page and the Issues tab until someone fixes it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase, Equipment } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import type { Key } from "@/lib/i18n";
import { AppPage, ErrorText, Field, Loading, btnPrimary, btnQuiet, inputCls, labelCls } from "@/components/ui";

const PRIORITIES: { value: "urgent" | "normal" | "low"; key: Key; on: string }[] = [
  { value: "urgent", key: "priority_urgent", on: "border-safety bg-safety text-white" },
  { value: "normal", key: "priority_normal", on: "border-steel bg-steel text-white" },
  { value: "low", key: "priority_low", on: "border-faded bg-faded text-white" },
];

export default function ReportPage() {
  return (
    <AppPage nav={false}>
      <ReportForm />
    </AppPage>
  );
}

function ReportForm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { farm, person, t } = useSession();
  const [machine, setMachine] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"urgent" | "normal" | "low">("normal");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("equipment")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        setMachine(data as Equipment | null);
        setLoading(false);
      });
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!title.trim()) {
      setMessage(t("title_required"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("issues").insert({
      farm_id: farm!.id,
      equipment_id: id,
      title: title.trim(),
      notes: notes.trim() || null,
      priority,
      reported_by: person?.id ?? null,
    });
    if (error) {
      setBusy(false);
      setMessage(error.message || t("offline_error"));
      return;
    }
    router.replace(`/equipment/${id}`);
  }

  if (loading) return <Loading />;
  if (!machine) return <p className="py-10 text-center text-faded">{t("no_matches")}</p>;

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href={`/equipment/${id}`} className={btnQuiet}>
          ← {machine.nickname}
        </Link>
        <span className="text-sm text-faded">{person?.name}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">
          {machine.unit_number && <span className="mr-2 font-mono text-faded">#{machine.unit_number}</span>}
          {machine.nickname}
        </h1>
        <p className="text-sm text-faded">{t("report_problem")}</p>
      </div>

      <Field label={t("whats_wrong")}>
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("whats_wrong_placeholder")}
          autoFocus
        />
      </Field>

      <fieldset>
        <legend className={labelCls}>{t("priority")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITIES.map((p) => (
            <button
              type="button"
              key={p.value}
              onClick={() => setPriority(p.value)}
              aria-pressed={priority === p.value}
              className={
                "rounded border p-3 font-bold " + (priority === p.value ? p.on : "border-seam bg-plate")
              }
            >
              {t(p.key)}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label={`${t("notes")} (${t("optional")})`}>
        <textarea className={inputCls} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <ErrorText>{message}</ErrorText>
      <button type="submit" disabled={busy} className={`${btnPrimary} w-full py-4 text-lg`}>
        {busy ? t("saving") : t("save")}
      </button>
    </form>
  );
}

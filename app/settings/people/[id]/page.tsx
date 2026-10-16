"use client";

// ONE PERSON'S WORK - everything they've logged, newest first,
// plus the issues they've reported. Useful for "what got done this week?"

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase, Equipment, Issue, LogEntry, MachineService, ServiceName } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { formatDate, formatReading, jobName } from "@/lib/i18n";
import { AppPage, Loading, btnQuiet, cardCls } from "@/components/ui";

type Job = MachineService & { service_names: ServiceName | null };

export default function PersonPage() {
  return (
    <AppPage need="farm">
      <PersonWork />
    </AppPage>
  );
}

function PersonWork() {
  const { id } = useParams<{ id: string }>();
  const { people, t, lang } = useSession();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [machines, setMachines] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const person = people.find((p) => p.id === id);

  useEffect(() => {
    (async () => {
      const [lg, iss, js, eq] = await Promise.all([
        supabase
          .from("log_entries")
          .select("*")
          .eq("person_id", id)
          .order("service_date", { ascending: false })
          .limit(200),
        supabase.from("issues").select("*").eq("reported_by", id).order("reported_at", { ascending: false }),
        supabase.from("machine_services").select("*, service_names(*)"),
        supabase.from("equipment").select("*"),
      ]);
      setEntries(
        ((lg.data as LogEntry[]) || []).sort(
          (a, b) => b.service_date.localeCompare(a.service_date) || b.created_at.localeCompare(a.created_at)
        )
      );
      setIssues((iss.data as Issue[]) || []);
      setJobs((js.data as Job[]) || []);
      setMachines((eq.data as Equipment[]) || []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <Loading />;
  const machineFor = (mid: string) => machines.find((m) => m.id === mid);
  const jobFor = (jid: string) => jobs.find((j) => j.id === jid);

  return (
    <>
      <Link href="/settings/people" className={`${btnQuiet} mb-3 inline-block`}>
        ← {t("people")}
      </Link>
      <h1 className="mb-4 text-xl font-bold">{person?.name || "—"}</h1>

      <section className={`${cardCls} mb-4`}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-faded">
          {t("work_logged")} ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="py-2 text-sm text-faded">{t("no_work_yet")}</p>
        ) : (
          <ul className="divide-y divide-seam">
            {entries.map((e) => {
              const m = machineFor(e.equipment_id);
              return (
                <li key={e.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/equipment/${e.equipment_id}/log`} className="font-semibold underline decoration-seam">
                      {m?.nickname || "—"}
                    </Link>
                    <span className="shrink-0 font-mono text-xs text-faded">{formatDate(e.service_date)}</span>
                  </div>
                  <p className="text-sm">
                    {jobName(jobFor(e.machine_service_id)?.service_names, lang)}
                    {m && e.meter_reading !== null && (
                      <span className="text-faded"> · {formatReading(e.meter_reading, m.meter_type, lang)}</span>
                    )}
                  </p>
                  {e.notes && <p className="line-clamp-2 text-sm text-faded">{e.notes}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-faded">
          {t("issues_reported")} ({issues.length})
        </h2>
        {issues.length === 0 ? (
          <p className="py-2 text-sm text-faded">{t("no_open_issues")}</p>
        ) : (
          <ul className="divide-y divide-seam">
            {issues.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span>
                  {i.status === "fixed" ? "✓ " : ""}
                  {i.title}
                  <span className="text-faded"> · {machineFor(i.equipment_id)?.nickname}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-faded">{formatDate(i.reported_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

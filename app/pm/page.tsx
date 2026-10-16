"use client";

// PM - preventive maintenance across the whole fleet, on one screen.
//   Needs attention: calendar services overdue, due soon, or never logged
//   Check the meter: hours/miles services, shown as the next-due reading
//                    (the app only knows the meter when someone enters it)
//   On track:        calendar services that are current
// Tap a row to log that service on that machine.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, Equipment, MachineService, ServiceName, todayISO } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { formatReading, jobName } from "@/lib/i18n";
import { latestByService, serviceStatus, ServiceStatus } from "@/lib/maintenance";
import { AppPage, Loading, btnQuiet, cardCls } from "@/components/ui";
import { StatusBadge, useIntervalText, useStatusText } from "@/components/StatusBadge";

type Job = MachineService & { service_names: ServiceName | null };
type Row = { job: Job; machine: Equipment; status: ServiceStatus };

const ORDER = { overdue: 0, due_soon: 1, no_record: 2, ok: 3 } as const;

export default function PmPage() {
  return (
    <AppPage>
      <PmBoard />
    </AppPage>
  );
}

function PmBoard() {
  const { t, lang } = useSession();
  const intervalText = useIntervalText();
  const statusText = useStatusText();
  const [rows, setRows] = useState<Row[]>([]);
  const [openIssues, setOpenIssues] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [eq, js, lg, iss] = await Promise.all([
        supabase.from("equipment").select("*").eq("is_active", true),
        supabase
          .from("machine_services")
          .select("*, service_names(*)")
          .eq("is_retired", false)
          .eq("category", "service"),
        supabase.from("log_entries").select("machine_service_id, service_date, meter_reading, created_at"),
        supabase.from("issues").select("id").eq("status", "open"),
      ]);
      const machines = (eq.data as Equipment[]) || [];
      const latest = latestByService(lg.data || []);
      const today = todayISO();
      const built: Row[] = [];
      for (const job of (js.data as Job[]) || []) {
        if (!job.interval_meter && !job.interval_months) continue;
        const machine = machines.find((m) => m.id === job.equipment_id);
        if (!machine) continue; // retired machine
        built.push({ job, machine, status: serviceStatus(job, latest.get(job.id) || null, today) });
      }
      setRows(built);
      setOpenIssues((iss.data || []).length);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loading />;

  const byMachine = (a: Row, b: Row) => a.machine.nickname.localeCompare(b.machine.nickname);
  const attention = rows
    .filter((r) => r.status.status && r.status.status !== "ok")
    .sort((a, b) => ORDER[a.status.status!] - ORDER[b.status.status!] || (a.status.daysLeft ?? 0) - (b.status.daysLeft ?? 0));
  const meter = rows.filter((r) => r.status.status === null).sort(byMachine);
  const onTrack = rows.filter((r) => r.status.status === "ok").sort(byMachine);

  function RowItem({ r }: { r: Row }) {
    const m = r.machine;
    return (
      <li>
        <Link
          href={`/equipment/${m.id}/log-work?job=${r.job.id}`}
          className="flex items-start gap-3 py-3 hover:bg-field"
        >
          <div className="w-24 shrink-0 pt-0.5">
            <StatusBadge status={r.status.status} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">
              {m.unit_number && <span className="mr-1 font-mono text-faded">#{m.unit_number}</span>}
              {m.nickname}
              <span className="font-normal text-faded"> — {jobName(r.job.service_names, lang)}</span>
            </p>
            <p className="text-xs text-faded">
              {intervalText(r.job.interval_meter, r.job.interval_months, m.meter_type)} ·{" "}
              {statusText(r.status, m.meter_type)}
            </p>
            {r.status.status === null && m.current_reading !== null && (
              <p className="text-xs text-faded">
                {t("meter_entered", { reading: formatReading(m.current_reading, m.meter_type, lang) })}
              </p>
            )}
          </div>
        </Link>
      </li>
    );
  }

  function Section({ title, hint, list }: { title: string; hint: string; list: Row[] }) {
    if (!list.length) return null;
    return (
      <section className={`${cardCls} mb-4`}>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-faded">
          {title} ({list.length})
        </h2>
        <p className="text-sm text-faded">{hint}</p>
        <ul className="divide-y divide-seam">
          {list.map((r) => (
            <RowItem key={r.job.id} r={r} />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t("pm_title")}</h1>
        <Link href="/batch" className={btnQuiet}>
          {t("batch_title")} →
        </Link>
      </div>

      {openIssues > 0 && (
        <Link
          href="/issues"
          className="mb-4 block rounded-lg border border-danger/30 bg-dangerSoft p-3 font-semibold text-danger"
        >
          ⚠ {t("open_issues_n", { n: openIssues })} →
        </Link>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-seam p-8 text-center text-faded">
          {t("no_schedules")}
        </div>
      ) : (
        <>
          <Section title={t("needs_attention")} hint={t("needs_attention_hint")} list={attention} />
          <Section title={t("check_meter")} hint={t("check_meter_hint")} list={meter} />
          <Section title={t("on_track")} hint="" list={onTrack} />
        </>
      )}
    </>
  );
}

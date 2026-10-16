"use client";

// DASHBOARD - the fleet at a glance (owners land here).
//   - Counts: active machines, overdue, due soon, open issues
//   - Needs attention: the most urgent PM items
//   - Open issues, urgent first
//   - Recent work across the whole fleet

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  supabase,
  Equipment,
  Issue,
  LogEntry,
  MachineService,
  ServiceName,
  todayISO,
} from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { entryName, formatDate, jobName } from "@/lib/i18n";
import { latestByService, serviceStatus, ServiceStatus } from "@/lib/maintenance";
import { AppPage, Loading, btnPrimary, cardCls } from "@/components/ui";
import { StatusBadge, useStatusText } from "@/components/StatusBadge";

type Job = MachineService & { service_names: ServiceName | null };
type PmRow = { job: Job; machine: Equipment; status: ServiceStatus };

const ORDER = { overdue: 0, due_soon: 1, no_record: 2, ok: 3 } as const;
const PRIORITY_RANK = { urgent: 0, normal: 1, low: 2 } as const;

export default function DashboardPage() {
  return (
    <AppPage wide>
      <Dashboard />
    </AppPage>
  );
}

function Dashboard() {
  const { t, lang, people } = useSession();
  const statusText = useStatusText();
  const [machines, setMachines] = useState<Equipment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pm, setPm] = useState<PmRow[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [recent, setRecent] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [eq, js, lg, iss] = await Promise.all([
        supabase.from("equipment").select("*").eq("is_active", true),
        supabase.from("machine_services").select("*, service_names(*)"),
        supabase.from("log_entries").select("*"),
        supabase.from("issues").select("*").eq("status", "open"),
      ]);
      const ms = (eq.data as Equipment[]) || [];
      const allJobs = (js.data as Job[]) || [];
      const logs = (lg.data as LogEntry[]) || [];
      const latest = latestByService(logs);
      const today = todayISO();

      const rows: PmRow[] = [];
      for (const job of allJobs) {
        if (job.is_retired || job.category !== "service") continue;
        if (!job.interval_meter && !job.interval_months) continue;
        const machine = ms.find((m) => m.id === job.equipment_id);
        if (!machine) continue;
        rows.push({ job, machine, status: serviceStatus(job, latest.get(job.id) || null, today) });
      }

      setMachines(ms);
      setJobs(allJobs);
      setPm(rows);
      setIssues(((iss.data as Issue[]) || []).filter((i) => ms.some((m) => m.id === i.equipment_id)));
      setRecent(
        logs
          .sort((a, b) => b.service_date.localeCompare(a.service_date) || b.created_at.localeCompare(a.created_at))
          .slice(0, 8)
      );
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loading />;

  const overdue = pm.filter((r) => r.status.status === "overdue").length;
  const dueSoon = pm.filter((r) => r.status.status === "due_soon").length;
  const attention = pm
    .filter((r) => r.status.status && r.status.status !== "ok")
    .sort((a, b) => ORDER[a.status.status!] - ORDER[b.status.status!] || (a.status.daysLeft ?? 0) - (b.status.daysLeft ?? 0))
    .slice(0, 6);
  const topIssues = issues
    .slice()
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.reported_at.localeCompare(a.reported_at))
    .slice(0, 5);

  const machineFor = (id: string) => machines.find((m) => m.id === id);
  const personName = (id: string | null) => people.find((p) => p.id === id)?.name || "—";
  const today = new Date().toLocaleDateString(lang === "es" ? "es-MX" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const Unit = ({ m }: { m?: Equipment }) =>
    m?.unit_number ? <span className="mr-1 font-mono text-faded">#{m.unit_number}</span> : null;

  const tiles = [
    { label: t("stat_active"), value: machines.length, accent: "border-t-[#9FB3C8]", ink: "text-ink", href: "/equipment" },
    { label: t("stat_overdue"), value: overdue, accent: "border-t-danger", ink: "text-danger", href: "/pm" },
    { label: t("stat_due_soon"), value: dueSoon, accent: "border-t-caution", ink: "text-cautionInk", href: "/pm" },
    { label: t("stat_open_issues"), value: issues.length, accent: "border-t-safety", ink: "text-safety", href: "/issues" },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("nav_dashboard")}</h1>
          <p className="text-sm capitalize text-faded">{today}</p>
        </div>
        <Link href="/equipment" className={`${btnPrimary} inline-flex items-center gap-2 py-2.5`}>
          <Plus size={18} aria-hidden="true" /> {t("log_work")}
        </Link>
      </div>

      {/* Counts */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className={`border border-t-4 border-seam bg-plate p-4 hover:border-x-safety/40 hover:border-b-safety/40 ${tile.accent}`}
          >
            <p className="text-sm text-faded">{tile.label}</p>
            <p className={`mt-1 font-mono text-3xl font-medium ${tile.ink}`}>{tile.value}</p>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-5">
        {/* Needs attention */}
        <section className={`${cardCls} lg:col-span-3`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{t("needs_attention")}</h2>
            <Link href="/pm" className="text-sm font-medium text-safety">
              {t("view_all")} →
            </Link>
          </div>
          {attention.length === 0 ? (
            <p className="py-4 text-sm text-faded">{t("all_caught_up")}</p>
          ) : (
            <ul className="divide-y divide-[#EDF1F5]">
              {attention.map((r) => (
                <li key={r.job.id}>
                  <Link
                    href={`/equipment/${r.machine.id}/log-work?job=${r.job.id}`}
                    className="flex items-start gap-3 py-2.5 hover:bg-field"
                  >
                    <span className="w-24 shrink-0 pt-0.5">
                      <StatusBadge status={r.status.status} />
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">
                        <Unit m={r.machine} />
                        {r.machine.nickname}
                      </span>
                      <span className="text-faded"> — {jobName(r.job.service_names, lang)}</span>
                      <span className="block text-xs text-faded">{statusText(r.status, r.machine.meter_type)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Open issues */}
        <section className={`${cardCls} lg:col-span-2`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{t("open_issues")}</h2>
            <Link href="/issues" className="text-sm font-medium text-safety">
              {t("view_all")} →
            </Link>
          </div>
          {topIssues.length === 0 ? (
            <p className="py-4 text-sm text-faded">{t("no_open_issues")}</p>
          ) : (
            <ul className="divide-y divide-[#EDF1F5]">
              {topIssues.map((i) => (
                <li key={i.id} className="py-2.5 text-sm">
                  <p className="font-medium">
                    {i.priority === "urgent" && (
                      <span className="mr-2 rounded bg-dangerSoft px-1.5 py-0.5 text-xs font-semibold text-[#8E1B1B]">
                        {t("priority_urgent")}
                      </span>
                    )}
                    {i.title}
                  </p>
                  <p className="text-xs text-faded">
                    <Unit m={machineFor(i.equipment_id)} />
                    {machineFor(i.equipment_id)?.nickname} · {personName(i.reported_by)} · {formatDate(i.reported_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent work */}
      <section className={cardCls}>
        <h2 className="mb-2 font-semibold">{t("recent_work")}</h2>
        {recent.length === 0 ? (
          <p className="py-4 text-sm text-faded">{t("no_work_yet")}</p>
        ) : (
          <ul className="divide-y divide-[#EDF1F5]">
            {recent.map((e) => {
              const m = machineFor(e.equipment_id);
              const job = jobs.find((j) => j.id === e.machine_service_id);
              return (
                <li key={e.id}>
                  <Link
                    href={`/equipment/${e.equipment_id}/log`}
                    className="flex items-baseline justify-between gap-3 py-2.5 text-sm hover:bg-field"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{entryName(e.kind, job?.service_names, lang)}</span>
                      <span className="block truncate text-xs text-faded">
                        <Unit m={m} />
                        {m?.nickname || "—"} · {personName(e.person_id)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-faded">{formatDate(e.service_date)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

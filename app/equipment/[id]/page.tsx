"use client";

// ONE MACHINE - the mechanic's starting point at the machine.
//   - Big buttons: Log work, Report a problem
//   - Open issues on this machine
//   - Its services and repairs, with status
//   - Recent work, and a link to the full log
//   - Edit details, retire, or permanently delete

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase, Equipment, Issue, LogEntry, MachineService, ServiceName, todayISO } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { formatDate, formatReading, jobName } from "@/lib/i18n";
import { latestByService, serviceStatus } from "@/lib/maintenance";
import { AppPage, ErrorText, Loading, btnOutline, btnPrimary, btnQuiet, btnSecondary, cardCls } from "@/components/ui";
import { StatusBadge, useIntervalText, useStatusText } from "@/components/StatusBadge";
import MachineForm from "@/components/MachineForm";

type Job = MachineService & { service_names: ServiceName | null };

export default function MachinePage() {
  return (
    <AppPage>
      <MachineDetail />
    </AppPage>
  );
}

function MachineDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, lang, people } = useSession();
  const intervalText = useIntervalText();
  const statusText = useStatusText();

  const [machine, setMachine] = useState<Equipment | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [peerCount, setPeerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const [eq, js, lg, iss] = await Promise.all([
        supabase.from("equipment").select("*").eq("id", id).maybeSingle(),
        supabase.from("machine_services").select("*, service_names(*)").eq("equipment_id", id),
        supabase
          .from("log_entries")
          .select("*")
          .eq("equipment_id", id)
          .order("service_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("issues")
          .select("*")
          .eq("equipment_id", id)
          .eq("status", "open")
          .order("reported_at", { ascending: false }),
      ]);
      const sorted = ((lg.data as LogEntry[]) || []).sort(
        (a, b) => b.service_date.localeCompare(a.service_date) || b.created_at.localeCompare(a.created_at)
      );
      const m = eq.data as Equipment | null;
      const myJobs = (js.data as Job[]) || [];
      setMachine(m);
      setJobs(myJobs);
      setLogs(sorted);
      setIssues((iss.data as Issue[]) || []);

      // Same make and model already set up? Offer to copy their services.
      if (m && m.make && m.model && myJobs.length === 0) {
        const { data: others } = await supabase
          .from("equipment")
          .select("id, make, model")
          .neq("id", m.id);
        const peers = (others || []).filter(
          (o) =>
            (o.make || "").toLowerCase() === m.make!.toLowerCase() &&
            (o.model || "").toLowerCase() === m.model!.toLowerCase()
        );
        if (peers.length) {
          const { data: peerJobs } = await supabase
            .from("machine_services")
            .select("equipment_id")
            .in("equipment_id", peers.map((p) => p.id))
            .eq("is_retired", false);
          setPeerCount(new Set((peerJobs || []).map((j) => j.equipment_id)).size);
        }
      }
      setLoading(false);
    })();
  }, [id]);

  async function setActive(active: boolean) {
    if (!machine) return;
    if (!active && !window.confirm(t("retire_machine_confirm", { name: machine.nickname }))) return;
    const { error } = await supabase.from("equipment").update({ is_active: active }).eq("id", machine.id);
    if (error) return setMessage(error.message);
    setMachine({ ...machine, is_active: active });
  }

  async function deleteMachine() {
    if (!machine) return;
    if (!window.confirm(t("delete_machine_confirm", { name: machine.nickname }))) return;
    const { error } = await supabase.from("equipment").delete().eq("id", machine.id);
    if (error) return setMessage(error.message);
    router.replace("/equipment");
  }

  if (loading) return <Loading />;
  if (!machine) {
    return (
      <div className="py-10 text-center text-faded">
        <p>{t("no_matches")}</p>
        <Link href="/equipment" className={btnQuiet}>
          ← {t("fleet")}
        </Link>
      </div>
    );
  }

  const latest = latestByService(logs);
  const today = todayISO();
  const activeJobs = jobs.filter((j) => !j.is_retired);
  const services = activeJobs.filter((j) => j.category === "service");
  const repairs = activeJobs.filter((j) => j.category === "repair");
  const lastWithReading = logs.find((l) => l.meter_reading !== null);
  const personName = (pid: string | null) => people.find((p) => p.id === pid)?.name || "—";
  const jobFor = (msid: string) => jobs.find((j) => j.id === msid);

  return (
    <>
      <Link href="/equipment" className={`${btnQuiet} no-print mb-3 inline-block`}>
        ← {t("fleet")}
      </Link>

      {/* ---------- Machine details ---------- */}
      {editing ? (
        <MachineForm
          machine={machine}
          onSaved={(m) => {
            setMachine(m);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className={`${cardCls} mb-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">
                {machine.unit_number && (
                  <span className="mr-2 font-mono text-faded">#{machine.unit_number}</span>
                )}
                {machine.nickname}
              </h1>
              <p className="text-sm text-faded">
                {[machine.make, machine.model].filter(Boolean).join(" ") || "—"}
                {machine.serial_number ? ` · SN ${machine.serial_number}` : ""}
              </p>
            </div>
            <button onClick={() => setEditing(true)} className={`${btnQuiet} shrink-0`}>
              {t("edit")}
            </button>
          </div>
          {!machine.is_active && (
            <span className="mt-2 inline-block rounded bg-seam px-2 py-0.5 text-xs font-bold tracking-wider text-faded">
              {t("retired").toUpperCase()}
            </span>
          )}
          {machine.meter_type !== "none" && (
            <p className="mt-2 font-mono text-lg">
              {formatReading(machine.current_reading, machine.meter_type, lang) || "—"}
            </p>
          )}
          {lastWithReading && machine.meter_type !== "none" && (
            <p className="text-xs text-faded">
              {t("last_reading", {
                reading: formatReading(lastWithReading.meter_reading, machine.meter_type, lang),
                date: formatDate(lastWithReading.service_date),
              })}
            </p>
          )}
        </div>
      )}

      <ErrorText>{message}</ErrorText>

      {/* ---------- Big buttons ---------- */}
      {machine.is_active && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <Link href={`/equipment/${machine.id}/log-work`} className={`${btnPrimary} py-5 text-center text-lg`}>
            {t("log_work")}
          </Link>
          <Link href={`/equipment/${machine.id}/report`} className={`${btnSecondary} py-5 text-center text-lg`}>
            {t("report_problem")}
          </Link>
        </div>
      )}

      {/* ---------- Copy from same model ---------- */}
      {peerCount > 0 && activeJobs.length === 0 && (
        <div className="mb-5 rounded-lg border-2 border-steel bg-plate p-4">
          <p className="mb-3 font-semibold">
            {t("same_model_prompt", {
              n: peerCount,
              model: [machine.make, machine.model].filter(Boolean).join(" "),
            })}
          </p>
          <Link href={`/equipment/${machine.id}/services?copy=1`} className={`${btnSecondary} inline-block`}>
            {t("copy_from_machine")}
          </Link>
        </div>
      )}

      {/* ---------- Open issues ---------- */}
      {issues.length > 0 && (
        <section className={`${cardCls} mb-4 border-safety`}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-safety">
            {t("open_issues")} ({issues.length})
          </h2>
          <ul className="divide-y divide-seam">
            {issues.map((i) => (
              <li key={i.id} className="py-2">
                <p className="font-semibold">
                  {i.priority === "urgent" && (
                    <span className="mr-2 rounded bg-safety px-1.5 py-0.5 text-xs font-bold text-white">
                      {t("priority_urgent").toUpperCase()}
                    </span>
                  )}
                  {i.title}
                </p>
                <p className="text-xs text-faded">
                  {t("reported_by_on", { name: personName(i.reported_by), date: formatDate(i.reported_at) })}
                </p>
              </li>
            ))}
          </ul>
          <Link href="/issues" className={`${btnQuiet} mt-2 inline-block`}>
            {t("issues")} →
          </Link>
        </section>
      )}

      {/* ---------- Services and repairs ---------- */}
      <section className={`${cardCls} mb-4`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-faded">
            {t("services_and_repairs")}
          </h2>
          <Link href={`/equipment/${machine.id}/services`} className="text-sm font-bold text-safety">
            {t("edit")}
          </Link>
        </div>

        {activeJobs.length === 0 ? (
          <div className="py-3 text-sm text-faded">
            <p className="mb-2">{t("no_jobs_set_up")}</p>
            <Link href={`/equipment/${machine.id}/services`} className={`${btnOutline} inline-block`}>
              {t("set_up_jobs")}
            </Link>
          </div>
        ) : (
          <>
            {services.length > 0 && (
              <ul className="divide-y divide-seam">
                {services.map((j) => {
                  const st = serviceStatus(j, latest.get(j.id) || null, today);
                  const tracked = !!(j.interval_meter || j.interval_months);
                  return (
                    <li key={j.id} className="flex items-start gap-3 py-2">
                      <div className="w-20 shrink-0 pt-0.5">{tracked && <StatusBadge status={st.status} />}</div>
                      <div className="min-w-0">
                        <p className="font-semibold">{jobName(j.service_names, lang)}</p>
                        <p className="text-xs text-faded">
                          {tracked ? `${intervalText(j.interval_meter, j.interval_months, machine.meter_type)} · ` : ""}
                          {statusText(st, machine.meter_type)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {repairs.length > 0 && (
              <>
                <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-faded">
                  {t("repairs")}
                </h3>
                <ul className="divide-y divide-seam">
                  {repairs.map((j) => {
                    const last = latest.get(j.id);
                    return (
                      <li key={j.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                        <span className="font-semibold">{jobName(j.service_names, lang)}</span>
                        <span className="text-xs text-faded">
                          {last ? t("last_done", { date: formatDate(last.service_date) }) : t("never_done")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      {/* ---------- Recent work ---------- */}
      <section className={`${cardCls} mb-6`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-faded">{t("recent_work")}</h2>
          {logs.length > 0 && (
            <Link href={`/equipment/${machine.id}/log`} className="text-sm font-bold text-safety">
              {t("view_full_log")}
            </Link>
          )}
        </div>
        {logs.length === 0 ? (
          <p className="py-3 text-sm text-faded">{t("no_work_yet")}</p>
        ) : (
          <ul className="divide-y divide-seam">
            {logs.slice(0, 5).map((l) => {
              const j = jobFor(l.machine_service_id);
              return (
                <li key={l.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{jobName(j?.service_names, lang)}</span>
                    <span className="shrink-0 font-mono text-xs text-faded">
                      {formatReading(l.meter_reading, machine.meter_type, lang)}
                    </span>
                  </div>
                  <p className="text-xs text-faded">
                    {t("entry_by_on", { name: personName(l.person_id), date: formatDate(l.service_date) })}
                  </p>
                  {l.notes && <p className="mt-1 line-clamp-2 text-sm">{l.notes}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- Retire / delete ---------- */}
      <div className="no-print space-y-3 text-center">
        {machine.is_active ? (
          <button onClick={() => setActive(false)} className={btnOutline}>
            {t("retire_machine")}
          </button>
        ) : (
          <button onClick={() => setActive(true)} className={btnSecondary}>
            {t("return_to_fleet")}
          </button>
        )}
        <div>
          <button onClick={deleteMachine} className={`${btnQuiet} hover:text-safety`}>
            {t("delete_machine")}
          </button>
        </div>
      </div>
    </>
  );
}

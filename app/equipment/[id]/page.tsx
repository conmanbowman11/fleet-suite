"use client";

// ONE MACHINE - the most-used screen. Pick a machine, then 3 choices:
//   Log a service   pick a PM template; its parts, fluids, and checklist fill in
//   Log a repair    write what happened, attach an invoice or photos
//   Report an issue flag a problem for later
// Below: open issues, the machine's PM templates (with what's due),
// recent work, and edit / retire / delete.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  supabase,
  CatalogPart,
  Equipment,
  Issue,
  KitPart,
  LogEntry,
  MachineService,
  ServiceName,
  todayISO,
} from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { entryName, formatDate, formatReading, jobName } from "@/lib/i18n";
import { latestByService, serviceStatus } from "@/lib/maintenance";
import { isFluid } from "@/lib/parts";
import { AppPage, ErrorText, Loading, btnOutline, btnQuiet, btnSecondary, cardCls } from "@/components/ui";
import { StatusBadge, useIntervalText, useStatusText } from "@/components/StatusBadge";
import MachineForm from "@/components/MachineForm";
import { Hammer, Plus, TriangleAlert, Wrench } from "lucide-react";

type Job = MachineService & { service_names: ServiceName | null };
type Kit = KitPart & { parts_catalog: Pick<CatalogPart, "unit"> | null };

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
  const [kits, setKits] = useState<Kit[]>([]);
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
      let myKits: Kit[] = [];
      if (myJobs.length) {
        const { data } = await supabase
          .from("kit_parts")
          .select("*, parts_catalog(unit)")
          .in("machine_service_id", myJobs.map((j) => j.id));
        myKits = (data as Kit[]) || [];
      }
      setMachine(m);
      setJobs(myJobs);
      setKits(myKits);
      setLogs(sorted);
      setIssues((iss.data as Issue[]) || []);

      // Same make and model already set up? Offer to copy their templates.
      const myTemplates = myJobs.filter((j) => j.category === "service");
      if (m && m.make && m.model && myTemplates.length === 0) {
        const { data: others } = await supabase.from("equipment").select("id, make, model").neq("id", m.id);
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
            .eq("category", "service")
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
  const templates = jobs
    .filter((j) => !j.is_retired && j.category === "service")
    .sort((a, b) => jobName(a.service_names, lang).localeCompare(jobName(b.service_names, lang)));
  const lastWithReading = logs.find((l) => l.meter_reading !== null);
  const personName = (pid: string | null) => people.find((p) => p.id === pid)?.name || "—";
  const jobFor = (msid: string) => jobs.find((j) => j.id === msid);
  const base = `/equipment/${machine.id}`;

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
        <div className="mb-4 overflow-hidden rounded-lg border border-seam bg-plate">
          {/* The data plate: unit number and meter reading */}
          <div
            className={
              "flex items-baseline justify-between gap-3 px-4 py-3 text-white " +
              (machine.is_active ? "bg-safety" : "bg-[#5B6B7D]")
            }
          >
            <span className="font-mono text-3xl font-medium">
              {machine.unit_number ? `#${machine.unit_number}` : "—"}
            </span>
            {machine.meter_type !== "none" && (
              <span className="font-mono text-lg">
                {formatReading(machine.current_reading, machine.meter_type, lang) || "—"}
              </span>
            )}
          </div>
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">
                {machine.nickname}
                {!machine.is_active && (
                  <span className="ml-2 align-middle rounded bg-[#EDF1F5] px-2 py-0.5 text-xs font-semibold text-faded">
                    {t("retired")}
                  </span>
                )}
              </h1>
              <p className="text-sm text-faded">
                {[machine.make, machine.model].filter(Boolean).join(" ") || "—"}
                {machine.serial_number ? ` · SN ${machine.serial_number}` : ""}
              </p>
              {lastWithReading && machine.meter_type !== "none" && (
                <p className="mt-1 text-xs text-faded">
                  {t("last_reading", {
                    reading: formatReading(lastWithReading.meter_reading, machine.meter_type, lang),
                    date: formatDate(lastWithReading.service_date),
                  })}
                </p>
              )}
            </div>
            <button onClick={() => setEditing(true)} className={`${btnQuiet} shrink-0`}>
              {t("edit")}
            </button>
          </div>
        </div>
      )}

      <ErrorText>{message}</ErrorText>

      {/* ---------- The 3 choices ---------- */}
      {machine.is_active && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href={`${base}/log-work`}
            className="flex items-center justify-center gap-2 rounded-lg bg-safety px-4 py-5 text-lg font-semibold text-white hover:bg-safetyDark"
          >
            <Wrench size={22} aria-hidden="true" /> {t("log_service")}
          </Link>
          <Link
            href={`${base}/repair`}
            className="flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-5 text-lg font-semibold text-white hover:bg-navyLight"
          >
            <Hammer size={22} aria-hidden="true" /> {t("log_repair")}
          </Link>
          <Link
            href={`${base}/report`}
            className="flex items-center justify-center gap-2 rounded-lg border border-danger/30 bg-dangerSoft px-4 py-5 text-lg font-semibold text-danger hover:border-danger"
          >
            <TriangleAlert size={22} aria-hidden="true" /> {t("report_issue")}
          </Link>
        </div>
      )}

      {/* ---------- Open issues ---------- */}
      {issues.length > 0 && (
        <section className="mb-4 rounded-lg border border-danger/30 bg-dangerSoft p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-danger">
            <TriangleAlert size={16} aria-hidden="true" />
            {t("open_issues")} ({issues.length})
          </h2>
          <ul className="divide-y divide-danger/15">
            {issues.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {i.priority === "urgent" && (
                      <span className="mr-2 rounded bg-danger px-1.5 py-0.5 text-xs font-semibold text-white">
                        {t("priority_urgent")}
                      </span>
                    )}
                    {i.title}
                  </p>
                  <p className="text-xs text-faded">
                    {t("reported_by_on", { name: personName(i.reported_by), date: formatDate(i.reported_at) })}
                  </p>
                </div>
                {machine.is_active && (
                  <Link
                    href={`${base}/repair?issue=${i.id}`}
                    className="shrink-0 rounded-md border border-danger/40 bg-plate px-3 py-1.5 text-sm font-semibold text-danger hover:border-danger"
                  >
                    {t("mark_fixed")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Copy from same model ---------- */}
      {peerCount > 0 && templates.length === 0 && (
        <div className="mb-5 rounded-lg border-2 border-steel bg-plate p-4">
          <p className="mb-3 font-semibold">
            {t("same_model_prompt", {
              n: peerCount,
              model: [machine.make, machine.model].filter(Boolean).join(" "),
            })}
          </p>
          <Link href={`${base}/services?copy=1`} className={`${btnSecondary} inline-block`}>
            {t("copy_from_machine")}
          </Link>
        </div>
      )}

      {/* ---------- PM templates ---------- */}
      <section className={`${cardCls} mb-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-faded">
            {t("pm_templates")} ({templates.length})
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
            <Link href={`${base}/services?copy=1`} className="whitespace-nowrap text-faded hover:text-safety">
              {t("copy_from_machine")}
            </Link>
            <Link href={`${base}/services?add=1`} className="flex items-center gap-1 whitespace-nowrap text-safety">
              <Plus size={15} aria-hidden="true" /> {t("add_template")}
            </Link>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="py-2 text-sm text-faded">
            <p className="mb-3">{t("no_templates")}</p>
            <Link href={`${base}/services?add=1`} className={`${btnOutline} inline-block`}>
              {t("add_template")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templates.map((j) => {
              const st = serviceStatus(j, latest.get(j.id) || null, today);
              const tracked = !!(j.interval_meter || j.interval_months);
              const kit = kits.filter((k) => k.machine_service_id === j.id);
              const fluids = kit.filter((k) => isFluid(k.parts_catalog)).length;
              return (
                <div key={j.id} className="flex flex-col rounded-md border border-seam p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{jobName(j.service_names, lang)}</p>
                    {tracked && <StatusBadge status={st.status} />}
                  </div>
                  <p className="text-xs text-faded">
                    {tracked ? `${intervalText(j.interval_meter, j.interval_months, machine.meter_type)} · ` : ""}
                    {statusText(st, machine.meter_type)}
                  </p>
                  <p className="mt-1 text-xs text-faded">
                    {t("template_counts", {
                      parts: kit.length - fluids,
                      fluids,
                      tasks: (j.tasks || []).length,
                    })}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-seam pt-2 text-sm">
                    <Link href={`${base}/services?edit=${j.id}`} className={btnQuiet}>
                      {t("edit")}
                    </Link>
                    {machine.is_active && (
                      <Link href={`${base}/log-work?job=${j.id}`} className="font-semibold text-safety">
                        {t("log_service")} →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- Recent work ---------- */}
      <section className={`${cardCls} mb-6`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-faded">{t("recent_work")}</h2>
          {logs.length > 0 && (
            <Link href={`${base}/log`} className="text-sm font-bold text-safety">
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
              const repair = l.kind === "repair";
              return (
                <li key={l.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">
                      {entryName(l.kind, j?.service_names, lang)}
                      {repair && l.done_by === "outside" && l.vendor && (
                        <span className="ml-2 text-xs font-normal text-faded">
                          {t("done_by_shop", { shop: l.vendor })}
                        </span>
                      )}
                    </span>
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

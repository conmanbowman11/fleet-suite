"use client";

// SERVICE LOG - everything ever done to one machine, newest first.
//   - Search notes, job names, people, and part numbers
//   - Filter by services / repairs and by date range
//   - Print what's showing (the resale and warranty record)
//   - Edit (keeps an "Edited by" note) or delete an entry
//   - Repairs show who did the work and open their invoices / photos
//   - Deleting an entry puts its tracked parts back in Inventory

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  supabase,
  CatalogPart,
  Equipment,
  Issue,
  LogEntry,
  MachineService,
  PartUsed,
  ServiceName,
  todayISO,
} from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { entryName, formatDate, formatReading } from "@/lib/i18n";
import { qtyText } from "@/lib/parts";
import { FileText } from "lucide-react";
import { AppPage, ErrorText, Loading, btnOutline, btnQuiet, cardCls, inputCls } from "@/components/ui";

type Job = MachineService & { service_names: ServiceName | null };
type TypeFilter = "all" | "service" | "repair";
type RangeFilter = "all" | "year" | "12m";

export default function LogPage() {
  return (
    <AppPage>
      <MachineLog />
    </AppPage>
  );
}

function MachineLog() {
  const { id } = useParams<{ id: string }>();
  const { t, lang, people, farm } = useSession();

  const [machine, setMachine] = useState<Equipment | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [parts, setParts] = useState<PartUsed[]>([]);
  const [fixed, setFixed] = useState<Issue[]>([]);
  const [units, setUnits] = useState<Record<string, string>>({});
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [range, setRange] = useState<RangeFilter>("all");

  useEffect(() => {
    (async () => {
      const [eq, js, lg, iss, cat] = await Promise.all([
        supabase.from("equipment").select("*").eq("id", id).maybeSingle(),
        supabase.from("machine_services").select("*, service_names(*)").eq("equipment_id", id),
        supabase
          .from("log_entries")
          .select("*")
          .eq("equipment_id", id)
          .order("service_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("issues").select("*").eq("equipment_id", id).not("fixed_by_log", "is", null),
        supabase.from("parts_catalog").select("id, unit"),
      ]);
      const logs = ((lg.data as LogEntry[]) || []).sort(
        (a, b) => b.service_date.localeCompare(a.service_date) || b.created_at.localeCompare(a.created_at)
      );
      let used: PartUsed[] = [];
      if (logs.length) {
        const { data } = await supabase
          .from("parts_used")
          .select("*")
          .in("log_entry_id", logs.map((l) => l.id));
        used = (data as PartUsed[]) || [];
      }
      setMachine(eq.data as Equipment | null);
      setJobs((js.data as Job[]) || []);
      setEntries(logs);
      setParts(used);
      setFixed((iss.data as Issue[]) || []);
      setUnits(
        Object.fromEntries(((cat.data as Pick<CatalogPart, "id" | "unit">[]) || []).map((c) => [c.id, c.unit]))
      );

      // Links to repair invoices and photos (good for one hour)
      const paths = logs.flatMap((l) => (l.files || []).map((f) => f.path));
      if (paths.length) {
        const { data: signed } = await supabase.storage.from("repair-files").createSignedUrls(paths, 3600);
        const urls: Record<string, string> = {};
        for (const s of signed || []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
        setFileUrls(urls);
      }
      setLoading(false);
    })();
  }, [id]);

  const personName = (pid: string | null) => people.find((p) => p.id === pid)?.name || "—";
  const jobFor = (msid: string) => jobs.find((j) => j.id === msid);

  const visible = useMemo(() => {
    const today = todayISO();
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    const yearAgo = d.toISOString().slice(0, 10);
    const q = search.trim().toLowerCase();

    return entries.filter((e) => {
      const job = jobFor(e.machine_service_id);
      if (type !== "all" && (e.kind || job?.category) !== type) return false;
      if (range === "year" && e.service_date < yearStart) return false;
      if (range === "12m" && e.service_date < yearAgo) return false;
      if (!q) return true;
      const haystack = [
        e.notes,
        e.vendor,
        job?.service_names?.name,
        job?.service_names?.name_es,
        personName(e.person_id),
        ...parts.filter((p) => p.log_entry_id === e.id).flatMap((p) => [p.part_number, p.description]),
        ...fixed.filter((i) => i.fixed_by_log === e.id).map((i) => i.title),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, jobs, parts, fixed, people, search, type, range]);

  async function deleteEntry(e: LogEntry) {
    if (!window.confirm(t("delete_entry_confirm"))) return;
    const { error } = await supabase.from("log_entries").delete().eq("id", e.id);
    if (error) return setMessage(error.message);
    if (e.files?.length) await supabase.storage.from("repair-files").remove(e.files.map((f) => f.path));
    setEntries((es) => es.filter((x) => x.id !== e.id));
  }

  if (loading) return <Loading />;
  if (!machine) return <p className="py-10 text-center text-faded">{t("no_matches")}</p>;

  const rangeLabel =
    range === "year" ? t("range_this_year") : range === "12m" ? t("range_12_months") : t("range_all");

  return (
    <>
      <div className="no-print mb-3 flex items-center justify-between">
        <Link href={`/equipment/${machine.id}`} className={btnQuiet}>
          ← {machine.nickname}
        </Link>
        <button onClick={() => window.print()} className={`${btnOutline} py-2 text-sm`}>
          {t("print")}
        </button>
      </div>

      <div className={`${cardCls} print-sheet`}>
        {/* Header (also the top of the printout) */}
        <p className="text-xs font-semibold uppercase tracking-widest text-faded">
          {farm?.name} — {t("machine_log")}
        </p>
        <h1 className="text-2xl font-bold">
          {machine.unit_number && <span className="mr-2 font-mono text-faded">#{machine.unit_number}</span>}
          {machine.nickname}
        </h1>
        <p className="mb-4 text-sm text-faded">
          {[machine.make, machine.model].filter(Boolean).join(" ") || "—"}
          {machine.serial_number ? ` · SN ${machine.serial_number}` : ""}
          {machine.current_reading !== null && machine.meter_type !== "none"
            ? ` · ${formatReading(machine.current_reading, machine.meter_type, lang)}`
            : ""}
          <span className="hidden print:inline"> · {rangeLabel}</span>
        </p>

        {/* Filters */}
        <div className="no-print mb-4 space-y-2">
          <input
            type="search"
            className={inputCls}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search_log")}
          />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
              <option value="all">{t("filter_all")}</option>
              <option value="service">{t("filter_services")}</option>
              <option value="repair">{t("filter_repairs")}</option>
            </select>
            <select className={inputCls} value={range} onChange={(e) => setRange(e.target.value as RangeFilter)}>
              <option value="all">{t("range_all")}</option>
              <option value="year">{t("range_this_year")}</option>
              <option value="12m">{t("range_12_months")}</option>
            </select>
          </div>
        </div>

        <ErrorText>{message}</ErrorText>

        {/* Entries */}
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-faded">
            {entries.length === 0 ? t("no_work_yet") : t("no_entries")}
          </p>
        ) : (
          <ul className="divide-y divide-seam">
            {visible.map((e) => {
              const job = jobFor(e.machine_service_id);
              const used = parts.filter((p) => p.log_entry_id === e.id);
              const issue = fixed.find((i) => i.fixed_by_log === e.id);
              return (
                <li key={e.id} className="break-inside-avoid py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-mono text-sm font-semibold">{formatDate(e.service_date)}</span>
                    <span className="font-mono text-sm text-faded">
                      {formatReading(e.meter_reading, machine.meter_type, lang)}
                    </span>
                  </div>
                  <p className="font-semibold">
                    {entryName(e.kind, job?.service_names, lang)}
                    <span className="ml-2 text-xs font-normal uppercase tracking-wider text-faded">
                      {t(e.kind === "repair" ? "repair" : "service")}
                    </span>
                  </p>
                  <p className="text-xs text-faded">
                    {t("logged_by")}: {personName(e.person_id)}
                    {e.done_by === "outside" && e.vendor ? ` · ${t("done_by_shop", { shop: e.vendor })}` : ""}
                  </p>
                  {e.notes && <p className="mt-1 whitespace-pre-line text-sm">{e.notes}</p>}
                  {(e.checklist || []).length > 0 && (
                    <p className="mt-1 text-sm">
                      <span className="text-faded">{t("checklist")}: </span>
                      {e.checklist.map((c, i) => (
                        <span key={i}>
                          {i > 0 && " · "}
                          <span className={c.done ? "" : "text-faded line-through"}>
                            {c.done ? "✓ " : ""}
                            {c.text}
                          </span>
                        </span>
                      ))}
                    </p>
                  )}
                  {(e.files || []).length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {e.files.map((f) => (
                        <a
                          key={f.path}
                          href={fileUrls[f.path] || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-safety underline-offset-2 hover:underline"
                        >
                          <FileText size={14} aria-hidden="true" />
                          {f.name}
                        </a>
                      ))}
                    </p>
                  )}
                  {used.length > 0 && (
                    <p className="mt-1 text-sm">
                      <span className="text-faded">{t("parts_used")}: </span>
                      {used.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && " · "}
                          <span className="font-mono">{p.part_number}</span>
                          {p.description ? ` ${p.description}` : ""} ×{qtyText(p.quantity, p.part_id ? units[p.part_id] : null)}
                        </span>
                      ))}
                    </p>
                  )}
                  {issue && (
                    <p className="mt-1 text-sm text-steel">✓ {t("fixes_issue", { title: issue.title })}</p>
                  )}
                  {e.edited_at && (
                    <p className="mt-1 text-xs italic text-faded">
                      {t("edited_note", { date: formatDate(e.edited_at), name: personName(e.edited_by) })}
                    </p>
                  )}
                  <div className="no-print mt-2 flex gap-4 text-sm">
                    <Link
                      href={`/equipment/${machine.id}/${e.kind === "repair" ? "repair" : "log-work"}?entry=${e.id}`}
                      className={btnQuiet}
                    >
                      {t("edit")}
                    </Link>
                    <button onClick={() => deleteEntry(e)} className={`${btnQuiet} hover:text-safety`}>
                      {t("delete")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

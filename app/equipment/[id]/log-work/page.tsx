"use client";

// LOG WORK - the 30-second form.
//   1. What was done? (this machine's services and repairs)
//   2. Date (today), meter reading, notes
//   3. Parts used: filled in from the kit; uncheck, change qty, or add more
//   4. Save. Odd meter readings get a soft warning first.
//
// The same form also:
//   ?entry=ID  edits an existing entry (keeps an "Edited by" note)
//   ?issue=ID  fixes an open issue: the issue is closed and linked to this entry
//   ?job=ID    starts with that service or repair already picked

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
  PartUsed,
  ServiceName,
  todayISO,
} from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { formatDate, formatReading, jobName } from "@/lib/i18n";
import { checkReading, MeterWarning, Reading } from "@/lib/meter";
import {
  AppPage,
  ErrorText,
  Field,
  Loading,
  btnOutline,
  btnPrimary,
  btnQuiet,
  cardCls,
  inputCls,
  labelCls,
} from "@/components/ui";
import PartPicker from "@/components/PartPicker";
import WarningBox from "@/components/WarningBox";

type Job = MachineService & { service_names: ServiceName | null };
type Kit = KitPart & { parts_catalog: CatalogPart | null };
type PartRow = {
  key: string;
  part_id: string | null;
  part_number: string;
  description: string | null;
  quantity: number;
  checked: boolean;
  fromKit: boolean;
};

function readParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export default function LogWorkPage() {
  return (
    <AppPage nav={false}>
      <LogWorkForm />
    </AppPage>
  );
}

function LogWorkForm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { farm, person, t, lang } = useSession();

  const [machine, setMachine] = useState<Equipment | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [catalog, setCatalog] = useState<CatalogPart[]>([]);
  const [history, setHistory] = useState<Reading[]>([]);
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);

  const [jobId, setJobId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reading, setReading] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<PartRow[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const [warnings, setWarnings] = useState<MeterWarning[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // ---------- Load ----------
  useEffect(() => {
    (async () => {
      const entryId = readParam("entry");
      const issueId = readParam("issue");
      const startJob = readParam("job");

      const [eq, js, cat, lg] = await Promise.all([
        supabase.from("equipment").select("*").eq("id", id).maybeSingle(),
        supabase.from("machine_services").select("*, service_names(*)").eq("equipment_id", id),
        supabase.from("parts_catalog").select("*").order("part_key"),
        supabase
          .from("log_entries")
          .select("id, service_date, meter_reading")
          .eq("equipment_id", id)
          .not("meter_reading", "is", null),
      ]);
      const m = eq.data as Equipment | null;
      const allJobs = (js.data as Job[]) || [];
      let myKits: Kit[] = [];
      if (allJobs.length) {
        const { data } = await supabase
          .from("kit_parts")
          .select("*, parts_catalog(*)")
          .in("machine_service_id", allJobs.map((j) => j.id));
        myKits = (data as Kit[]) || [];
      }

      // Meter history for the odd-reading checks (not counting the entry being edited)
      const hist: Reading[] = (lg.data || [])
        .filter((l) => l.id !== entryId)
        .map((l) => ({ date: l.service_date, reading: Number(l.meter_reading) }));
      if (!hist.length && m?.current_reading !== null && m?.current_reading !== undefined) {
        hist.push({ date: m.created_at.slice(0, 10), reading: Number(m.current_reading) });
      }

      setMachine(m);
      setJobs(allJobs);
      setKits(myKits);
      setCatalog((cat.data as CatalogPart[]) || []);
      setHistory(hist);

      if (entryId) {
        const [{ data: e }, { data: used }] = await Promise.all([
          supabase.from("log_entries").select("*").eq("id", entryId).maybeSingle(),
          supabase.from("parts_used").select("*").eq("log_entry_id", entryId),
        ]);
        if (e) {
          const le = e as LogEntry;
          setEntry(le);
          setJobId(le.machine_service_id);
          setDate(le.service_date);
          setReading(le.meter_reading !== null ? String(le.meter_reading) : "");
          setNotes(le.notes || "");
          setRows(
            ((used as PartUsed[]) || []).map((p) => ({
              key: p.id,
              part_id: p.part_id,
              part_number: p.part_number,
              description: p.description,
              quantity: p.quantity,
              checked: true,
              fromKit: false,
            }))
          );
        }
      } else if (startJob && allJobs.some((j) => j.id === startJob && !j.is_retired)) {
        pickJob(startJob, myKits, []);
      }

      if (issueId) {
        const { data: iss } = await supabase.from("issues").select("*").eq("id", issueId).maybeSingle();
        if (iss) {
          setIssue(iss as Issue);
          if (!entryId) setNotes((iss as Issue).title);
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Picking a job fills in its kit (keeps any extra parts already added)
  function pickJob(msid: string, kitList = kits, current = rows) {
    setJobId(msid);
    setWarnings([]);
    if (entry) return; // editing: keep the parts as recorded
    const extras = current.filter((r) => !r.fromKit);
    const kitRows: PartRow[] = kitList
      .filter((k) => k.machine_service_id === msid && k.parts_catalog)
      .map((k) => ({
        key: "kit-" + k.id,
        part_id: k.part_id,
        part_number: k.parts_catalog!.part_number,
        description: k.parts_catalog!.description,
        quantity: k.quantity,
        checked: true,
        fromKit: true,
      }));
    setRows([...kitRows, ...extras]);
  }

  function addExtraPart(p: CatalogPart) {
    setRows((rs) => {
      const existing = rs.find((r) => r.part_id === p.id);
      if (existing) return rs.map((r) => (r === existing ? { ...r, checked: true } : r));
      return [
        ...rs,
        {
          key: "extra-" + p.id,
          part_id: p.id,
          part_number: p.part_number,
          description: p.description,
          quantity: 1,
          checked: true,
          fromKit: false,
        },
      ];
    });
    setShowPicker(false);
  }

  function updateRow(key: string, change: Partial<PartRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  // ---------- Save ----------
  async function submit(e?: React.FormEvent, confirmed = false) {
    e?.preventDefault();
    if (!machine || !person) return;
    setMessage("");
    if (!jobId) {
      setMessage(t("pick_job_error"));
      return;
    }
    const meterValue = machine.meter_type === "none" || reading === "" ? null : Number(reading);

    if (!confirmed) {
      const w = checkReading({
        meterType: machine.meter_type,
        history,
        newReading: meterValue,
        newDate: date,
        today: todayISO(),
        maxMilesPerDay: farm?.max_miles_per_day ?? 800,
      });
      if (w.length) {
        setWarnings(w);
        return;
      }
    }
    setWarnings([]);
    setBusy(true);

    const values = {
      machine_service_id: jobId,
      service_date: date,
      meter_reading: meterValue,
      notes: notes.trim() || null,
    };

    let entryId = entry?.id;
    if (entry) {
      const { error } = await supabase
        .from("log_entries")
        .update({ ...values, edited_at: new Date().toISOString(), edited_by: person.id })
        .eq("id", entry.id);
      if (error) return fail(error.message);
      await supabase.from("parts_used").delete().eq("log_entry_id", entry.id);
    } else {
      const { data, error } = await supabase
        .from("log_entries")
        .insert({ ...values, farm_id: farm!.id, equipment_id: machine.id, person_id: person.id })
        .select()
        .single();
      if (error) return fail(error.message);
      entryId = (data as LogEntry).id;
    }

    // Frozen receipt of the parts used
    const used = rows.filter((r) => r.checked && r.quantity > 0);
    if (used.length) {
      const { error } = await supabase.from("parts_used").insert(
        used.map((r) => ({
          farm_id: farm!.id,
          log_entry_id: entryId,
          part_id: r.part_id,
          part_number: r.part_number,
          description: r.description,
          quantity: r.quantity,
        }))
      );
      if (error) return fail(error.message);
    }

    // Keep the machine's meter up to date
    if (meterValue !== null && (machine.current_reading === null || meterValue > Number(machine.current_reading))) {
      await supabase.from("equipment").update({ current_reading: meterValue }).eq("id", machine.id);
    }

    // Close the issue this work fixed
    if (issue && issue.status === "open") {
      await supabase
        .from("issues")
        .update({ status: "fixed", fixed_by_log: entryId, fixed_at: new Date().toISOString() })
        .eq("id", issue.id);
    }

    router.replace(issue ? "/issues" : entry ? `/equipment/${machine.id}/log` : `/equipment/${machine.id}`);
  }

  function fail(msg: string) {
    setBusy(false);
    setMessage(msg || t("offline_error"));
  }

  // ---------- Screen ----------
  if (loading) return <Loading />;
  if (!machine) return <p className="py-10 text-center text-faded">{t("no_matches")}</p>;

  const visibleJobs = jobs
    .filter((j) => !j.is_retired || j.id === jobId)
    .sort((a, b) => jobName(a.service_names, lang).localeCompare(jobName(b.service_names, lang)));
  const services = visibleJobs.filter((j) => j.category === "service");
  const repairs = visibleJobs.filter((j) => j.category === "repair");
  const lastReading = history.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  function JobButton({ j }: { j: Job }) {
    const selected = j.id === jobId;
    return (
      <button
        type="button"
        onClick={() => pickJob(j.id)}
        aria-pressed={selected}
        className={
          "rounded border p-3 text-left font-semibold " +
          (selected ? "border-steel bg-steel text-white" : "border-seam bg-plate hover:border-steel")
        }
      >
        {jobName(j.service_names, lang)}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => submit(e)} className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href={`/equipment/${machine.id}`} className={btnQuiet}>
          ← {machine.nickname}
        </Link>
        <span className="text-sm text-faded">{person?.name}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">
          {machine.unit_number && <span className="mr-2 font-mono text-faded">#{machine.unit_number}</span>}
          {machine.nickname}
        </h1>
        <p className="text-sm text-faded">{entry ? t("edit_entry") : t("log_work")}</p>
      </div>

      {issue && (
        <p className="border-l-4 border-danger bg-dangerSoft p-3 text-sm">
          {t("fixes_issue", { title: issue.title })}
        </p>
      )}

      {/* 1. What was done */}
      <section>
        <p className={labelCls}>{t("pick_job")}</p>
        {visibleJobs.length === 0 ? (
          <div className={`${cardCls} text-sm text-faded`}>
            <p className="mb-2">{t("no_jobs_set_up")}</p>
            <Link href={`/equipment/${machine.id}/services`} className={`${btnOutline} inline-block`}>
              {t("set_up_jobs")}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {services.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-faded">{t("services")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {services.map((j) => (
                    <JobButton key={j.id} j={j} />
                  ))}
                </div>
              </div>
            )}
            {repairs.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-faded">{t("repairs")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {repairs.map((j) => (
                    <JobButton key={j.id} j={j} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. Date, meter, notes */}
      <section className="grid grid-cols-2 gap-3">
        <Field label={t("date")}>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {machine.meter_type !== "none" && (
          <Field
            label={t("meter_reading")}
            hint={
              lastReading
                ? t("last_reading", {
                    reading: formatReading(lastReading.reading, machine.meter_type, lang),
                    date: formatDate(lastReading.date),
                  })
                : undefined
            }
          >
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={reading}
              onChange={(e) => {
                setReading(e.target.value);
                setWarnings([]);
              }}
              placeholder={machine.meter_type === "miles" ? t("unit_mi") : t("unit_hrs")}
            />
          </Field>
        )}
      </section>

      <Field label={t("notes")}>
        <textarea
          className={inputCls}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("what_did_you_do")}
        />
      </Field>

      {/* 3. Parts used */}
      <section>
        <p className={labelCls}>{t("parts_used")}</p>
        {rows.length > 0 && (
          <ul className="mb-2 divide-y divide-seam rounded border border-seam bg-plate">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#1E5BA8]"
                  checked={r.checked}
                  onChange={(e) => updateRow(r.key, { checked: e.target.checked })}
                  aria-label={r.part_number}
                />
                <span className={"min-w-0 flex-1 " + (r.checked ? "" : "text-faded line-through")}>
                  <span className="font-mono font-semibold">{r.part_number}</span>
                  {r.description && <span className="block text-sm text-faded">{r.description}</span>}
                </span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  aria-label={t("qty")}
                  value={r.quantity}
                  onChange={(e) => updateRow(r.key, { quantity: Number(e.target.value) })}
                  className="w-16 rounded border border-seam p-2 text-right"
                />
              </li>
            ))}
          </ul>
        )}
        {showPicker ? (
          <div>
            <PartPicker
              catalog={catalog}
              onCatalogChange={(p) => setCatalog((c) => [...c.filter((x) => x.id !== p.id), p])}
              onPick={addExtraPart}
            />
            <button type="button" onClick={() => setShowPicker(false)} className={`${btnQuiet} mt-2`}>
              {t("cancel")}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowPicker(true)} className="text-sm font-bold text-safety">
            + {t("add_extra_part")}
          </button>
        )}
      </section>

      {/* 4. Save */}
      <ErrorText>{message}</ErrorText>
      {warnings.length > 0 ? (
        <WarningBox
          warnings={warnings.map((w) => ({ warning: w }))}
          onFix={() => setWarnings([])}
          onConfirm={() => submit(undefined, true)}
          busy={busy}
        />
      ) : (
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full py-4 text-lg`}>
          {busy ? t("saving") : t("save")}
        </button>
      )}
    </form>
  );
}

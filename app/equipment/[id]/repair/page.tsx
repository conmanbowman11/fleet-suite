"use client";

// LOG A REPAIR - a blank write-up of what happened and what was fixed.
//   - Who did the work: our crew, or an outside shop (with its name)
//   - Attach the shop's invoice (PDF) or photos
//   - Can close an open issue on this machine
//   - Parts used are optional; tracked parts come out of Inventory
// Saved in the machine's log like any other entry, as a "Repair".
//   ?issue=ID  starts with that issue picked
//   ?entry=ID  edits an existing repair

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  supabase,
  CatalogPart,
  Equipment,
  FileRef,
  Issue,
  LogEntry,
  MachineService,
  PartUsed,
  ServiceName,
  todayISO,
} from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { formatDate, formatReading } from "@/lib/i18n";
import { checkReading, MeterWarning, Reading } from "@/lib/meter";
import { AppPage, ErrorText, Field, Loading, btnPrimary, btnQuiet, inputCls, labelCls } from "@/components/ui";
import PartPicker from "@/components/PartPicker";
import WarningBox from "@/components/WarningBox";
import { FileText, Paperclip, X } from "lucide-react";

const BUCKET = "repair-files";
const MAX_BYTES = 20 * 1024 * 1024;

type Job = MachineService & { service_names: ServiceName | null };
type PartRow = { key: string; part_id: string | null; part_number: string; description: string | null; unit: string; quantity: string };

function readParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export default function RepairPage() {
  return (
    <AppPage nav={false}>
      <RepairForm />
    </AppPage>
  );
}

function RepairForm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { farm, person, t, lang } = useSession();
  const fileInput = useRef<HTMLInputElement>(null);

  const [machine, setMachine] = useState<Equipment | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [catalog, setCatalog] = useState<CatalogPart[]>([]);
  const [openIssues, setOpenIssues] = useState<Issue[]>([]);
  const [history, setHistory] = useState<Reading[]>([]);
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(todayISO());
  const [reading, setReading] = useState("");
  const [doneBy, setDoneBy] = useState<"crew" | "outside">("crew");
  const [vendor, setVendor] = useState("");
  const [writeup, setWriteup] = useState("");
  const [issueId, setIssueId] = useState("");
  const [rows, setRows] = useState<PartRow[]>([]);
  const [keptFiles, setKeptFiles] = useState<FileRef[]>([]);
  const [removedFiles, setRemovedFiles] = useState<FileRef[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [warnings, setWarnings] = useState<MeterWarning[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"" | "saving" | "uploading">("");

  useEffect(() => {
    (async () => {
      const entryId = readParam("entry");
      const startIssue = readParam("issue");
      const [eq, js, cat, lg, iss] = await Promise.all([
        supabase.from("equipment").select("*").eq("id", id).maybeSingle(),
        supabase.from("machine_services").select("*, service_names(*)").eq("equipment_id", id),
        supabase.from("parts_catalog").select("*").order("part_key"),
        supabase
          .from("log_entries")
          .select("id, service_date, meter_reading")
          .eq("equipment_id", id)
          .not("meter_reading", "is", null),
        supabase.from("issues").select("*").eq("equipment_id", id).eq("status", "open").order("reported_at"),
      ]);
      const m = eq.data as Equipment | null;
      const cat2 = (cat.data as CatalogPart[]) || [];
      const hist: Reading[] = (lg.data || [])
        .filter((l) => l.id !== entryId)
        .map((l) => ({ date: l.service_date, reading: Number(l.meter_reading) }));
      if (!hist.length && m?.current_reading !== null && m?.current_reading !== undefined) {
        hist.push({ date: m.created_at.slice(0, 10), reading: Number(m.current_reading) });
      }
      setMachine(m);
      setJobs((js.data as Job[]) || []);
      setCatalog(cat2);
      setOpenIssues((iss.data as Issue[]) || []);
      setHistory(hist);
      if (startIssue && (iss.data || []).some((i) => i.id === startIssue)) setIssueId(startIssue);

      if (entryId) {
        const [{ data: e }, { data: used }] = await Promise.all([
          supabase.from("log_entries").select("*").eq("id", entryId).maybeSingle(),
          supabase.from("parts_used").select("*").eq("log_entry_id", entryId),
        ]);
        if (e) {
          const le = e as LogEntry;
          setEntry(le);
          setDate(le.service_date);
          setReading(le.meter_reading !== null ? String(le.meter_reading) : "");
          setDoneBy(le.done_by === "outside" ? "outside" : "crew");
          setVendor(le.vendor || "");
          setWriteup(le.notes || "");
          setKeptFiles(le.files || []);
          setRows(
            ((used as PartUsed[]) || []).map((p) => ({
              key: p.id,
              part_id: p.part_id,
              part_number: p.part_number,
              description: p.description,
              unit: cat2.find((c) => c.id === p.part_id)?.unit || "each",
              quantity: String(p.quantity),
            }))
          );
        }
      }
      setLoading(false);
    })();
  }, [id]);

  function addPart(p: CatalogPart) {
    setRows((rs) =>
      rs.some((r) => r.part_id === p.id)
        ? rs
        : [
            ...rs,
            {
              key: "p-" + p.id,
              part_id: p.id,
              part_number: p.part_number,
              description: p.description,
              unit: p.unit || "each",
              quantity: "1",
            },
          ]
    );
  }

  function pickFiles(list: FileList | null) {
    setMessage("");
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_BYTES) setMessage(t("file_too_big", { name: f.name }));
      else ok.push(f);
    }
    setNewFiles((fs) => [...fs, ...ok]);
    if (fileInput.current) fileInput.current.value = "";
  }

  // Every machine gets one "General Repair" entry type for its repairs
  async function repairJobId(): Promise<string | null> {
    if (entry) return entry.machine_service_id;
    const existing = jobs.find(
      (j) => j.category === "repair" && j.service_names?.farm_id === null && j.service_names?.name === "General Repair"
    );
    if (existing) return existing.id;
    const { data: names } = await supabase.from("service_names").select("*").eq("category", "repair");
    const list = (names as ServiceName[]) || [];
    const name = list.find((n) => n.farm_id === null && n.name === "General Repair") || list[0];
    if (!name) return null;
    const mine = jobs.find((j) => j.service_name_id === name.id);
    if (mine) return mine.id;
    const { data, error } = await supabase
      .from("machine_services")
      .insert({ farm_id: farm!.id, equipment_id: id, service_name_id: name.id, category: "repair" })
      .select("id")
      .single();
    if (error && error.code === "23505") {
      const { data: again } = await supabase
        .from("machine_services")
        .select("id")
        .eq("equipment_id", id)
        .eq("service_name_id", name.id)
        .maybeSingle();
      return again?.id ?? null;
    }
    return data?.id ?? null;
  }

  async function submit(e?: React.FormEvent, confirmed = false) {
    e?.preventDefault();
    if (!machine || !person) return;
    setMessage("");
    if (!writeup.trim()) return setMessage(t("repair_writeup_required"));
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
      if (w.length) return setWarnings(w);
    }
    setWarnings([]);

    // 1. Upload any new files
    setBusy("uploading");
    const uploaded: FileRef[] = [];
    for (const f of newFiles) {
      const safe = f.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
      const path = `${farm!.id}/${machine.id}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
      if (error) return fail(error.message);
      uploaded.push({ path, name: f.name, type: f.type });
    }

    // 2. Save the entry
    setBusy("saving");
    const jobId = await repairJobId();
    if (!jobId) return fail(t("error_generic"));
    const values = {
      machine_service_id: jobId,
      kind: "repair" as const,
      service_date: date,
      meter_reading: meterValue,
      notes: writeup.trim(),
      done_by: doneBy,
      vendor: doneBy === "outside" ? vendor.trim() || null : null,
      files: [...keptFiles, ...uploaded],
    };

    let entryId = entry?.id;
    if (entry) {
      const { error } = await supabase
        .from("log_entries")
        .update({ ...values, edited_at: new Date().toISOString(), edited_by: person.id })
        .eq("id", entry.id);
      if (error) return fail(error.message);
      await supabase.from("parts_used").delete().eq("log_entry_id", entry.id);
      if (removedFiles.length) await supabase.storage.from(BUCKET).remove(removedFiles.map((f) => f.path));
    } else {
      const { data, error } = await supabase
        .from("log_entries")
        .insert({ ...values, farm_id: farm!.id, equipment_id: machine.id, person_id: person.id })
        .select()
        .single();
      if (error) return fail(error.message);
      entryId = (data as LogEntry).id;
    }

    // 3. Parts used (tracked ones come out of inventory)
    const used = rows.filter((r) => Number(r.quantity) > 0);
    if (used.length) {
      const { error } = await supabase.from("parts_used").insert(
        used.map((r) => ({
          farm_id: farm!.id,
          log_entry_id: entryId,
          part_id: r.part_id,
          part_number: r.part_number,
          description: r.description,
          quantity: Number(r.quantity),
        }))
      );
      if (error) return fail(error.message);
    }

    // 4. Meter and issue
    if (meterValue !== null && (machine.current_reading === null || meterValue > Number(machine.current_reading))) {
      await supabase.from("equipment").update({ current_reading: meterValue }).eq("id", machine.id);
    }
    if (issueId) {
      await supabase
        .from("issues")
        .update({ status: "fixed", fixed_by_log: entryId, fixed_at: new Date().toISOString() })
        .eq("id", issueId);
    }

    router.replace(entry ? `/equipment/${machine.id}/log` : `/equipment/${machine.id}`);
  }

  function fail(msg: string) {
    setBusy("");
    setMessage(msg || t("offline_error"));
  }

  if (loading) return <Loading />;
  if (!machine) return <p className="py-10 text-center text-faded">{t("no_matches")}</p>;

  const lastReading = history.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const chosenIssue = openIssues.find((i) => i.id === issueId);

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
        <p className="text-sm text-faded">{entry ? t("edit_repair") : t("log_repair")}</p>
      </div>

      {chosenIssue && (
        <p className="border-l-4 border-danger bg-dangerSoft p-3 text-sm">
          {t("fixes_issue", { title: chosenIssue.title })}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Field label={t("date")}>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {machine.meter_type !== "none" && (
          <Field
            label={`${t("meter_reading")} (${t("optional")})`}
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
              className={`${inputCls} font-mono`}
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

      <fieldset>
        <legend className={labelCls}>{t("who_did_work")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["crew", "outside"] as const).map((v) => (
            <button
              type="button"
              key={v}
              onClick={() => setDoneBy(v)}
              aria-pressed={doneBy === v}
              className={
                "rounded-md border-2 p-3 font-semibold " +
                (doneBy === v ? "border-navy bg-navy text-white" : "border-seam bg-plate hover:border-navy")
              }
            >
              {t(v === "crew" ? "done_by_crew" : "done_by_outside")}
            </button>
          ))}
        </div>
        {doneBy === "outside" && (
          <input
            className={`${inputCls} mt-2`}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder={t("shop_name")}
            aria-label={t("shop_name")}
          />
        )}
      </fieldset>

      <Field label={t("repair_writeup")}>
        <textarea className={inputCls} rows={6} value={writeup} onChange={(e) => setWriteup(e.target.value)} />
      </Field>

      {/* Invoice or photos */}
      <section>
        <p className={labelCls}>{t("files_label")}</p>
        {(keptFiles.length > 0 || newFiles.length > 0) && (
          <ul className="mb-2 divide-y divide-seam rounded-md border border-seam bg-plate">
            {keptFiles.map((f) => (
              <li key={f.path} className="flex items-center gap-2 px-3 py-2 text-sm">
                <FileText size={16} className="shrink-0 text-faded" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button
                  type="button"
                  aria-label={t("remove")}
                  onClick={() => {
                    setKeptFiles((fs) => fs.filter((x) => x.path !== f.path));
                    setRemovedFiles((fs) => [...fs, f]);
                  }}
                  className="rounded p-1 text-faded hover:text-danger"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
            {newFiles.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <FileText size={16} className="shrink-0 text-safety" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-faded">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                <button
                  type="button"
                  aria-label={t("remove")}
                  onClick={() => setNewFiles((fs) => fs.filter((_, idx) => idx !== i))}
                  className="rounded p-1 text-faded hover:text-danger"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-seam bg-plate p-4 text-sm font-semibold text-faded hover:border-safety hover:text-safety">
          <Paperclip size={18} aria-hidden="true" /> {t("add_files")}
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="sr-only"
            onChange={(e) => pickFiles(e.target.files)}
          />
        </label>
      </section>

      {openIssues.length > 0 && (
        <Field label={t("fixes_open_issue")}>
          <select className={inputCls} value={issueId} onChange={(e) => setIssueId(e.target.value)}>
            <option value="">{t("no_issue")}</option>
            {openIssues.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title} ({formatDate(i.reported_at)})
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Parts used (optional) */}
      <section>
        <p className={labelCls}>{t("parts_used_optional")}</p>
        {rows.length > 0 && (
          <ul className="mb-2 divide-y divide-seam rounded-md border border-seam bg-plate">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="font-mono font-semibold">{r.part_number}</span>
                  {r.description && <span className="block truncate text-sm text-faded">{r.description}</span>}
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  aria-label={`${r.part_number} ${t("qty")}`}
                  value={r.quantity}
                  onChange={(e) =>
                    setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, quantity: e.target.value } : x)))
                  }
                  className="w-20 rounded border border-seam p-2 text-right font-mono"
                />
                {r.unit !== "each" && <span className="-ml-1 w-7 text-xs text-faded">{r.unit}</span>}
                <button
                  type="button"
                  aria-label={t("remove")}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="rounded p-1 text-faded hover:text-danger"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <PartPicker
          catalog={catalog}
          onCatalogChange={(p) => setCatalog((c) => [...c.filter((x) => x.id !== p.id), p])}
          onPick={addPart}
        />
      </section>

      <ErrorText>{message}</ErrorText>
      {warnings.length > 0 ? (
        <WarningBox
          warnings={warnings.map((w) => ({ warning: w }))}
          onFix={() => setWarnings([])}
          onConfirm={() => submit(undefined, true)}
          busy={!!busy}
        />
      ) : (
        <button type="submit" disabled={!!busy} className={`${btnPrimary} w-full py-4 text-lg`}>
          {busy === "uploading" ? t("uploading") : busy === "saving" ? t("saving") : t("save_repair")}
        </button>
      )}
    </form>
  );
}

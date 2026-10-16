"use client";

// LOG ON SEVERAL MACHINES - e.g. greasing eight machines in one morning.
//   1. Pick the service
//   2. Check the machines (only ones that have that service set up)
//   3. Date and notes once, for all of them
//   4. A meter reading per machine; each machine's kit is pre-filled
// Saves one normal log entry per machine, so every machine's own
// history stays complete. Entries saved together share a batch ID.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  supabase,
  CatalogPart,
  Equipment,
  KitPart,
  MachineService,
  ServiceName,
  todayISO,
} from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { jobName } from "@/lib/i18n";
import { checkReading, MeterWarning, Reading } from "@/lib/meter";
import { AppPage, ErrorText, Field, Loading, btnPrimary, btnQuiet, cardCls, inputCls, labelCls } from "@/components/ui";
import WarningBox from "@/components/WarningBox";

type Job = MachineService & { service_names: ServiceName | null };
type Kit = KitPart & { parts_catalog: CatalogPart | null };
type Row = { checked: boolean; reading: string; parts: Record<string, { checked: boolean; qty: number }> };

export default function BatchPage() {
  return (
    <AppPage>
      <BatchForm />
    </AppPage>
  );
}

function BatchForm() {
  const router = useRouter();
  const { farm, person, t, lang } = useSession();

  const [machines, setMachines] = useState<Equipment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [history, setHistory] = useState<Record<string, Reading[]>>({});
  const [loading, setLoading] = useState(true);

  const [nameId, setNameId] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [warnings, setWarnings] = useState<{ label: string; warning: MeterWarning }[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [eq, js, lg] = await Promise.all([
        supabase.from("equipment").select("*").eq("is_active", true).order("nickname"),
        supabase
          .from("machine_services")
          .select("*, service_names(*)")
          .eq("is_retired", false)
          .eq("category", "service"),
        supabase
          .from("log_entries")
          .select("equipment_id, service_date, meter_reading")
          .not("meter_reading", "is", null),
      ]);
      const allJobs = (js.data as Job[]) || [];
      let allKits: Kit[] = [];
      if (allJobs.length) {
        const { data } = await supabase
          .from("kit_parts")
          .select("*, parts_catalog(*)")
          .in("machine_service_id", allJobs.map((j) => j.id));
        allKits = (data as Kit[]) || [];
      }
      const ms = (eq.data as Equipment[]) || [];
      const hist: Record<string, Reading[]> = {};
      for (const l of lg.data || []) {
        (hist[l.equipment_id] ||= []).push({ date: l.service_date, reading: Number(l.meter_reading) });
      }
      for (const m of ms) {
        if (!hist[m.id]?.length && m.current_reading !== null) {
          hist[m.id] = [{ date: m.created_at.slice(0, 10), reading: Number(m.current_reading) }];
        }
      }
      setMachines(ms);
      setJobs(allJobs.filter((j) => ms.some((m) => m.id === j.equipment_id)));
      setKits(allKits);
      setHistory(hist);
      setLoading(false);
    })();
  }, []);

  // Service names that are set up on at least one active machine
  const serviceOptions = useMemo(() => {
    const seen = new Map<string, { name: ServiceName; count: number }>();
    for (const j of jobs) {
      if (!j.service_names) continue;
      const cur = seen.get(j.service_name_id);
      seen.set(j.service_name_id, { name: j.service_names, count: (cur?.count || 0) + 1 });
    }
    return [...seen.values()].sort((a, b) => jobName(a.name, lang).localeCompare(jobName(b.name, lang)));
  }, [jobs, lang]);

  const jobsForName = jobs.filter((j) => j.service_name_id === nameId);
  const machineFor = (j: Job) => machines.find((m) => m.id === j.equipment_id)!;

  function chooseService(id: string) {
    setNameId(id);
    setWarnings([]);
    setMessage("");
    const next: Record<string, Row> = {};
    for (const j of jobs.filter((x) => x.service_name_id === id)) {
      const parts: Row["parts"] = {};
      for (const k of kits.filter((k) => k.machine_service_id === j.id)) {
        parts[k.id] = { checked: true, qty: k.quantity };
      }
      next[j.id] = { checked: true, reading: "", parts };
    }
    setRows(next);
  }

  function updateRow(jid: string, change: Partial<Row>) {
    setRows((r) => ({ ...r, [jid]: { ...r[jid], ...change } }));
    setWarnings([]);
  }

  const chosen = jobsForName.filter((j) => rows[j.id]?.checked);

  async function submit(confirmed = false) {
    setMessage("");
    if (!chosen.length) {
      setMessage(t("batch_pick_one"));
      return;
    }

    if (!confirmed) {
      const found: { label: string; warning: MeterWarning }[] = [];
      for (const j of chosen) {
        const m = machineFor(j);
        const r = rows[j.id].reading;
        const ws = checkReading({
          meterType: m.meter_type,
          history: history[m.id] || [],
          newReading: m.meter_type === "none" || r === "" ? null : Number(r),
          newDate: date,
          today: todayISO(),
          maxMilesPerDay: farm?.max_miles_per_day ?? 800,
        });
        for (const w of ws) found.push({ label: m.nickname, warning: w });
      }
      if (found.length) {
        setWarnings(found);
        return;
      }
    }
    setWarnings([]);
    setBusy(true);

    const batchId = crypto.randomUUID();
    const entryRows = chosen.map((j) => {
      const m = machineFor(j);
      const r = rows[j.id].reading;
      return {
        farm_id: farm!.id,
        equipment_id: m.id,
        machine_service_id: j.id,
        person_id: person!.id,
        service_date: date,
        meter_reading: m.meter_type === "none" || r === "" ? null : Number(r),
        notes: notes.trim() || null,
        batch_id: batchId,
      };
    });

    const { data, error } = await supabase.from("log_entries").insert(entryRows).select();
    if (error) {
      setBusy(false);
      setMessage(error.message || t("offline_error"));
      return;
    }

    const saved = (data as { id: string; machine_service_id: string }[]) || [];
    const usedRows = saved.flatMap((entry) =>
      kits
        .filter((k) => k.machine_service_id === entry.machine_service_id && k.parts_catalog)
        .filter((k) => rows[entry.machine_service_id].parts[k.id]?.checked)
        .map((k) => ({
          farm_id: farm!.id,
          log_entry_id: entry.id,
          part_id: k.part_id,
          part_number: k.parts_catalog!.part_number,
          description: k.parts_catalog!.description,
          quantity: rows[entry.machine_service_id].parts[k.id].qty || 1,
        }))
    );
    if (usedRows.length) await supabase.from("parts_used").insert(usedRows);

    // Keep each machine's meter up to date
    await Promise.all(
      entryRows
        .filter((e) => {
          const m = machines.find((x) => x.id === e.equipment_id)!;
          return e.meter_reading !== null && (m.current_reading === null || e.meter_reading > Number(m.current_reading));
        })
        .map((e) => supabase.from("equipment").update({ current_reading: e.meter_reading }).eq("id", e.equipment_id))
    );

    router.replace("/equipment");
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      <Link href="/equipment" className={btnQuiet}>
        ← {t("fleet")}
      </Link>
      <h1 className="text-2xl font-bold">{t("batch_title")}</h1>

      {/* 1. Service */}
      <section>
        <p className={labelCls}>{t("batch_step_service")}</p>
        {serviceOptions.length === 0 ? (
          <p className={`${cardCls} text-sm text-faded`}>{t("batch_none")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {serviceOptions.map(({ name, count }) => (
              <button
                key={name.id}
                type="button"
                onClick={() => chooseService(name.id)}
                aria-pressed={nameId === name.id}
                className={
                  "rounded border p-3 text-left font-semibold " +
                  (nameId === name.id ? "border-steel bg-steel text-white" : "border-seam bg-plate hover:border-steel")
                }
              >
                {jobName(name, lang)}
                <span className="block text-xs font-normal opacity-80">{t("machines_n", { n: count })}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {nameId && (
        <>
          {/* 2 + 4. Machines, each with its reading and kit */}
          <section>
            <p className={labelCls}>
              {t("batch_step_machines")} · {t("batch_meters")}
            </p>
            <ul className="space-y-2">
              {jobsForName
                .slice()
                .sort((a, b) => machineFor(a).nickname.localeCompare(machineFor(b).nickname))
                .map((j) => {
                  const m = machineFor(j);
                  const row = rows[j.id];
                  if (!row) return null;
                  const kit = kits.filter((k) => k.machine_service_id === j.id);
                  return (
                    <li key={j.id} className={`${cardCls} ${row.checked ? "" : "opacity-50"}`}>
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-[#1E5BA8]"
                          checked={row.checked}
                          onChange={(e) => updateRow(j.id, { checked: e.target.checked })}
                        />
                        <span className="flex-1 font-semibold">
                          {m.unit_number && <span className="mr-1 font-mono text-faded">#{m.unit_number}</span>}
                          {m.nickname}
                        </span>
                        {m.meter_type !== "none" && (
                          <input
                            type="number"
                            inputMode="decimal"
                            disabled={!row.checked}
                            value={row.reading}
                            onChange={(e) => updateRow(j.id, { reading: e.target.value })}
                            placeholder={m.meter_type === "miles" ? t("unit_mi") : t("unit_hrs")}
                            aria-label={`${m.nickname} ${t("meter_reading")}`}
                            className="w-28 rounded border border-seam p-2 text-right"
                          />
                        )}
                      </label>
                      {row.checked && kit.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-seam pt-2">
                          {kit.map((k) => {
                            const p = row.parts[k.id];
                            return (
                              <li key={k.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[#1E5BA8]"
                                  checked={p?.checked ?? false}
                                  onChange={(e) =>
                                    updateRow(j.id, {
                                      parts: { ...row.parts, [k.id]: { ...p, checked: e.target.checked } },
                                    })
                                  }
                                  aria-label={k.parts_catalog?.part_number}
                                />
                                <span className="flex-1 font-mono">{k.parts_catalog?.part_number}</span>
                                <span className="text-faded">×{p?.qty ?? k.quantity}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>

          {/* 3. Shared details */}
          <section className="space-y-3">
            <p className={labelCls}>{t("batch_shared")}</p>
            <Field label={t("date")}>
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t("notes")}>
              <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </section>

          <ErrorText>{message}</ErrorText>
          {warnings.length > 0 ? (
            <WarningBox
              warnings={warnings}
              onFix={() => setWarnings([])}
              onConfirm={() => submit(true)}
              busy={busy}
            />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => submit()}
              className={`${btnPrimary} w-full py-4 text-lg`}
            >
              {busy ? t("saving") : t("batch_save", { n: chosen.length })}
            </button>
          )}
        </>
      )}
    </div>
  );
}

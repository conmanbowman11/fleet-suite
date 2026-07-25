"use client";

// ONE MACHINE'S PAGE. Now five jobs:
//   1. The 30-second "Log a service" flow
//   2. Maintenance schedule: intervals + OVERDUE / DUE SOON status
//   3. Parts & filters: the machine's parts list, grouped into service kits
//   4. Full service history
//   5. Print -> clean printable service record

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase, getMyFarm } from "@/lib/supabase";
import { scheduleStatus, Schedule, LogLite } from "@/lib/maintenance";

type ServiceLog = {
  id: string;
  service_date: string;
  engine_hours: number | null;
  performed_by: string | null;
  notes: string | null;
  service_type_id: string;
  equipment_id: string;
  service_types: { name: string } | null;
};

export default function EquipmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const equipmentId = params.id as string;

  const [farm, setFarm] = useState<any>(null);
  const [equipment, setEquipment] = useState<any>(null);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Log-a-service form
  const [showLog, setShowLog] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [serviceDate, setServiceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [engineHours, setEngineHours] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Schedule form
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedTypeId, setSchedTypeId] = useState("");
  const [schedHours, setSchedHours] = useState("");
  const [schedMonths, setSchedMonths] = useState("");
  const [schedMessage, setSchedMessage] = useState("");

  // Part form
  const [showPart, setShowPart] = useState(false);
  const [partNumber, setPartNumber] = useState("");
  const [partDesc, setPartDesc] = useState("");
  const [partSupplier, setPartSupplier] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [partKit, setPartKit] = useState("");
  const [partMessage, setPartMessage] = useState("");

  useEffect(() => {
    async function load() {
      const myFarm = await getMyFarm();
      if (!myFarm) {
        router.replace("/login");
        return;
      }
      setFarm(myFarm);

      const [{ data: eq }, { data: types }, { data: logData }, { data: sch }, { data: pt }] =
        await Promise.all([
          supabase.from("equipment").select("*").eq("id", equipmentId).single(),
          supabase.from("service_types").select("*").order("name"),
          supabase
            .from("service_logs")
            .select("*, service_types(name)")
            .eq("equipment_id", equipmentId)
            .order("service_date", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase.from("service_schedules").select("*").eq("equipment_id", equipmentId),
          supabase.from("parts").select("*").eq("equipment_id", equipmentId).order("part_number"),
        ]);

      setEquipment(eq);
      setServiceTypes(types || []);
      setLogs((logData as any) || []);
      setSchedules((sch as any) || []);
      setParts(pt || []);
      setLoading(false);
    }
    load();
  }, [equipmentId, router]);

  function typeName(id: string) {
    return serviceTypes.find((t) => t.id === id)?.name || "Service";
  }

  async function saveLog() {
    setMessage("");
    if (!serviceTypeId) {
      setMessage("Pick the service performed.");
      return;
    }
    setBusy(true);

    const hoursNum = engineHours ? Number(engineHours) : null;

    const { data, error } = await supabase
      .from("service_logs")
      .insert({
        farm_id: farm.id,
        equipment_id: equipmentId,
        service_type_id: serviceTypeId,
        service_date: serviceDate,
        engine_hours: hoursNum,
        performed_by: performedBy.trim() || null,
        notes: notes.trim() || null,
      })
      .select("*, service_types(name)")
      .single();

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    if (
      hoursNum != null &&
      (equipment.current_hours == null || hoursNum > equipment.current_hours)
    ) {
      await supabase
        .from("equipment")
        .update({ current_hours: hoursNum })
        .eq("id", equipmentId);
      setEquipment({ ...equipment, current_hours: hoursNum });
    }

    setLogs([data as any, ...logs]);
    setServiceTypeId("");
    setEngineHours("");
    setPerformedBy("");
    setNotes("");
    setShowLog(false);
    setBusy(false);
  }

  async function saveSchedule() {
    setSchedMessage("");
    if (!schedTypeId) {
      setSchedMessage("Pick the service to track.");
      return;
    }
    if (!schedHours && !schedMonths) {
      setSchedMessage("Set an hours interval, a months interval, or both.");
      return;
    }
    const { data, error } = await supabase
      .from("service_schedules")
      .insert({
        farm_id: farm.id,
        equipment_id: equipmentId,
        service_type_id: schedTypeId,
        interval_hours: schedHours ? Number(schedHours) : null,
        interval_months: schedMonths ? Number(schedMonths) : null,
      })
      .select()
      .single();
    if (error) {
      setSchedMessage(error.message);
      return;
    }
    setSchedules([...schedules, data as any]);
    setSchedTypeId("");
    setSchedHours("");
    setSchedMonths("");
    setShowSchedule(false);
  }

  async function deleteSchedule(id: string) {
    await supabase.from("service_schedules").delete().eq("id", id);
    setSchedules(schedules.filter((s) => s.id !== id));
  }

  async function savePart() {
    setPartMessage("");
    if (!partNumber.trim()) {
      setPartMessage("Enter the part number.");
      return;
    }
    const { data, error } = await supabase
      .from("parts")
      .insert({
        farm_id: farm.id,
        equipment_id: equipmentId,
        part_number: partNumber.trim(),
        description: partDesc.trim() || null,
        supplier: partSupplier.trim() || null,
        typical_quantity: partQty ? Number(partQty) : 1,
        service_type_id: partKit || null,
      })
      .select()
      .single();
    if (error) {
      setPartMessage(error.message);
      return;
    }
    setParts(
      [...parts, data].sort((a, b) => a.part_number.localeCompare(b.part_number))
    );
    setPartNumber("");
    setPartDesc("");
    setPartSupplier("");
    setPartQty("1");
    setPartKit("");
    setShowPart(false);
  }

  async function deletePart(id: string) {
    await supabase.from("parts").delete().eq("id", id);
    setParts(parts.filter((p) => p.id !== id));
  }

  async function deleteLog(id: string) {
    const ok = window.confirm("Delete this log entry? This can't be undone.");
    if (!ok) return;
    const { error } = await supabase.from("service_logs").delete().eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setLogs(logs.filter((l) => l.id !== id));
  }

  async function deleteMachine() {
    const ok = window.confirm(
      `Delete ${equipment.nickname} for good?\n\nThis also permanently deletes its ENTIRE service history, parts list, and maintenance schedules. There is no undo.\n\nIf you're retiring or selling the machine, keep it instead - the printed history is worth money at resale.`
    );
    if (!ok) return;
    const { error } = await supabase
      .from("equipment")
      .delete()
      .eq("id", equipmentId);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.replace("/equipment");
  }

  function formatDate(d: string) {
    const [y, m, day] = d.split("-");
    return `${m}/${day}/${y}`;
  }

  if (loading || !equipment) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-faded tracking-widest uppercase">Loading…</p>
      </main>
    );
  }

  const logLites: LogLite[] = logs.map((l) => ({
    equipment_id: l.equipment_id,
    service_type_id: l.service_type_id,
    service_date: l.service_date,
    engine_hours: l.engine_hours,
  }));

  return (
    <main className="mx-auto max-w-2xl p-4">
      {/* Back + Print */}
      <div className="no-print mb-4 flex items-center justify-between">
        <button
          onClick={() => router.push("/equipment")}
          className="text-sm text-faded underline"
        >
          ← All equipment
        </button>
        <button
          onClick={() => window.print()}
          className="rounded border border-steel px-4 py-2 text-sm font-bold text-steel hover:bg-steel hover:text-white"
        >
          Print service record
        </button>
      </div>

      <div className="print-sheet rounded-lg border border-seam bg-plate p-5 shadow-sm">
        {/* Machine data plate */}
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-faded">
          {farm?.name} — Equipment Service Record
        </div>
        <h1 className="text-2xl font-bold">{equipment.nickname}</h1>
        <p className="mb-4 text-sm text-faded">
          {[equipment.make, equipment.model].filter(Boolean).join(" ")}
          {equipment.serial_number ? ` · SN ${equipment.serial_number}` : ""}
          {equipment.current_hours != null
            ? ` · ${equipment.current_hours.toLocaleString()} engine hrs`
            : ""}
        </p>

        {/* Log a service */}
        <div className="no-print mb-5">
          {!showLog ? (
            <button
              onClick={() => setShowLog(true)}
              className="w-full rounded bg-safety p-4 text-lg font-bold text-white hover:bg-safetyDark"
            >
              + Log a service
            </button>
          ) : (
            <div className="rounded-lg border border-seam bg-field p-4">
              <h2 className="mb-3 font-semibold">Log a service</h2>

              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-faded">
                Service performed
              </label>
              <select
                value={serviceTypeId}
                onChange={(e) => setServiceTypeId(e.target.value)}
                className="mb-1 w-full rounded border border-seam bg-plate p-3 text-base"
              >
                <option value="">Choose service…</option>
                {serviceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="mb-3 text-xs text-faded">
                Missing one? Add it on the Services tab — it&apos;ll show up here.
              </p>

              <div className="mb-3 flex gap-2">
                <div className="w-1/2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-faded">
                    Date
                  </label>
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    className="w-full rounded border border-seam bg-plate p-3"
                  />
                </div>
                <div className="w-1/2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-faded">
                    Engine hours
                  </label>
                  <input
                    type="number"
                    value={engineHours}
                    onChange={(e) => setEngineHours(e.target.value)}
                    className="w-full rounded border border-seam bg-plate p-3"
                    placeholder="2450"
                  />
                </div>
              </div>

              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-faded">
                Performed by
              </label>
              <input
                type="text"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                className="mb-3 w-full rounded border border-seam bg-plate p-3"
                placeholder="Name"
              />

              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-faded">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mb-3 w-full rounded border border-seam bg-plate p-3"
                rows={2}
                placeholder="Found hydraulic leak, ordered seal…"
              />

              {message && (
                <p className="mb-3 rounded bg-orange-50 p-3 text-sm text-safety">
                  {message}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={saveLog}
                  disabled={busy}
                  className="w-2/3 rounded bg-safety p-3 font-bold text-white hover:bg-safetyDark disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save to log"}
                </button>
                <button
                  onClick={() => setShowLog(false)}
                  className="w-1/3 rounded border border-seam bg-plate p-3 text-faded"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Maintenance schedule */}
        <div className="no-print mb-5">
          <div className="mb-2 flex items-center justify-between border-b border-seam pb-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-faded">
              Maintenance schedule
            </h2>
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className="text-sm font-bold text-safety"
            >
              {showSchedule ? "Close" : "+ Track a service"}
            </button>
          </div>

          {showSchedule && (
            <div className="mb-3 rounded-lg border border-seam bg-field p-4">
              <select
                value={schedTypeId}
                onChange={(e) => setSchedTypeId(e.target.value)}
                className="mb-2 w-full rounded border border-seam bg-plate p-3"
              >
                <option value="">Which service to track…</option>
                {serviceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <div className="mb-2 flex gap-2">
                <input
                  type="number"
                  className="w-1/2 rounded border border-seam p-3"
                  placeholder="Every X hours"
                  value={schedHours}
                  onChange={(e) => setSchedHours(e.target.value)}
                />
                <input
                  type="number"
                  className="w-1/2 rounded border border-seam p-3"
                  placeholder="Every X months"
                  value={schedMonths}
                  onChange={(e) => setSchedMonths(e.target.value)}
                />
              </div>
              {schedMessage && (
                <p className="mb-2 rounded bg-orange-50 p-3 text-sm text-safety">
                  {schedMessage}
                </p>
              )}
              <button
                onClick={saveSchedule}
                className="w-full rounded bg-steel p-3 font-bold text-white hover:bg-steelLight"
              >
                Save schedule
              </button>
            </div>
          )}

          {schedules.length === 0 ? (
            <p className="py-2 text-sm text-faded">
              Nothing tracked yet. Hours intervals show the next-due meter
              reading; month intervals get OVERDUE / DUE SOON flags (the app
              always knows the date).
            </p>
          ) : (
            <ul className="divide-y divide-seam">
              {schedules.map((s) => {
                const { status, detail } = scheduleStatus(s, logLites);
                const badge =
                  status === "overdue"
                    ? { label: "OVERDUE", cls: "bg-safety text-white" }
                    : status === "due_soon"
                    ? { label: "DUE SOON", cls: "bg-amber-400 text-ink" }
                    : status === "no_record"
                    ? { label: "NO RECORD", cls: "bg-seam text-faded" }
                    : status === "ok"
                    ? { label: "OK", cls: "bg-steel text-white" }
                    : null;
                const every = [
                  s.interval_hours ? `${Number(s.interval_hours).toLocaleString()} hrs` : null,
                  s.interval_months ? `${s.interval_months} mo` : null,
                ]
                  .filter(Boolean)
                  .join(" / ");
                return (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    {badge && (
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold tracking-wider ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    )}
                    <span className="flex-1">
                      <span className="font-semibold">
                        {typeName(s.service_type_id)}
                      </span>
                      <span className="block text-sm text-faded">
                        every {every} · {detail}
                      </span>
                    </span>
                    <button
                      onClick={() => deleteSchedule(s.id)}
                      className="text-xs text-faded underline"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Parts & filters */}
        <div className="no-print mb-5">
          <div className="mb-2 flex items-center justify-between border-b border-seam pb-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-faded">
              Parts &amp; filters
            </h2>
            <button
              onClick={() => setShowPart(!showPart)}
              className="text-sm font-bold text-safety"
            >
              {showPart ? "Close" : "+ Add part"}
            </button>
          </div>

          {showPart && (
            <div className="mb-3 rounded-lg border border-seam bg-field p-4">
              <div className="mb-2 flex gap-2">
                <input
                  className="w-1/2 rounded border border-seam p-3"
                  placeholder="Part number — required"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                />
                <input
                  className="w-1/2 rounded border border-seam p-3"
                  placeholder="Description (oil filter)"
                  value={partDesc}
                  onChange={(e) => setPartDesc(e.target.value)}
                />
              </div>
              <div className="mb-2 flex gap-2">
                <input
                  className="w-1/2 rounded border border-seam p-3"
                  placeholder="Supplier"
                  value={partSupplier}
                  onChange={(e) => setPartSupplier(e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  className="w-1/2 rounded border border-seam p-3"
                  placeholder="Typical qty"
                  value={partQty}
                  onChange={(e) => setPartQty(e.target.value)}
                />
              </div>
              <select
                value={partKit}
                onChange={(e) => setPartKit(e.target.value)}
                className="mb-2 w-full rounded border border-seam bg-plate p-3"
              >
                <option value="">Not part of a service kit</option>
                {serviceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    Part of the {t.name} kit
                  </option>
                ))}
              </select>
              {partMessage && (
                <p className="mb-2 rounded bg-orange-50 p-3 text-sm text-safety">
                  {partMessage}
                </p>
              )}
              <button
                onClick={savePart}
                className="w-full rounded bg-steel p-3 font-bold text-white hover:bg-steelLight"
              >
                Save part
              </button>
            </div>
          )}

          {parts.length === 0 ? (
            <p className="py-2 text-sm text-faded">
              No parts entered. Add this machine&apos;s filters once, and building
              supplier orders becomes two taps on the Orders tab.
            </p>
          ) : (
            <ul className="divide-y divide-seam">
              {parts.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1">
                    <span className="font-mono font-semibold">{p.part_number}</span>
                    <span className="block text-sm text-faded">
                      {p.description || "—"}
                      {p.service_type_id ? ` · ${typeName(p.service_type_id)} kit` : ""}
                      {p.supplier ? ` · ${p.supplier}` : ""}
                    </span>
                  </span>
                  <button
                    onClick={() => deletePart(p.id)}
                    className="text-xs text-faded underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Service history */}
        <h2 className="mb-2 border-b border-seam pb-1 text-xs font-semibold uppercase tracking-widest text-faded">
          Service history
        </h2>
        {logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-faded">
            No services logged yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-faded">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Service</th>
                <th className="py-2 pr-2">Hours</th>
                <th className="py-2">By</th>
                <th className="no-print py-2"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-seam align-top">
                  <td className="py-2 pr-2 whitespace-nowrap font-mono">
                    {formatDate(log.service_date)}
                  </td>
                  <td className="py-2 pr-2">
                    <span className="font-semibold">
                      {log.service_types?.name || "Service"}
                    </span>
                    {log.notes && <div className="text-faded">{log.notes}</div>}
                  </td>
                  <td className="py-2 pr-2 font-mono">
                    {log.engine_hours != null
                      ? log.engine_hours.toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-2">{log.performed_by || "—"}</td>
                  <td className="no-print py-2 pl-2 text-right">
                    <button
                      onClick={() => deleteLog(log.id)}
                      className="text-xs text-faded underline"
                      aria-label="Delete this log entry"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="no-print mt-6 text-center">
        <button
          onClick={deleteMachine}
          className="text-sm text-faded underline hover:text-safety"
        >
          Delete this machine and all its records
        </button>
      </div>
    </main>
  );
}

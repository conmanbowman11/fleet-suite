"use client";

// ONE MACHINE'S PAGE. Three jobs:
//   1. The 30-second "Log a service" flow (the mechanic-in-the-field feature)
//   2. Full service history, newest first
//   3. Print button -> clean printable service record

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase, getMyFarm } from "@/lib/supabase";

type ServiceLog = {
  id: string;
  service_date: string;
  engine_hours: number | null;
  performed_by: string | null;
  notes: string | null;
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
  const [loading, setLoading] = useState(true);

  // Log-a-service form
  const [showLog, setShowLog] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [serviceDate, setServiceDate] = useState(
    new Date().toISOString().slice(0, 10) // defaults to today
  );
  const [engineHours, setEngineHours] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const myFarm = await getMyFarm();
      if (!myFarm) {
        router.replace("/login");
        return;
      }
      setFarm(myFarm);

      const { data: eq } = await supabase
        .from("equipment")
        .select("*")
        .eq("id", equipmentId)
        .single();
      setEquipment(eq);

      const { data: types } = await supabase
        .from("service_types")
        .select("*")
        .order("name");
      setServiceTypes(types || []);

      const { data: logData } = await supabase
        .from("service_logs")
        .select("*, service_types(name)")
        .eq("equipment_id", equipmentId)
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false });
      setLogs((logData as any) || []);

      setLoading(false);
    }
    load();
  }, [equipmentId, router]);

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

    // Keep the machine's "current hours" up to date automatically
    if (hoursNum != null && (equipment.current_hours == null || hoursNum > equipment.current_hours)) {
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

  return (
    <main className="mx-auto max-w-2xl p-4">
      {/* Back + Print (hidden when printing) */}
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

      {/* The printable sheet starts here */}
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

        {/* Log a service button/form (hidden when printing) */}
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
                className="mb-3 w-full rounded border border-seam bg-plate p-3 text-base"
              >
                <option value="">Choose service…</option>
                {serviceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

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
                    {log.notes && (
                      <div className="text-faded">{log.notes}</div>
                    )}
                  </td>
                  <td className="py-2 pr-2 font-mono">
                    {log.engine_hours != null
                      ? log.engine_hours.toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-2">{log.performed_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

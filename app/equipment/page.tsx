"use client";

// THE HOME SCREEN: your equipment fleet.
// Now with maintenance badges: OVERDUE / DUE SOON, computed from
// each machine's schedules + service history + engine hours.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, getMyFarm } from "@/lib/supabase";
import Nav from "@/components/Nav";
import { equipmentStatus, Schedule, LogLite, Status } from "@/lib/maintenance";

type Equipment = {
  id: string;
  nickname: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  current_hours: number | null;
};

export default function EquipmentPage() {
  const router = useRouter();
  const [farm, setFarm] = useState<any>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<LogLite[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  // Add-equipment form fields
  const [nickname, setNickname] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [hours, setHours] = useState("");
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
      const [{ data: eq }, { data: sch }, { data: lg }] = await Promise.all([
        supabase.from("equipment").select("*").eq("is_active", true).order("nickname"),
        supabase.from("service_schedules").select("*"),
        supabase
          .from("service_logs")
          .select("equipment_id, service_type_id, service_date, engine_hours"),
      ]);
      setEquipment(eq || []);
      setSchedules((sch as any) || []);
      setLogs((lg as any) || []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function addEquipment() {
    setMessage("");
    if (!nickname.trim()) {
      setMessage("Give the machine a name.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("equipment")
      .insert({
        farm_id: farm.id,
        nickname: nickname.trim(),
        make: make.trim() || null,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        current_hours: hours ? Number(hours) : null,
      })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    setEquipment(
      [...equipment, data].sort((a, b) => a.nickname.localeCompare(b.nickname))
    );
    setNickname("");
    setMake("");
    setModel("");
    setSerial("");
    setHours("");
    setShowAdd(false);
    setBusy(false);
  }

  const visible = equipment.filter((eq) =>
    (eq.nickname + " " + (eq.make || "") + " " + (eq.model || ""))
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function badgeFor(eq: Equipment): { label: string; cls: string } | null {
    const mine = schedules.filter((s) => s.equipment_id === eq.id);
    const status: Status | null = equipmentStatus(mine, logs);
    if (status === "overdue")
      return { label: "OVERDUE", cls: "bg-safety text-white" };
    if (status === "due_soon")
      return { label: "DUE SOON", cls: "bg-amber-400 text-ink" };
    if (status === "no_record")
      return { label: "NO RECORD", cls: "bg-seam text-faded" };
    return null;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-faded tracking-widest uppercase">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Nav farmName={farm?.name} />

      {/* Search + Add */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-seam bg-plate p-3 text-base"
          placeholder="Search equipment…"
        />
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="shrink-0 rounded bg-safety px-4 font-bold text-white hover:bg-safetyDark"
        >
          {showAdd ? "Close" : "+ Add"}
        </button>
      </div>

      {/* Add equipment form */}
      {showAdd && (
        <div className="mb-4 rounded-lg border border-seam bg-plate p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">New equipment</h2>
          <input
            className="mb-2 w-full rounded border border-seam p-3"
            placeholder="Nickname (e.g. Big Red) — required"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <div className="mb-2 flex gap-2">
            <input
              className="w-1/2 rounded border border-seam p-3"
              placeholder="Make (CAT)"
              value={make}
              onChange={(e) => setMake(e.target.value)}
            />
            <input
              className="w-1/2 rounded border border-seam p-3"
              placeholder="Model (Challenger 765C)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="mb-3 flex gap-2">
            <input
              className="w-1/2 rounded border border-seam p-3"
              placeholder="Serial number"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
            />
            <input
              className="w-1/2 rounded border border-seam p-3"
              placeholder="Engine hours"
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          {message && (
            <p className="mb-3 rounded bg-orange-50 p-3 text-sm text-safety">
              {message}
            </p>
          )}
          <button
            onClick={addEquipment}
            disabled={busy}
            className="w-full rounded bg-steel p-3 font-bold text-white hover:bg-steelLight disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save equipment"}
          </button>
        </div>
      )}

      {/* Equipment cards */}
      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-seam p-8 text-center text-faded">
          {equipment.length === 0
            ? "No equipment yet. Tap + Add to enter your first machine."
            : "No matches for that search."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((eq) => {
            const badge = badgeFor(eq);
            return (
              <button
                key={eq.id}
                onClick={() => router.push(`/equipment/${eq.id}`)}
                className="block w-full rounded-lg border border-seam bg-plate p-4 text-left shadow-sm hover:border-steel"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold">{eq.nickname}</span>
                  <span className="flex items-center gap-2">
                    {badge && (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold tracking-wider ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    )}
                    {eq.current_hours != null && (
                      <span className="font-mono text-sm text-faded">
                        {eq.current_hours.toLocaleString()} hrs
                      </span>
                    )}
                  </span>
                </div>
                <p className="text-sm text-faded">
                  {[eq.make, eq.model].filter(Boolean).join(" ") || "—"}
                  {eq.serial_number ? ` · SN ${eq.serial_number}` : ""}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

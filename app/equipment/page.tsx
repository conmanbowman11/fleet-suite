"use client";

// THE HOME SCREEN: your equipment fleet.
// Big tappable cards (mobile-first), search bar, and an Add Equipment form.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, getMyFarm } from "@/lib/supabase";

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
      const { data } = await supabase
        .from("equipment")
        .select("*")
        .eq("is_active", true)
        .order("nickname");
      setEquipment(data || []);
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

    setEquipment([...equipment, data].sort((a, b) => a.nickname.localeCompare(b.nickname)));
    setNickname("");
    setMake("");
    setModel("");
    setSerial("");
    setHours("");
    setShowAdd(false);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const visible = equipment.filter((eq) =>
    (eq.nickname + " " + (eq.make || "") + " " + (eq.model || ""))
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-faded tracking-widest uppercase">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider">
            {farm?.name}
          </h1>
          <p className="text-sm text-faded">Equipment fleet</p>
        </div>
        <button onClick={signOut} className="text-sm text-faded underline">
          Sign out
        </button>
      </div>

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
              placeholder="Make (John Deere)"
              value={make}
              onChange={(e) => setMake(e.target.value)}
            />
            <input
              className="w-1/2 rounded border border-seam p-3"
              placeholder="Model (8R 340)"
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
          {visible.map((eq) => (
            <button
              key={eq.id}
              onClick={() => router.push(`/equipment/${eq.id}`)}
              className="block w-full rounded-lg border border-seam bg-plate p-4 text-left shadow-sm hover:border-steel"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold">{eq.nickname}</span>
                {eq.current_hours != null && (
                  <span className="font-mono text-sm text-faded">
                    {eq.current_hours.toLocaleString()} hrs
                  </span>
                )}
              </div>
              <p className="text-sm text-faded">
                {[eq.make, eq.model].filter(Boolean).join(" ") || "—"}
                {eq.serial_number ? ` · SN ${eq.serial_number}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

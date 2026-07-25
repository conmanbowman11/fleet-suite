"use client";

// SERVICES PAGE
// The dropdown menu lives here. Built-in services keep bookkeeping
// consistent; each farm can add its own (e.g. "500 Hour Service").
// Built-ins can't be deleted. Custom ones can.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, getMyFarm } from "@/lib/supabase";
import Nav from "@/components/Nav";

export default function ServicesPage() {
  const router = useRouter();
  const [farm, setFarm] = useState<any>(null);
  const [types, setTypes] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const myFarm = await getMyFarm();
      if (!myFarm) {
        router.replace("/login");
        return;
      }
      setFarm(myFarm);
      const { data } = await supabase
        .from("service_types")
        .select("*")
        .order("name");
      setTypes(data || []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function addService() {
    setMessage("");
    const name = newName.trim();
    if (!name) {
      setMessage("Type a service name first.");
      return;
    }
    if (types.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setMessage("That service already exists — keeping the list clean keeps records consistent.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("service_types")
      .insert({ farm_id: farm.id, name })
      .select()
      .single();
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    setTypes([...types, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    setBusy(false);
  }

  async function deleteService(id: string) {
    const ok = window.confirm(
      "Remove this service from the dropdown? Past log entries that used it are kept."
    );
    if (!ok) return;
    const { error } = await supabase.from("service_types").delete().eq("id", id);
    if (error) {
      setMessage(
        "Can't remove this service because log entries or schedules still use it. That history is protected on purpose."
      );
      return;
    }
    setTypes(types.filter((t) => t.id !== id));
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-faded tracking-widest uppercase">Loading…</p>
      </main>
    );
  }

  const builtIn = types.filter((t) => !t.farm_id);
  const custom = types.filter((t) => t.farm_id);

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Nav farmName={farm?.name} />

      <div className="mb-4 rounded-lg border border-seam bg-plate p-4 shadow-sm">
        <h2 className="mb-1 font-semibold">Add a service</h2>
        <p className="mb-3 text-sm text-faded">
          Custom services show up in the dropdown when logging work — e.g.
          &ldquo;500 Hour Service&rdquo; or &ldquo;Pre-Harvest Inspection&rdquo;.
        </p>
        <div className="flex gap-2">
          <input
            className="w-full rounded border border-seam p-3"
            placeholder="Service name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            onClick={addService}
            disabled={busy}
            className="shrink-0 rounded bg-safety px-4 font-bold text-white hover:bg-safetyDark disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {message && (
          <p className="mt-3 rounded bg-orange-50 p-3 text-sm text-safety">
            {message}
          </p>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-seam bg-plate p-4 shadow-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-faded">
          Your custom services
        </h2>
        {custom.length === 0 ? (
          <p className="py-3 text-sm text-faded">None yet.</p>
        ) : (
          <ul className="divide-y divide-seam">
            {custom.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span className="font-semibold">{t.name}</span>
                <button
                  onClick={() => deleteService(t.id)}
                  className="text-sm text-faded underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-seam bg-plate p-4 shadow-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-faded">
          Built-in services (always available)
        </h2>
        <ul className="divide-y divide-seam">
          {builtIn.map((t) => (
            <li key={t.id} className="py-2 text-sm">
              {t.name}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

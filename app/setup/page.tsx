"use client";

// One-time screen after account creation: name your farm.
// This creates the "farms" row that all your data hangs off of.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SetupPage() {
  const router = useRouter();
  const [farmName, setFarmName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function createFarm() {
    setMessage("");
    if (!farmName.trim()) {
      setMessage("Give your farm a name.");
      return;
    }
    setBusy(true);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      router.replace("/login");
      return;
    }

    const { error } = await supabase.from("farms").insert({
      owner_user_id: user.id,
      name: farmName.trim(),
      contact_email: user.email,
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    router.replace("/equipment");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-seam bg-plate p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Name your farm</h1>
        <p className="mb-4 text-sm text-faded">
          This shows up on printed service records.
        </p>

        <input
          type="text"
          value={farmName}
          onChange={(e) => setFarmName(e.target.value)}
          className="mb-4 w-full rounded border border-seam p-3 text-base"
          placeholder="e.g. Bowman Family Farms"
        />

        {message && (
          <p className="mb-4 rounded bg-orange-50 p-3 text-sm text-safety">
            {message}
          </p>
        )}

        <button
          onClick={createFarm}
          disabled={busy}
          className="w-full rounded bg-safety p-3 text-base font-bold text-white hover:bg-safetyDark disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </div>
    </main>
  );
}

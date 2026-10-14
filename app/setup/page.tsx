"use client";

// ONE-TIME FARM SETUP right after the account is created.
// Creates the farm that every machine, person, and record belongs to.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { ErrorText, Loading, btnPrimary, cardCls, inputCls } from "@/components/ui";

export default function SetupPage() {
  const { status, t, refresh } = useSession();
  const router = useRouter();
  const [farmName, setFarmName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "signed_out") router.replace("/login");
    if (status === "ready") router.replace("/");
  }, [status, router]);

  async function createFarm(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!farmName.trim()) {
      setMessage(t("farm_name_required"));
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
    await refresh();
    router.replace("/");
  }

  if (status !== "no_farm") return <Loading />;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={createFarm} className={`${cardCls} w-full max-w-sm space-y-4 p-6`}>
        <div>
          <h1 className="text-lg font-semibold">{t("farm_name_title")}</h1>
          <p className="text-sm text-faded">{t("farm_name_hint")}</p>
        </div>
        <input
          type="text"
          value={farmName}
          onChange={(e) => setFarmName(e.target.value)}
          className={inputCls}
          placeholder="Bowman Family Farms"
        />
        <ErrorText>{message}</ErrorText>
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? t("saving") : t("save_continue")}
        </button>
      </form>
    </main>
  );
}

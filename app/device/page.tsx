"use client";

// THIS DEVICE - Personal or Shared.
// Shown once after the farm login, and later from Settings → This device.
//   Personal: pick the person; the device remembers them and their language.
//   Shared:   asks "Who's working?" on each scan and after 30 minutes idle.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, useRequireFarm, DeviceMode } from "@/lib/session";
import { Loading, btnOutline, btnPrimary, btnQuiet, cardCls, startPathFor } from "@/components/ui";

export default function DevicePage() {
  const ready = useRequireFarm();
  const { device, activePeople, person, t, setDevice, signOut, signOutAll } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<DeviceMode | null>(device?.mode ?? null);
  const [busy, setBusy] = useState(false);

  function chooseShared() {
    setDevice("shared", null);
    router.replace("/who");
  }

  function choosePerson(personId: string) {
    setDevice("personal", personId);
    const p = activePeople.find((x) => x.id === personId) || null;
    router.replace(startPathFor(p));
  }

  async function handleSignOut(all: boolean) {
    if (all && !window.confirm(t("sign_out_all_confirm"))) return;
    setBusy(true);
    if (all) await signOutAll();
    else await signOut();
    router.replace("/login");
  }

  if (!ready) return <Loading />;

  return (
    <main className="mx-auto max-w-md p-4 pt-10">
      {device && (
        <Link href="/settings" className={`${btnQuiet} mb-4 inline-block`}>
          ← {t("settings")}
        </Link>
      )}
      <h1 className="mb-6 text-2xl font-bold">
        {device ? t("this_device") : t("device_setup_title")}
      </h1>

      <div className="space-y-3">
        {(["personal", "shared"] as const).map((m) => (
          <button
            key={m}
            onClick={() => (m === "shared" ? chooseShared() : setMode("personal"))}
            aria-pressed={mode === m}
            className={
              `${cardCls} block w-full text-left ` +
              (mode === m ? "border-2 border-steel" : "hover:border-steel")
            }
          >
            <span className="block text-lg font-bold">
              {t(m === "personal" ? "device_personal" : "device_shared")}
            </span>
            <span className="block text-sm text-faded">
              {t(m === "personal" ? "device_personal_desc" : "device_shared_desc")}
            </span>
          </button>
        ))}
      </div>

      {mode === "personal" && (
        <div className="mt-6">
          <h2 className="mb-3 font-semibold">{t("pick_person")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {activePeople.map((p) => {
              const current = device?.mode === "personal" && person?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => choosePerson(p.id)}
                  className={`${current ? btnPrimary : btnOutline} py-4`}
                >
                  {p.name}
                  {current ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {device && (
        <div className="mt-10 space-y-3 border-t border-seam pt-6">
          <button disabled={busy} onClick={() => handleSignOut(false)} className={`${btnOutline} w-full`}>
            {t("sign_out")}
          </button>
          <button disabled={busy} onClick={() => handleSignOut(true)} className={`${btnQuiet} block w-full text-center`}>
            {t("sign_out_all")}
          </button>
        </div>
      )}
    </main>
  );
}

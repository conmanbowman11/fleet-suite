"use client";

// SETTINGS - the onboarding home base.
//   Farm details, and links to every setup list.

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import type { Key } from "@/lib/i18n";
import { AppPage, ErrorText, Field, btnSecondary, cardCls, inputCls } from "@/components/ui";

const LINKS: { href: string; key: Key; hint?: Key }[] = [
  { href: "/settings/people", key: "people" },
  { href: "/settings/names", key: "service_names", hint: "service_names_hint" },
  { href: "/parts", key: "parts_catalog", hint: "parts_catalog_hint" },
  { href: "/settings/qr", key: "qr_labels", hint: "qr_hint" },
  { href: "/device", key: "this_device" },
];

export default function SettingsPage() {
  return (
    <AppPage need="farm">
      <SettingsHome />
    </AppPage>
  );
}

function SettingsHome() {
  const { farm, t, refresh } = useSession();
  const [name, setName] = useState(farm?.name ?? "");
  const [maxMiles, setMaxMiles] = useState(String(farm?.max_miles_per_day ?? 800));
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveFarm(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSaved(false);
    if (!name.trim()) return setMessage(t("farm_name_required"));
    setBusy(true);
    const { error } = await supabase
      .from("farms")
      .update({ name: name.trim(), max_miles_per_day: Number(maxMiles) || 800 })
      .eq("id", farm!.id);
    setBusy(false);
    if (error) return setMessage(error.message);
    await refresh();
    setSaved(true);
  }

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">{t("settings")}</h1>

      <ul className="mb-6 space-y-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={`${cardCls} block hover:border-steel`}>
              <span className="flex items-center justify-between">
                <span className="font-semibold">{t(l.key)}</span>
                <span className="text-faded">→</span>
              </span>
              {l.hint && <span className="mt-1 block text-sm text-faded">{t(l.hint)}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <form onSubmit={saveFarm} className={`${cardCls} space-y-3`}>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-faded">{t("farm")}</h2>
        <Field label={t("name")}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("max_miles")}>
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={maxMiles}
            onChange={(e) => setMaxMiles(e.target.value)}
          />
        </Field>
        <ErrorText>{message}</ErrorText>
        <button type="submit" disabled={busy} className={`${btnSecondary} w-full`}>
          {busy ? t("saving") : saved ? `${t("save")} ✓` : t("save")}
        </button>
      </form>
    </>
  );
}

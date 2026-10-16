"use client";

// QR LABELS - one sticker per machine.
// Each code is a link to that machine's permanent ID (not its name), so
// renaming a machine never breaks its sticker. The unit number is printed
// large as a backup if a sticker gets dirty or torn.
// Labels are 4" x 2" (fits common 10-per-sheet weatherproof label sheets).

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { supabase, Equipment } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { translate } from "@/lib/i18n";
import { AppPage, Loading, btnPrimary, btnQuiet, cardCls } from "@/components/ui";

export default function QrPage() {
  return (
    <AppPage need="farm" nav={false}>
      <QrLabels />
    </AppPage>
  );
}

function QrLabels() {
  const { t, farm } = useSession();
  const [machines, setMachines] = useState<Equipment[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("equipment").select("*").eq("is_active", true).order("nickname");
      const list = (data as Equipment[]) || [];
      const origin = window.location.origin;
      const made: Record<string, string> = {};
      await Promise.all(
        list.map(async (m) => {
          made[m.id] = await QRCode.toDataURL(`${origin}/m/${m.id}`, {
            margin: 1,
            width: 320,
            errorCorrectionLevel: "M",
          });
        })
      );
      setMachines(list);
      setCodes(made);
      setChecked(Object.fromEntries(list.map((m) => [m.id, true])));
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loading />;
  const chosen = machines.filter((m) => checked[m.id]);
  const allOn = chosen.length === machines.length;

  return (
    <>
      <style>{`@media print { @page { size: letter; margin: 0.5in 0.15in; } main { max-width: none !important; padding: 0 !important; } }`}</style>

      {/* Controls (not printed) */}
      <div className="no-print">
        <Link href="/settings" className={`${btnQuiet} mb-3 inline-block`}>
          ← {t("settings")}
        </Link>
        <h1 className="text-xl font-bold">{t("qr_labels")}</h1>
        <p className="mb-4 text-sm text-faded">{t("qr_hint")}</p>

        <div className={`${cardCls} mb-4`}>
          <label className="mb-2 flex items-center gap-3 border-b border-seam pb-2 font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#1E5BA8]"
              checked={allOn}
              onChange={(e) => setChecked(Object.fromEntries(machines.map((m) => [m.id, e.target.checked])))}
            />
            {t("select_all")} ({chosen.length}/{machines.length})
          </label>
          <ul className="space-y-1">
            {machines.map((m) => (
              <li key={m.id}>
                <label className="flex items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[#1E5BA8]"
                    checked={!!checked[m.id]}
                    onChange={(e) => setChecked({ ...checked, [m.id]: e.target.checked })}
                  />
                  {m.unit_number && <span className="font-mono text-faded">#{m.unit_number}</span>}
                  {m.nickname}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <button
          disabled={!chosen.length}
          onClick={() => window.print()}
          className={`${btnPrimary} mb-6 w-full`}
        >
          {t("print_labels")} ({chosen.length})
        </button>
      </div>

      {/* The label sheet (preview on screen, the only thing printed) */}
      <div className="flex flex-wrap justify-center gap-[0.18in] print:justify-start print:gap-x-[0.18in] print:gap-y-0">
        {chosen.map((m) => (
          <div
            key={m.id}
            className="flex shrink-0 items-center gap-[0.12in] overflow-hidden rounded border border-seam bg-white p-[0.12in] text-black print:rounded-none print:border-dashed"
            style={{ width: "4in", height: "2in", breakInside: "avoid" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={codes[m.id]} alt="" style={{ width: "1.7in", height: "1.7in" }} />
            <div className="min-w-0 flex-1 leading-tight">
              {m.unit_number && (
                <p className="font-mono text-3xl font-bold leading-none">#{m.unit_number}</p>
              )}
              <p className="mt-1 truncate text-lg font-bold">{m.nickname}</p>
              <p className="truncate text-xs">{[m.make, m.model].filter(Boolean).join(" ")}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase leading-snug">
                {translate("en", "scan_to_log")}
                <br />
                {translate("es", "scan_to_log")}
              </p>
              <p className="mt-1 truncate text-[9px] text-gray-500">{farm?.name}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

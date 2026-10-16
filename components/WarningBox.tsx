"use client";

// METER WARNING BOX - shown when a reading looks wrong.
// Soft by design: "Fix it" goes back to the form, "It's correct" saves anyway.

import { useSession } from "@/lib/session";
import type { MeterWarning } from "@/lib/meter";
import { TriangleAlert } from "lucide-react";

export default function WarningBox({
  warnings,
  label,
  onFix,
  onConfirm,
  busy,
}: {
  warnings: { label?: string; warning: MeterWarning }[];
  label?: string;
  onFix: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const { t } = useSession();
  if (!warnings.length) return null;
  return (
    <div role="alert" className="rounded-lg border-2 border-caution bg-cautionSoft p-4">
      <p className="mb-2 flex items-center gap-2 font-bold text-cautionInk">
        <TriangleAlert size={18} aria-hidden="true" /> {label || t("warn_title")}
      </p>
      <ul className="mb-3 space-y-1 text-sm">
        {warnings.map((w, i) => (
          <li key={i}>
            {w.label && <span className="font-semibold">{w.label}: </span>}
            {t(w.warning.key, w.warning.vars)}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onFix}
          className="rounded border border-seam bg-plate px-4 py-3 font-bold"
        >
          {t("fix_it")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded bg-steel px-4 py-3 font-bold text-white disabled:opacity-50"
        >
          {busy ? t("saving") : t("its_correct")}
        </button>
      </div>
    </div>
  );
}

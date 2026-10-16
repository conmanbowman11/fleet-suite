"use client";

// STATUS BADGES and the one-line status text for a service.
//   Overdue (red) / Due soon (amber) / OK (blue) / No record (gray)
//   "Last done 03/12/2026 at 3,948 hrs · Next due at 4,448 hrs"

import { useSession } from "@/lib/session";
import { formatDate, formatReading } from "@/lib/i18n";
import type { Key } from "@/lib/i18n";
import type { MeterType } from "@/lib/supabase";
import type { ServiceStatus, Status } from "@/lib/maintenance";

const STYLES: Record<Status, string> = {
  overdue: "bg-dangerSoft text-[#8E1B1B]",
  due_soon: "bg-cautionSoft text-cautionInk",
  ok: "bg-tint text-[#123E73]",
  no_record: "bg-[#EDF1F5] text-faded",
};

// The colored stripe on the left edge of a machine card
export const STRIPE: Record<Status | "none", string> = {
  overdue: "border-l-danger",
  due_soon: "border-l-caution",
  ok: "border-l-safety",
  no_record: "border-l-[#9FB3C8]",
  none: "border-l-[#9FB3C8]",
};

const LABELS: Record<Status, Key> = {
  overdue: "status_overdue",
  due_soon: "status_due_soon",
  ok: "status_ok",
  no_record: "status_no_record",
};

export function StatusBadge({ status }: { status: Status | null }) {
  const { t } = useSession();
  if (!status) return null;
  return (
    <span className={`inline-block shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}>
      {t(LABELS[status])}
    </span>
  );
}

// "Every 500 hrs / every 12 months"
export function useIntervalText() {
  const { t } = useSession();
  return (
    intervalMeter: number | null,
    intervalMonths: number | null,
    meterType: MeterType
  ): string => {
    const parts: string[] = [];
    if (intervalMeter && meterType !== "none") {
      parts.push(
        t("every_reading", {
          n: Number(intervalMeter).toLocaleString("en-US"),
          unit: t(meterType === "miles" ? "unit_mi" : "unit_hrs"),
        })
      );
    }
    if (intervalMonths) {
      parts.push(intervalMonths === 1 ? t("every_month") : t("every_months", { n: intervalMonths }));
    }
    return parts.join(" / ") || t("no_interval");
  };
}

// "Last done 03/12/2026 at 3,948 hrs · Next due at 4,448 hrs · next by 09/01/2027"
export function useStatusText() {
  const { t, lang } = useSession();
  return (s: ServiceStatus, meterType: MeterType): string => {
    const parts: string[] = [];
    if (!s.lastDate) {
      parts.push(t("never_done"));
    } else if (s.lastReading !== null && meterType !== "none") {
      parts.push(
        t("last_done_at", {
          date: formatDate(s.lastDate),
          reading: formatReading(s.lastReading, meterType, lang),
        })
      );
    } else {
      parts.push(t("last_done", { date: formatDate(s.lastDate) }));
    }
    if (s.nextDueReading !== null && meterType !== "none") {
      parts.push(t("next_due_reading", { reading: formatReading(s.nextDueReading, meterType, lang) }));
    }
    if (s.daysLeft !== null) {
      if (s.daysLeft < 0) parts.push(t("days_past", { n: Math.abs(s.daysLeft) }));
      else if (s.daysLeft <= 14) parts.push(t("due_in_days", { n: s.daysLeft }));
      else parts.push(t("next_by", { date: formatDate(s.nextDueDate) }));
    }
    return parts.join(" · ");
  };
}

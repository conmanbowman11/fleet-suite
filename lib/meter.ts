// METER READING WARNINGS
// Checks a new reading against the machine's history before saving.
// Every warning is "soft": the mechanic can fix it or tap "It's correct".
//
//   lower   - lower than the last reading
//   jump    - physically impossible (more than 24 hrs per day, or more
//             miles per day than the farm's limit)
//   pace    - far above this machine's usual daily use
//   same    - unchanged after 60+ days
//   future  - the date hasn't happened yet

import { MeterType } from "@/lib/supabase";
import { Key } from "@/lib/i18n";

export type Reading = { date: string; reading: number }; // date = YYYY-MM-DD

export type MeterWarning = {
  key: Key;
  vars?: Record<string, string | number>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(a + "T12:00:00");
  const tb = Date.parse(b + "T12:00:00");
  return Math.round((tb - ta) / DAY_MS);
}

export function checkReading(opts: {
  meterType: MeterType;
  history: Reading[]; // earlier readings for this machine, any order
  newReading: number | null;
  newDate: string;
  today: string;
  maxMilesPerDay: number;
}): MeterWarning[] {
  const { meterType, newReading, newDate, today, maxMilesPerDay } = opts;
  const warnings: MeterWarning[] = [];
  const unitKey: Key = meterType === "miles" ? "unit_mi" : "unit_hrs";

  if (newDate > today) warnings.push({ key: "warn_future" });

  if (meterType === "none" || newReading === null || isNaN(newReading)) {
    return warnings;
  }

  // Readings taken before (or on) the new date, newest first
  const before = opts.history
    .filter((h) => h.date <= newDate && h.reading !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.reading - a.reading));
  const last = before[0];
  if (!last) return warnings;

  // 1. Lower than the last reading
  if (newReading < last.reading) {
    warnings.push({
      key: "warn_lower",
      vars: { last: last.reading.toLocaleString("en-US") },
    });
    return warnings; // the other checks don't make sense after this
  }

  const diff = newReading - last.reading;
  const days = Math.max(daysBetween(last.date, newDate), 1);
  const perDay = diff / days;
  const limit = meterType === "miles" ? maxMilesPerDay : 24;

  // 2. Physically impossible
  if (perDay > limit) {
    warnings.push({
      key: "warn_jump",
      vars: {
        diff: diff.toLocaleString("en-US"),
        unit: unitKey === "unit_mi" ? "mi" : "hrs",
        days,
      },
    });
    return warnings;
  }

  // 3. Far above usual pace (needs at least 2 readings 14+ days apart)
  const oldest = before[before.length - 1];
  const span = daysBetween(oldest.date, last.date);
  if (before.length >= 2 && span >= 14) {
    const usual = (last.reading - oldest.reading) / span;
    const floor = meterType === "miles" ? 50 : 4; // ignore tiny numbers
    if (usual > 0 && perDay > usual * 2.5 && perDay > floor) {
      warnings.push({ key: "warn_pace" });
    }
  }

  // 4. Same reading after a long gap
  if (diff === 0 && days >= 60) {
    warnings.push({ key: "warn_same", vars: { months: Math.round(days / 30) } });
  }

  return warnings;
}

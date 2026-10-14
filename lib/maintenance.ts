// MAINTENANCE STATUS for one service on one machine.
//
// Hours and miles are FACTS, not alarms: the app only knows a meter
// reading when someone enters it, so it shows "next due at 4,448 hrs"
// and the mechanic compares that with the meter on the machine.
//
// Calendar intervals ARE judged, because the app always knows today's
// date: OVERDUE, DUE SOON (within 14 days), OK, or NO RECORD.

import { MachineService } from "@/lib/supabase";

export type Status = "overdue" | "due_soon" | "ok" | "no_record";

export type LastDone = { service_date: string; meter_reading: number | null } | null;

export type ServiceStatus = {
  status: Status | null; // null = hours/miles only, no judgment
  lastDate: string | null;
  lastReading: number | null;
  nextDueReading: number | null;
  nextDueDate: string | null; // YYYY-MM-DD
  daysLeft: number | null; // negative = days past due
};

const DUE_SOON_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  // keep the day of month, but not past the end of the month
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, lastDay));
  return date.toISOString().slice(0, 10);
}

export function serviceStatus(
  svc: Pick<MachineService, "interval_meter" | "interval_months">,
  last: LastDone,
  today: string
): ServiceStatus {
  const result: ServiceStatus = {
    status: null,
    lastDate: last?.service_date ?? null,
    lastReading: last?.meter_reading ?? null,
    nextDueReading: null,
    nextDueDate: null,
    daysLeft: null,
  };

  // Hours / miles: state the next-due reading, never judge it
  if (svc.interval_meter && last && last.meter_reading !== null) {
    result.nextDueReading = Number(last.meter_reading) + Number(svc.interval_meter);
  }

  // Calendar: judge it
  if (svc.interval_months) {
    if (!last) {
      result.status = "no_record";
    } else {
      result.nextDueDate = addMonths(last.service_date, svc.interval_months);
      const days = Math.round(
        (Date.parse(result.nextDueDate + "T12:00:00") - Date.parse(today + "T12:00:00")) / DAY_MS
      );
      result.daysLeft = days;
      result.status = days < 0 ? "overdue" : days <= DUE_SOON_DAYS ? "due_soon" : "ok";
    }
  } else if (svc.interval_meter && !last) {
    // Hours-only service that's never been logged: flag it so it gets a starting point
    result.status = "no_record";
  }

  return result;
}

const RANK: Record<Status, number> = { overdue: 3, due_soon: 2, no_record: 1, ok: 0 };

// The worst status across a machine's services (for list badges)
export function worstStatus(statuses: (Status | null)[]): Status | null {
  let worst: Status | null = null;
  for (const s of statuses) {
    if (s && (worst === null || RANK[s] > RANK[worst])) worst = s;
  }
  return worst;
}

// Newest log entry per machine service, from a list of entries
export function latestByService<
  T extends { machine_service_id: string; service_date: string; created_at?: string }
>(entries: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const e of entries) {
    const cur = map.get(e.machine_service_id);
    if (
      !cur ||
      e.service_date > cur.service_date ||
      (e.service_date === cur.service_date && (e.created_at || "") > (cur.created_at || ""))
    ) {
      map.set(e.machine_service_id, e);
    }
  }
  return map;
}

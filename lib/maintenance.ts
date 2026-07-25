// Maintenance logic — "facts, not judgments" for engine hours.
//
// The app only knows engine hours when a person enters them, so it never
// claims a machine is overdue based on hours. Instead it states the fact:
//   "last done at 3,948 hrs -> next due at 4,448 hrs"
// and the mechanic compares that against the meter in the cab.
//
// Calendar intervals (every X months) ARE judged, because the app always
// knows today's date. Those produce OVERDUE / DUE SOON / NO RECORD badges.

export type Schedule = {
  id: string;
  equipment_id: string;
  service_type_id: string;
  interval_hours: number | null;
  interval_months: number | null;
  service_types?: { name: string } | null;
};

export type LogLite = {
  equipment_id: string;
  service_type_id: string;
  service_date: string;
  engine_hours: number | null;
};

// status null = no judgment (hours-only schedule); detail is always shown
export type Status = "overdue" | "due_soon" | "ok" | "no_record";

const RANK: Record<Status, number> = {
  overdue: 3,
  due_soon: 2,
  no_record: 1,
  ok: 0,
};

export function scheduleStatus(
  schedule: Schedule,
  logs: LogLite[]
): { status: Status | null; detail: string } {
  const relevant = logs
    .filter(
      (l) =>
        l.equipment_id === schedule.equipment_id &&
        l.service_type_id === schedule.service_type_id
    )
    .sort((a, b) => (a.service_date < b.service_date ? 1 : -1));

  const last = relevant[0];
  const details: string[] = [];

  // ---- Hours: facts only, never a judgment ----
  if (schedule.interval_hours) {
    if (last && last.engine_hours != null) {
      const dueAt = last.engine_hours + Number(schedule.interval_hours);
      details.push(
        `last at ${last.engine_hours.toLocaleString()} hrs → next due at ${dueAt.toLocaleString()} hrs`
      );
    } else if (last) {
      details.push("last service logged without hours");
    }
  }

  // ---- Calendar: the app knows today's date, so it can judge ----
  let status: Status | null = null;
  if (schedule.interval_months) {
    if (!last) {
      status = "no_record";
    } else {
      const lastDate = new Date(last.service_date + "T00:00:00");
      const dueDate = new Date(lastDate);
      dueDate.setMonth(dueDate.getMonth() + schedule.interval_months);
      const today = new Date();
      const daysLeft = Math.round(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft <= 0) {
        status = "overdue";
        details.push(`${Math.abs(daysLeft)} days past due`);
      } else if (daysLeft <= 14) {
        status = "due_soon";
        details.push(`due in ${daysLeft} days`);
      } else {
        status = "ok";
        details.push(`next by ${dueDate.toLocaleDateString()}`);
      }
    }
  }

  if (!last && details.length === 0) {
    details.push("no service on record yet");
  }

  return { status, detail: details.join(" · ") };
}

// Worst calendar-based status across a machine's schedules (for list badges).
// Hours-only schedules never produce a badge.
export function equipmentStatus(
  schedules: Schedule[],
  logs: LogLite[]
): Status | null {
  let worst: Status | null = null;
  for (const s of schedules) {
    if (!s.interval_months) continue;
    const { status } = scheduleStatus(s, logs);
    if (status && (worst === null || RANK[status] > RANK[worst])) {
      worst = status;
    }
  }
  return worst;
}

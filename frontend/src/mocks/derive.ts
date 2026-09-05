/**
 * DERIVED READS OVER THE MUTABLE STORE
 *
 * `seed/` has functions that answer all of these — `leaveDays`, `balancesFor`,
 * `resolveContract`, the attendance and leave indexes. They read the **seed**,
 * which is right for generating fixtures and wrong for serving requests: by
 * the time a handler runs, someone may have approved a leave request, edited
 * an attendance row or hired somebody, and an answer computed from the frozen
 * dataset would silently ignore all three.
 *
 * So the definitions live once, in `seed/`, and these are the same definitions
 * pointed at `db`. Where the arithmetic is subtle — what counts as a leave
 * day, which contract applies — the seed module is the authority and this file
 * follows it exactly, because two answers to "how many days is this?" is the
 * one thing PRD §3.6 and §4.2 exist to prevent.
 */
import type {
  Attendance, Contract, LeaveBalance, RequestState, TimeOffType,
} from "@/api/contract";
import { db } from "./db";
import { dayOfWeek, decimal, eachDay, type ISODate } from "@/lib/date";
import type { PayrollSources } from "./seed/engine";

/* ── Calendars ───────────────────────────────────────────────────────── */

/** Non-optional holidays only — optional ones do not reduce a day count. */
export const blockingHolidays = (): Set<ISODate> =>
  new Set(db.holidays.filter((h) => !h.is_optional).map((h) => h.date));

/** Monday-indexed working days for a schedule. */
export function workingDays(scheduleId: number | null): Set<number> {
  const schedule = db.schedules.find((s) => s.id === scheduleId) ?? db.schedules[0];
  return new Set(schedule?.lines.map((l) => l.day_of_week) ?? []);
}

const scheduleOf = (employeeId: number): number | null =>
  db.employees.find((e) => e.id === employeeId)?.working_schedule_id ?? null;

/**
 * §3.6 and §4.2 count days the same way: scheduled working days in the range,
 * minus non-optional public holidays. A Friday-to-Monday request on a five-day
 * week is two days, and Ganesh Chaturthi inside a range is not charged.
 */
export function leaveDaysBetween(employeeId: number, from: ISODate, to: ISODate): number {
  const working = workingDays(scheduleOf(employeeId));
  const holidays = blockingHolidays();
  return eachDay(from, to).filter((d) => working.has(dayOfWeek(d)) && !holidays.has(d)).length;
}

/* ── Indexes the payroll engine reads ────────────────────────────────── */

export function attendanceIndex(): Map<number, Map<ISODate, Attendance>> {
  const index = new Map<number, Map<ISODate, Attendance>>();
  for (const a of db.attendances) {
    let byDate = index.get(a.employee_id);
    if (!byDate) {
      byDate = new Map();
      index.set(a.employee_id, byDate);
    }
    byDate.set(a.work_date, a);
  }
  return index;
}

/** `employeeId → date → is_paid`, approved requests only. */
export function approvedLeaveIndex(): Map<number, Map<ISODate, boolean>> {
  const index = new Map<number, Map<ISODate, boolean>>();
  const holidays = blockingHolidays();

  for (const r of db.timeOffRequests) {
    if (r.state !== "APPROVED") continue;
    const working = workingDays(scheduleOf(r.employee_id));

    let byDate = index.get(r.employee_id);
    if (!byDate) {
      byDate = new Map();
      index.set(r.employee_id, byDate);
    }
    for (const d of eachDay(r.date_from, r.date_to)) {
      if (!working.has(dayOfWeek(d)) || holidays.has(d)) continue;
      byDate.set(d, r.is_paid);
    }
  }
  return index;
}

/** What `computePayslip` needs, built from the store rather than the seed. */
export const sourcesFromDb = (): PayrollSources => ({
  attendance: attendanceIndex(),
  leave: approvedLeaveIndex(),
  rules: db.salaryRules.filter((r) => r.is_active),
});

/* ── Contracts ───────────────────────────────────────────────────────── */

/**
 * §4.3 step 1. `RUNNING` contracts covering any part of the period, the one
 * applicable at `period_end` first. Two of them is a mid-period raise, not an
 * error — the caller raises `MULTI_CONTRACT_PERIOD` and pays on `[0]`.
 */
export const contractsCovering = (
  employeeId: number,
  periodStart: ISODate,
  periodEnd: ISODate,
): Contract[] =>
  db.contracts
    .filter(
      (c) =>
        c.employee_id === employeeId &&
        c.state === "RUNNING" &&
        c.date_start <= periodEnd &&
        (c.date_end === null || c.date_end >= periodStart),
    )
    .sort((a, b) => b.date_start.localeCompare(a.date_start));

/* ── Leave balances ──────────────────────────────────────────────────── */

/**
 * `pending` is the field that earns its place: approval blocks past zero
 * (§3.6), so the UI has to show the wall coming rather than report it on
 * arrival. `remaining` therefore subtracts taken **and** pending, and clamps
 * at zero — a balance is never negative.
 */
export function balancesFor(employeeId: number): LeaveBalance[] {
  const allocations = db.leaveAllocations.filter(
    (a) => a.employee_id === employeeId && a.state === "APPROVED",
  );
  const requests = db.timeOffRequests.filter((r) => r.employee_id === employeeId);

  return db.timeOffTypes
    .filter((t) => t.requires_allocation)
    .map((type) => {
      const allocated = allocations
        .filter((a) => a.time_off_type_id === type.id)
        .reduce((sum, a) => sum + Number(a.days), 0);

      const of = (state: RequestState) =>
        requests
          .filter((r) => r.time_off_type_id === type.id && r.state === state)
          .reduce((sum, r) => sum + Number(r.duration_days), 0);

      const taken = of("APPROVED");
      const pending = of("TO_APPROVE");
      const window = allocations.find((a) => a.time_off_type_id === type.id);

      return {
        employee_id: employeeId,
        time_off_type_id: type.id,
        time_off_type_name: type.name,
        unit: type.unit,
        is_paid: type.is_paid,
        allocated: decimal(allocated),
        taken: decimal(taken),
        pending: decimal(pending),
        remaining: decimal(Math.max(0, allocated - taken - pending)),
        validity_from: window?.validity_from ?? null,
        validity_to: window?.validity_to ?? null,
      };
    });
}

/** The balance for one type, or `null` when the type needs no allocation. */
export function balanceFor(employeeId: number, type: TimeOffType): LeaveBalance | null {
  if (!type.requires_allocation) return null;
  return balancesFor(employeeId).find((b) => b.time_off_type_id === type.id) ?? null;
}

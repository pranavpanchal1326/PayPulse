/**
 * ATTENDANCE — roughly three thousand rows across the seven seeded months.
 *
 * PRD §9 asks for late arrivals, missing check-outs, overtime and **deliberate
 * gaps**. The gaps are the load-bearing part: under `TREAT_AS_UNPAID` (§4.1) a
 * scheduled day with no row and no approved leave is an absence, so without
 * them `absent_days` is zero everywhere, the `LWP` line never moves, and
 * `HIGH_ABSENCE` has nobody to fire on.
 *
 * Everything computed here is computed the way §3.4 says the server computes
 * it — `worked_hours` from the timestamps and the break, `overtime_hours`
 * against the schedule's own `daily_hours`, midnight crossings included. A
 * fixture that just asserts `worked_hours: "8.00"` would hide the one bug this
 * dataset exists to prove is fixed.
 */
import type { Attendance, AttendanceStatus } from "@/api/contract";
import { ATTENDANCE_FROM, ATTENDANCE_TO } from "./anchor";
import {
  at, dayOfWeek, decimal, eachDay, minutesOf, shiftMinutes, timeOf, type ISODate,
} from "./calendar";
import { blockingHolidays, employees, scheduleById, scheduleWorkingDays } from "./people";
import { approvedLeaveDays } from "./timeOff";
import { SEEDS, rng } from "./random";

/** Attendance rows are the only place a check-in is later than scheduled. */
const LATE_GRACE_MINUTES = 15;

const EDIT_REASONS = [
  "Biometric device offline; corrected from the register.",
  "Employee forgot to punch out; confirmed with the supervisor.",
  "Wrong shift selected at the terminal.",
];

const r = rng(SEEDS.attendance);

export const attendances: Attendance[] = [];

{
  let id = 1;
  const days = eachDay(ATTENDANCE_FROM, ATTENDANCE_TO);

  for (const e of employees) {
    const schedule = scheduleById.get(e.working_schedule_id ?? 1);
    const working = scheduleWorkingDays.get(e.working_schedule_id ?? 1);
    if (!schedule || !working) continue;

    const line = schedule.lines[0];
    const startMinutes = minutesOf(line.start_time);
    const scheduledMinutes = shiftMinutes(line.start_time, line.end_time, line.break_minutes);
    const dailyHours = Number(schedule.daily_hours);

    for (const date of days) {
      // Outside employment: nothing to record, in either direction.
      if (date < e.date_of_joining) continue;
      if (e.date_of_exit && date > e.date_of_exit) continue;

      const isWorkingDay = working.has(dayOfWeek(date));
      const isHoliday = blockingHolidays.has(date);
      const onLeave = approvedLeaveDays.get(date)?.has(e.id) ?? false;

      if (!isWorkingDay) continue;

      // §3.4: attendance on a public holiday is *allowed*, and every hour of it
      // counts as overtime. Rare, so it reads as an exception rather than a
      // second normal.
      if (isHoliday && !r.chance(0.06)) continue;

      // §3.4: attendance on an approved-leave day is allowed but flagged
      // `ATTENDANCE_ON_LEAVE_DAY` — leave wins for pay, the hours still count
      // for overtime. Seeded thinly so the warning has a subject.
      if (onLeave && !r.chance(0.05)) continue;

      // The deliberate gap. Interns and contractors are patchier than staff,
      // which is both realistic and useful — it concentrates `HIGH_ABSENCE`
      // on identifiable people instead of smearing it across thirty.
      const gapRate =
        e.employee_type === "INTERN" || e.employee_type === "CONTRACT" ? 0.16 : 0.09;
      if (!isHoliday && !onLeave && r.chance(gapRate)) continue;

      // ── The row itself ────────────────────────────────────────────────
      const lateBy = r.chance(0.12) ? r.int(16, 75) : r.int(-10, LATE_GRACE_MINUTES);
      const checkInMinutes = startMinutes + lateBy;
      const checkIn = at(date, timeOf(checkInMinutes));

      // A missing check-out leaves the row standing with zero hours (§3.4).
      const missingCheckout = r.chance(0.03);

      let workedHours = 0;
      let overtimeHours = 0;
      let checkOut: string | null = null;

      if (!missingCheckout) {
        const extra = r.chance(0.18) ? r.int(30, 180) : r.int(-20, 25);
        const spanMinutes = scheduledMinutes + line.break_minutes + extra;
        const outMinutes = checkInMinutes + spanMinutes;
        // Midnight crossing is a *day* offset on the timestamp, not a negative
        // duration — the whole point of §3.4(2).
        checkOut = at(date, timeOf(outMinutes), Math.floor(outMinutes / 1440));

        workedHours = Math.round(((spanMinutes - line.break_minutes) / 60) * 100) / 100;
        overtimeHours = isHoliday
          ? workedHours // every hour on a holiday is overtime
          : Math.max(0, Math.round((workedHours - dailyHours) * 100) / 100);
      }

      const status: AttendanceStatus = missingCheckout
        ? "MISSING_CHECKOUT"
        : lateBy > LATE_GRACE_MINUTES
          ? "LATE"
          : overtimeHours > 0
            ? "OVERTIME"
            : "PRESENT";

      // `PATCH` is HR_MANAGER+ only and always records a reason (§3.4), so an
      // edited row without one would be unreachable through the real API.
      const edited = r.chance(0.015);

      attendances.push({
        id: id++,
        employee_id: e.id,
        employee_name: e.full_name,
        work_date: date,
        check_in: checkIn,
        check_out: checkOut,
        break_minutes: missingCheckout ? 0 : line.break_minutes,
        worked_hours: decimal(workedHours),
        overtime_hours: decimal(overtimeHours),
        status,
        is_manual_edit: edited,
        edited_by_id: edited ? 4 : null, // Imran Shaikh, HR_MANAGER
        edit_reason: edited ? r.pick(EDIT_REASONS) : null,
      });
    }
  }
}

/** `employeeId → date → row`. Payroll asks "was there a row?" once per day. */
export const attendanceIndex = new Map<number, Map<ISODate, Attendance>>();
for (const a of attendances) {
  let byDate = attendanceIndex.get(a.employee_id);
  if (!byDate) {
    byDate = new Map();
    attendanceIndex.set(a.employee_id, byDate);
  }
  byDate.set(a.work_date, a);
}

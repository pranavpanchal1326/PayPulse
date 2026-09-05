/**
 * ATTENDANCE — `/attendances`, `/attendances/check-in`, `/check-out`.
 *
 * `worked_hours`, `overtime_hours` and `status` are **computed here, on every
 * write**, never taken from the request (PRD §3.4). A client that could post
 * its own hours would make the payslip unauditable, and the whole point of the
 * fixture engine is that the numbers derive from something.
 *
 * Two §3.4 rules the mock has to get right because the UI is designed around
 * them: a shift ending before it starts crosses midnight and is still positive
 * (22:00 → 06:00 is eight hours), and a row with no check-out stands as
 * `MISSING_CHECKOUT` with zero hours rather than being deleted or guessed.
 *
 * **"Today" is the fixture anchor**, not the wall clock. `ANCHOR_TODAY` is
 * what every seeded date hangs from (PRD §9), so a check-in taken from
 * `new Date()` would land in a month with no schedule, no payrun and no
 * context. The time of day is real; only the date is pinned.
 */
import { http } from "msw";
import type { Attendance } from "@/api/contract";
import { ATTENDANCE_STATUSES } from "@/api/contract";
import { byId, db, nextId } from "../db";
import {
  Fields, Refused, auth, body, conflict, descBy, idOf, int, notFound, ok, ownScopeId,
  paginate, query, route, settle, str,
} from "../http";
import { ANCHOR_TODAY } from "../seed/anchor";
import { IST_OFFSET, decimal, minutesOf } from "../seed/calendar";

/** Later than this after the scheduled start and the row reads `LATE` (§3.4). */
const LATE_GRACE_MINUTES = 15;

const scheduleFor = (employeeId: number) => {
  const employee = byId(db.employees, employeeId);
  return byId(db.schedules, employee?.working_schedule_id ?? 1) ?? db.schedules[0];
};

/** Minutes since midnight from an ISO timestamp, offset and all. */
const clockMinutes = (iso: string): number => {
  const time = iso.slice(11, 16);
  return minutesOf(time);
};

/** Whole days between two timestamps' date parts — the midnight crossing. */
const dayOffset = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) /
      86_400_000,
  );

/**
 * §3.4, in one place. Called on create, on check-out and on every manual edit,
 * so the three paths cannot disagree about what an eight-hour day is.
 */
function recompute(row: Attendance): Attendance {
  const schedule = scheduleFor(row.employee_id);
  const line =
    schedule.lines.find((l) => l.start_time.slice(0, 5) === row.check_in.slice(11, 16)) ??
    schedule.lines[0];

  if (!row.check_out) {
    row.worked_hours = decimal(0);
    row.overtime_hours = decimal(0);
    row.status = "MISSING_CHECKOUT";
    return row;
  }

  const spanMinutes =
    clockMinutes(row.check_out) -
    clockMinutes(row.check_in) +
    dayOffset(row.check_in, row.check_out) * 1440;

  const worked = Math.max(0, spanMinutes - row.break_minutes) / 60;
  const dailyHours = Number(schedule.daily_hours);
  const overtime = Math.max(0, worked - dailyHours);
  const lateBy = clockMinutes(row.check_in) - minutesOf(line.start_time);

  row.worked_hours = decimal(Math.round(worked * 100) / 100);
  row.overtime_hours = decimal(Math.round(overtime * 100) / 100);
  row.status = lateBy > LATE_GRACE_MINUTES ? "LATE" : overtime > 0 ? "OVERTIME" : "PRESENT";
  return row;
}

/** `2026-09-05T09:07:00+05:30` — the anchor date, the real time of day. */
const nowInPeriod = (date = ANCHOR_TODAY): string => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${date}T${hh}:${mm}:00${IST_OFFSET}`;
};

/**
 * Who this write is *for*. `EMPLOYEE` may only punch its own clock; anyone
 * with `create` on attendance may record it for someone else, which is how a
 * supervisor fixes a missed punch at the terminal.
 */
function subjectOf(
  user: { role: string; employee_id: number | null },
  requested: number | undefined,
): number | undefined {
  const own = user.role === "EMPLOYEE" ? user.employee_id : null;
  return own ?? requested ?? user.employee_id ?? undefined;
}

export const attendanceHandlers = [
  http.get(route("/attendances"), async ({ request }) => {
    await settle();
    const user = auth(request, "attendance", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const q = query(url);
    const own = ownScopeId(user);
    const employeeId = own ?? q.num("employee_id");
    const from = q.get("date_from");
    const to = q.get("date_to");
    const status = q.get("status");

    const rows = db.attendances.filter(
      (a) =>
        (employeeId === undefined || a.employee_id === employeeId) &&
        (from === undefined || a.work_date >= from) &&
        (to === undefined || a.work_date <= to) &&
        (status === undefined || a.status === status),
    );

    // Newest first, then by name — a day's rows read as a register.
    const ordered = descBy(rows, (a) => `${a.work_date}#${String(a.id).padStart(6, "0")}`);
    return ok(paginate(ordered, url));
  }),

  http.post(route("/attendances/check-in"), async ({ request }) => {
    await settle();
    const user = auth(request, "attendance", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const employeeId = subjectOf(user, int(patch.employee_id));
    if (employeeId === undefined || !byId(db.employees, employeeId)) {
      return notFound("That employee");
    }

    const workDate = str(patch.work_date) ?? ANCHOR_TODAY;
    const openRow = db.attendances.find(
      (a) => a.employee_id === employeeId && a.work_date === workDate && a.check_out === null,
    );
    if (openRow) {
      return conflict("You are already checked in. Check out before starting a new entry.");
    }

    const schedule = scheduleFor(employeeId);
    const created: Attendance = recompute({
      id: nextId(db.attendances),
      employee_id: employeeId,
      employee_name: byId(db.employees, employeeId)!.full_name,
      work_date: workDate,
      check_in: str(patch.check_in) ?? nowInPeriod(workDate),
      check_out: null,
      break_minutes: schedule.lines[0]?.break_minutes ?? 0,
      worked_hours: decimal(0),
      overtime_hours: decimal(0),
      status: "MISSING_CHECKOUT",
      is_manual_edit: false,
      edited_by_id: null,
      edit_reason: null,
    });

    db.attendances.push(created);
    return ok(created, 201);
  }),

  http.post(route("/attendances/check-out"), async ({ request }) => {
    await settle();
    const user = auth(request, "attendance", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const employeeId = subjectOf(user, int(patch.employee_id));
    if (employeeId === undefined) return notFound("That employee");

    const workDate = str(patch.work_date) ?? ANCHOR_TODAY;
    const row = db.attendances.find(
      (a) => a.employee_id === employeeId && a.work_date === workDate && a.check_out === null,
    );
    if (!row) return conflict("There is no open check-in to close.");

    row.check_out = str(patch.check_out) ?? nowInPeriod(workDate);
    recompute(row);
    return ok(row);
  }),

  http.post(route("/attendances"), async ({ request }) => {
    await settle();
    const user = auth(request, "attendance", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const employeeId = subjectOf(user, int(patch.employee_id));
    const workDate = str(patch.work_date);
    const checkIn = str(patch.check_in);

    const f = new Fields()
      .require("employee_id", employeeId)
      .require("work_date", workDate)
      .require("check_in", checkIn);
    if (employeeId !== undefined) {
      f.check(byId(db.employees, employeeId) !== undefined, "employee_id", "That employee no longer exists.");
    }
    if (f.failed) return f.response();

    const duplicate = db.attendances.find(
      (a) => a.employee_id === employeeId && a.work_date === workDate,
    );
    if (duplicate) {
      return conflict(`There is already an attendance row for ${workDate}. Edit that one instead.`);
    }

    const schedule = scheduleFor(employeeId!);
    const created: Attendance = recompute({
      id: nextId(db.attendances),
      employee_id: employeeId!,
      employee_name: byId(db.employees, employeeId!)!.full_name,
      work_date: workDate!,
      check_in: checkIn!,
      check_out: str(patch.check_out) ?? null,
      break_minutes: int(patch.break_minutes) ?? schedule.lines[0]?.break_minutes ?? 0,
      worked_hours: decimal(0),
      overtime_hours: decimal(0),
      status: "PRESENT",
      is_manual_edit: false,
      edited_by_id: null,
      edit_reason: null,
    });

    db.attendances.push(created);
    return ok(created, 201);
  }),

  /**
   * `HR_MANAGER+` only — `EMPLOYEE` has create and read on attendance but not
   * update, so the matrix refuses this before the handler runs. The **reason
   * is mandatory** (§3.4): an edited row without one would be a number nobody
   * can account for on a payslip.
   */
  http.patch(route("/attendances/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "attendance", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.attendances, idOf(params));
    if (!row) return notFound("That attendance row");

    const patch = await body(request);
    const reason = str(patch.edit_reason);
    const f = new Fields().require("edit_reason", reason, "Say why this row is being changed.");
    if (reason !== undefined) {
      f.check(reason.length >= 8, "edit_reason", "A few words, so the change can be accounted for.");
    }

    const status = str(patch.status);
    if (status !== undefined) {
      f.check(
        (ATTENDANCE_STATUSES as readonly string[]).includes(status),
        "status",
        "Status is computed from the times — it cannot be set directly.",
      );
    }
    if (f.failed) return f.response();

    if ("check_in" in patch && str(patch.check_in)) row.check_in = str(patch.check_in)!;
    if ("check_out" in patch) row.check_out = str(patch.check_out) ?? null;
    if ("break_minutes" in patch) row.break_minutes = int(patch.break_minutes) ?? 0;

    if (row.check_out && row.check_out < row.check_in) {
      return new Fields()
        .add("check_out", "Check-out is before check-in. For a night shift, use the next day's date.")
        .response();
    }

    row.is_manual_edit = true;
    row.edited_by_id = user.id;
    row.edit_reason = reason!;
    recompute(row);
    return ok(row);
  }),
];

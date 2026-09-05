/**
 * TIME OFF — types, allocations, requests and balances.
 *
 * Three behaviours from PRD §3.6, all of which the UI is designed around and
 * none of which is visible unless the mock actually enforces them:
 *
 *   · **`duration_days` is schedule- and holiday-aware.** Computed on the
 *     server, from the range — never sent by the client. A Friday-to-Monday
 *     request on a five-day week is two days.
 *   · **Approval blocks past zero.** Not creation: you may *file* a request
 *     that would overdraw the balance, and the approver is the one who is
 *     stopped. That split is why `LeaveBalance.pending` exists — the UI has to
 *     warn before the user reaches the wall.
 *   · **Hours convert on approval.** An `HOURS` type is filed in hours and
 *     recorded as `hours / daily_hours` days.
 *
 * Overlapping requests are refused on create, because two approved leaves on
 * one day would double-count against both the balance and `unpaid_days`.
 */
import { http } from "msw";
import type { LeaveAllocation, RequestState, TimeOffRequest, TimeOffType } from "@/api/contract";
import { LEAVE_UNITS } from "@/api/contract";
import { balanceFor, balancesFor, leaveDaysBetween } from "../derive";
import { byId, db, nextId } from "../db";
import {
  Fields, Refused, auth, body, businessRule, conflict, descBy, idOf, int, notFound, ok,
  ownScopeId, paginate, query, route, settle, sortBy, str,
} from "../http";
import { ANCHOR_TODAY } from "../seed/anchor";
import { decimal, monthLabel, monthOf } from "@/lib/date";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const dailyHoursOf = (employeeId: number): number => {
  const employee = byId(db.employees, employeeId);
  const schedule = byId(db.schedules, employee?.working_schedule_id ?? 1) ?? db.schedules[0];
  return Number(schedule?.daily_hours ?? 8);
};

const stamp = () => `${ANCHOR_TODAY}T${new Date().toTimeString().slice(0, 8)}+05:30`;

/** Approved and pending requests occupy the calendar; refused ones do not. */
const OCCUPYING: RequestState[] = ["DRAFT", "TO_APPROVE", "APPROVED"];

const overlapsExisting = (r: TimeOffRequest, employeeId: number, from: string, to: string) =>
  r.employee_id === employeeId &&
  OCCUPYING.includes(r.state) &&
  r.date_from <= to &&
  from <= r.date_to;

/**
 * The transitions §3.6 allows. Written as a table rather than a chain of
 * `if`s so the refusal message can name what *is* possible.
 */
const NEXT_STATES: Record<RequestState, RequestState[]> = {
  DRAFT: ["TO_APPROVE", "CANCELLED"],
  TO_APPROVE: ["APPROVED", "REFUSED", "CANCELLED"],
  APPROVED: ["CANCELLED"],
  REFUSED: [],
  CANCELLED: [],
};

export const timeOffHandlers = [
  /* ── Types ─────────────────────────────────────────────────────────── */

  http.get(route("/time-off/types"), async ({ request }) => {
    await settle();
    const user = auth(request, "time_off_type", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const activeOnly = query(url).bool("is_active");
    const rows = db.timeOffTypes.filter((t) => activeOnly === undefined || t.is_active === activeOnly);
    return ok(paginate(sortBy(rows, (t) => t.name), url));
  }),

  http.post(route("/time-off/types"), async ({ request }) => {
    await settle();
    const user = auth(request, "time_off_type", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const name = str(patch.name);
    const code = str(patch.code);
    const unit = str(patch.unit) ?? "DAYS";

    const f = new Fields().require("name", name).require("code", code);
    if (code !== undefined) {
      f.check(/^[A-Z][A-Z0-9_]{1,9}$/.test(code), "code", "Capitals, digits and underscores.");
      f.check(!db.timeOffTypes.some((t) => t.code === code), "code", "That code is taken.");
    }
    f.check((LEAVE_UNITS as readonly string[]).includes(unit), "unit", "Days or hours.");
    if (f.failed) return f.response();

    const created: TimeOffType = {
      id: nextId(db.timeOffTypes),
      name: name!,
      code: code!,
      unit: unit as TimeOffType["unit"],
      requires_allocation: patch.requires_allocation !== false,
      is_paid: patch.is_paid !== false,
      // A token name, never a hex — blueprint §20.3.
      color: str(patch.color) ?? "cobalt",
      is_active: true,
    };
    db.timeOffTypes.push(created);
    return ok(created, 201);
  }),

  http.patch(route("/time-off/types/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "time_off_type", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.timeOffTypes, idOf(params));
    if (!row) return notFound("That leave type");

    const patch = await body(request);
    for (const key of ["name", "color"] as const) {
      const value = str(patch[key]);
      if (value) row[key] = value;
    }
    for (const key of ["requires_allocation", "is_paid", "is_active"] as const) {
      if (typeof patch[key] === "boolean") row[key] = patch[key] as boolean;
    }
    return ok(row);
  }),

  /* ── Allocations ───────────────────────────────────────────────────── */

  http.get(route("/time-off/allocations"), async ({ request }) => {
    await settle();
    const user = auth(request, "leave_allocation", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const q = query(url);
    const own = ownScopeId(user);
    const employeeId = own ?? q.num("employee_id");
    const typeId = q.num("time_off_type_id");
    const state = q.get("state");

    const rows = db.leaveAllocations.filter(
      (a) =>
        (employeeId === undefined || a.employee_id === employeeId) &&
        (typeId === undefined || a.time_off_type_id === typeId) &&
        (state === undefined || a.state === state),
    );
    return ok(paginate(sortBy(rows, (a) => a.employee_name), url));
  }),

  http.post(route("/time-off/allocations"), async ({ request }) => {
    await settle();
    const user = auth(request, "leave_allocation", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const employeeId = int(patch.employee_id);
    const typeId = int(patch.time_off_type_id);
    const days = patch.days;
    const from = str(patch.validity_from);
    const to = str(patch.validity_to);

    const f = new Fields()
      .require("employee_id", employeeId)
      .require("time_off_type_id", typeId)
      .require("days", days)
      .require("validity_from", from)
      .require("validity_to", to);

    const employee = employeeId === undefined ? undefined : byId(db.employees, employeeId);
    const type = typeId === undefined ? undefined : byId(db.timeOffTypes, typeId);
    f.check(employee !== undefined, "employee_id", "That employee no longer exists.");
    f.check(type !== undefined, "time_off_type_id", "That leave type no longer exists.");
    if (days !== undefined) f.check(Number(days) > 0, "days", "Allocate more than zero.");
    if (from && to) f.check(to >= from, "validity_to", "The window ends before it starts.");
    if (f.failed) return f.response();

    const created: LeaveAllocation = {
      id: nextId(db.leaveAllocations),
      employee_id: employee!.id,
      employee_name: employee!.full_name,
      time_off_type_id: type!.id,
      time_off_type_name: type!.name,
      days: decimal(Number(days)),
      validity_from: from!,
      validity_to: to!,
      // Allocations are proposed, then approved — same two-step as a request.
      state: "TO_APPROVE",
      notes: str(patch.notes) ?? null,
    };
    db.leaveAllocations.push(created);
    return ok(created, 201);
  }),

  http.post(route("/time-off/allocations/:id/approve"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "leave_allocation", "approve");
    if (user instanceof Refused) return user.response;

    const row = byId(db.leaveAllocations, idOf(params));
    if (!row) return notFound("That allocation");
    if (row.state !== "TO_APPROVE") {
      return businessRule("invalid_state", `An allocation that is ${row.state} cannot be approved.`);
    }
    row.state = "APPROVED";
    return ok(row);
  }),

  http.post(route("/time-off/allocations/:id/refuse"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "leave_allocation", "approve");
    if (user instanceof Refused) return user.response;

    const row = byId(db.leaveAllocations, idOf(params));
    if (!row) return notFound("That allocation");
    if (row.state !== "TO_APPROVE") {
      return businessRule("invalid_state", `An allocation that is ${row.state} cannot be refused.`);
    }
    row.state = "REFUSED";
    return ok(row);
  }),

  /* ── Balances ──────────────────────────────────────────────────────── */

  http.get(route("/time-off/balances"), async ({ request }) => {
    await settle();
    const user = auth(request, "leave_allocation", "read");
    if (user instanceof Refused) return user.response;

    const q = query(new URL(request.url));
    const own = ownScopeId(user);
    const employeeId = own ?? q.num("employee_id") ?? user.employee_id;
    if (employeeId === null || employeeId === undefined) {
      return new Fields().add("employee_id", "Say whose balances you want.").response();
    }
    if (!byId(db.employees, employeeId)) return notFound("That employee");

    // Not a `Page` — this is a fixed, small set per employee, and paging it
    // would be a lie about how it is fetched (PRD §5 lists it flat).
    return ok(balancesFor(employeeId));
  }),

  /* ── Requests ──────────────────────────────────────────────────────── */

  http.get(route("/time-off/requests"), async ({ request }) => {
    await settle();
    const user = auth(request, "time_off_request", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const q = query(url);
    const own = ownScopeId(user);

    let rows = db.timeOffRequests;
    if (own !== null) {
      rows = rows.filter((r) => r.employee_id === own);
    } else if (q.get("scope") === "my_team") {
      const team = new Set(
        db.employees.filter((e) => e.manager_id === user.employee_id).map((e) => e.id),
      );
      rows = rows.filter((r) => team.has(r.employee_id));
    }

    const employeeId = q.num("employee_id");
    const typeId = q.num("time_off_type_id");
    const state = q.get("state");
    const from = q.get("date_from");
    const to = q.get("date_to");

    rows = rows.filter(
      (r) =>
        (employeeId === undefined || r.employee_id === employeeId) &&
        (typeId === undefined || r.time_off_type_id === typeId) &&
        (state === undefined || r.state === state) &&
        (from === undefined || r.date_to >= from) &&
        (to === undefined || r.date_from <= to),
    );

    return ok(paginate(descBy(rows, (r) => r.date_from), url));
  }),

  http.post(route("/time-off/requests"), async ({ request }) => {
    await settle();
    const user = auth(request, "time_off_request", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const own = ownScopeId(user);
    const employeeId = own ?? int(patch.employee_id) ?? user.employee_id ?? undefined;
    const typeId = int(patch.time_off_type_id);
    const from = str(patch.date_from);
    const to = str(patch.date_to) ?? from;

    const f = new Fields()
      .require("employee_id", employeeId)
      .require("time_off_type_id", typeId)
      .require("date_from", from);

    const employee = employeeId === undefined ? undefined : byId(db.employees, employeeId);
    const type = typeId === undefined ? undefined : byId(db.timeOffTypes, typeId);
    f.check(employee !== undefined, "employee_id", "That employee no longer exists.");
    f.check(type?.is_active === true, "time_off_type_id", "That leave type is not available.");
    if (from) f.check(ISO_DATE.test(from), "date_from", "Use the date picker (YYYY-MM-DD).");
    if (from && to) f.check(to >= from, "date_to", "The request ends before it starts.");
    if (f.failed) return f.response();

    /**
     * §3.6: an `HOURS`-unit type is *filed* in hours and *recorded* in days,
     * so one number reaches payroll and the balance. Everything else counts
     * working days in the range. Either way the client does not get to say.
     */
    const days =
      type!.unit === "HOURS"
        ? Number(patch.hours ?? 0) / dailyHoursOf(employee!.id)
        : leaveDaysBetween(employee!.id, from!, to!);

    if (type!.unit === "HOURS" && !(Number(patch.hours) > 0)) {
      return new Fields().add("hours", "Say how many hours, for an hours-based type.").response();
    }

    if (days === 0) {
      return businessRule(
        "no_working_days",
        "Those dates are all weekends or public holidays — there is nothing to request.",
      );
    }

    const clash = db.timeOffRequests.find((r) => overlapsExisting(r, employee!.id, from!, to!));
    if (clash) {
      return businessRule(
        "overlapping_request",
        `This overlaps an existing ${clash.state.toLowerCase().replace("_", " ")} request ` +
          `from ${clash.date_from} to ${clash.date_to}.`,
      );
    }

    const created: TimeOffRequest = {
      id: nextId(db.timeOffRequests),
      employee_id: employee!.id,
      employee_name: employee!.full_name,
      time_off_type_id: type!.id,
      time_off_type_name: type!.name,
      is_paid: type!.is_paid,
      date_from: from!,
      date_to: to!,
      duration_days: decimal(days),
      // Filed straight for approval; `DRAFT` is reachable by asking for it.
      state: str(patch.state) === "DRAFT" ? "DRAFT" : "TO_APPROVE",
      reason: str(patch.reason) ?? null,
      approver_id: null,
      approver_name: null,
      decided_at: null,
    };

    db.timeOffRequests.push(created);
    return ok(created, 201);
  }),

  /**
   * **Where the balance is enforced.** Creation is permissive on purpose; this
   * is the wall, and `LeaveBalance.pending` is how the UI shows it coming.
   */
  http.post(route("/time-off/requests/:id/approve"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "time_off_request", "approve");
    if (user instanceof Refused) return user.response;

    const row = byId(db.timeOffRequests, idOf(params));
    if (!row) return notFound("That request");
    if (!NEXT_STATES[row.state].includes("APPROVED")) {
      return businessRule("invalid_state", `A request that is ${row.state} cannot be approved.`);
    }

    const type = byId(db.timeOffTypes, row.time_off_type_id);

    if (type?.requires_allocation) {
      const balance = balanceFor(row.employee_id, type);
      // `pending` includes this request, so compare against taken only.
      const remaining = Number(balance?.allocated ?? 0) - Number(balance?.taken ?? 0);
      if (Number(row.duration_days) > remaining) {
        return businessRule(
          "insufficient_balance",
          `${row.employee_name} has ${decimal(Math.max(0, remaining))} days of ` +
            `${type.name} left and this request is ${row.duration_days}. ` +
            `Allocate more before approving.`,
        );
      }
    }

    row.state = "APPROVED";
    row.approver_id = user.employee_id;
    row.approver_name = user.full_name;
    row.decided_at = stamp();
    return ok(row);
  }),

  http.post(route("/time-off/requests/:id/refuse"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "time_off_request", "approve");
    if (user instanceof Refused) return user.response;

    const row = byId(db.timeOffRequests, idOf(params));
    if (!row) return notFound("That request");
    if (!NEXT_STATES[row.state].includes("REFUSED")) {
      return businessRule("invalid_state", `A request that is ${row.state} cannot be refused.`);
    }

    row.state = "REFUSED";
    row.approver_id = user.employee_id;
    row.approver_name = user.full_name;
    row.decided_at = stamp();
    return ok(row);
  }),

  /**
   * Cancellation is reachable from `APPROVED`, which is why that transition is
   * in the table above — plans change after a manager has said yes.
   *
   * It needs `update`, which `EMPLOYEE` does not have: the matrix grants that
   * role create and read on its own requests and no more, so an employee asks
   * their manager to cancel. That is the backend's rule, mirrored, not a
   * decision taken here — see `auth/rbac.ts`.
   */
  http.post(route("/time-off/requests/:id/cancel"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "time_off_request", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.timeOffRequests, idOf(params));
    if (!row) return notFound("That request");

    const own = ownScopeId(user);
    if (own !== null && row.employee_id !== own) return notFound("That request");

    if (!NEXT_STATES[row.state].includes("CANCELLED")) {
      return businessRule("invalid_state", `A request that is ${row.state} cannot be cancelled.`);
    }

    /**
     * PRD §3.6's cancellation table, third row. An APPROVED request whose days
     * fall inside a period that has already been **paid** cannot be withdrawn:
     * the payslip that consumed it is money that has moved, and §4.8 makes
     * paid payroll immutable. Correcting it is §14 roadmap, not a button.
     *
     * The other two rows need no code — a DRAFT or TO_APPROVE request never
     * consumed anything, and an APPROVED one in an open period just cancels.
     */
    if (row.state === "APPROVED") {
      const paid = db.payslips.find(
        (p) =>
          p.employee_id === row.employee_id &&
          p.state === "PAID" &&
          p.period_start <= row.date_to &&
          p.period_end >= row.date_from,
      );
      if (paid) {
        return conflict(
          `${row.employee_name} has already been paid for ` +
            `${monthLabel(monthOf(paid.period_end))}, and this leave is inside that period. ` +
            `Paid payroll cannot be changed — a correction run is the only way back.`,
        );
      }
    }

    row.state = "CANCELLED";
    row.decided_at = stamp();
    return ok(row);
  }),
];

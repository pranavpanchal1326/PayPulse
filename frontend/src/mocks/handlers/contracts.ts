/**
 * CONTRACTS — `/contracts` and `/contracts/active`.
 *
 * The one rule worth writing a mock for is **B2's exclusion constraint**, and
 * specifically its boundary: two `RUNNING` contracts for the same employee may
 * not overlap, but they *may* be adjacent. A contract ending on the 15th and
 * the next starting on the 16th is a mid-month raise, not a collision — v1
 * rejected it and thereby made a raise unpayable (PRD §3.2).
 *
 * Postgres will enforce this with an `EXCLUDE` constraint over
 * `daterange(date_start, date_end, '[]')`. `overlaps()` below is that range
 * comparison, closed at both ends, so the mock refuses exactly what the
 * database will refuse and accepts exactly what it will accept.
 */
import { http } from "msw";
import type { Contract } from "@/api/contract";
import { CONTRACT_STATES } from "@/api/contract";
import { byId, db, nextId } from "../db";
import {
  Fields, Refused, auth, body, conflict, descBy, idOf, int, notFound, ok, ownScopeId,
  paginate, query, route, settle, str,
} from "../http";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+(\.\d{1,2})?$/;

/**
 * Closed at both ends, `null` meaning open-ended. `a` ends the day `b` starts
 * ⇒ they touch but do not overlap, which is the case that matters.
 */
const overlaps = (a: Contract, b: Contract): boolean =>
  a.date_start <= (b.date_end ?? "9999-12-31") && b.date_start <= (a.date_end ?? "9999-12-31");

/** Running on `date` — the §4.3 step-1 resolver's predicate. */
const runningOn = (c: Contract, date: string): boolean =>
  c.state === "RUNNING" && c.date_start <= date && (c.date_end === null || c.date_end >= date);

function validateContract(patch: Record<string, unknown>, existing: Contract | null): Fields {
  const f = new Fields();

  const employeeId = int(patch.employee_id) ?? existing?.employee_id;
  const start = str(patch.date_start) ?? existing?.date_start;
  const end = patch.date_end === null ? null : (str(patch.date_end) ?? existing?.date_end ?? null);
  const wage = str(patch.wage) ?? existing?.wage;
  const state = (str(patch.state) ?? existing?.state ?? "DRAFT") as Contract["state"];

  if (!existing) {
    f.require("employee_id", patch.employee_id)
      .require("name", str(patch.name))
      .require("date_start", str(patch.date_start))
      .require("wage", patch.wage);
  }

  if (employeeId !== undefined) {
    f.check(byId(db.employees, employeeId) !== undefined, "employee_id", "That employee no longer exists.");
  }
  if (start !== undefined) {
    f.check(ISO_DATE.test(start), "date_start", "Use the date picker (YYYY-MM-DD).");
  }
  if (end !== null && end !== undefined) {
    f.check(ISO_DATE.test(end), "date_end", "Use the date picker (YYYY-MM-DD).");
    if (start) f.check(end >= start, "date_end", "The end date cannot precede the start date.");
  }
  if (wage !== undefined) {
    // Money is a string on the wire in both directions (PRD §5).
    f.check(MONEY.test(String(wage)), "wage", "Enter an amount like 50000.00.");
  }
  if (str(patch.state) !== undefined) {
    f.check(
      (CONTRACT_STATES as readonly string[]).includes(state),
      "state",
      "Not a valid contract state.",
    );
  }

  const scheduleId = int(patch.working_schedule_id) ?? existing?.working_schedule_id;
  if (scheduleId !== undefined) {
    f.check(byId(db.schedules, scheduleId) !== undefined, "working_schedule_id", "That schedule no longer exists.");
  }

  const structureId =
    patch.salary_structure_id === null
      ? null
      : (int(patch.salary_structure_id) ?? existing?.salary_structure_id ?? null);
  if (structureId !== null && structureId !== undefined) {
    f.check(
      byId(db.salaryStructures, structureId) !== undefined,
      "salary_structure_id",
      "That salary structure no longer exists.",
    );
  }

  return f;
}

/** B2's exclusion constraint, as the database will state it. */
function findOverlap(candidate: Contract): Contract | undefined {
  if (candidate.state !== "RUNNING") return undefined;
  return db.contracts.find(
    (c) =>
      c.id !== candidate.id &&
      c.employee_id === candidate.employee_id &&
      c.state === "RUNNING" &&
      overlaps(c, candidate),
  );
}

export const contractHandlers = [
  /**
   * Registered **before** `/contracts/:id` would be: MSW matches in
   * registration order, and `active` is a perfectly good `:id` as far as a
   * path pattern is concerned.
   */
  http.get(route("/contracts/active"), async ({ request }) => {
    await settle();
    const user = auth(request, "contract", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const q = query(url);
    const own = ownScopeId(user);
    const employeeId = own ?? q.num("employee_id");
    const date = q.get("date") ?? new Date().toISOString().slice(0, 10);

    if (employeeId === undefined) {
      return new Fields().add("employee_id", "Say whose contract you want.").response();
    }

    const applicable = db.contracts
      .filter((c) => c.employee_id === employeeId && runningOn(c, date))
      // §4.3 step 1: when several apply, the one in force at the later date.
      .sort((a, b) => b.date_start.localeCompare(a.date_start));

    if (applicable.length === 0) return notFound("No contract covering that date");
    return ok(applicable[0]);
  }),

  http.get(route("/contracts"), async ({ request }) => {
    await settle();
    const user = auth(request, "contract", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const q = query(url);
    const own = ownScopeId(user);
    const employeeId = own ?? q.num("employee_id");
    const state = q.get("state");
    const activeOn = q.get("active_on");

    const rows = db.contracts.filter(
      (c) =>
        (employeeId === undefined || c.employee_id === employeeId) &&
        (state === undefined || c.state === state) &&
        (activeOn === undefined ||
          (c.date_start <= activeOn && (c.date_end === null || c.date_end >= activeOn))),
    );

    return ok(paginate(descBy(rows, (c) => c.date_start), url));
  }),

  http.post(route("/contracts"), async ({ request }) => {
    await settle();
    const user = auth(request, "contract", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const f = validateContract(patch, null);
    if (f.failed) return f.response();

    const employee = byId(db.employees, int(patch.employee_id)!)!;
    const created: Contract = {
      id: nextId(db.contracts),
      employee_id: employee.id,
      employee_name: employee.full_name,
      name: str(patch.name)!,
      state: (str(patch.state) as Contract["state"]) ?? "DRAFT",
      date_start: str(patch.date_start)!,
      date_end: str(patch.date_end) ?? null,
      wage: Number(patch.wage).toFixed(2),
      currency: str(patch.currency) ?? "INR",
      working_schedule_id: int(patch.working_schedule_id) ?? employee.working_schedule_id ?? 1,
      salary_structure_id: int(patch.salary_structure_id) ?? db.salaryStructures[0]?.id ?? null,
      job_position_id: int(patch.job_position_id) ?? employee.job_position_id,
      notes: str(patch.notes) ?? null,
    };

    const clash = findOverlap(created);
    if (clash) {
      return conflict(
        `This overlaps "${clash.name}" (${clash.date_start} to ${clash.date_end ?? "open"}). ` +
          `End that contract the day before this one starts to record a mid-period change.`,
      );
    }

    db.contracts.push(created);
    return ok(created, 201);
  }),

  http.patch(route("/contracts/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "contract", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.contracts, idOf(params));
    if (!row) return notFound("That contract");

    const patch = await body(request);
    const f = validateContract(patch, row);
    if (f.failed) return f.response();

    // Validate the *result*, not the patch: an overlap is a property of the
    // row as it would stand after the write.
    const candidate: Contract = { ...row };
    for (const key of [
      "name", "state", "date_start", "date_end", "working_schedule_id",
      "salary_structure_id", "job_position_id", "notes",
    ] as const) {
      if (key in patch) (candidate as unknown as Record<string, unknown>)[key] = patch[key];
    }
    if (patch.wage !== undefined) candidate.wage = Number(patch.wage).toFixed(2);

    const clash = findOverlap(candidate);
    if (clash) {
      return conflict(
        `This would overlap "${clash.name}" (${clash.date_start} to ${clash.date_end ?? "open"}).`,
      );
    }

    Object.assign(row, candidate);
    return ok(row);
  }),
];

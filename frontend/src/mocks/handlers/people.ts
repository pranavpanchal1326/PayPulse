/**
 * PEOPLE AND REFERENCE DATA — `/employees`, `/departments`, `/job-positions`,
 * `/working-schedules`.
 *
 * Three rules from the PRD are enforced here rather than merely represented,
 * because the screens built on top of them (P5, P6) are designed *around* the
 * refusal:
 *
 *   · **`EMPLOYEE` sees one row — its own** (§6, row-level scoping). Not a
 *     filtered list of thirty; a list of one.
 *   · **`status` is derived from `date_of_exit`**, never set by hand (§3.3).
 *   · **`hours_per_week` is computed from the schedule lines** on every write
 *     (spec A3). Sending it is ignored, exactly as the server will ignore it.
 */
import { http } from "msw";
import type { Department, Employee, JobPosition, WorkingSchedule } from "@/api/contract";
import { EMPLOYEE_STATUSES, EMPLOYEE_TYPES } from "@/api/contract";
import { byId, db, matches, nextId } from "../db";
import {
  Fields, Refused, auth, body, idOf, int, notFound, ok, ownScopeId, paginate, query,
  route, settle, sortBy, str,
} from "../http";
import { crossesMidnight, decimal, shiftMinutes } from "../seed/calendar";

/* ── Validation shared by create and update ──────────────────────────── */

/** `^[A-Z]{4}0[A-Z0-9]{6}$` — PRD §3.9. The fixtures satisfy it; so must input. */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateEmployee(patch: Record<string, unknown>, existing: Employee | null): Fields {
  const f = new Fields();
  const email = str(patch.email);
  const name = str(patch.full_name);

  if (!existing) {
    f.require("full_name", name)
      .require("email", email)
      .require("date_of_joining", str(patch.date_of_joining));
  }

  if (email !== undefined) {
    f.check(EMAIL.test(email), "email", "Enter a valid email address.");
    const clash = db.employees.find(
      (e) => e.email.toLowerCase() === email.toLowerCase() && e.id !== existing?.id,
    );
    f.check(!clash, "email", "Another employee already uses this address.");
  }

  const ifsc = str(patch.bank_ifsc);
  if (ifsc !== undefined) {
    f.check(
      IFSC.test(ifsc),
      "bank_ifsc",
      "IFSC looks like HDFC0001234 — four letters, a zero, then six.",
    );
  }

  for (const field of ["date_of_joining", "date_of_exit"] as const) {
    const value = str(patch[field]);
    if (value !== undefined) {
      f.check(ISO_DATE.test(value), field, "Use the date picker (YYYY-MM-DD).");
    }
  }

  const joining = str(patch.date_of_joining) ?? existing?.date_of_joining;
  const exit =
    patch.date_of_exit === null ? null : (str(patch.date_of_exit) ?? existing?.date_of_exit);
  if (joining && exit) {
    f.check(exit >= joining, "date_of_exit", "The exit date cannot precede the joining date.");
  }

  const type = str(patch.employee_type);
  if (type !== undefined) {
    f.check(
      (EMPLOYEE_TYPES as readonly string[]).includes(type),
      "employee_type",
      "Not a valid employee type.",
    );
  }

  const status = str(patch.status);
  if (status !== undefined) {
    f.check(
      (EMPLOYEE_STATUSES as readonly string[]).includes(status),
      "status",
      "Not a valid status.",
    );
  }

  const references = [
    ["department_id", db.departments],
    ["job_position_id", db.jobPositions],
    ["manager_id", db.employees],
    ["working_schedule_id", db.schedules],
  ] as const;

  for (const [field, rows] of references) {
    const id = patch[field] === null ? null : int(patch[field]);
    if (id !== undefined && id !== null) {
      f.check(
        byId(rows as readonly { id: number }[] as { id: number }[], id) !== undefined,
        field,
        "That record no longer exists.",
      );
    }
  }

  if (existing && int(patch.manager_id) === existing.id) {
    f.add("manager_id", "An employee cannot report to themselves.");
  }

  return f;
}

/** Denormalised names, recomputed on every write so a rename cannot orphan one. */
function denormalise(e: Employee): Employee {
  e.department_name =
    e.department_id === null ? null : (byId(db.departments, e.department_id)?.name ?? null);
  e.job_title =
    e.job_position_id === null ? null : (byId(db.jobPositions, e.job_position_id)?.title ?? null);
  e.manager_name =
    e.manager_id === null ? null : (byId(db.employees, e.manager_id)?.full_name ?? null);
  // §3.3: status follows the exit date. It is stored, not entered.
  e.status = e.date_of_exit ? "INACTIVE" : "ACTIVE";
  return e;
}

/** Employee counts are derived, so they cannot drift after a create or a move. */
function recount(): void {
  for (const d of db.departments) {
    d.employee_count = db.employees.filter((e) => e.department_id === d.id).length;
  }
  for (const p of db.jobPositions) {
    p.employee_count = db.employees.filter((e) => e.job_position_id === p.id).length;
  }
}

/**
 * The A3 rule in one place: `hours_per_week`, `daily_hours` and
 * `crosses_midnight` are **derived from the lines**, on create and on update.
 * Whatever the client sent for those three is discarded without comment —
 * which is what "read-only" has to mean on a write endpoint.
 */
function buildSchedule(
  id: number,
  name: string,
  timezone: string | undefined,
  lines: Record<string, unknown>[],
): WorkingSchedule {
  const normalised = lines.map((l, i) => ({
    id: id * 10 + i,
    day_of_week: int(l.day_of_week) ?? 0,
    start_time: str(l.start_time) ?? "09:00:00",
    end_time: str(l.end_time) ?? "18:00:00",
    break_minutes: int(l.break_minutes) ?? 0,
  }));

  const minutes = normalised.reduce(
    (total, l) => total + shiftMinutes(l.start_time, l.end_time, l.break_minutes),
    0,
  );
  const days = new Set(normalised.map((l) => l.day_of_week)).size;

  return {
    id,
    name,
    timezone: timezone ?? "Asia/Kolkata",
    hours_per_week: decimal(minutes / 60),
    daily_hours: decimal(days === 0 ? 0 : minutes / 60 / days),
    crosses_midnight: normalised.some((l) => crossesMidnight(l.start_time, l.end_time)),
    lines: normalised,
  };
}

/* ── Handlers ────────────────────────────────────────────────────────── */

export const peopleHandlers = [
  /* ── Employees ─────────────────────────────────────────────────────── */

  http.get(route("/employees"), async ({ request }) => {
    await settle();
    const user = auth(request, "employee", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const q = query(url);
    const own = ownScopeId(user);

    let rows = db.employees;
    if (own !== null) {
      rows = rows.filter((e) => e.id === own);
    } else if (q.get("scope") === "my_team") {
      // "Reports to me", resolved from the caller's own employee record —
      // never from a client-supplied id.
      rows = rows.filter((e) => e.manager_id === user.employee_id);
    }

    const search = q.get("q");
    const departmentId = q.num("department_id");
    const managerId = q.num("manager_id");
    const status = q.get("status");
    const type = q.get("employee_type");

    rows = rows.filter(
      (e) =>
        (search === undefined ||
          matches(e.full_name, search) ||
          matches(e.email, search) ||
          matches(e.employee_number, search) ||
          matches(e.job_title, search)) &&
        (departmentId === undefined || e.department_id === departmentId) &&
        (managerId === undefined || e.manager_id === managerId) &&
        (status === undefined || e.status === status) &&
        (type === undefined || e.employee_type === type),
    );

    return ok(paginate(sortBy(rows, (e) => e.full_name), url));
  }),

  http.post(route("/employees"), async ({ request }) => {
    await settle();
    const user = auth(request, "employee", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const f = validateEmployee(patch, null);
    if (f.failed) return f.response();

    const id = nextId(db.employees);
    const created: Employee = denormalise({
      id,
      employee_number: `PP-${String(id).padStart(4, "0")}`,
      full_name: str(patch.full_name)!,
      email: str(patch.email)!,
      phone: str(patch.phone) ?? null,
      department_id: int(patch.department_id) ?? null,
      department_name: null,
      job_position_id: int(patch.job_position_id) ?? null,
      job_title: null,
      manager_id: int(patch.manager_id) ?? null,
      manager_name: null,
      working_schedule_id: int(patch.working_schedule_id) ?? 1,
      employee_type: (str(patch.employee_type) as Employee["employee_type"]) ?? "FULL_TIME",
      status: "ACTIVE",
      date_of_joining: str(patch.date_of_joining)!,
      date_of_exit: str(patch.date_of_exit) ?? null,
      bank_account: str(patch.bank_account) ?? null,
      bank_ifsc: str(patch.bank_ifsc) ?? null,
      user_id: null,
    });

    db.employees.push(created);
    recount();
    return ok(created, 201);
  }),

  http.get(route("/employees/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "employee", "read");
    if (user instanceof Refused) return user.response;

    const row = byId(db.employees, idOf(params));
    if (!row) return notFound("That employee");

    const own = ownScopeId(user);
    // A 404 rather than a 403: scoping should not confirm that a row exists.
    if (own !== null && row.id !== own) return notFound("That employee");

    return ok(row);
  }),

  http.patch(route("/employees/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "employee", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.employees, idOf(params));
    if (!row) return notFound("That employee");

    const patch = await body(request);
    const f = validateEmployee(patch, row);
    if (f.failed) return f.response();

    const writable = [
      "full_name", "email", "phone", "department_id", "job_position_id", "manager_id",
      "working_schedule_id", "employee_type", "date_of_joining", "date_of_exit",
      "bank_account", "bank_ifsc",
    ] as const;

    for (const key of writable) {
      if (key in patch) (row as unknown as Record<string, unknown>)[key] = patch[key];
    }

    denormalise(row);
    recount();
    return ok(row);
  }),

  /**
   * ★ PRD §5 — one call, five counts. Five round-trips per employee form
   * would be slow and obvious on stage.
   */
  http.get(route("/employees/:id/summary"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "employee", "read");
    if (user instanceof Refused) return user.response;

    const id = idOf(params);
    if (!byId(db.employees, id)) return notFound("That employee");

    const own = ownScopeId(user);
    if (own !== null && id !== own) return notFound("That employee");

    const count = <T,>(rows: T[], match: (row: T) => boolean) => rows.filter(match).length;

    return ok({
      employee_id: id,
      contracts: count(db.contracts, (c) => c.employee_id === id),
      attendances: count(db.attendances, (a) => a.employee_id === id),
      time_off_requests: count(db.timeOffRequests, (r) => r.employee_id === id),
      allocations: count(db.leaveAllocations, (a) => a.employee_id === id),
      payslips: count(db.payslips, (p) => p.employee_id === id),
    });
  }),

  /* ── Departments ───────────────────────────────────────────────────── */

  http.get(route("/departments"), async ({ request }) => {
    await settle();
    const user = auth(request, "department", "read");
    if (user instanceof Refused) return user.response;
    return ok(paginate(sortBy(db.departments, (d) => d.name), new URL(request.url)));
  }),

  http.post(route("/departments"), async ({ request }) => {
    await settle();
    const user = auth(request, "department", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const name = str(patch.name);
    const code = str(patch.code);

    const f = new Fields().require("name", name).require("code", code);
    if (code !== undefined) {
      f.check(/^[A-Z]{2,6}$/.test(code), "code", "Two to six capital letters.");
      f.check(!db.departments.some((d) => d.code === code), "code", "That code is taken.");
    }
    if (f.failed) return f.response();

    const created: Department = {
      id: nextId(db.departments),
      name: name!,
      code: code!,
      manager_id: int(patch.manager_id) ?? null,
      employee_count: 0,
    };
    db.departments.push(created);
    return ok(created, 201);
  }),

  http.patch(route("/departments/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "department", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.departments, idOf(params));
    if (!row) return notFound("That department");

    const patch = await body(request);
    const name = str(patch.name);
    if (name) row.name = name;
    if ("manager_id" in patch) row.manager_id = int(patch.manager_id) ?? null;
    return ok(row);
  }),

  /* ── Job positions ─────────────────────────────────────────────────── */

  http.get(route("/job-positions"), async ({ request }) => {
    await settle();
    const user = auth(request, "job_position", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const departmentId = query(url).num("department_id");
    const rows = db.jobPositions.filter(
      (p) => departmentId === undefined || p.department_id === departmentId,
    );
    return ok(paginate(sortBy(rows, (p) => p.title), url));
  }),

  http.post(route("/job-positions"), async ({ request }) => {
    await settle();
    const user = auth(request, "job_position", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const title = str(patch.title);
    const f = new Fields().require("title", title);
    if (f.failed) return f.response();

    const created: JobPosition = {
      id: nextId(db.jobPositions),
      title: title!,
      department_id: int(patch.department_id) ?? null,
      employee_count: 0,
    };
    db.jobPositions.push(created);
    return ok(created, 201);
  }),

  http.patch(route("/job-positions/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "job_position", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.jobPositions, idOf(params));
    if (!row) return notFound("That position");

    const patch = await body(request);
    const title = str(patch.title);
    if (title) row.title = title;
    if ("department_id" in patch) row.department_id = int(patch.department_id) ?? null;
    return ok(row);
  }),

  /* ── Working schedules ─────────────────────────────────────────────── */

  http.get(route("/working-schedules"), async ({ request }) => {
    await settle();
    const user = auth(request, "working_schedule", "read");
    if (user instanceof Refused) return user.response;
    return ok(paginate(sortBy(db.schedules, (s) => s.name), new URL(request.url)));
  }),

  http.post(route("/working-schedules"), async ({ request }) => {
    await settle();
    const user = auth(request, "working_schedule", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const name = str(patch.name);
    const lines = Array.isArray(patch.lines) ? (patch.lines as Record<string, unknown>[]) : [];

    const f = new Fields().require("name", name);
    f.check(lines.length > 0, "lines", "A schedule needs at least one working day.");
    if (f.failed) return f.response();

    const created = buildSchedule(nextId(db.schedules), name!, str(patch.timezone), lines);
    db.schedules.push(created);
    return ok(created, 201);
  }),

  http.patch(route("/working-schedules/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "working_schedule", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.schedules, idOf(params));
    if (!row) return notFound("That schedule");

    const patch = await body(request);
    const lines = Array.isArray(patch.lines)
      ? (patch.lines as Record<string, unknown>[])
      : row.lines.map((l) => ({ ...l }));

    Object.assign(
      row,
      buildSchedule(row.id, str(patch.name) ?? row.name, str(patch.timezone) ?? row.timezone, lines),
    );
    return ok(row);
  }),
];

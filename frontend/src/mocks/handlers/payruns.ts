/**
 * PAYRUNS — the two-step wizard and the processing cockpit.
 *
 * The state machine is the product here, so it is written once, as a table,
 * and every transition endpoint reads it. PRD §4.8:
 *
 *   DRAFT → COMPUTED → VALIDATED → PAID
 *     └──────── CANCELLED ────────┘        (never from PAID)
 *   VALIDATED → DRAFT via reopen           (never from PAID)
 *
 * Two refusals matter more than the rest, because they are what a payroll
 * manager is actually protected by:
 *
 *   · **An open `ERROR` blocks validate.** Not a confirm dialog — a refusal,
 *     naming the warnings.
 *   · **`MISSING_BANK_DETAILS` blocks mark-paid**, and can be forced *only*
 *     with a written reason, which is then stored on the run forever (§4.8).
 */
import { http } from "msw";
import type { EligibleEmployeesRequest, Payrun, PayrunState, WarningSeverity } from "@/api/contract";
import { byId, db, nextId } from "../db";
import {
  Fields, Refused, auth, body, businessRule, conflict, descBy, idOf, int, notFound, ok,
  paginate, query, route, settle, sortBy, str,
} from "../http";
import { computeRun, eligibleEmployees } from "../payrollRun";
import { monthLabel, monthOf } from "../seed/calendar";

/**
 * §4.8, as a table. A transition absent from here is refused, with this map's
 * own vocabulary.
 *
 * `COMPUTED → COMPUTED` is in the table deliberately: PRD §5 marks compute
 * **idempotent**, which means recomputing an already-computed run is a normal
 * thing to do — you fix an attendance row and press it again. Leaving it out
 * makes the second press a 422, and the cockpit's most-used button works
 * exactly once.
 */
const NEXT_STATES: Record<PayrunState, PayrunState[]> = {
  DRAFT: ["COMPUTED", "CANCELLED"],
  COMPUTED: ["COMPUTED", "VALIDATED", "DRAFT", "CANCELLED"],
  VALIDATED: ["PAID", "DRAFT", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

const warningsOf = (payrunId: number) => db.payrollWarnings.filter((w) => w.payrun_id === payrunId);

const openBlockers = (payrunId: number, blocks: "validate" | "compute" | "mark-paid") =>
  warningsOf(payrunId).filter((w) => !w.is_resolved && w.blocks === blocks);

const counts = (payrunId: number): Record<WarningSeverity, number> => {
  const tally: Record<WarningSeverity, number> = { ERROR: 0, WARNING: 0, INFO: 0 };
  for (const w of warningsOf(payrunId)) if (!w.is_resolved) tally[w.severity]++;
  return tally;
};

const detail = (payrun: Payrun) => ({
  ...payrun,
  payslips: sortBy(
    db.payslips.filter((p) => p.payrun_id === payrun.id),
    (p) => p.employee_name,
  ),
  warnings: warningsOf(payrun.id),
  warning_counts: counts(payrun.id),
});

const refuse = (payrun: Payrun, to: PayrunState) =>
  businessRule(
    "invalid_state",
    `A ${payrun.state.toLowerCase()} payrun cannot become ${to.toLowerCase()}.` +
      (NEXT_STATES[payrun.state].length === 0
        ? " This run is final."
        : ` From here it can only go to ${NEXT_STATES[payrun.state].join(", ").toLowerCase()}.`),
  );

const stamp = () => new Date().toISOString();

export const payrunHandlers = [
  /**
   * **STEP 1 · creates nothing.** Registered before `/payruns/:id` because a
   * path pattern is happy to read "eligible-employees" as an id.
   */
  http.post(route("/payruns/eligible-employees"), async ({ request }) => {
    await settle();
    const user = auth(request, "payrun", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const structureId = int(patch.salary_structure_id);
    const start = str(patch.period_start);
    const end = str(patch.period_end);

    const f = new Fields()
      .require("salary_structure_id", structureId)
      .require("period_start", start)
      .require("period_end", end);
    if (structureId !== undefined) {
      f.check(
        byId(db.salaryStructures, structureId) !== undefined,
        "salary_structure_id",
        "That structure no longer exists.",
      );
    }
    if (start && end) {
      f.check(end >= start, "period_end", "The period ends before it starts.");
    }
    if (f.failed) return f.response();

    const rows = eligibleEmployees({
      salary_structure_id: structureId!,
      period_start: start!,
      period_end: end!,
      department_id: int(patch.department_id),
      employee_type: str(patch.employee_type) as EligibleEmployeesRequest["employee_type"],
    });

    // A flat array, not a `Page`: this is a preview the wizard renders whole,
    // and paging a selection list would let a user commit to a subset they
    // never saw.
    return ok(sortBy(rows, (r) => r.name));
  }),

  http.get(route("/payruns"), async ({ request }) => {
    await settle();
    const user = auth(request, "payrun", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const q = query(url);
    const state = q.get("state");
    const period = q.get("period");
    const departmentId = q.num("department_id");

    let rows = db.payruns.filter(
      (p) =>
        (state === undefined || p.state === state) &&
        // `YYYY-MM` matches any run whose period overlaps that month.
        (period === undefined ||
          (monthOf(p.period_start) <= period && period <= monthOf(p.period_end))),
    );

    if (departmentId !== undefined) {
      const runsWithDepartment = new Set(
        db.payslips
          .filter((p) => {
            const employee = byId(db.employees, p.employee_id);
            return employee?.department_id === departmentId;
          })
          .map((p) => p.payrun_id),
      );
      rows = rows.filter((p) => runsWithDepartment.has(p.id));
    }

    return ok(paginate(descBy(rows, (p) => p.period_start), url));
  }),

  /** **STEP 2** — the first call in the wizard that writes anything down. */
  http.post(route("/payruns"), async ({ request }) => {
    await settle();
    const user = auth(request, "payrun", "create");
    if (user instanceof Refused) return user.response;

    const patch = await body(request);
    const structureId = int(patch.salary_structure_id);
    const start = str(patch.period_start);
    const end = str(patch.period_end);
    const employeeIds = Array.isArray(patch.employee_ids) ? patch.employee_ids.map(Number) : [];

    const f = new Fields()
      .require("salary_structure_id", structureId)
      .require("period_start", start)
      .require("period_end", end);
    f.check(employeeIds.length > 0, "employee_ids", "Choose at least one employee.");

    const structure = structureId === undefined ? undefined : byId(db.salaryStructures, structureId);
    f.check(structure !== undefined, "salary_structure_id", "That structure no longer exists.");
    if (start && end) f.check(end >= start, "period_end", "The period ends before it starts.");
    if (f.failed) return f.response();

    // Selecting someone step 1 called ineligible is a client bug, not a user
    // one — refuse it here rather than producing a payslip nobody can explain.
    const eligible = new Map(
      eligibleEmployees({
        salary_structure_id: structureId!,
        period_start: start!,
        period_end: end!,
      }).map((r) => [r.employee_id, r]),
    );
    const ineligible = employeeIds.filter((id) => eligible.get(id)?.eligible !== true);
    if (ineligible.length > 0) {
      const names = ineligible
        .map((id) => byId(db.employees, id)?.full_name ?? `#${id}`)
        .join(", ");
      return businessRule(
        "not_eligible",
        `${names} cannot be paid for this period. Go back a step and review the blockers.`,
      );
    }

    const created: Payrun = {
      id: nextId(db.payruns),
      name: str(patch.name) ?? `${monthLabel(monthOf(end!))} · monthly payroll`,
      salary_structure_id: structure!.id,
      salary_structure_name: structure!.name,
      period_start: start!,
      period_end: end!,
      currency: structure!.currency,
      state: "DRAFT",
      payslip_count: 0,
      total_gross: "0.00",
      total_deductions: "0.00",
      total_net: "0.00",
      computed_at: null,
      validated_at: null,
      paid_at: null,
      paid_by_id: null,
      force_paid_reason: null,
      created_at: stamp(),
    };
    db.payruns.push(created);

    // "creates batch + DRAFT payslips, returns processing view" (PRD §5). The
    // pipeline runs so the processing view has rows to show, but the run is
    // left DRAFT and uncomputed: Compute is a decision the user makes, and a
    // `computed_at` on a run nobody has computed would be a lie the cockpit
    // then has to render.
    computeRun(created, employeeIds);
    created.state = "DRAFT";
    created.computed_at = null;
    for (const slip of db.payslips.filter((p) => p.payrun_id === created.id)) {
      slip.state = "DRAFT";
    }

    return ok(detail(created), 201);
  }),

  http.get(route("/payruns/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payrun", "read");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payruns, idOf(params));
    if (!row) return notFound("That payrun");
    return ok(detail(row));
  }),

  http.get(route("/payruns/:id/warnings"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payrun", "read");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payruns, idOf(params));
    if (!row) return notFound("That payrun");

    const url = new URL(request.url);
    const severity = query(url).get("severity");
    const rows = warningsOf(row.id).filter((w) => severity === undefined || w.severity === severity);
    return ok(paginate(rows, url));
  }),

  /** Idempotent by construction — see `payrollRun.ts::computeRun`. */
  http.post(route("/payruns/:id/compute"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payrun", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payruns, idOf(params));
    if (!row) return notFound("That payrun");
    if (!NEXT_STATES[row.state].includes("COMPUTED")) return refuse(row, "COMPUTED");

    computeRun(row);

    const blocked = openBlockers(row.id, "compute");
    if (blocked.length > 0) {
      return businessRule("compute_blocked", blocked[0].message);
    }
    return ok(detail(row));
  }),

  http.post(route("/payruns/:id/validate"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payrun", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payruns, idOf(params));
    if (!row) return notFound("That payrun");
    if (!NEXT_STATES[row.state].includes("VALIDATED")) return refuse(row, "VALIDATED");

    // Not a confirm dialog. An unresolved ERROR is a refusal, and it names
    // what has to be fixed — §4.9.
    const errors = warningsOf(row.id).filter((w) => !w.is_resolved && w.severity === "ERROR");
    if (errors.length > 0) {
      return businessRule(
        "blocked_by_errors",
        `${errors.length} ${errors.length === 1 ? "error" : "errors"} must be resolved first: ` +
          errors.slice(0, 3).map((e) => e.message).join(" "),
      );
    }

    row.state = "VALIDATED";
    row.validated_at = stamp();
    for (const slip of db.payslips.filter((p) => p.payrun_id === row.id)) slip.state = "VALIDATED";
    return ok(detail(row));
  }),

  http.post(route("/payruns/:id/mark-paid"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payrun", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payruns, idOf(params));
    if (!row) return notFound("That payrun");
    if (!NEXT_STATES[row.state].includes("PAID")) return refuse(row, "PAID");

    const patch = await body(request);
    const force = patch.force === true;
    const reason = str(patch.force_paid_reason);

    const blockers = openBlockers(row.id, "mark-paid");
    if (blockers.length > 0 && !force) {
      return businessRule(
        "blocked_by_warnings",
        `${blockers.length} ${blockers.length === 1 ? "employee has" : "employees have"} ` +
          `no bank details on file. Add them, or release with a written reason.`,
      );
    }
    if (blockers.length > 0 && force && !reason) {
      // §4.8: forcing is allowed; forcing silently is not.
      return new Fields()
        .add("force_paid_reason", "Say why this is being released with warnings open.")
        .response();
    }

    row.state = "PAID";
    row.paid_at = stamp();
    row.paid_by_id = user.employee_id;
    row.force_paid_reason = blockers.length > 0 ? reason! : null;
    for (const slip of db.payslips.filter((p) => p.payrun_id === row.id)) slip.state = "PAID";
    return ok(detail(row));
  }),

  http.post(route("/payruns/:id/reopen"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payrun", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payruns, idOf(params));
    if (!row) return notFound("That payrun");
    // Never from PAID. Money has left; the record stands.
    if (!NEXT_STATES[row.state].includes("DRAFT")) return refuse(row, "DRAFT");

    row.state = "DRAFT";
    row.validated_at = null;
    for (const slip of db.payslips.filter((p) => p.payrun_id === row.id)) slip.state = "DRAFT";
    return ok(detail(row));
  }),

  http.post(route("/payruns/:id/cancel"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payrun", "delete");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payruns, idOf(params));
    if (!row) return notFound("That payrun");
    if (!NEXT_STATES[row.state].includes("CANCELLED")) return refuse(row, "CANCELLED");

    row.state = "CANCELLED";
    for (const slip of db.payslips.filter((p) => p.payrun_id === row.id)) slip.state = "CANCELLED";
    return ok(detail(row));
  }),

  /**
   * Bulk email. The backend hands this to `BackgroundTasks` and answers 202
   * immediately, so the mock does the same — a UI written against a
   * synchronous mock and a background real endpoint would have the wrong
   * feedback model, and that is a rewrite rather than a tweak.
   */
  http.post(route("/payruns/:id/send-payslips"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payslip", "read");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payruns, idOf(params));
    if (!row) return notFound("That payrun");
    if (!["VALIDATED", "PAID"].includes(row.state)) {
      return conflict("Payslips can only be sent once the run is validated.");
    }

    const recipients = db.payslips.filter((p) => p.payrun_id === row.id);
    const undeliverable = recipients.filter(
      (p) => !byId(db.employees, p.employee_id)?.email,
    ).length;

    return ok(
      {
        queued: recipients.length - undeliverable,
        skipped: undeliverable,
        message:
          `${recipients.length - undeliverable} payslips queued for delivery. ` +
          `They will appear in Mailpit as they send.`,
      },
      202,
    );
  }),
];

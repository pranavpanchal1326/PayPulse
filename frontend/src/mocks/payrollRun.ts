/**
 * COMPUTING A PAYRUN, LIVE — the §4.3 pipeline against the mutable store.
 *
 * `seed/payruns.ts` runs this same pipeline once, at module load, to produce
 * the seven historical runs. This is the version `POST /payruns/{id}/compute`
 * calls: same steps, same warning vocabulary, but reading `db` so that a leave
 * approved a minute ago changes the number, which is the entire reason the
 * cockpit has a Compute button rather than a static table.
 *
 * **Compute is idempotent** (PRD §5). It deletes this run's payslips, lines
 * and warnings and rebuilds them, rather than appending — pressing it twice
 * must not double the payroll, and "recompute" is the same code path as
 * "compute".
 */
import type {
  Contract, Employee, EligibleEmployee, EligibleEmployeesRequest, PayrollWarning,
  Payrun, Payslip, WarningCode,
} from "@/api/contract";
import { WARNING_META } from "@/api/contract";
import { contractsCovering, sourcesFromDb } from "./derive";
import { db, nextId } from "./db";
import { computePayslip, countDays, paiseToString } from "./seed/engine";
import { daysBetween, decimal, monthLabel, monthOf, type ISODate } from "./seed/calendar";

/* ── Warnings ────────────────────────────────────────────────────────── */

/**
 * `severity` and `blocks` come from `WARNING_META`, never from the caller —
 * one table decides how loudly a code speaks, and the cockpit reads the same
 * table when it renders the strip.
 */
function warn(
  into: PayrollWarning[],
  id: number,
  payrunId: number,
  payslipId: number | null,
  employee: Employee | null,
  code: WarningCode,
  message: string,
): void {
  const meta = WARNING_META[code];
  into.push({
    id,
    payrun_id: payrunId,
    payslip_id: payslipId,
    employee_id: employee?.id ?? null,
    employee_name: employee?.full_name ?? null,
    code,
    severity: meta.severity,
    message,
    blocks: meta.blocks,
    is_resolved: false,
  });
}

/* ── The pipeline ────────────────────────────────────────────────────── */

/** Employees this run covers, taken from the payslips it already has. */
const rosterOf = (payrun: Payrun): number[] => [
  ...new Set(db.payslips.filter((p) => p.payrun_id === payrun.id).map((p) => p.employee_id)),
];

export function computeRun(payrun: Payrun, roster = rosterOf(payrun)): void {
  const sources = sourcesFromDb();
  const { period_start: start, period_end: end } = payrun;
  const period = monthOf(end);

  /**
   * Ids are taken from the high-water mark *before* the delete, so a
   * recompute never re-issues an id that a screen, a toast or an open drawer
   * is still holding. Postgres sequences behave the same way, and a UI that
   * suddenly shows a different person's payslip under the same id is a bug
   * that takes a very long time to believe.
   */
  let slipId = nextId(db.payslips);
  let lineId = nextId(db.payslipLines);
  let warningId = nextId(db.payrollWarnings);

  // Idempotence: this run's derived rows go, then are rebuilt. Ids are not
  // reused, exactly as a delete-and-insert in Postgres would behave.
  const keptSlips = db.payslips.filter((p) => p.payrun_id !== payrun.id);
  const goneSlipIds = new Set(
    db.payslips.filter((p) => p.payrun_id === payrun.id).map((p) => p.id),
  );
  db.payslips.length = 0;
  db.payslips.push(...keptSlips);

  const keptLines = db.payslipLines.filter((l) => !goneSlipIds.has(l.payslip_id));
  db.payslipLines.length = 0;
  db.payslipLines.push(...keptLines);

  const keptWarnings = db.payrollWarnings.filter((w) => w.payrun_id !== payrun.id);
  db.payrollWarnings.length = 0;
  db.payrollWarnings.push(...keptWarnings);

  const warnings: PayrollWarning[] = [];
  const structureRules = db.salaryRules.filter(
    (r) => r.structure_id === payrun.salary_structure_id && r.is_active,
  );

  if (structureRules.length === 0) {
    warn(
      warnings, warningId++, payrun.id, null, null, "NO_STRUCTURE_RULES",
      `"${payrun.salary_structure_name}" has no active rules, so there is nothing to compute.`,
    );
  }

  let grossTotal = 0;
  let deductionTotal = 0;
  let netTotal = 0;
  let count = 0;

  for (const employeeId of roster) {
    const employee = db.employees.find((e) => e.id === employeeId);
    if (!employee) continue;

    const covering = contractsCovering(employee.id, start, end);
    const contract: Contract | undefined = covering[0];

    // §4.3 step 1: no contract covering the period is an ERROR and no payslip.
    if (!contract) {
      warn(
        warnings, warningId++, payrun.id, null, employee, "NO_ACTIVE_CONTRACT",
        `${employee.full_name} has no running contract covering ${monthLabel(period)}. ` +
          `Renew the contract or remove them from this payrun.`,
      );
      continue;
    }

    const computed = computePayslip(employee, contract, start, end, sources);
    const id = slipId++;
    const codes: WarningCode[] = [];

    const raise = (code: WarningCode, message: string) => {
      codes.push(code);
      warn(warnings, warningId++, payrun.id, id, employee, code, message);
    };

    if (covering.length > 1) {
      // §3.2: two contracts in one period is a raise, not a collision.
      raise(
        "MULTI_CONTRACT_PERIOD",
        `Two contracts cover ${monthLabel(period)}. Paid on "${contract.name}"; ` +
          `"${covering[1].name}" was not used.`,
      );
    }

    if (computed.counts.contract_days < computed.counts.period_days) {
      raise(
        "PRORATED_PERIOD",
        `Paid for ${computed.counts.contract_days} of ${computed.counts.period_days} days — ` +
          `${employee.date_of_exit ? "left" : "joined"} mid-period.`,
      );
    }

    if (!employee.bank_account || !employee.bank_ifsc) {
      raise(
        "MISSING_BANK_DETAILS",
        `No bank account on file for ${employee.full_name}. Payment cannot be released.`,
      );
    }

    if (computed.counts.missing_checkouts > 0) {
      const n = computed.counts.missing_checkouts;
      raise("MISSING_CHECKOUT", `${n} attendance ${n === 1 ? "row has" : "rows have"} no check-out.`);
    }

    if (computed.counts.attendance_on_leave_days > 0) {
      const n = computed.counts.attendance_on_leave_days;
      raise(
        "ATTENDANCE_ON_LEAVE_DAY",
        `Attendance recorded on ${n} approved-leave ${n === 1 ? "day" : "days"}. ` +
          `Leave was used for pay; the hours still counted towards overtime.`,
      );
    }

    if (
      computed.counts.contract_days > 0 &&
      computed.counts.absent_days > computed.counts.contract_days * 0.3
    ) {
      raise(
        "HIGH_ABSENCE",
        `${computed.counts.absent_days} of ${computed.counts.contract_days} contract days ` +
          `have no attendance and no approved leave.`,
      );
    }

    if (contract.date_end && contract.date_end >= end && daysBetween(end, contract.date_end) <= 30) {
      raise("CONTRACT_EXPIRING", `Contract ends ${contract.date_end}, within 30 days of the period end.`);
    }

    for (const code of computed.warnings) {
      raise(code, `Payslip for ${employee.full_name} failed a §4.6 check.`);
    }

    for (const line of computed.lines) {
      db.payslipLines.push({ ...line, id: lineId++, payslip_id: id });
    }

    db.payslips.push({
      id,
      payrun_id: payrun.id,
      employee_id: employee.id,
      employee_name: employee.full_name,
      employee_number: employee.employee_number,
      department_name: employee.department_name,
      contract_id: contract.id,
      currency: payrun.currency,
      period_start: start,
      period_end: end,
      basic: paiseToString(computed.basic),
      gross: paiseToString(computed.gross),
      total_deductions: paiseToString(computed.totalDeductions),
      net: paiseToString(computed.net),
      worked_hours: decimal(computed.counts.worked_hours),
      overtime_hours: decimal(computed.counts.overtime_hours),
      period_days: computed.counts.period_days,
      contract_days: computed.counts.contract_days,
      payable_days: decimal(computed.counts.payable_days),
      unpaid_days: decimal(computed.counts.unpaid_days),
      absent_days: decimal(computed.counts.absent_days),
      paid_leave_days: decimal(computed.counts.paid_leave_days),
      unpaid_leave_days: decimal(computed.counts.unpaid_leave_days),
      state: "COMPUTED",
      warning_codes: codes,
    });

    grossTotal += computed.gross;
    deductionTotal += computed.totalDeductions;
    netTotal += computed.net;
    count++;
  }

  db.payrollWarnings.push(...warnings);

  payrun.payslip_count = count;
  payrun.total_gross = paiseToString(grossTotal);
  payrun.total_deductions = paiseToString(deductionTotal);
  payrun.total_net = paiseToString(netTotal);
  payrun.state = "COMPUTED";
  payrun.computed_at = new Date().toISOString();
  payrun.validated_at = null;
}

/**
 * Recompute one payslip in place — `POST /payslips/{id}/recompute`, which the
 * cockpit offers on a single row rather than making a user re-run the whole
 * batch to fix one person.
 */
export function recomputePayslip(payslip: Payslip): Payslip | null {
  const employee = db.employees.find((e) => e.id === payslip.employee_id);
  if (!employee) return null;

  const contract = contractsCovering(employee.id, payslip.period_start, payslip.period_end)[0];
  if (!contract) return null;

  const computed = computePayslip(
    employee, contract, payslip.period_start, payslip.period_end, sourcesFromDb(),
  );

  let lineId = nextId(db.payslipLines);
  const kept = db.payslipLines.filter((l) => l.payslip_id !== payslip.id);
  db.payslipLines.length = 0;
  db.payslipLines.push(...kept);
  for (const line of computed.lines) {
    db.payslipLines.push({ ...line, id: lineId++, payslip_id: payslip.id });
  }

  payslip.contract_id = contract.id;
  payslip.basic = paiseToString(computed.basic);
  payslip.gross = paiseToString(computed.gross);
  payslip.total_deductions = paiseToString(computed.totalDeductions);
  payslip.net = paiseToString(computed.net);
  payslip.worked_hours = decimal(computed.counts.worked_hours);
  payslip.overtime_hours = decimal(computed.counts.overtime_hours);
  payslip.period_days = computed.counts.period_days;
  payslip.contract_days = computed.counts.contract_days;
  payslip.payable_days = decimal(computed.counts.payable_days);
  payslip.unpaid_days = decimal(computed.counts.unpaid_days);
  payslip.absent_days = decimal(computed.counts.absent_days);
  payslip.paid_leave_days = decimal(computed.counts.paid_leave_days);
  payslip.unpaid_leave_days = decimal(computed.counts.unpaid_leave_days);
  payslip.state = "COMPUTED";

  return payslip;
}

/* ── Step 1 of the wizard ────────────────────────────────────────────── */

/**
 * **Creates nothing.** The spec is emphatic that Continue moves to employee
 * selection *without creating the Payrun*, so this is a pure function of its
 * arguments and the current data: call it twice, get the same answer, and
 * `GET /payruns` afterwards shows nothing new.
 *
 * Proration is visible here, before anyone commits — `period_days` against
 * `contract_days` is the whole reason step 1 exists as an endpoint rather than
 * as a client-side filter over `/employees`.
 */
export function eligibleEmployees(request: EligibleEmployeesRequest): EligibleEmployee[] {
  const { period_start: start, period_end: end } = request;
  const sources = sourcesFromDb();

  const paidAlready = new Set(
    db.payslips
      .filter(
        (p) =>
          p.period_start === start &&
          p.period_end === end &&
          ["VALIDATED", "PAID"].includes(p.state),
      )
      .map((p) => p.employee_id),
  );

  const roster = db.employees.filter(
    (e) =>
      e.date_of_joining <= end &&
      (e.date_of_exit === null || e.date_of_exit >= start) &&
      (request.department_id === undefined || e.department_id === request.department_id) &&
      (request.employee_type === undefined || e.employee_type === request.employee_type),
  );

  return roster.map((employee) => {
    const covering = contractsCovering(employee.id, start, end).filter(
      (c) => c.salary_structure_id === request.salary_structure_id,
    );
    const contract = covering[0];

    const blockers: EligibleEmployee["blockers"] = [];
    const notes: EligibleEmployee["notes"] = [];

    if (!contract) blockers.push("NO_ACTIVE_CONTRACT");
    if (paidAlready.has(employee.id)) blockers.push("ALREADY_PAID_THIS_PERIOD");
    if (covering.length > 1) notes.push("MULTI_CONTRACT_PERIOD");

    const counts = contract
      ? countDays(employee, contract, start as ISODate, end as ISODate, sources)
      : null;

    if (counts && counts.contract_days < counts.period_days) notes.push("PRORATED_PERIOD");

    return {
      employee_id: employee.id,
      name: employee.full_name,
      department: employee.department_name,
      contract_wage: contract?.wage ?? null,
      currency: contract?.currency ?? db.salaryStructures[0]?.currency ?? "INR",
      period_days: counts?.period_days ?? 0,
      contract_days: counts?.contract_days ?? 0,
      eligible: blockers.length === 0,
      blockers,
      notes,
    };
  });
}

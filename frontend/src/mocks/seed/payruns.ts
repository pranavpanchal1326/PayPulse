/**
 * PAYRUNS — six closed months and one open one.
 *
 * PRD §9 asks for six historical payruns so the Monthly Net Salary Trend is
 * never empty on stage, and P3 asks for one run carrying an open `ERROR` so
 * the blocked state in the cockpit is designable. Both are here:
 *
 *   · five `PAID`, one `VALIDATED` — the six points on the trend chart, since
 *     `total_net_paid` counts VALIDATED and PAID only (PRD §5)
 *   · one `COMPUTED` run for the open period, holding a `NO_ACTIVE_CONTRACT`
 *     ERROR that blocks validate, plus the bank-details, multi-contract and
 *     proration warnings that make the warning strip worth designing
 *
 * **Why the open run is `COMPUTED` and not `DRAFT`.** A DRAFT payrun has no
 * payslips — it is a name and a date range. There is nothing on it to lay out,
 * and the screen that matters (B6, the processing view) only exists after
 * Compute. The DRAFT state is still reachable through `reopen`; it just is not
 * where the fixtures leave the product sitting.
 */
import type {
  Payrun, PayrollWarning, Payslip, PayslipLine, PayrunState, WarningCode,
} from "@/api/contract";
import { ALL_PERIODS, CLOSED_PERIODS, CURRENCY, OPEN_PERIOD } from "./anchor";
import { addDays, daysBetween, decimal, monthEnd, monthLabel, monthStart } from "./calendar";
import { STRUCTURE_ID, contractsCovering } from "./contracts";
import { computePayslip, paiseToString } from "./engine";
import { WARNING_META } from "@/api/contract";
import { employees } from "./people";
import { salaryStructures } from "./payroll";

const STRUCTURE_NAME = salaryStructures[0].name;

export const payruns: Payrun[] = [];
export const payslips: Payslip[] = [];
export const payslipLines: PayslipLine[] = [];
export const payrollWarnings: PayrollWarning[] = [];

/** One PAID run was released past an open warning — §4.8's `force_paid_reason`. */
const FORCED_PERIOD = CLOSED_PERIODS[3];

let payrunId = 1;
let payslipId = 1;
let lineId = 1;
let warningId = 1;

function stateFor(period: string): PayrunState {
  if (period === OPEN_PERIOD) return "COMPUTED";
  // The most recent closed month is signed off but not yet released.
  if (period === CLOSED_PERIODS[CLOSED_PERIODS.length - 1]) return "VALIDATED";
  return "PAID";
}

function addWarning(
  payrun: number,
  payslip: number | null,
  employeeId: number | null,
  employeeName: string | null,
  code: WarningCode,
  message: string,
  resolved = false,
) {
  const meta = WARNING_META[code];
  payrollWarnings.push({
    id: warningId++,
    payrun_id: payrun,
    payslip_id: payslip,
    employee_id: employeeId,
    employee_name: employeeName,
    code,
    severity: meta.severity,
    message,
    blocks: meta.blocks,
    is_resolved: resolved,
  });
}

for (const period of ALL_PERIODS) {
  const periodStart = monthStart(period);
  const periodEnd = monthEnd(period);
  const state = stateFor(period);
  const isOpen = period === OPEN_PERIOD;
  const id = payrunId++;

  const timestamp = (day: number, time: string) => `${addDays(periodEnd, day)}T${time}+05:30`;

  let grossTotal = 0;
  let deductionTotal = 0;
  let netTotal = 0;
  let count = 0;

  // Everyone employed at any point in the period is on the run — including the
  // joiner, the leaver, and the one whose contract has since lapsed.
  const roster = employees.filter(
    (e) =>
      e.date_of_joining <= periodEnd &&
      (e.date_of_exit === null || e.date_of_exit >= periodStart),
  );

  for (const employee of roster) {
    const covering = contractsCovering(employee.id, periodStart, periodEnd);
    const contract = covering[0];

    // §4.3 step 1: no contract covers the period → ERROR, and no payslip.
    if (!contract) {
      addWarning(
        id, null, employee.id, employee.full_name,
        "NO_ACTIVE_CONTRACT",
        `${employee.full_name} has no running contract covering ${monthLabel(period)}. ` +
          `Renew the contract or remove them from this payrun.`,
      );
      continue;
    }

    const computed = computePayslip(employee, contract, periodStart, periodEnd);
    const slipId = payslipId++;
    const codes: WarningCode[] = [];

    const raise = (code: WarningCode, message: string, resolved = false) => {
      codes.push(code);
      addWarning(id, slipId, employee.id, employee.full_name, code, message, resolved);
    };

    // §3.2: two contracts in one period is a raise, not a collision. The one at
    // period end was used; the warning names the one that was not.
    if (covering.length > 1) {
      raise("MULTI_CONTRACT_PERIOD",
        `Two contracts cover ${monthLabel(period)}. Paid on "${contract.name}"; ` +
          `"${covering[1].name}" was not used.`);
    }

    if (computed.counts.contract_days < computed.counts.period_days) {
      raise("PRORATED_PERIOD",
        `Paid for ${computed.counts.contract_days} of ${computed.counts.period_days} ` +
          `days — ${employee.date_of_exit ? "left" : "joined"} mid-period.`);
    }

    // Bank details are read from the employee record as it stands *now*, so
    // this only ever fires on the open run. A historical payslip records the
    // state of the world when it was computed.
    if (isOpen && (!employee.bank_account || !employee.bank_ifsc)) {
      raise("MISSING_BANK_DETAILS",
        `No bank account on file for ${employee.full_name}. Payment cannot be released.`);
    }

    if (computed.counts.missing_checkouts > 0) {
      raise("MISSING_CHECKOUT",
        `${computed.counts.missing_checkouts} attendance ` +
          `${computed.counts.missing_checkouts === 1 ? "row has" : "rows have"} no check-out.`);
    }

    if (computed.counts.attendance_on_leave_days > 0) {
      raise("ATTENDANCE_ON_LEAVE_DAY",
        `Attendance recorded on ${computed.counts.attendance_on_leave_days} approved-leave ` +
          `${computed.counts.attendance_on_leave_days === 1 ? "day" : "days"}. ` +
          `Leave was used for pay; the hours still counted towards overtime.`);
    }

    if (
      computed.counts.contract_days > 0 &&
      computed.counts.absent_days > computed.counts.contract_days * 0.3
    ) {
      raise("HIGH_ABSENCE",
        `${computed.counts.absent_days} of ${computed.counts.contract_days} contract days ` +
          `have no attendance and no approved leave.`);
    }

    if (
      contract.date_end &&
      contract.date_end >= periodEnd &&
      daysBetween(periodEnd, contract.date_end) <= 30
    ) {
      raise("CONTRACT_EXPIRING",
        `Contract ends ${contract.date_end}, within 30 days of the period end.`);
    }

    for (const code of computed.warnings) {
      raise(code, `Payslip for ${employee.full_name} failed a §4.6 check.`);
    }

    for (const line of computed.lines) {
      payslipLines.push({ ...line, id: lineId++, payslip_id: slipId });
    }

    payslips.push({
      id: slipId,
      payrun_id: id,
      employee_id: employee.id,
      employee_name: employee.full_name,
      employee_number: employee.employee_number,
      department_name: employee.department_name,
      contract_id: contract.id,
      currency: CURRENCY,
      period_start: periodStart,
      period_end: periodEnd,
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
      state: state === "COMPUTED" ? "COMPUTED" : state === "VALIDATED" ? "VALIDATED" : "PAID",
      warning_codes: codes,
    });

    grossTotal += computed.gross;
    deductionTotal += computed.totalDeductions;
    netTotal += computed.net;
    count++;
  }

  const forced = period === FORCED_PERIOD;
  if (forced) {
    addWarning(
      id, null, null, null,
      "MISSING_BANK_DETAILS",
      "One employee had no bank account on file when this run was released.",
      true,
    );
  }

  payruns.push({
    id,
    name: `${monthLabel(period)} · monthly payroll`,
    salary_structure_id: STRUCTURE_ID,
    salary_structure_name: STRUCTURE_NAME,
    period_start: periodStart,
    period_end: periodEnd,
    currency: CURRENCY,
    state,
    payslip_count: count,
    total_gross: paiseToString(grossTotal),
    total_deductions: paiseToString(deductionTotal),
    total_net: paiseToString(netTotal),
    computed_at: timestamp(1, "18:40:00"),
    validated_at: state === "COMPUTED" ? null : timestamp(2, "10:15:00"),
    paid_at: state === "PAID" ? timestamp(2, "16:05:00") : null,
    paid_by_id: state === "PAID" ? 2 : null, // Ravi Deshmukh, payroll manager
    force_paid_reason: forced
      ? "Bank details confirmed by phone; released on the CFO's written approval."
      : null,
    created_at: timestamp(0, "09:00:00"),
  });
}

export const payslipsByPayrun = new Map<number, Payslip[]>();
for (const p of payslips) {
  const list = payslipsByPayrun.get(p.payrun_id) ?? [];
  list.push(p);
  payslipsByPayrun.set(p.payrun_id, list);
}

export const linesByPayslip = new Map<number, PayslipLine[]>();
for (const l of payslipLines) {
  const list = linesByPayslip.get(l.payslip_id) ?? [];
  list.push(l);
  linesByPayslip.set(l.payslip_id, list);
}

export const warningsByPayrun = new Map<number, PayrollWarning[]>();
for (const w of payrollWarnings) {
  const list = warningsByPayrun.get(w.payrun_id) ?? [];
  list.push(w);
  warningsByPayrun.set(w.payrun_id, list);
}

/** The open run — the one every payroll screen lands on first. */
export const OPEN_PAYRUN = payruns[payruns.length - 1];

/**
 * THE FIXTURE PAYROLL ENGINE — PRD §4.2, §4.5 and §4.6, in miniature.
 *
 * **Why this exists at all.** The alternative was ~200 payslips of hand-written
 * numbers. Those would reconcile for about a day, and then someone would nudge
 * a wage and the payslip screen would be rendering arithmetic that no longer
 * adds up — on the one screen in the product where the numbers adding up *is*
 * the feature. Generating them from the same definitions the backend uses means
 * the §4.6 invariants can be **asserted**, and they are, at the bottom of this
 * file.
 *
 * **What it is not.** It is not a formula sandbox. The twelve rules of §4.5 are
 * reimplemented here as a switch on `rule_code`, so `payroll.ts` keeps the real
 * formula strings for the rule editor while this stays small enough to audit.
 * The sandbox is a backend concern (§4.4) and stays there.
 *
 * All arithmetic lands in **integer paise** before it becomes a string.
 * Rounding is ROUND_HALF_UP at line level, and `categories.*` accumulate
 * already-rounded amounts — sums of rounded numbers, not rounded sums (§4.6).
 */
import type {
  Attendance, Contract, Employee, PayslipLine, RuleCategory, SalaryRule, WarningCode,
} from "@/api/contract";
import { attendanceIndex } from "./attendance";
import { dayOfWeek, eachDay, type ISODate } from "@/lib/date";
import { blockingHolidays, scheduleById, scheduleWorkingDays } from "./people";
import { salaryRules } from "./payroll";
import { approvedLeaveByEmployee } from "./timeOff";

/* ── Where the engine reads from ─────────────────────────────────────── */

/**
 * Attendance, approved leave and the rule set — the three things a
 * computation depends on that are **not** arguments.
 *
 * The seed is the default because that is what the historical fixtures are
 * generated from, and they must stay byte-identical (PRD §9). But `POST
 * /payruns/{id}/compute` is a live endpoint: by the time it runs, someone may
 * have edited an attendance row or approved a leave request through the mock
 * API, and recomputing against the frozen seed would quietly ignore the very
 * change they just made. The handlers therefore pass a set built from
 * `mocks/db.ts`. Same arithmetic, current inputs.
 */
export interface PayrollSources {
  /** `employeeId → work_date → row`. */
  attendance: Map<number, Map<ISODate, Attendance>>;
  /** `employeeId → date → is_paid`, approved leave only. */
  leave: Map<number, Map<ISODate, boolean>>;
  /** Evaluated in `sequence` order; inactive rules are skipped. */
  rules: SalaryRule[];
}

export const seedSources: PayrollSources = {
  attendance: attendanceIndex,
  leave: approvedLeaveByEmployee,
  rules: salaryRules,
};

/* ── Money ───────────────────────────────────────────────────────────── */

/** ROUND_HALF_UP, away from zero on a tie — `Math.round` rounds −0.5 up to 0. */
export function toPaise(rupees: number): number {
  const scaled = rupees * 100;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

export const paiseToString = (paise: number): string => {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  return `${neg ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

const fromPaise = (paise: number) => paise / 100;
const decimal = (n: number) => n.toFixed(2);

/* ── §4.2 · Day counting ─────────────────────────────────────────────── */

export interface DayCounts {
  period_days: number;
  contract_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  unpaid_days: number;
  payable_days: number;
  worked_hours: number;
  overtime_hours: number;
  missing_checkouts: number;
  attendance_on_leave_days: number;
  days_present_on_time: number;
  days_with_attendance: number;
}

/**
 * `PAYROLL_ABSENCE_POLICY` (§4.1). `TREAT_AS_UNPAID` is the default and the
 * only one the fixtures use; the flag is here so the shape of the decision
 * survives into the mock rather than being quietly hardcoded.
 */
export const ABSENCE_POLICY: "TREAT_AS_UNPAID" | "IGNORE" = "TREAT_AS_UNPAID";

export function countDays(
  employee: Employee,
  contract: Contract,
  periodStart: ISODate,
  periodEnd: ISODate,
  sources: PayrollSources = seedSources,
): DayCounts {
  const scheduleId = contract.working_schedule_id ?? employee.working_schedule_id ?? 1;
  const working = scheduleWorkingDays.get(scheduleId) ?? new Set<number>();

  const attendance = sources.attendance.get(employee.id);
  const leave = sources.leave.get(employee.id);

  // The denominator: schedule working days in the period, minus non-optional
  // public holidays. Same for everyone on that schedule.
  const periodDays = eachDay(periodStart, periodEnd).filter(
    (d) => working.has(dayOfWeek(d)) && !blockingHolidays.has(d),
  );

  // The proration numerator: the slice of those days this contract and this
  // employment actually cover. Makes a joiner on the 12th correct.
  const from = [periodStart, contract.date_start, employee.date_of_joining]
    .reduce((a, b) => (a > b ? a : b));
  const to = [periodEnd, contract.date_end ?? periodEnd, employee.date_of_exit ?? periodEnd]
    .reduce((a, b) => (a < b ? a : b));

  const contractDays = periodDays.filter((d) => d >= from && d <= to);

  let paidLeave = 0;
  let unpaidLeave = 0;
  let absent = 0;
  let onLeaveWithAttendance = 0;
  let daysWithAttendance = 0;
  let presentOnTime = 0;
  let workedHours = 0;
  let overtimeHours = 0;
  let missingCheckouts = 0;

  for (const d of contractDays) {
    const row = attendance?.get(d);
    const leaveIsPaid = leave?.get(d);

    if (row) {
      daysWithAttendance++;
      workedHours += Number(row.worked_hours);
      overtimeHours += Number(row.overtime_hours);
      if (row.status === "MISSING_CHECKOUT") missingCheckouts++;
      if (row.status === "PRESENT") presentOnTime++;
      if (leaveIsPaid !== undefined) onLeaveWithAttendance++;
    }

    if (leaveIsPaid !== undefined) {
      // §3.4: leave wins for the pay basis even when a row exists; the hours
      // still counted towards overtime above.
      if (leaveIsPaid) paidLeave++;
      else unpaidLeave++;
    } else if (!row && ABSENCE_POLICY === "TREAT_AS_UNPAID") {
      absent++;
    }
  }

  const unpaidDays = unpaidLeave + absent;

  const counts: DayCounts = {
    period_days: periodDays.length,
    contract_days: contractDays.length,
    paid_leave_days: paidLeave,
    unpaid_leave_days: unpaidLeave,
    absent_days: absent,
    unpaid_days: unpaidDays,
    payable_days: contractDays.length - unpaidDays,
    worked_hours: Math.round(workedHours * 100) / 100,
    overtime_hours: Math.round(overtimeHours * 100) / 100,
    missing_checkouts: missingCheckouts,
    attendance_on_leave_days: onLeaveWithAttendance,
    days_present_on_time: presentOnTime,
    days_with_attendance: daysWithAttendance,
  };

  // §4.2's stated invariant, asserted rather than assumed.
  if (counts.contract_days !== counts.payable_days + counts.unpaid_days) {
    throw new Error(`§4.2 invariant broken for employee ${employee.id}`);
  }
  if (counts.contract_days > counts.period_days) {
    throw new Error(`contract_days > period_days for employee ${employee.id}`);
  }

  return counts;
}

/* ── §4.3 step 3 · The evaluation context ────────────────────────────── */

interface EvalContext {
  wage: number;
  dailyHours: number;
  counts: DayCounts;
  /** Amounts of already-computed rules, in paise, by code. */
  rules: Map<string, number>;
  /** Running totals per category, in paise. */
  categories: Map<RuleCategory, number>;
}

const ruleAmount = (ctx: EvalContext, code: string) => fromPaise(ctx.rules.get(code) ?? 0);
const categoryAmount = (ctx: EvalContext, cat: RuleCategory) =>
  fromPaise(ctx.categories.get(cat) ?? 0);

/**
 * The twelve rules of §4.5, one branch each, in rupees. Returns `null` when the
 * rule's condition excludes it — a rule that does not apply produces no line at
 * all, rather than a zero one nobody can explain.
 *
 * Keep this switch in step with the `amount_formula` strings in `payroll.ts`.
 */
function evaluate(rule: SalaryRule, ctx: EvalContext): number | null {
  const { wage, dailyHours, counts: c } = ctx;
  const proration = c.period_days === 0 ? 0 : c.contract_days / c.period_days;

  switch (rule.code) {
    case "BASIC":
      return wage * 0.5 * proration;

    case "HRA":
      return ruleAmount(ctx, "BASIC") * 0.4;

    case "DA":
      return ruleAmount(ctx, "BASIC") * 0.2;

    case "CONV":
      return 1600 * proration;

    case "SPECIAL":
      return Math.max(
        0,
        wage * proration -
          ruleAmount(ctx, "BASIC") -
          ruleAmount(ctx, "HRA") -
          ruleAmount(ctx, "DA") -
          ruleAmount(ctx, "CONV"),
      );

    case "OT": {
      if (c.overtime_hours <= 0) return null;
      // Guard the divisor: a payable-days figure of zero means the employee had
      // no payable time at all, and an overtime rate against it is meaningless.
      const denominator = c.payable_days * dailyHours;
      if (denominator <= 0) return null;
      return c.overtime_hours * (ruleAmount(ctx, "BASIC") / denominator) * 1.5;
    }

    case "GROSS":
      return categoryAmount(ctx, "BASIC") + categoryAmount(ctx, "ALLOWANCE");

    case "PF":
      return Math.min(ruleAmount(ctx, "BASIC") + ruleAmount(ctx, "DA"), 15000) * 0.12;

    case "PT":
      return ruleAmount(ctx, "GROSS") > 21000 ? 200 : 0;

    case "TDS":
      return Math.max(0, (ruleAmount(ctx, "GROSS") * 12 - 500000) * 0.05 / 12);

    case "LWP":
      if (c.unpaid_days <= 0) return null;
      return c.period_days === 0 ? 0 : (wage / c.period_days) * c.unpaid_days;

    case "NET":
      return categoryAmount(ctx, "GROSS") - categoryAmount(ctx, "DEDUCTION");

    default:
      // A rule the fixture engine does not know how to evaluate is exactly the
      // `RULE_EVAL_FAILED` case (§4.9) — surfaced, never silently zeroed.
      return null;
  }
}

/* ── §4.3 · One payslip ──────────────────────────────────────────────── */

export interface ComputedPayslip {
  counts: DayCounts;
  lines: Omit<PayslipLine, "id" | "payslip_id">[];
  basic: number;
  gross: number;
  totalDeductions: number;
  net: number;
  warnings: WarningCode[];
}

/** Rates that make the payslip's `quantity × rate` column mean something. */
function lineQuantityAndRate(
  code: string,
  amountPaise: number,
  ctx: EvalContext,
): { quantity: number; rate: number } {
  if (code === "OT") {
    return { quantity: ctx.counts.overtime_hours, rate: fromPaise(amountPaise) / (ctx.counts.overtime_hours || 1) };
  }
  if (code === "LWP") {
    return { quantity: ctx.counts.unpaid_days, rate: fromPaise(amountPaise) / (ctx.counts.unpaid_days || 1) };
  }
  return { quantity: 1, rate: fromPaise(amountPaise) };
}

export function computePayslip(
  employee: Employee,
  contract: Contract,
  periodStart: ISODate,
  periodEnd: ISODate,
  sources: PayrollSources = seedSources,
): ComputedPayslip {
  const counts = countDays(employee, contract, periodStart, periodEnd, sources);
  const schedule = scheduleById.get(contract.working_schedule_id ?? 1);

  const ctx: EvalContext = {
    wage: Number(contract.wage),
    dailyHours: Number(schedule?.daily_hours ?? 8),
    counts,
    rules: new Map(),
    categories: new Map(),
  };

  const lines: ComputedPayslip["lines"] = [];
  /** The same amounts in paise, so the totals never round-trip through text. */
  const amounts: { category: RuleCategory; paise: number }[] = [];
  const warnings: WarningCode[] = [];

  for (const rule of [...sources.rules].sort((a, b) => a.sequence - b.sequence)) {
    if (!rule.is_active) continue;

    const raw = evaluate(rule, ctx);
    if (raw === null) continue;

    if (!Number.isFinite(raw)) {
      warnings.push("RULE_EVAL_FAILED");
      continue;
    }

    // Round at line level, immediately after evaluation (§4.6).
    const amount = toPaise(raw);
    ctx.rules.set(rule.code, amount);
    ctx.categories.set(rule.category, (ctx.categories.get(rule.category) ?? 0) + amount);

    const { quantity, rate } = lineQuantityAndRate(rule.code, amount, ctx);

    amounts.push({ category: rule.category, paise: amount });
    lines.push({
      rule_code: rule.code,
      name: rule.name,
      category: rule.category,
      sequence: rule.sequence,
      quantity: decimal(quantity),
      rate: paiseToString(toPaise(rate)),
      amount: paiseToString(amount),
    });
  }

  const sumWhere = (predicate: (c: RuleCategory) => boolean) =>
    amounts.filter((a) => predicate(a.category)).reduce((total, a) => total + a.paise, 0);

  const gross = sumWhere((c) => c === "BASIC" || c === "ALLOWANCE");
  const totalDeductions = sumWhere((c) => c === "DEDUCTION");
  const net = gross - totalDeductions;
  const basic = ctx.rules.get("BASIC") ?? 0;

  // §4.6, asserted. `NET` is a rule *and* a derived total; if those two ever
  // disagree the payslip is not a document, it is a rumour.
  const netLine = ctx.rules.get("NET");
  if (netLine !== undefined && netLine !== net) {
    warnings.push("PAYSLIP_NOT_RECONCILED");
  }
  if (net < 0) warnings.push("NEGATIVE_NET");

  return { counts, lines, basic, gross, totalDeductions, net, warnings };
}

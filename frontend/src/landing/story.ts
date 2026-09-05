/**
 * THE STORY'S DATA · blueprint P13
 *
 * *"Eight acts, built **from** the design system — which is why it comes
 * last."* The same discipline applies one level down, to the content: every
 * figure on this page is computed by `computePayslip` from the P3 fixtures,
 * through the identical path the product itself uses. Nothing here is written
 * out by hand.
 *
 * That is not purity for its own sake. The landing page's entire claim is
 * *"every number has a reason"*, and a marketing page with a hand-typed hero
 * figure would be the one place in the product where that is false. If the
 * fixtures change, this page changes with them — and if the arithmetic ever
 * broke, the landing page would be the first screen to say so.
 *
 * **One protagonist, eight acts.** Divya Menon is the cast member with
 * approved *unpaid* leave inside the open period, which is what makes Act 03's
 * balance roll and Act 04's `LWP` carve the same event seen twice. Telling
 * eight acts about eight different people would have been easier to assemble
 * and would have demonstrated nothing.
 *
 * Everything below is computed **once, at module scope**. The module only
 * loads inside the landing page's lazy chunk, and the result is immutable — so
 * a `useMemo` in eight acts would be eight caches of one constant.
 */
import type { Contract, PayslipDetail, PayslipLine } from "@/api/contract";
import { money, type Money } from "@/api/money";
import { buildLineModel, buildPayslipProvenance } from "@/components/signature";
import type { LineModel, ProvenanceNode, StackBlock } from "@/components/signature";
import { CURRENCY, OPEN_PERIOD } from "@/mocks/seed/anchor";
import { monthEnd, monthLabel, monthStart, type ISODate } from "@/lib/date";
import { attendances } from "@/mocks/seed/attendance";
import { contractsCovering } from "@/mocks/seed/contracts";
import { computePayslip, paiseToString } from "@/mocks/seed/engine";
import { employeeById, holidays } from "@/mocks/seed/people";
import { salaryRules } from "@/mocks/seed/payroll";
import { OPEN_PAYRUN, warningsByPayrun } from "@/mocks/seed/payruns";
import { balancesFor, timeOffRequests } from "@/mocks/seed/timeOff";

/** The one person this page is about — `CAST`'s unpaid-leave case. */
const PROTAGONIST = 17;

const dec = (n: number) => n.toFixed(2);

/* ── The period, and the person ──────────────────────────────────────── */

const periodStart = monthStart(OPEN_PERIOD);
const periodEnd = monthEnd(OPEN_PERIOD);

const employee = employeeById.get(PROTAGONIST)!;
const contract: Contract = contractsCovering(PROTAGONIST, periodStart, periodEnd)[0];

const computed = computePayslip(employee, contract, periodStart, periodEnd);

const lines: PayslipLine[] = computed.lines.map((line, i) => ({
  ...line,
  id: i + 1,
  payslip_id: 0,
}));

/**
 * A full `PayslipDetail`, not a subset — because Act 06 hands it straight to
 * the *product's* `PayslipCard`, and the landing page does not get its own
 * lighter-weight version of a payslip. If the card needs a field, the story
 * supplies the real one.
 */
export const payslip: PayslipDetail = {
  id: 0,
  payrun_id: OPEN_PAYRUN.id,
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
  worked_hours: dec(computed.counts.worked_hours),
  overtime_hours: dec(computed.counts.overtime_hours),
  period_days: computed.counts.period_days,
  contract_days: computed.counts.contract_days,
  payable_days: dec(computed.counts.payable_days),
  unpaid_days: dec(computed.counts.unpaid_days),
  absent_days: dec(computed.counts.absent_days),
  paid_leave_days: dec(computed.counts.paid_leave_days),
  unpaid_leave_days: dec(computed.counts.unpaid_leave_days),
  state: "COMPUTED",
  warning_codes: [],
  lines,
  contract,
  warnings: [],
};

export const person = {
  name: employee.full_name,
  title: employee.job_title,
  department: employee.department_name,
  number: employee.employee_number,
};

export const period = {
  start: periodStart,
  end: periodEnd,
  label: monthLabel(OPEN_PERIOD),
  /** The bead's home position — the middle of the period, so the line reads. */
  middle: `${OPEN_PERIOD}-15` as ISODate,
};

/* ── The headline figures ────────────────────────────────────────────── */

export const figures = {
  net: money(payslip.net),
  gross: money(payslip.gross),
  deductions: money(payslip.total_deductions),
  basic: money(payslip.basic),
  overtimeHours: Number(payslip.overtime_hours),
  payableDays: Number(payslip.payable_days),
  periodDays: payslip.period_days,
  unpaidDays: Number(payslip.unpaid_days),
  ruleCount: lines.length,
  contractCount: contractsCovering(PROTAGONIST, periodStart, periodEnd).length,
};

/* ── THE LINE ────────────────────────────────────────────────────────── */

const myAttendance = attendances.filter((a) => a.employee_id === PROTAGONIST);
const myContracts = contractsCovering(PROTAGONIST, periodStart, periodEnd);

/**
 * The hero's window is the **period**, not the seven-month span the product's
 * payrun header uses. At seven months a day is three pixels and the leave gap
 * — the one thing the hero disassembly has to make legible — reads as noise.
 * At one month each day is its own mark, and two missing ticks are a hole.
 */
export const lineModelAt = (date: ISODate): LineModel =>
  buildLineModel({
    from: periodStart,
    to: periodEnd,
    activeOn: date,
    contracts: myContracts,
    attendances: myAttendance,
    holidays,
    periodEnds: [periodEnd],
  });

export const lineModel: LineModel = lineModelAt(period.middle);

/* ── THE STACK ───────────────────────────────────────────────────────── */

const ruleByCode = new Map(salaryRules.map((r) => [r.code, r]));

/**
 * `GROSS` and `NET` are totals of the other lines. Drawing them as blocks
 * would count the same money twice and make the tower twice its real height —
 * the identical filter the product's own stack applies, for the identical
 * reason. A rule that evaluated to zero is dropped for the same reason again:
 * a notch carved out of the tower for nothing removed is the picture
 * disagreeing with the arithmetic.
 */
export const blocks: StackBlock[] = lines
  .filter((l) => l.category !== "GROSS" && l.category !== "NET")
  .filter((l) => money(l.amount) !== 0)
  .sort((a, b) => a.sequence - b.sequence)
  .map((line) => {
    const rule = ruleByCode.get(line.rule_code);
    return {
      code: line.rule_code,
      name: line.name,
      kind: line.category === "DEDUCTION" ? ("deduct" as const) : ("add" as const),
      amount: money(line.amount),
      sequence: line.sequence,
      formula:
        rule?.amount_formula ??
        (rule?.percentage ? `${rule.percentage}% of ${rule.percentage_base_code}` : null),
      inputs: [
        { label: "quantity", value: line.quantity },
        { label: "rate", value: line.rate },
      ],
    };
  });

export const additive = blocks.filter((b) => b.kind === "add");
export const deductions = blocks.filter((b) => b.kind === "deduct");

/* ── THE PROVENANCE ──────────────────────────────────────────────────── */

const myLeave = timeOffRequests.filter(
  (r) =>
    r.employee_id === PROTAGONIST &&
    r.state === "APPROVED" &&
    r.date_to >= periodStart &&
    r.date_from <= periodEnd,
);

export const provenance: ProvenanceNode = buildPayslipProvenance({
  payslip,
  rules: salaryRules,
  leave: myLeave,
  attendances: myAttendance.filter(
    (a) => a.work_date >= periodStart && a.work_date <= periodEnd,
  ),
});

/* ── ACT 02 · one real day ───────────────────────────────────────────── */

/**
 * The clock face shows a **real attendance row**, chosen as the day inside the
 * period with the most overtime — because Act 02's whole beat is those extra
 * hours travelling down the line and landing in the `OT` block, and a day with
 * no overtime would leave the block it lands in at zero.
 */
export const day = (() => {
  const inPeriod = myAttendance.filter(
    (a) => a.work_date >= periodStart && a.work_date <= periodEnd && a.check_out !== null,
  );
  const best =
    inPeriod.reduce<(typeof inPeriod)[number] | null>(
      (top, a) =>
        top === null || Number(a.overtime_hours) > Number(top.overtime_hours) ? a : top,
      null,
    ) ?? inPeriod[0];

  const clock = (stamp: string | null) => (stamp === null ? "--:--" : stamp.slice(11, 16));
  const hours = (value: string) => {
    const total = Math.round(Number(value) * 60);
    const hh = String(Math.floor(total / 60)).padStart(2, "0");
    const mm = String(total % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  return {
    date: best.work_date,
    checkIn: clock(best.check_in),
    checkOut: clock(best.check_out),
    worked: hours(best.worked_hours),
    overtime: hours(best.overtime_hours),
    overtimeHours: Number(best.overtime_hours),
  };
})();

/** The `OT` line those hours land in — the same event, recorded twice. */
export const overtimeBlock = blocks.find((b) => b.code === "OT") ?? null;

/* ── ACT 03 · the balance that moves ─────────────────────────────────── */

/**
 * The paid-leave balance, and the unpaid days that reached payroll. Two
 * different mechanisms — one is an allocation being drawn down, the other is a
 * deduction being created — and the act shows them in that order, because that
 * is the order they happen in.
 */
export const leave = (() => {
  const balances = balancesFor(PROTAGONIST);
  const paid = balances.find((b) => b.is_paid && Number(b.allocated) > 0) ?? balances[0];
  const lwp = blocks.find((b) => b.code === "LWP") ?? null;

  return {
    typeName: paid?.time_off_type_name ?? "Annual leave",
    allocated: Number(paid?.allocated ?? 0),
    taken: Number(paid?.taken ?? 0),
    pending: Number(paid?.pending ?? 0),
    remaining: Number(paid?.remaining ?? 0),
    unpaidDays: figures.unpaidDays,
    /** What those unpaid days cost, exactly as the payslip records it. */
    lwp,
    /** The net as it would have stood had the unpaid days not happened. */
    netBefore: (figures.net + (lwp?.amount ?? 0)) as Money,
  };
})();

/* ── ACT 05 · the payrun, as the cockpit sees it ─────────────────────── */

/**
 * Real counts from the open payrun, not the blueprint's illustrative `147`.
 * The dark act's claim is *"business logic demonstrated, not claimed"* — and
 * the one thing it cannot afford is an invented number in the header above the
 * demonstration.
 */
export const payrun = (() => {
  const warnings = warningsByPayrun.get(OPEN_PAYRUN.id) ?? [];
  const open = warnings.filter((w) => !w.is_resolved);
  const blocking = open.filter((w) => w.severity === "ERROR" || w.blocks !== null);
  const first = blocking[0] ?? open[0] ?? null;

  return {
    name: OPEN_PAYRUN.name,
    label: monthLabel(OPEN_PERIOD),
    payslips: OPEN_PAYRUN.payslip_count,
    warnings: open.length,
    blocked: blocking.length,
    ready: Math.max(0, OPEN_PAYRUN.payslip_count - open.length),
    totalNet: money(OPEN_PAYRUN.total_net),
    /** The one the reader fixes, with their own hands, inside the page. */
    blocker: {
      title: first?.employee_name ?? "One payslip",
      message: first?.message ?? "This payslip has no bank account on file.",
      code: first?.code ?? "MISSING_BANK_DETAILS",
    },
  };
})();

export { salaryRules };
export type { Money };

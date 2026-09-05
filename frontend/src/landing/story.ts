/**
 * THE STORY'S DATA · blueprint P13
 *
 * *"Every number has a reason"* is the landing page's whole claim, and it used
 * to be false in the one place it mattered most: these figures were computed
 * by a fixture payroll engine that shipped inside the browser bundle. The
 * arithmetic was real, but it was a *second* implementation's arithmetic — so
 * the page demonstrated a program nobody would ever run.
 *
 * Now one request to `/demo/story` returns the same month out of the same
 * database the product uses, computed by the same engine. If payroll changes,
 * the front door changes with it, and if payroll broke, this page would be the
 * first screen to say so — which is what the claim was supposed to mean.
 *
 * **Top-level await, deliberately.** Every act reads these as plain module
 * constants, and they should: the data is immutable and loads once. Awaiting
 * here keeps that shape — the module simply finishes initialising later. It is
 * only ever imported from the landing page's lazy chunk, which already sits
 * behind a `Suspense` boundary, so the wait is the boundary's problem and no
 * act needs to know a network call happened.
 *
 * The endpoint is public because this page renders signed out; see
 * `backend/app/api/v1/demo.py` for why that is narrow rather than careless.
 */
import type {
  Attendance,
  Contract,
  LeaveBalance,
  PayrollWarning,
  PayslipDetail,
  PayslipLine,
  PublicHoliday,
  SalaryRule,
  TimeOffRequest,
} from "@/api/contract";
import { api } from "@/api/client";
import { money, type Money } from "@/api/money";
import { buildLineModel, buildPayslipProvenance } from "@/components/signature";
import type { LineModel, ProvenanceNode, StackBlock } from "@/components/signature";
import { monthLabel, monthOf, type ISODate } from "@/lib/date";

interface StoryPayload {
  payslip: PayslipDetail;
  person: {
    name: string;
    title: string | null;
    department: string | null;
    number: string;
  };
  period: { start: ISODate; end: ISODate };
  contracts: Contract[];
  attendances: Attendance[];
  holidays: PublicHoliday[];
  salary_rules: SalaryRule[];
  leave_requests: TimeOffRequest[];
  balances: LeaveBalance[];
  payrun: {
    id: number;
    name: string;
    state: string;
    payslip_count: number;
    total_net: string;
    warnings: PayrollWarning[];
  };
}

const data = await api.get<StoryPayload>("/demo/story");

/* ── The period, and the person ──────────────────────────────────────── */

const periodStart = data.period.start;
const periodEnd = data.period.end;
const openMonth = monthOf(periodStart);

const lines: PayslipLine[] = data.payslip.lines;
const myAttendance = data.attendances;
const myContracts = data.contracts;
const holidays = data.holidays;

export const salaryRules = data.salary_rules;

/**
 * A full `PayslipDetail`, not a subset — because Act 06 hands it straight to
 * the *product's* `PayslipCard`, and the landing page does not get its own
 * lighter-weight version of a payslip. It is the real one now, so there is
 * nothing left to assemble.
 */
export const payslip: PayslipDetail = data.payslip;

export const person = {
  name: data.person.name,
  title: data.person.title ?? "",
  department: data.person.department ?? "",
  number: data.person.number,
};

export const period = {
  start: periodStart,
  end: periodEnd,
  label: monthLabel(openMonth),
  /** The bead's home position — the middle of the period, so the line reads. */
  middle: `${openMonth}-15` as ISODate,
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
  contractCount: myContracts.length,
};

/* ── THE LINE ────────────────────────────────────────────────────────── */

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
        (rule?.percentage
          ? `${rule.percentage}% of ${rule.percentage_base_code}`
          : null),
      inputs: [
        { label: "quantity", value: line.quantity },
        { label: "rate", value: line.rate },
      ],
    };
  });

export const additive = blocks.filter((b) => b.kind === "add");
export const deductions = blocks.filter((b) => b.kind === "deduct");

/* ── THE PROVENANCE ──────────────────────────────────────────────────── */

export const provenance: ProvenanceNode = buildPayslipProvenance({
  payslip,
  rules: salaryRules,
  leave: data.leave_requests,
  attendances: myAttendance,
});

/* ── ACT 02 · one real day ───────────────────────────────────────────── */

/**
 * The clock face shows a **real attendance row**, chosen as the day inside the
 * period with the most overtime — because Act 02's whole beat is those extra
 * hours travelling down the line and landing in the `OT` block, and a day with
 * no overtime would leave the block it lands in at zero.
 */
export const day = (() => {
  const inPeriod = myAttendance.filter((a) => a.check_out !== null);
  const best =
    inPeriod.reduce<(typeof inPeriod)[number] | null>(
      (top, a) =>
        top === null || Number(a.overtime_hours) > Number(top.overtime_hours)
          ? a
          : top,
      null,
    ) ?? inPeriod[0];

  const clock = (stamp: string | null) =>
    stamp === null ? "--:--" : stamp.slice(11, 16);
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
  const balances = data.balances;
  const paid =
    balances.find((b) => b.is_paid && Number(b.allocated) > 0) ?? balances[0];
  const lwp = blocks.find((b) => b.code === "LWP") ?? null;

  return {
    typeName: paid?.type_name ?? "Annual leave",
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
 * Real counts from the payrun this payslip belongs to, not the blueprint's
 * illustrative `147`. The dark act's claim is *"business logic demonstrated,
 * not claimed"* — and the one thing it cannot afford is an invented number in
 * the header above the demonstration.
 */
export const payrun = (() => {
  const open = data.payrun.warnings.filter((w) => !w.is_resolved);
  const blocking = open.filter(
    (w) => w.severity === "ERROR" || w.blocks !== null,
  );
  const first = blocking[0] ?? open[0] ?? null;

  return {
    name: data.payrun.name,
    label: monthLabel(openMonth),
    payslips: data.payrun.payslip_count,
    warnings: open.length,
    blocked: blocking.length,
    ready: Math.max(0, data.payrun.payslip_count - open.length),
    totalNet: money(data.payrun.total_net),
    /** The one the reader fixes, with their own hands, inside the page. */
    blocker: {
      title: first?.employee_name ?? "One payslip",
      message: first?.message ?? "This payslip has no bank account on file.",
      code: first?.code ?? "MISSING_BANK_DETAILS",
    },
  };
})();

export type { Money };

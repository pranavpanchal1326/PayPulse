/**
 * THE DATASET, ASSEMBLED
 *
 * Import order is load-bearing, because the generators feed each other: leave
 * has to exist before attendance can avoid it, attendance before payroll can
 * count absences, payroll before the dashboard can add anything up. Modules
 * are listed here in that order rather than alphabetically, and the comment is
 * the reason not to "tidy" them.
 *
 * Everything below is computed once, at module load, and then treated as
 * read-only. `mocks/db.ts` takes the mutable copy the handlers write to.
 */
import { ANCHOR_TODAY, ALL_PERIODS, CURRENCY, OPEN_PERIOD } from "./anchor";
import {
  CAST, DEMO_PASSWORD, departments, employees, holidays, jobPositions, schedules, users,
} from "./people";
import { contracts } from "./contracts";
import { salaryRules, salaryStructures } from "./payroll";
import { leaveAllocations, timeOffRequests, timeOffTypes } from "./timeOff";
import { attendances } from "./attendance";
import { payrollWarnings, payruns, payslipLines, payslips } from "./payruns";

/**
 * "Distinct employees with a RUNNING contract pointing at the structure"
 * (PRD §5). Derived rather than typed in, so it cannot go stale when the
 * contract fixtures change.
 */
salaryStructures[0].employee_count = new Set(
  contracts.filter((c) => c.state === "RUNNING" && c.salary_structure_id !== null)
    .map((c) => c.employee_id),
).size;

export const seed = {
  meta: { today: ANCHOR_TODAY, openPeriod: OPEN_PERIOD, periods: ALL_PERIODS, currency: CURRENCY },
  cast: CAST,
  password: DEMO_PASSWORD,

  users,
  departments,
  jobPositions,
  schedules,
  holidays,
  employees,
  contracts,

  attendances,

  timeOffTypes,
  leaveAllocations,
  timeOffRequests,

  salaryStructures,
  salaryRules,

  payruns,
  payslips,
  payslipLines,
  payrollWarnings,
} as const;

export type Seed = typeof seed;

/**
 * A fixture that quietly stops satisfying the spec is worse than no fixture:
 * every screen built on it inherits the defect. These are the P3 exit criteria
 * that can be checked by machine, checked at load, in dev only.
 */
if (import.meta.env.DEV) {
  const problems: string[] = [];
  const expect = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };

  expect(employees.length === 30, `PRD §9 wants 30 employees, got ${employees.length}`);
  expect(
    employees.filter((e) => !e.bank_account).length === 3,
    "PRD §9 wants exactly 3 employees without bank details",
  );
  expect(schedules.some((s) => s.crosses_midnight), "no midnight-crossing schedule");
  expect(contracts.length === 35, `PRD §9 wants 35 contracts, got ${contracts.length}`);
  expect(holidays.length === 14, `PRD §9 wants ~14 holidays, got ${holidays.length}`);
  expect(
    contracts.filter((c) => c.employee_id === CAST.raise && c.state === "RUNNING").length === 2,
    "the adjacent contract pair is missing — MULTI_CONTRACT_PERIOD has no subject",
  );
  expect(
    payruns.filter((p) => p.state === "PAID" || p.state === "VALIDATED").length === 6,
    "the trend chart needs 6 closed payruns",
  );
  expect(
    payrollWarnings.some((w) => w.severity === "ERROR" && !w.is_resolved),
    "no open ERROR warning — the blocked payrun state is undesignable",
  );

  // Money is a string everywhere (P3 exit criterion), and a *well-formed* one.
  const MONEY = /^-?\d+\.\d{2}$/;
  const badMoney = [
    ...contracts.map((c) => c.wage),
    ...payslips.flatMap((p) => [p.basic, p.gross, p.total_deductions, p.net]),
    ...payslipLines.map((l) => l.amount),
  ].filter((v) => typeof v !== "string" || !MONEY.test(v));
  expect(badMoney.length === 0, `${badMoney.length} money values are not 2dp strings`);

  // §4.6: the payslip is a document only if it reconciles.
  const unreconciled = payslips.filter(
    (p) => Number(p.net).toFixed(2) !==
      (Number(p.gross) - Number(p.total_deductions)).toFixed(2),
  );
  expect(unreconciled.length === 0, `${unreconciled.length} payslips do not reconcile`);

  if (problems.length > 0) {
    console.error("[mocks] fixtures violate the PRD:\n  · " + problems.join("\n  · "));
  } else {
    console.info(
      `[mocks] ${employees.length} employees · ${contracts.length} contracts · ` +
      `${attendances.length} attendance rows · ${leaveAllocations.length} allocations · ` +
      `${timeOffRequests.length} leave requests · ` +
      `${payruns.length} payruns · ${payslips.length} payslips · ` +
      `${payrollWarnings.length} warnings · open period ${OPEN_PERIOD}`,
    );
  }
}

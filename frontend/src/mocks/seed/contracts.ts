/**
 * CONTRACTS — PRD §9's "35 contracts", and the one pair that matters.
 *
 * Every employee gets a current `RUNNING` contract. Five long-serving people
 * also get an `EXPIRED` predecessor, so the contract list has history in it and
 * `?state=` filters against something. That is 35 rows.
 *
 * **The pair that earns its place** is Kavya Reddy's: one contract ending on
 * the 15th of the open period and the next starting on the 16th. Adjacent, not
 * overlapping — which is exactly the case v1 raised `OVERLAPPING_CONTRACTS` on
 * and thereby made a mid-month raise unpayable (PRD §3.2). Here it resolves to
 * the contract applicable at `period_end` and raises `MULTI_CONTRACT_PERIOD` as
 * a **WARNING**, and the payslip is still produced. Without this pair in the
 * fixtures, the warning strip in the cockpit has nothing to render.
 */
import type { Contract } from "@/api/contract";
import { ALL_PERIODS, CURRENCY, OPEN_PERIOD } from "./anchor";
import { addDays, monthStart, type ISODate } from "@/lib/date";
import { CAST, WAGE_BY_EMPLOYEE, employees } from "./people";
import { SEEDS, rng } from "./random";

/** The single seeded structure every contract points at (see `payroll.ts`). */
export const STRUCTURE_ID = 1;

const money = (rupees: number) => `${rupees}.00`;

const OPEN_START = monthStart(OPEN_PERIOD);
const RAISE_DAY: ISODate = `${OPEN_PERIOD}-16`;

/** Employees who get an expired predecessor as well as a current contract. */
const WITH_HISTORY = [1, 2, 6, 15];

/**
 * The lapsed fixed-term contract. His renewal has not been signed, so the open
 * payrun — created while he was still covered — computes an ERROR he cannot be
 * paid past. P3 asks for exactly one of these: without it the payrun cockpit's
 * blocked state has nothing to render and never gets designed.
 */
export const LAPSED_CONTRACT_EMPLOYEE = 11;

const r = rng(SEEDS.contracts);

const rows: Contract[] = [];
let id = 1;

for (const e of employees) {
  const wage = WAGE_BY_EMPLOYEE.get(e.id) ?? 50000;
  const scheduleId = e.working_schedule_id ?? 1;

  const base = {
    employee_id: e.id,
    employee_name: e.full_name,
    currency: CURRENCY,
    working_schedule_id: scheduleId,
    salary_structure_id: STRUCTURE_ID,
    job_position_id: e.job_position_id,
  };

  // A prior contract on the old wage, ended the day before the current one.
  if (WITH_HISTORY.includes(e.id)) {
    const start = e.date_of_joining;
    const end = addDays(monthStart(ALL_PERIODS[0]), -1);
    if (start < end) {
      rows.push({
        ...base,
        id: id++,
        name: `${e.full_name} · previous terms`,
        state: "EXPIRED",
        date_start: start,
        date_end: end,
        // A round 12% below today's wage — a promotion, legible on the screen.
        wage: money(Math.round((wage / 1.12) / 500) * 500),
        notes: "Superseded by revised terms.",
      });
    }
  }

  if (e.id === CAST.raise) {
    // The pair. Both are RUNNING and both are legal: `daterange('[]')` treats
    // the 15th and the 16th as adjacent, not overlapping (PRD §3.2).
    rows.push({
      ...base,
      id: id++,
      name: `${e.full_name} · permanent`,
      state: "RUNNING",
      date_start: e.date_of_joining,
      date_end: addDays(RAISE_DAY, -1),
      wage: money(wage),
      notes: "Superseded mid-period by a revised wage.",
    });
    rows.push({
      ...base,
      id: id++,
      name: `${e.full_name} · revised wage`,
      state: "RUNNING",
      date_start: RAISE_DAY,
      date_end: null,
      wage: money(wage + 9000),
      notes: "Mid-period raise. Applicable at period end.",
    });
    continue;
  }

  const lapsed = e.id === LAPSED_CONTRACT_EMPLOYEE;

  // The leaver's contract ends the day they do, so `contract_days` stops with
  // them and the payslip prorates instead of paying a full month (PRD §4.2).
  const dateEnd = lapsed
    ? addDays(OPEN_START, -1)
    : (e.date_of_exit ??
      // A handful of fixed-term contracts, one of which expires inside 30 days
      // of the open period so `CONTRACT_EXPIRING` (INFO) has a subject.
      (e.employee_type === "CONTRACT" ? addDays(OPEN_START, r.int(20, 75)) : null));

  rows.push({
    ...base,
    id: id++,
    name: `${e.full_name} · ${e.employee_type === "CONTRACT" ? "fixed term" : "permanent"}`,
    state: e.date_of_exit || lapsed ? "EXPIRED" : "RUNNING",
    date_start: WITH_HISTORY.includes(e.id) ? monthStart(ALL_PERIODS[0]) : e.date_of_joining,
    date_end: dateEnd,
    wage: money(wage),
    notes: lapsed ? "Fixed term ended; renewal not yet signed." : null,
  });
}

export const contracts: Contract[] = rows;

/**
 * The §4.3 step-1 resolver, in miniature: `RUNNING`, covering the period, and
 * when there are several, the one applicable at `period_end`. Returns the rest
 * so the caller can raise `MULTI_CONTRACT_PERIOD` naming them.
 */
export function resolveContract(
  employeeId: number,
  periodStart: ISODate,
  periodEnd: ISODate,
): { used: Contract | null; others: Contract[] } {
  const applicable = contracts
    .filter(
      (c) =>
        c.employee_id === employeeId &&
        c.state === "RUNNING" &&
        c.date_start <= periodEnd &&
        (c.date_end === null || c.date_end >= periodStart),
    )
    .sort((a, b) => b.date_start.localeCompare(a.date_start));

  return { used: applicable[0] ?? null, others: applicable.slice(1) };
}

/**
 * The contract that *was* in force over a past period, `EXPIRED` included.
 *
 * `resolveContract` above is the live §4.3 resolver and is RUNNING-only, which
 * is right for a payrun being computed today. It is wrong for seeding history:
 * a contract that ended in June was running in May, and the payslip it produced
 * is a document, not a re-derivation. Historical fixtures use this; the
 * eligibility endpoint uses the resolver.
 */
export function contractsCovering(
  employeeId: number,
  periodStart: ISODate,
  periodEnd: ISODate,
): Contract[] {
  return contracts
    .filter(
      (c) =>
        c.employee_id === employeeId &&
        (c.state === "RUNNING" || c.state === "EXPIRED") &&
        c.date_start <= periodEnd &&
        (c.date_end === null || c.date_end >= periodStart),
    )
    .sort((a, b) => b.date_start.localeCompare(a.date_start));
}

export const contractsByEmployee = new Map<number, Contract[]>();
for (const c of contracts) {
  const list = contractsByEmployee.get(c.employee_id) ?? [];
  list.push(c);
  contractsByEmployee.set(c.employee_id, list);
}

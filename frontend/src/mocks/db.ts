/**
 * THE MUTABLE STORE
 *
 * `seed/` is computed once and treated as read-only; this is the copy the
 * handlers write to. Two reasons for the split rather than mutating the seed
 * in place:
 *
 *   · `reset()` restores the demo in one call, which is what you want at 3 a.m.
 *     after approving forty leave requests to see what the list looks like full.
 *   · A generator that read back its own mutations would stop being
 *     deterministic, and the whole point of `random.ts` is that it does not.
 *
 * Arrays are shallow-copied. The objects inside them are shared with the seed
 * and edited in place, which is exactly how a database behaves and is why
 * `reset()` rebuilds from a structured clone rather than re-copying references.
 */
import type {
  Attendance, Contract, Department, Employee, JobPosition, LeaveAllocation,
  PayrollWarning, Payrun, Payslip, PayslipLine, PublicHoliday, SalaryRule,
  SalaryStructure, TimeOffRequest, TimeOffType, WorkingSchedule,
} from "@/api/contract";
import { seed } from "./seed";
import type { MockUser } from "./seed/people";

interface Store {
  users: MockUser[];
  departments: Department[];
  jobPositions: JobPosition[];
  schedules: WorkingSchedule[];
  holidays: PublicHoliday[];
  employees: Employee[];
  contracts: Contract[];
  attendances: Attendance[];
  timeOffTypes: TimeOffType[];
  leaveAllocations: LeaveAllocation[];
  timeOffRequests: TimeOffRequest[];
  salaryStructures: SalaryStructure[];
  salaryRules: SalaryRule[];
  payruns: Payrun[];
  payslips: Payslip[];
  payslipLines: PayslipLine[];
  payrollWarnings: PayrollWarning[];
}

/**
 * `structuredClone` rather than a spread: the fixtures are two levels deep in
 * places (schedule lines, warning lists) and a shallow copy would leave the
 * handlers editing the seed through a shared reference — which reads as
 * "reset does nothing" and takes an hour to find.
 */
const snapshot = (): Store => ({
  users: structuredClone(seed.users) as MockUser[],
  departments: structuredClone(seed.departments) as Department[],
  jobPositions: structuredClone(seed.jobPositions) as JobPosition[],
  schedules: structuredClone(seed.schedules) as WorkingSchedule[],
  holidays: structuredClone(seed.holidays) as PublicHoliday[],
  employees: structuredClone(seed.employees) as Employee[],
  contracts: structuredClone(seed.contracts) as Contract[],
  attendances: structuredClone(seed.attendances) as Attendance[],
  timeOffTypes: structuredClone(seed.timeOffTypes) as TimeOffType[],
  leaveAllocations: structuredClone(seed.leaveAllocations) as LeaveAllocation[],
  timeOffRequests: structuredClone(seed.timeOffRequests) as TimeOffRequest[],
  salaryStructures: structuredClone(seed.salaryStructures) as SalaryStructure[],
  salaryRules: structuredClone(seed.salaryRules) as SalaryRule[],
  payruns: structuredClone(seed.payruns) as Payrun[],
  payslips: structuredClone(seed.payslips) as Payslip[],
  payslipLines: structuredClone(seed.payslipLines) as PayslipLine[],
  payrollWarnings: structuredClone(seed.payrollWarnings) as PayrollWarning[],
});

export const db: Store = snapshot();

/** Back to the seeded state. Exposed on `window.__mocks.reset()` in dev. */
export function reset(): void {
  Object.assign(db, snapshot());
}

/** Next id for a collection — `max + 1`, the way a sequence behaves. */
export const nextId = (rows: { id: number }[]): number =>
  rows.reduce((max, r) => (r.id > max ? r.id : max), 0) + 1;

export const byId = <T extends { id: number }>(rows: T[], id: number): T | undefined =>
  rows.find((r) => r.id === id);

/** Case- and diacritic-insensitive contains, for every `?q=` in the API. */
export function matches(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  const normalise = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return normalise(haystack).includes(normalise(needle));
}

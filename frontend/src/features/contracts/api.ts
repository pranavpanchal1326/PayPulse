/**
 * CONTRACTS AND SCHEDULES — the endpoints, typed once.
 *
 * Same discipline as `features/people/api.ts`: no screen in this folder builds
 * a URL. When B2 and B2.5 land, this file is the swap.
 */
import { api } from "@/api/client";
import type {
  Contract, ContractQuery, Employee, JobPosition, Page, SalaryStructure, WorkingSchedule,
} from "@/api/contract";

/** The server's ceiling. Past it the screen shows a count and search narrows. */
export const PAGE_SIZE = 200;

export const listContracts = (q: ContractQuery) =>
  api.get<Page<Contract>>("/contracts", { ...q, page_size: q.page_size ?? PAGE_SIZE });

/**
 * The §4.3 step-1 resolver, exposed. Answers "which contract would payroll
 * use for this person on this day?" — which is a different question from
 * "which contracts do they have", and the one the contract list's active
 * marker is actually about.
 */

export const createContract = (patch: Partial<Contract>) =>
  api.post<Contract>("/contracts", patch);

export const updateContract = (id: number, patch: Partial<Contract>) =>
  api.patch<Contract>(`/contracts/${id}`, patch);

/* ── Reference data the two screens need ──────────────────────────────── */

export const listEmployees = () =>
  api.get<Page<Employee>>("/employees", { page_size: PAGE_SIZE });

export const listSchedules = () =>
  api.get<WorkingSchedule[]>("/working-schedules", { page_size: PAGE_SIZE });

export const listStructures = () =>
  api.get<SalaryStructure[]>("/salary-structures", { page_size: PAGE_SIZE });

export const listJobPositions = () =>
  api.get<JobPosition[]>("/job-positions", { page_size: PAGE_SIZE });

/* ── S5 · the schedule editor ─────────────────────────────────────────── */

/**
 * `hours_per_week`, `daily_hours` and `crosses_midnight` are **never sent**.
 * Spec A3 makes them derived, and the server discards them — so the type
 * says so rather than leaving a caller to discover it.
 */
export type ScheduleLineDraft = Pick<
  WorkingSchedule["lines"][number],
  "day_of_week" | "start_time" | "end_time" | "break_minutes"
>;

export interface ScheduleDraft {
  name: string;
  timezone?: string;
  lines: ScheduleLineDraft[];
}

export const createSchedule = (draft: ScheduleDraft) =>
  api.post<WorkingSchedule>("/working-schedules", draft);

export const updateSchedule = (id: number, draft: Partial<ScheduleDraft>) =>
  api.patch<WorkingSchedule>(`/working-schedules/${id}`, draft);

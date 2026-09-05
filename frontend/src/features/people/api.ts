/**
 * PEOPLE — the endpoints, typed once.
 *
 * Screens call these; nothing in `features/people` builds a URL. When B1
 * lands and `api/schema.d.ts` is regenerated from the live OpenAPI document,
 * this file is the only thing that changes — the swap named in
 * BUILD-PLAN §Backend dependency happens here, not in six components.
 */
import { api } from "@/api/client";
import type {
  Attendance, Contract, Department, Employee, EmployeeSummary, JobPosition, Page,
  WorkingSchedule,
} from "@/api/contract";

/** Everything S2 can filter by. `undefined` means "not filtered". */
export interface EmployeeFilters {
  q?: string;
  department_id?: number;
  manager_id?: number;
  status?: string;
  employee_type?: string;
  /** `my_team` resolves against the caller's own record, server-side. */
  scope?: "my_team";
}

/**
 * Kanban groups by department and List sorts across the whole set, so both
 * need the same complete result — paging one of them would silently drop
 * people out of a column. 200 is the server's ceiling (`MAX_PAGE_SIZE`); past
 * that the screen shows a count and the search narrows it.
 */
export const PEOPLE_PAGE_SIZE = 200;

export const listEmployees = (filters: EmployeeFilters) =>
  api.get<Page<Employee>>("/employees", { ...filters, page_size: PEOPLE_PAGE_SIZE });

export const getEmployee = (id: number) => api.get<Employee>(`/employees/${id}`);

/** ★ One call, five counts — PRD §5. The employee page is built on this. */
export const getEmployeeSummary = (id: number) =>
  api.get<EmployeeSummary>(`/employees/${id}/summary`);

export const createEmployee = (patch: Partial<Employee>) =>
  api.post<Employee>("/employees", patch);

export const updateEmployee = (id: number, patch: Partial<Employee>) =>
  api.patch<Employee>(`/employees/${id}`, patch);

export const listDepartments = () =>
  api.get<Department[]>("/departments", { page_size: PEOPLE_PAGE_SIZE });

export const createDepartment = (patch: Partial<Department>) =>
  api.post<Department>("/departments", patch);

export const updateDepartment = (id: number, patch: Partial<Department>) =>
  api.patch<Department>(`/departments/${id}`, patch);

export const listJobPositions = () =>
  api.get<JobPosition[]>("/job-positions", { page_size: PEOPLE_PAGE_SIZE });

export const createJobPosition = (patch: Partial<JobPosition>) =>
  api.post<JobPosition>("/job-positions", patch);

export const updateJobPosition = (id: number, patch: Partial<JobPosition>) =>
  api.patch<JobPosition>(`/job-positions/${id}`, patch);

export const listSchedules = () =>
  api.get<WorkingSchedule[]>("/working-schedules", { page_size: PEOPLE_PAGE_SIZE });

/* ── THE LINE's sources ───────────────────────────────────────────────────
   Bands come from contracts, ticks from attendance. Both are scoped to one
   employee by the server, so the employee page never filters client-side.  */

export const listContractsFor = (employeeId: number) =>
  api.get<Page<Contract>>("/contracts", { employee_id: employeeId, page_size: PEOPLE_PAGE_SIZE });

/**
 * Attendance is the one list here that genuinely outruns a page: a year of
 * working days is ~250 rows against a server ceiling of 200. THE LINE draws
 * every tick or it lies about the gaps, so this walks the pages.
 */
export async function listAttendanceFor(
  employeeId: number,
  from: string,
  to: string,
): Promise<Attendance[]> {
  const rows: Attendance[] = [];
  for (let page = 1; page <= 12; page++) {
    const result = await api.get<Page<Attendance>>("/attendances", {
      employee_id: employeeId,
      date_from: from,
      date_to: to,
      page,
      page_size: PEOPLE_PAGE_SIZE,
    });
    rows.push(...result.items);
    if (page >= result.pages) break;
  }
  return rows;
}

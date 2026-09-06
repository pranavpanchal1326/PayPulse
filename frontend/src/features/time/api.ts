/**
 * ATTENDANCE — the endpoints, typed once. B3's swap happens here.
 */
import { api } from "@/api/client";
import type {
  Attendance, AttendanceCreate, AttendanceEdit, AttendancePeriodOverview,
  AttendanceQuery, Employee, Page,
} from "@/api/contract";

export const PAGE_SIZE = 200;

export const listAttendance = (q: AttendanceQuery) =>
  api.get<Page<Attendance>>("/attendances", { ...q, page_size: q.page_size ?? PAGE_SIZE });

/**
 * A month of one team's attendance is comfortably more than the server's
 * 200-row ceiling, and S6's month strip has to draw **every** day or its gaps
 * are meaningless — the same argument P5 made for THE LINE. So this walks the
 * pages rather than showing the first two hundred rows and calling it a month.
 */
const MAX_PAGES = 25;

export async function listAllAttendance(q: AttendanceQuery): Promise<Attendance[]> {
  /*
    The first page is what tells us how many there are, so it has to be
    awaited alone. The rest do not depend on each other and are fetched
    together — a month of one team is four pages today and the serial walk
    cost ~0.16s, but the ceiling here is 25, and twenty-five round trips
    taken one after another is a stall nobody can see the reason for.

    `Promise.all` preserves the order of its inputs, so the rows stay in the
    server's ordering without a sort.
  */
  const first = await listAttendance({ ...q, page: 1, page_size: PAGE_SIZE });
  const total = Math.min(first.pages, MAX_PAGES);
  if (total <= 1) return first.items;

  const rest = await Promise.all(
    Array.from({ length: total - 1 }, (_, i) =>
      listAttendance({ ...q, page: i + 2, page_size: PAGE_SIZE }),
    ),
  );
  return [...first.items, ...rest.flatMap((page) => page.items)];
}

/**
 * The period aggregate, server-side. Employee-scoped: the route resolves the
 * caller's own record when `employee_id` is omitted, so the team view has no
 * overview to ask for and does not ask.
 */
export const getOverview = (q: {
  employee_id: number;
  period_start: string;
  period_end: string;
}) => api.get<AttendancePeriodOverview>("/attendances/overview", q);

export const createAttendance = (patch: AttendanceCreate) =>
  api.post<Attendance>("/attendances", patch);

/** `HR_MANAGER+` only, and the reason is mandatory — PRD §3.4. */
export const editAttendance = (id: number, patch: AttendanceEdit) =>
  api.patch<Attendance>(`/attendances/${id}`, patch);

export const checkIn = (patch: { employee_id?: number; work_date?: string; check_in?: string }) =>
  api.post<Attendance>("/attendances/check-in", patch);

export const checkOut = (patch: { employee_id?: number; work_date?: string; check_out?: string }) =>
  api.post<Attendance>("/attendances/check-out", patch);

export const listEmployees = () =>
  api.get<Page<Employee>>("/employees", { page_size: PAGE_SIZE });

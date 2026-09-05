/**
 * ATTENDANCE — the endpoints, typed once. B3's swap happens here.
 */
import { api } from "@/api/client";
import type {
  Attendance, AttendanceCreate, AttendanceEdit, AttendanceQuery, Employee, Page,
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
export async function listAllAttendance(q: AttendanceQuery): Promise<Attendance[]> {
  const rows: Attendance[] = [];
  for (let page = 1; page <= 25; page++) {
    const result = await listAttendance({ ...q, page, page_size: PAGE_SIZE });
    rows.push(...result.items);
    if (page >= result.pages) break;
  }
  return rows;
}

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

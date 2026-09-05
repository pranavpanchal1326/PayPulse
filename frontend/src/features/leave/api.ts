/**
 * TIME OFF — the endpoints, typed once. B4's swap happens here.
 */
import { api } from "@/api/client";
import type {
  Employee, LeaveAllocation, LeaveBalance, Page, TimeOffRequest, TimeOffRequestCreate,
  TimeOffRequestQuery, TimeOffType,
} from "@/api/contract";

export const PAGE_SIZE = 200;

/* ── Types ────────────────────────────────────────────────────────────── */

export const listTypes = (activeOnly?: boolean) =>
  api.get<TimeOffType[]>("/time-off/types", {
    is_active: activeOnly === undefined ? undefined : String(activeOnly),
    page_size: PAGE_SIZE,
  });

export const createType = (patch: Partial<TimeOffType>) =>
  api.post<TimeOffType>("/time-off/types", patch);

export const updateType = (id: number, patch: Partial<TimeOffType>) =>
  api.patch<TimeOffType>(`/time-off/types/${id}`, patch);

/* ── Allocations ──────────────────────────────────────────────────────── */

export const listAllocations = (q: {
  employee_id?: number;
  time_off_type_id?: number;
  state?: string;
}) => api.get<Page<LeaveAllocation>>("/time-off/allocations", { ...q, page_size: PAGE_SIZE });

export const createAllocation = (patch: {
  employee_id: number;
  time_off_type_id: number;
  days: string;
  validity_from: string;
  validity_to: string;
  notes?: string | null;
}) => api.post<LeaveAllocation>("/time-off/allocations", patch);

export const approveAllocation = (id: number) =>
  api.post<LeaveAllocation>(`/time-off/allocations/${id}/approve`);

export const refuseAllocation = (id: number) =>
  api.post<LeaveAllocation>(`/time-off/allocations/${id}/refuse`);

/* ── Balances ─────────────────────────────────────────────────────────── */

/**
 * **Not a `Page`.** One employee has a handful of balances, one per type, and
 * §5 lists it flat — paging a set this size would be a lie about how it is
 * fetched. The array shape is the contract, not an oversight.
 */
export const getBalances = (employeeId: number) =>
  api.get<LeaveBalance[]>("/time-off/balances", { employee_id: employeeId });

/* ── Requests ─────────────────────────────────────────────────────────── */

export const listRequests = (q: TimeOffRequestQuery) =>
  api.get<Page<TimeOffRequest>>("/time-off/requests", { ...q, page_size: q.page_size ?? PAGE_SIZE });

/**
 * `duration_days` is **never sent**. §3.6 makes it schedule- and holiday-aware
 * and computes it server-side, which is the whole reason a Friday-to-Monday
 * request on a five-day week is two days rather than four. A client that sent
 * its own number would be guessing at a calendar it does not hold.
 */
export const createRequest = (patch: TimeOffRequestCreate & { hours?: number }) =>
  api.post<TimeOffRequest>("/time-off/requests", patch);

export const approveRequest = (id: number) =>
  api.post<TimeOffRequest>(`/time-off/requests/${id}/approve`);

export const refuseRequest = (id: number) =>
  api.post<TimeOffRequest>(`/time-off/requests/${id}/refuse`);

export const cancelRequest = (id: number) =>
  api.post<TimeOffRequest>(`/time-off/requests/${id}/cancel`);

export const listEmployees = () =>
  api.get<Page<Employee>>("/employees", { page_size: PAGE_SIZE });

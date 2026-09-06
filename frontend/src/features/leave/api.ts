/**
 * TIME OFF — the endpoints, typed once. B4's swap happens here.
 */
import { api } from "@/api/client";
import type {
  Employee, LeaveAllocation, LeaveBalance, LeaveSummary, Page, TimeOffRequest,
  TimeOffRequestCreate, TimeOffRequestQuery, TimeOffType,
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

/**
 * The note is optional here and so is the body — the allocation routes accept
 * a bodyless call on purpose, so older callers keep working. Sending `{ note }`
 * is simply the richer form of the same request.
 */
export const approveAllocation = (id: number, note?: string) =>
  api.post<LeaveAllocation>(`/time-off/allocations/${id}/approve`, { note: note || null });

export const refuseAllocation = (id: number, note?: string) =>
  api.post<LeaveAllocation>(`/time-off/allocations/${id}/refuse`, { note: note || null });

/* ── Balances ─────────────────────────────────────────────────────────── */

/**
 * **Not a `Page`.** One employee has a handful of balances, one per type, and
 * §5 lists it flat — paging a set this size would be a lie about how it is
 * fetched. The array shape is the contract, not an oversight.
 */
export const getBalances = (employeeId: number) =>
  api.get<LeaveBalance[]>("/time-off/balances", { employee_id: employeeId });

/* ── Requests ─────────────────────────────────────────────────────────── */

/**
 * `GET /time-off/summary` — approved leave in a period, split paid/unpaid.
 *
 * Distinct from `/time-off/balances`: a balance is what is *left to take*,
 * this is what was *actually taken* and therefore what the pay basis reads.
 * A screen that shows only the balance cannot answer "what did this person
 * get paid for", which is the question payroll brings to it.
 */
export const getLeaveSummary = (q: {
  employee_id: number;
  period_start: string;
  period_end: string;
}) => api.get<LeaveSummary>("/time-off/summary", q);

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

/**
 * **The body is not optional.** `DecisionRequest` has one optional field, but
 * FastAPI still requires the object — posting nothing answers 422 and the
 * decision silently fails in the drawer. Both send `{ note }` even when the
 * note is absent, which is what the endpoint has always asked for.
 */
export const approveRequest = (id: number, note?: string) =>
  api.post<TimeOffRequest>(`/time-off/requests/${id}/approve`, { note: note || null });

export const refuseRequest = (id: number, note?: string) =>
  api.post<TimeOffRequest>(`/time-off/requests/${id}/refuse`, { note: note || null });

export const cancelRequest = (id: number) =>
  api.post<TimeOffRequest>(`/time-off/requests/${id}/cancel`);

export const listEmployees = () =>
  api.get<Page<Employee>>("/employees", { page_size: PAGE_SIZE });

/**
 * PAYROLL — configuration (B5), the payrun (B7) and payslips (B8), typed once.
 *
 * Three phases share this file because they share a domain: a rule change is
 * visible on a payslip, and a payslip belongs to a payrun. Splitting them
 * would put the same five imports in three places and invite three different
 * ideas of what a structure is.
 */
import { api, requestBlob } from "@/api/client";
import type {
  Department, EligibleEmployee, EligibleEmployeesRequest, Employee, FormulaValidationRequest,
  FormulaValidationResult, MarkPaidRequest, Page, Payrun, PayrunCreate, PayrunDetail,
  PayrunQuery, PayslipDetail, SalaryRule, SalaryStructure, SalaryStructureDetail,
} from "@/api/contract";

export const PAGE_SIZE = 200;

/* ── Salary structures and rules · P9 ─────────────────────────────────── */

export const listStructures = () =>
  api.get<SalaryStructure[]>("/salary-structures", { page_size: PAGE_SIZE });

export const getStructure = (id: number) =>
  api.get<SalaryStructureDetail>(`/salary-structures/${id}`);

export const createStructure = (patch: Partial<SalaryStructure>) =>
  api.post<SalaryStructure>("/salary-structures", patch);

/**
 * The **complete** ordering, never a subset. A request naming half the rules
 * is refused rather than applied to half the list — a partly reordered
 * structure evaluates in an order nobody chose, which is the one failure this
 * endpoint exists to prevent.
 */
export const reorderRules = (structureId: number, ruleIds: number[]) =>
  api.post<SalaryStructureDetail>(`/salary-structures/${structureId}/reorder`, {
    rule_ids: ruleIds,
  });

export const createRule = (patch: Partial<SalaryRule>) =>
  api.post<SalaryRule>("/salary-rules", patch);

export const updateRule = (id: number, patch: Partial<SalaryRule>) =>
  api.patch<SalaryRule>(`/salary-rules/${id}`, patch);

export const deleteRule = (id: number) => api.delete<void>(`/salary-rules/${id}`);

/**
 * The sandbox. **The client never evaluates an expression itself** — a text
 * field that reaches a JavaScript compiler is an XSS hole with extra steps,
 * and a second evaluator would be a second definition of how pay is computed.
 * This is a dry run against a sample context, and it answers 200 with
 * `valid: false` for bad input, because half-typed text is not an error.
 */
export const validateFormula = (body: FormulaValidationRequest) =>
  api.post<FormulaValidationResult & { referenced?: string[] }>(
    "/salary-rules/validate-formula",
    body,
  );

/* ── The payrun · P10 ─────────────────────────────────────────────────── */

/**
 * **STEP 1 CREATES NOTHING.** Stateless, idempotent, persists no row — the
 * spec is emphatic and the wizard says so in the interface.
 */
export const previewEligible = (body: EligibleEmployeesRequest) =>
  api.post<EligibleEmployee[]>("/payruns/eligible-employees", body);

export const listPayruns = (q: PayrunQuery) =>
  api.get<Page<Payrun>>("/payruns", { ...q, page_size: q.page_size ?? PAGE_SIZE });

export const getPayrun = (id: number) => api.get<PayrunDetail>(`/payruns/${id}`);

export const createPayrun = (body: PayrunCreate) => api.post<PayrunDetail>("/payruns", body);

/** Idempotent by construction — pressing Compute twice is not a 422. */
export const computePayrun = (id: number) => api.post<PayrunDetail>(`/payruns/${id}/compute`);

export const validatePayrun = (id: number) => api.post<PayrunDetail>(`/payruns/${id}/validate`);

export const markPaid = (id: number, body: MarkPaidRequest = {}) =>
  api.post<PayrunDetail>(`/payruns/${id}/mark-paid`, body);

export const reopenPayrun = (id: number) => api.post<PayrunDetail>(`/payruns/${id}/reopen`);

export const cancelPayrun = (id: number) => api.post<PayrunDetail>(`/payruns/${id}/cancel`);

export interface SendResult {
  queued: number;
  skipped: number;
  message: string;
}

/** 202. The backend hands this to a background task and answers immediately. */
export const sendPayslips = (id: number) =>
  api.post<SendResult>(`/payruns/${id}/send-payslips`);

/* ── Payslips · P11 ───────────────────────────────────────────────────── */

export const getPayslip = (id: number) => api.get<PayslipDetail>(`/payslips/${id}`);

export const recomputePayslip = (id: number) =>
  api.post<PayslipDetail>(`/payslips/${id}/recompute`);

/**
 * The payslip as a document.
 *
 * Fetched rather than linked. `/payslips/{id}/pdf` needs the same Bearer token
 * every other endpoint does, and a top-level navigation to its URL carries no
 * Authorization header — so the obvious `window.open(url)` is a 401 on a real
 * backend and a refusal against the mock. The bytes come back through the
 * client, with its refresh queue, and reach the browser as an object URL.
 */
export const fetchPayslipPdf = (id: number) =>
  requestBlob(`/payslips/${id}/pdf`, { method: "GET" });

/* ── Reference ────────────────────────────────────────────────────────── */

export const listEmployees = () =>
  api.get<Page<Employee>>("/employees", { page_size: PAGE_SIZE });

export const listDepartments = () =>
  api.get<Department[]>("/departments", { page_size: PAGE_SIZE });

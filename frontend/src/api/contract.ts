/**
 * THE API CONTRACT — hand-written, from PRD §5.
 *
 * `schema.d.ts` is generated from the live `openapi.json` and is the truth for
 * everything the backend has actually shipped. Today that is auth and nothing
 * else. This file is the truth for everything it has *not* shipped yet: B1–B9,
 * transcribed from the PRD by hand so the frontend can be built to completion
 * before a single one of those routers exists.
 *
 * **The migration path is the point.** As each backend block lands, its types
 * move out of here and are read from `schema.d.ts` instead — the section is
 * deleted, `docs/api-contract.md` gets an entry, and the mock handler for it
 * is retired. A type living here is a promissory note, not a permanent home.
 *
 * Two conventions are absolute, because they are the ones a hand-written
 * contract gets wrong:
 *
 *   1. **Money is a string.** `Numeric(12,2)` serialised as `"50000.00"`
 *      (PRD §5, cross-cutting). Never a number. `api/money.ts` is the only
 *      place one is parsed.
 *   2. **Every collection is a `Page<T>`, every failure is an
 *      `ErrorEnvelope`.** No endpoint returns a bare array.
 */

/* ────────────────────────────────────────────────────────────────────────
   SCALARS

   Named aliases rather than bare `string`, so the intent survives into every
   call site and a wrong assignment is at least visible in review.
   ──────────────────────────────────────────────────────────────────────── */

/** `Numeric(12,2)` on the wire: `"50000.00"`. Parse with `money()`. */
export type MoneyString = string;
/** `YYYY-MM-DD`. */
export type DateString = string;
/** ISO-8601 with offset. Rendered in `Asia/Kolkata` (PRD §5). */
export type DateTimeString = string;
/** `HH:MM` or `HH:MM:SS`, local to the schedule — never a timestamp. */
export type TimeString = string;
/** ISO-4217, `CHAR(3)`. Ships as `INR`; carried everywhere money is. */
export type CurrencyCode = string;
/** `NUMERIC(5,2)` day and hour counts — also strings, for the same reason. */
export type DecimalString = string;

/* ────────────────────────────────────────────────────────────────────────
   ENVELOPES — PRD §5, cross-cutting
   ──────────────────────────────────────────────────────────────────────── */

/** Mirrors `backend/app/schemas/common.py::Page`. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  page_size: number;
}

/** Every list endpoint accepts these; most add their own filters on top. */
export interface PageQuery {
  page?: number;
  page_size?: number;
}

export interface FieldErrorPayload {
  field: string;
  message: string;
}

/**
 * The failure shape. `api/errors.ts` owns the runtime side of this — the
 * interface is repeated here so a mock handler can be typed against the
 * contract without importing the client's error classes.
 */
export interface ErrorPayload {
  code: string;
  message: string;
  field_errors: FieldErrorPayload[];
}

/* ────────────────────────────────────────────────────────────────────────
   ENUMS — mirrors of `backend/app/core/enums.py`

   Written as const arrays first so the mocks and any `<Select>` can iterate
   the domain without a second, drifting copy of the same list.
   ──────────────────────────────────────────────────────────────────────── */

export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as const;
export type EmployeeType = (typeof EMPLOYEE_TYPES)[number];

export const CONTRACT_STATES = ["DRAFT", "RUNNING", "EXPIRED", "CANCELLED"] as const;
export type ContractState = (typeof CONTRACT_STATES)[number];

/**
 * `ABSENT` is deliberately absent (PRD §3.4) — absence is the *absence of a
 * row*, not a property of one. The backend enum still carries it as of B0;
 * the frontend never renders it, and §3.4 records it as a scheduled deletion.
 */
export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "OVERTIME", "MISSING_CHECKOUT"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const LEAVE_UNITS = ["DAYS", "HOURS"] as const;
export type LeaveUnit = (typeof LEAVE_UNITS)[number];

/** Shared by time-off requests and allocations. */
export const REQUEST_STATES = [
  "DRAFT", "TO_APPROVE", "APPROVED", "REFUSED", "CANCELLED",
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

export const RULE_CATEGORIES = ["BASIC", "ALLOWANCE", "GROSS", "DEDUCTION", "NET"] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export const CONDITION_TYPES = ["ALWAYS", "EXPRESSION"] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const AMOUNT_TYPES = ["FIXED", "PERCENTAGE", "FORMULA"] as const;
export type AmountType = (typeof AMOUNT_TYPES)[number];

export const PAYRUN_STATES = [
  "DRAFT", "COMPUTED", "VALIDATED", "PAID", "CANCELLED",
] as const;
export type PayrunState = (typeof PAYRUN_STATES)[number];

export const PAYSLIP_STATES = [
  "DRAFT", "COMPUTED", "VALIDATED", "PAID", "CANCELLED",
] as const;
export type PayslipState = (typeof PAYSLIP_STATES)[number];

export const WARNING_SEVERITIES = ["ERROR", "WARNING", "INFO"] as const;
export type WarningSeverity = (typeof WARNING_SEVERITIES)[number];

/* ────────────────────────────────────────────────────────────────────────
   MASTER DATA — spec B1, B2, B3
   ──────────────────────────────────────────────────────────────────────── */

export interface Department {
  id: number;
  name: string;
  code: string;
  manager_id: number | null;
  employee_count: number;
}

export interface JobPosition {
  id: number;
  title: string;
  department_id: number | null;
  employee_count: number;
}

/** `(day_of_week 0–6, start, end, break)` — PRD §3.1. Monday is 0. */
export interface WorkingScheduleLine {
  id: number;
  day_of_week: number;
  start_time: TimeString;
  end_time: TimeString;
  break_minutes: number;
}

export interface WorkingSchedule {
  id: number;
  name: string;
  timezone: string;
  /**
   * **Read-only, computed from the lines on every write** — spec A3 is
   * explicit that it must not be entered by hand. Sending it is ignored.
   */
  hours_per_week: DecimalString;
  /** `hours_per_week / distinct working days`. Replaces v1's hardcoded 8. */
  daily_hours: DecimalString;
  /** True when any line has `end_time < start_time` (PRD §3.1). */
  crosses_midnight: boolean;
  lines: WorkingScheduleLine[];
}

export interface Employee {
  id: number;
  employee_number: string;
  full_name: string;
  email: string;
  phone: string | null;
  department_id: number | null;
  department_name: string | null;
  job_position_id: number | null;
  job_title: string | null;
  manager_id: number | null;
  manager_name: string | null;
  working_schedule_id: number | null;
  employee_type: EmployeeType;
  status: EmployeeStatus;
  date_of_joining: DateString;
  date_of_exit: DateString | null;
  /** Null when never captured — the `MISSING_BANK_DETAILS` warning's source. */
  bank_account: string | null;
  bank_ifsc: string | null;
  user_id: number | null;
}

/**
 * Spec B2 wants smart buttons showing counts. Five round-trips per employee
 * form would be slow and obvious on stage, so `/employees/{id}/summary` is one
 * call (PRD §5 ★).
 */
export interface EmployeeSummary {
  employee_id: number;
  contracts: number;
  attendances: number;
  time_off_requests: number;
  allocations: number;
  payslips: number;
}

export interface Contract {
  id: number;
  employee_id: number;
  employee_name: string;
  name: string;
  state: ContractState;
  date_start: DateString;
  /** Open-ended when null. */
  date_end: DateString | null;
  wage: MoneyString;
  currency: CurrencyCode;
  working_schedule_id: number;
  salary_structure_id: number | null;
  job_position_id: number | null;
  notes: string | null;
}

/** Seed-only — no CRUD screen (PRD §3.5). Read for the calendar and payslip. */
export interface PublicHoliday {
  id: number;
  name: string;
  date: DateString;
  /** Optional holidays do **not** reduce `period_days`. */
  is_optional: boolean;
}

export interface EmployeeQuery extends PageQuery {
  q?: string;
  department_id?: number;
  status?: EmployeeStatus;
  employee_type?: EmployeeType;
  manager_id?: number;
  /** `HR_MANAGER` shortcut for `manager_id = me` (PRD §6, row-level scoping). */
  scope?: "my_team";
}

export interface ContractQuery extends PageQuery {
  employee_id?: number;
  state?: ContractState;
  /** Contracts running on this date. */
  active_on?: DateString;
}

/* ────────────────────────────────────────────────────────────────────────
   ATTENDANCE — spec B3
   ──────────────────────────────────────────────────────────────────────── */

export interface Attendance {
  id: number;
  employee_id: number;
  employee_name: string;
  work_date: DateString;
  check_in: DateTimeString;
  /** Null leaves the row standing as `MISSING_CHECKOUT` with zero hours. */
  check_out: DateTimeString | null;
  break_minutes: number;
  /** **Computed server-side**, never client-supplied (PRD §3.4). */
  worked_hours: DecimalString;
  /** `max(0, worked_hours − daily_hours(work_date))`. */
  overtime_hours: DecimalString;
  status: AttendanceStatus;
  is_manual_edit: boolean;
  edited_by_id: number | null;
  edit_reason: string | null;
}

export interface AttendanceQuery extends PageQuery {
  employee_id?: number;
  date_from?: DateString;
  date_to?: DateString;
  status?: AttendanceStatus;
}

export interface AttendanceCreate {
  employee_id: number;
  work_date: DateString;
  check_in: DateTimeString;
  check_out?: DateTimeString | null;
  break_minutes?: number;
}

/** `PATCH` is `HR_MANAGER+` only and **requires** a reason (PRD §3.4). */
export interface AttendanceEdit {
  check_in?: DateTimeString;
  check_out?: DateTimeString | null;
  break_minutes?: number;
  edit_reason: string;
}

/* ────────────────────────────────────────────────────────────────────────
   TIME OFF — spec B4
   ──────────────────────────────────────────────────────────────────────── */

export interface TimeOffType {
  id: number;
  name: string;
  code: string;
  unit: LeaveUnit;
  requires_allocation: boolean;
  /** `false` is how unpaid leave reaches payroll — see PRD §3.6. */
  is_paid: boolean;
  /** A token name (`--accent-lilac`), never a hex — blueprint §20.3. */
  color: string;
  is_active: boolean;
}

export interface LeaveAllocation {
  id: number;
  employee_id: number;
  employee_name: string;
  time_off_type_id: number;
  type_name: string;
  days: DecimalString;
  validity_from: DateString;
  validity_to: DateString;
  state: RequestState;
  notes: string | null;
  approver_id: number | null;
  approver_name: string | null;
  /** The approver's note, recorded with the decision. */
  decision_note: string | null;
}

/** Half days cover one date; the API refuses a half day over a range. */
export type HalfDay = "FIRST_HALF" | "SECOND_HALF";

export interface TimeOffRequest {
  id: number;
  employee_id: number;
  employee_name: string;
  time_off_type_id: number;
  type_name: string;
  is_paid: boolean;
  date_from: DateString;
  date_to: DateString;
  /**
   * **Schedule- and holiday-aware** (PRD §3.6): a Fri–Mon request on a 5-day
   * week is 2 days, not 4. Hour-unit types convert on approval.
   */
  duration_days: DecimalString;
  /** Which half of the day, when it is half a day. Null is a whole day. */
  half_day: HalfDay | null;
  state: RequestState;
  reason: string | null;
  approver_id: number | null;
  approver_name: string | null;
  /** The approver's note, recorded with the decision. */
  decision_note: string | null;
  decided_at: DateTimeString | null;
}

/**
 * `pending` closes v1's gap where an employee could stack requests past their
 * balance with no signal. Approval blocks past zero (PRD §3.6), so the UI must
 * warn *before* the user hits the wall.
 */
export interface LeaveBalance {
  employee_id: number;
  time_off_type_id: number;
  type_name: string;
  unit: LeaveUnit;
  is_paid: boolean;
  allocated: DecimalString;
  taken: DecimalString;
  pending: DecimalString;
  remaining: DecimalString;
  validity_from: DateString | null;
  validity_to: DateString | null;
}

export interface TimeOffRequestQuery extends PageQuery {
  employee_id?: number;
  time_off_type_id?: number;
  state?: RequestState;
  date_from?: DateString;
  date_to?: DateString;
  scope?: "my_team";
}

export interface TimeOffRequestCreate {
  employee_id: number;
  time_off_type_id: number;
  date_from: DateString;
  date_to: DateString;
  /** Only valid when date_from === date_to, and never on an hour-unit type. */
  half_day?: HalfDay | null;
  reason?: string | null;
}

/* ────────────────────────────────────────────────────────────────────────
   PAYROLL CONFIGURATION — spec B5's prerequisite
   ──────────────────────────────────────────────────────────────────────── */

export interface SalaryRule {
  id: number;
  structure_id: number;
  /** `^[A-Z][A-Z0-9_]{1,19}$` — PRD §3.9. */
  code: string;
  name: string;
  category: RuleCategory;
  sequence: number;
  condition_type: ConditionType;
  condition_expr: string | null;
  amount_type: AmountType;
  amount_fixed: MoneyString | null;
  /** `"40.00"` means 40%. A percentage, not a fraction. */
  percentage: DecimalString | null;
  /** Must reference a **strictly lower** sequence (PRD §4.4). */
  percentage_base_code: string | null;
  amount_formula: string | null;
  appears_on_payslip: boolean;
  is_active: boolean;
}

export interface SalaryStructure {
  id: number;
  name: string;
  code: string;
  currency: CurrencyCode;
  rule_count: number;
  /** Distinct employees with a RUNNING contract pointing here (PRD §5). */
  employee_count: number;
  is_active: boolean;
}

export interface SalaryStructureDetail extends SalaryStructure {
  /** Ordered by `sequence` — the order they evaluate in (PRD §4.3 step 4). */
  rules: SalaryRule[];
}

/** `POST /salary-rules/validate-formula` — the sandbox dry-run (PRD §4.4). */
export interface FormulaValidationRequest {
  expression: string;
  /** Overrides for the sample context; anything omitted uses the default. */
  context?: Record<string, number | string>;
}

export interface FormulaValidationResult {
  valid: boolean;
  /** The amount the expression produced against the sample context. */
  amount: MoneyString | null;
  /** Present only when `valid` is false. */
  error: string | null;
  /** The context the amount was computed against, so the UI can show it. */
  sample_context: Record<string, number | string>;
}

/* ────────────────────────────────────────────────────────────────────────
   PAYRUN — spec B5 (the two-step wizard) and B6
   ──────────────────────────────────────────────────────────────────────── */

/** Blockers make a row ineligible; notes are informational (PRD §5). */
export const ELIGIBILITY_BLOCKERS = [
  "NO_ACTIVE_CONTRACT", "ALREADY_PAID_THIS_PERIOD",
] as const;
export type EligibilityBlocker = (typeof ELIGIBILITY_BLOCKERS)[number];

export const ELIGIBILITY_NOTES = ["PRORATED_PERIOD", "MULTI_CONTRACT_PERIOD"] as const;
export type EligibilityNote = (typeof ELIGIBILITY_NOTES)[number];

/**
 * **Step 1 creates nothing.** The spec is emphatic: *"Clicking Continue moves
 * to employee selection without creating the Payrun."* This endpoint is
 * stateless and idempotent — it persists no row, and calling it twice with the
 * same body returns the same answer.
 */
export interface EligibleEmployeesRequest {
  salary_structure_id: number;
  period_start: DateString;
  period_end: DateString;
  department_id?: number;
  employee_type?: EmployeeType;
}

export interface EligibleEmployee {
  employee_id: number;
  name: string;
  department: string | null;
  contract_wage: MoneyString | null;
  currency: CurrencyCode;
  /** Proration is visible *before* you commit — the whole point of step 1. */
  period_days: number;
  contract_days: number;
  eligible: boolean;
  blockers: EligibilityBlocker[];
  notes: EligibilityNote[];
}

/** The full warning vocabulary — PRD §4.9. */
export const WARNING_CODES = [
  "NO_ACTIVE_CONTRACT", "NEGATIVE_NET", "NO_STRUCTURE_RULES", "PAYSLIP_NOT_RECONCILED",
  "MISSING_BANK_DETAILS", "MULTI_CONTRACT_PERIOD", "RULE_EVAL_FAILED",
  "RULE_FORWARD_REFERENCE", "MISSING_CHECKOUT", "ATTENDANCE_ON_LEAVE_DAY", "HIGH_ABSENCE",
  "PRORATED_PERIOD", "CONTRACT_EXPIRING", "RECOMPUTE_REQUIRED",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export interface PayrollWarning {
  id: number;
  payrun_id: number;
  /** Null when the warning is about the run rather than one payslip. */
  payslip_id: number | null;
  employee_id: number | null;
  employee_name: string | null;
  code: WarningCode;
  severity: WarningSeverity;
  message: string;
  /** ERROR warnings block `validate`; `MISSING_BANK_DETAILS` blocks `mark-paid`. */
  blocks: "validate" | "compute" | "mark-paid" | null;
  is_resolved: boolean;
}

export interface Payrun {
  id: number;
  name: string;
  salary_structure_id: number;
  salary_structure_name: string;
  period_start: DateString;
  period_end: DateString;
  currency: CurrencyCode;
  state: PayrunState;
  payslip_count: number;
  total_gross: MoneyString;
  total_deductions: MoneyString;
  total_net: MoneyString;
  computed_at: DateTimeString | null;
  validated_at: DateTimeString | null;
  paid_at: DateTimeString | null;
  paid_by_id: number | null;
  /** Mandatory when `mark-paid` was forced past an open warning (PRD §4.8). */
  force_paid_reason: string | null;
  created_at: DateTimeString;
}

export interface PayrunDetail extends Payrun {
  payslips: Payslip[];
  warnings: PayrollWarning[];
  /** Pre-counted by severity so the cockpit header needs no client reduce. */
  warning_counts: Record<WarningSeverity, number>;
}

export interface PayrunCreate {
  name: string;
  salary_structure_id: number;
  period_start: DateString;
  period_end: DateString;
  employee_ids: number[];
}

export interface PayrunQuery extends PageQuery {
  state?: PayrunState;
  /** `YYYY-MM` — matches any run whose period overlaps that month. */
  period?: string;
  department_id?: number;
}

export interface MarkPaidRequest {
  /** Overrides an unresolved `MISSING_BANK_DETAILS`. Requires a reason. */
  force?: boolean;
  force_paid_reason?: string;
}

/* ────────────────────────────────────────────────────────────────────────
   PAYSLIP — spec B7
   ──────────────────────────────────────────────────────────────────────── */

export interface PayslipLine {
  id: number;
  payslip_id: number;
  /** Denormalised, so a deleted rule never corrupts history (PRD §4.7). */
  rule_code: string;
  name: string;
  category: RuleCategory;
  sequence: number;
  quantity: DecimalString;
  rate: MoneyString;
  amount: MoneyString;
}

/** Day counts — every figure defined once, in PRD §4.2, and printed as-is. */
export interface PayslipDayCounts {
  /** The denominator. Same for everyone on that schedule. */
  period_days: number;
  /** The proration numerator: joiner on the 20th, leaver on the 10th. */
  contract_days: number;
  /** `contract_days − unpaid_days`. Also the formula context's `worked_days`. */
  payable_days: DecimalString;
  /** `unpaid_leave_days + absent_days`. */
  unpaid_days: DecimalString;
  absent_days: DecimalString;
  paid_leave_days: DecimalString;
  unpaid_leave_days: DecimalString;
}

export interface Payslip extends PayslipDayCounts {
  id: number;
  payrun_id: number;
  employee_id: number;
  employee_name: string;
  employee_number: string;
  department_name: string | null;
  /** The contract this was computed against — the brief's B7 "applicable period contract". */
  contract_id: number | null;
  currency: CurrencyCode;
  period_start: DateString;
  period_end: DateString;
  basic: MoneyString;
  gross: MoneyString;
  total_deductions: MoneyString;
  net: MoneyString;
  worked_hours: DecimalString;
  overtime_hours: DecimalString;
  state: PayslipState;
  /** Denormalised for the cockpit row; the full objects live on the payrun. */
  warning_codes: WarningCode[];
}

export interface PayslipDetail extends Payslip {
  /** Ordered by `sequence`; `appears_on_payslip = false` rules are excluded. */
  lines: PayslipLine[];
  contract: Contract | null;
  warnings: PayrollWarning[];
}

export interface PayslipQuery extends PageQuery {
  payrun_id?: number;
  employee_id?: number;
  state?: PayslipState;
  /** `YYYY-MM`. */
  period?: string;
}

/* ────────────────────────────────────────────────────────────────────────
   DASHBOARD — spec B9. One endpoint, one round-trip.
   ──────────────────────────────────────────────────────────────────────── */

export interface DashboardQuery {
  period_start?: DateString;
  period_end?: DateString;
  department_id?: number;
  employee_type?: EmployeeType;
}

/**
 * Money fields are `null` for `HR_MANAGER` — PRD §6.1(a) keeps page 3's
 * *"no access to payroll features"* boundary while still giving that role a
 * real landing screen. The UI must render a dashboard with these missing, not
 * a dashboard with zeroes.
 */
export interface DashboardKpis {
  total_net_paid: MoneyString | null;
  payslips_generated: number;
  average_net_salary: MoneyString | null;
  approved_time_off_days: DecimalString;
  attendance_health_pct: DecimalString;
  headcount: number;
}

export interface DepartmentSalaryCost {
  department_id: number;
  department: string;
  headcount: number;
  total_gross: MoneyString;
  total_net: MoneyString;
}

/** `YYYY-MM` → net. Requests 12 months, renders whatever exists (PRD §5). */
export interface MonthlyNetPoint {
  month: string;
  net: MoneyString;
}

export interface AttendanceOverview {
  present: number;
  late: number;
  absent_days: DecimalString;
  overtime_hours: DecimalString;
  missing_checkouts: number;
  manual_edits: number;
  /** How much of the schedule is *accounted for*, present or excused. */
  coverage_pct: DecimalString;
}

/**
 * `GET /attendances/overview` — the *period* aggregate, and a different shape
 * from the dashboard's `AttendanceOverview` above.
 *
 * It exists because the one figure payroll actually acts on — absence — is
 * not derivable from the attendance rows. A day with no row is only absent
 * relative to the contract's schedule, the holiday calendar and approved
 * leave, and the client holds none of those three. The server does.
 */
/** `GET /time-off/summary` — approved leave in a period, as payroll reads it. */
export interface LeaveSummary {
  employee_id: number;
  period_start: string;
  period_end: string;
  paid_leave_days: number;
  unpaid_leave_days: number;
  total_leave_days: number;
}

export interface AttendancePeriodOverview {
  employee_id: number | null;
  period_start: string;
  period_end: string;
  period_days: number;
  contract_days: number;
  days_with_records: number;
  absent_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  attendance_on_leave_days: number;
  present: number;
  late: number;
  overtime_days: number;
  missing_checkouts: number;
  manual_edits: number;
  worked_hours: DecimalString;
  overtime_hours: DecimalString;
  coverage_pct: number;
  present_pct: number;
  absence_policy: string;
}

export interface TimeOffOverview {
  approved_days: DecimalString;
  pending_requests: number;
  by_type: { time_off_type_id: number; name: string; days: DecimalString }[];
  low_balances: {
    employee_id: number;
    employee_name: string;
    type_name: string;
    remaining: DecimalString;
  }[];
}

export interface DashboardAlert {
  severity: WarningSeverity;
  code: WarningCode | string;
  message: string;
  entity_type: "payrun" | "payslip" | "employee" | "contract" | "attendance";
  entity_id: number;
}

export interface Dashboard {
  kpis: DashboardKpis;
  /** Null for `HR_MANAGER` — see `DashboardKpis`. */
  salary_cost_by_department: DepartmentSalaryCost[] | null;
  monthly_net_trend: MonthlyNetPoint[] | null;
  attendance_overview: AttendanceOverview;
  time_off_overview: TimeOffOverview;
  alerts: DashboardAlert[];
}

/* ────────────────────────────────────────────────────────────────────────
   WARNING PRESENTATION

   `code` is stable and `message` is already written for humans, so this map
   stays small on purpose: it adds only what the API cannot know — how loudly
   to say it, and what the user is supposed to *do*. Same discipline as
   `errors.ts::MESSAGES`.
   ──────────────────────────────────────────────────────────────────────── */

export const WARNING_META: Record<
  WarningCode,
  { severity: WarningSeverity; blocks: PayrollWarning["blocks"]; label: string }
> = {
  NO_ACTIVE_CONTRACT:     { severity: "ERROR",   blocks: "validate",  label: "No active contract" },
  NEGATIVE_NET:           { severity: "ERROR",   blocks: "validate",  label: "Negative net pay" },
  NO_STRUCTURE_RULES:     { severity: "ERROR",   blocks: "compute",   label: "Structure has no rules" },
  PAYSLIP_NOT_RECONCILED: { severity: "ERROR",   blocks: "validate",  label: "Payslip does not reconcile" },
  MISSING_BANK_DETAILS:   { severity: "WARNING", blocks: "mark-paid", label: "Missing bank details" },
  MULTI_CONTRACT_PERIOD:  { severity: "WARNING", blocks: null,        label: "Two contracts this period" },
  RULE_EVAL_FAILED:       { severity: "WARNING", blocks: null,        label: "Rule failed to evaluate" },
  RULE_FORWARD_REFERENCE: { severity: "WARNING", blocks: null,        label: "Rule references a later rule" },
  MISSING_CHECKOUT:       { severity: "WARNING", blocks: null,        label: "Missing check-out" },
  ATTENDANCE_ON_LEAVE_DAY:{ severity: "WARNING", blocks: null,        label: "Attendance on a leave day" },
  HIGH_ABSENCE:           { severity: "WARNING", blocks: null,        label: "High absence" },
  PRORATED_PERIOD:        { severity: "INFO",    blocks: null,        label: "Prorated period" },
  CONTRACT_EXPIRING:      { severity: "INFO",    blocks: null,        label: "Contract expiring" },
  RECOMPUTE_REQUIRED:     { severity: "INFO",    blocks: null,        label: "Recompute required" },
};

/** The one question the payrun cockpit asks constantly. */
export const blocksValidate = (w: PayrollWarning): boolean =>
  !w.is_resolved && w.severity === "ERROR";

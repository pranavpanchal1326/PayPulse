/**
 * THE PERMISSION MATRIX — a mirror of `backend/app/core/rbac.py`.
 *
 * The backend is the enforcer; this copy exists so the UI never *offers* an
 * action the API will refuse. Any drift is a bug in this file, not the server.
 *
 * Built the same way as the Python: each payroll role extends the one beneath
 * it, matching the brief's "all X permissions plus …" phrasing, so the two
 * cannot fall out of step through a copy-paste edit.
 */

export const ROLES = [
  "EMPLOYEE",
  "HR_MANAGER",
  "HR_PAYROLL_USER",
  "HR_PAYROLL_MANAGER",
  "ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = ["create", "read", "update", "delete", "approve"] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCES = [
  "employee", "department", "job_position", "working_schedule", "contract",
  "attendance", "time_off_type", "leave_allocation", "time_off_request",
  "salary_structure", "salary_rule", "payrun", "payslip", "dashboard", "user",
] as const;
export type Resource = (typeof RESOURCES)[number];

export type Scope = "ALL" | "OWN";
export interface Grant {
  actions: readonly Action[];
  scope: Scope;
}
type Matrix = Partial<Record<Resource, Grant>>;

const CRUD: Action[] = ["create", "read", "update", "delete"];
const CRUDA: Action[] = [...CRUD, "approve"];
const CRU: Action[] = ["create", "read", "update"];
const CR: Action[] = ["create", "read"];
const R: Action[] = ["read"];

const own = (actions: Action[]): Grant => ({ actions, scope: "OWN" });
const all = (actions: Action[]): Grant => ({ actions, scope: "ALL" });

/** "View own details, attendance and leave balances. No payroll or HR admin." */
const EMPLOYEE: Matrix = {
  employee: own(R),
  contract: own(R),
  attendance: own(CR),
  time_off_request: own(CR),
  leave_allocation: own(R),
  // Reference data an employee must read to file a request at all.
  working_schedule: all(R),
  time_off_type: all(R),
  department: all(R),
  job_position: all(R),
};

/** Full CRUD on HR modules, approves leave, deliberately no payroll keys. */
const HR_MANAGER: Matrix = {
  employee: all(CRUD),
  department: all(CRUD),
  job_position: all(CRUD),
  working_schedule: all(CRUD),
  contract: all(CRUD),
  attendance: all(CRUD),
  time_off_type: all(CRUD),
  time_off_request: all(CRUDA),
  leave_allocation: all(CRUDA),
};

const HR_PAYROLL_USER: Matrix = {
  ...HR_MANAGER,
  salary_structure: all(R),
  salary_rule: all(R),
  payrun: all(CRU),
  payslip: all(CRU),
  dashboard: all(R),
};

const HR_PAYROLL_MANAGER: Matrix = {
  ...HR_PAYROLL_USER,
  salary_structure: all(CRUD),
  salary_rule: all(CRUD),
  payrun: all(CRUD),
  payslip: all(CRUD),
};

const ADMIN: Matrix = Object.fromEntries(RESOURCES.map((r) => [r, all(CRUDA)]));

export const MATRIX: Record<Role, Matrix> = {
  EMPLOYEE,
  HR_MANAGER,
  HR_PAYROLL_USER,
  HR_PAYROLL_MANAGER,
  ADMIN,
};

/**
 * §6.1(b) — page 3 grants employees details, attendance and leave balances,
 * and no payroll access. It does not grant payslip viewing, so `/payslips`
 * stays closed to EMPLOYEE and email is the delivery channel.
 *
 * Flipping this to `true` makes "shouldn't employees see their payslips?" a
 * demo toggle rather than a rebuild. Ships OFF.
 */
export const EMPLOYEE_SELF_PAYSLIP = false;
if (EMPLOYEE_SELF_PAYSLIP) {
  MATRIX.EMPLOYEE.payslip = own(R);
}

export const grantFor = (role: Role, resource: Resource): Grant | undefined =>
  MATRIX[role]?.[resource];

export const can = (role: Role, resource: Resource, action: Action): boolean =>
  grantFor(role, resource)?.actions.includes(action) ?? false;

export const scopeFor = (role: Role, resource: Resource): Scope | undefined =>
  grantFor(role, resource)?.scope;

/** True when this role may only see rows belonging to its own employee record. */
export const isOwnScoped = (role: Role, resource: Resource): boolean =>
  scopeFor(role, resource) === "OWN";

/** Human labels — used in the shell and the permission-denied screen. */
export const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: "Employee",
  HR_MANAGER: "HR manager",
  HR_PAYROLL_USER: "Payroll executive",
  HR_PAYROLL_MANAGER: "Payroll manager",
  ADMIN: "Administrator",
};

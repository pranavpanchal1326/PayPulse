/**
 * DASHBOARD — one endpoint, one round-trip (PRD §5, spec B9).
 *
 * Every KPI here is computed from the same rows the detail screens show, and
 * the definitions are §5's, not invented: `total_net_paid` counts VALIDATED
 * and PAID payslips only, `attendance_health_pct` is present-and-accounted-for
 * over scheduled, `average_net_salary` divides by payslips rather than by
 * headcount. v1 named these KPIs without defining them, which is the fastest
 * way to lose trust in a dashboard — the first person to check the arithmetic
 * finds it disagrees with the list underneath.
 *
 * **The money fields are `null`, not zero**, for a role without payslip
 * access. A dashboard of zeroes reads as "the company paid nothing"; a
 * dashboard with the money *absent* reads as what it is. The UI is required to
 * render the second (PRD §6.1(a)).
 */
import { http } from "msw";
import type {
  Dashboard, DashboardAlert, DepartmentSalaryCost, MonthlyNetPoint, WarningSeverity,
} from "@/api/contract";
import { balancesFor } from "../derive";
import { byId, db } from "../db";
import { Refused, auth, ok, query, route, settle } from "../http";
import { OPEN_PERIOD } from "../seed/anchor";
import { addMonths, decimal, monthEnd, monthOf, monthStart } from "../seed/calendar";
import { paiseToString, toPaise } from "../seed/engine";

/** Counted towards money KPIs — a DRAFT payslip is a proposal, not a payment. */
const SETTLED = ["VALIDATED", "PAID"];

/** Below this many days remaining, a balance is worth surfacing. */
const LOW_BALANCE_DAYS = 2;

export const dashboardHandlers = [
  http.get(route("/dashboard"), async ({ request }) => {
    await settle();
    const user = auth(request, "dashboard", "read");
    if (user instanceof Refused) return user.response;

    const q = query(new URL(request.url));
    const start = q.get("period_start") ?? monthStart(OPEN_PERIOD);
    const end = q.get("period_end") ?? monthEnd(OPEN_PERIOD);
    const departmentId = q.num("department_id");
    const employeeType = q.get("employee_type");

    /**
     * The filters are applied to the *people*, then everything else follows
     * from that set. Filtering each collection independently is how a
     * dashboard ends up with a headcount that does not match its own payslip
     * count.
     */
    const inScope = db.employees.filter(
      (e) =>
        (departmentId === undefined || e.department_id === departmentId) &&
        (employeeType === undefined || e.employee_type === employeeType) &&
        e.date_of_joining <= end &&
        (e.date_of_exit === null || e.date_of_exit >= start),
    );
    const ids = new Set(inScope.map((e) => e.id));

    const payslips = db.payslips.filter(
      (p) =>
        ids.has(p.employee_id) &&
        p.period_start >= start &&
        p.period_end <= end &&
        SETTLED.includes(p.state),
    );

    const attendances = db.attendances.filter(
      (a) => ids.has(a.employee_id) && a.work_date >= start && a.work_date <= end,
    );

    const requests = db.timeOffRequests.filter(
      (r) => ids.has(r.employee_id) && r.date_to >= start && r.date_from <= end,
    );

    /* ── KPIs ──────────────────────────────────────────────────────── */

    const netPaise = payslips.reduce((sum, p) => sum + toPaise(Number(p.net)), 0);
    const approvedDays = requests
      .filter((r) => r.state === "APPROVED")
      .reduce((sum, r) => sum + Number(r.duration_days), 0);

    // "Accounted for" is present *or* excused: a day on approved leave is not
    // a hole in the coverage, and counting it as one punishes taking leave.
    const scheduledDays = payslips.reduce((sum, p) => sum + p.contract_days, 0);
    const accountedDays = payslips.reduce(
      (sum, p) => sum + p.contract_days - Number(p.absent_days),
      0,
    );
    const health = scheduledDays === 0 ? 100 : (accountedDays / scheduledDays) * 100;

    /* ── Salary cost by department ─────────────────────────────────── */

    const costByDepartment = new Map<number, DepartmentSalaryCost>();
    for (const slip of payslips) {
      const employee = byId(db.employees, slip.employee_id);
      const id = employee?.department_id ?? 0;
      const row = costByDepartment.get(id) ?? {
        department_id: id,
        department: employee?.department_name ?? "Unassigned",
        headcount: 0,
        total_gross: "0.00",
        total_net: "0.00",
      };
      row.headcount++;
      row.total_gross = paiseToString(toPaise(Number(row.total_gross)) + toPaise(Number(slip.gross)));
      row.total_net = paiseToString(toPaise(Number(row.total_net)) + toPaise(Number(slip.net)));
      costByDepartment.set(id, row);
    }

    /* ── Twelve months of net ──────────────────────────────────────── */

    /**
     * Sparse-tolerant by construction (PRD §5): the last twelve months are
     * enumerated and each is filled from whatever exists, so a month with no
     * payrun is a **gap in the line**, not a zero. A zero would draw a cliff
     * and invite a question about a payroll that never happened.
     */
    const lastMonth = monthOf(end);
    const trend: MonthlyNetPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const month = addMonths(lastMonth, -i);
      const slips = db.payslips.filter(
        (p) => ids.has(p.employee_id) && monthOf(p.period_end) === month && SETTLED.includes(p.state),
      );
      if (slips.length === 0) continue;
      trend.push({
        month,
        net: paiseToString(slips.reduce((sum, p) => sum + toPaise(Number(p.net)), 0)),
      });
    }

    /* ── Time off ──────────────────────────────────────────────────── */

    const byType = db.timeOffTypes
      .map((type) => ({
        time_off_type_id: type.id,
        name: type.name,
        days: decimal(
          requests
            .filter((r) => r.time_off_type_id === type.id && r.state === "APPROVED")
            .reduce((sum, r) => sum + Number(r.duration_days), 0),
        ),
      }))
      .filter((row) => Number(row.days) > 0);

    const lowBalances = inScope
      .flatMap((employee) =>
        balancesFor(employee.id)
          .filter((b) => Number(b.allocated) > 0 && Number(b.remaining) < LOW_BALANCE_DAYS)
          .map((b) => ({
            employee_id: employee.id,
            employee_name: employee.full_name,
            time_off_type_name: b.time_off_type_name,
            remaining: b.remaining,
          })),
      )
      .slice(0, 8);

    /* ── Alerts ────────────────────────────────────────────────────── */

    /**
     * Unresolved payroll warnings, loudest first, plus the standing
     * data-quality alert the payrun cannot fix for itself. Capped at ten: an
     * alert list nobody can finish reading is a list nobody reads.
     */
    const order: Record<WarningSeverity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
    const openRuns = new Set(
      db.payruns.filter((p) => !["PAID", "CANCELLED"].includes(p.state)).map((p) => p.id),
    );

    const alerts: DashboardAlert[] = db.payrollWarnings
      .filter((w) => !w.is_resolved && openRuns.has(w.payrun_id) && w.severity !== "INFO")
      .sort((a, b) => order[a.severity] - order[b.severity])
      .slice(0, 10)
      .map((w) => ({
        severity: w.severity,
        code: w.code,
        message: w.message,
        entity_type: w.payslip_id ? "payslip" : "payrun",
        entity_id: w.payslip_id ?? w.payrun_id,
      }));

    const missingBank = inScope.filter((e) => !e.bank_account && e.status === "ACTIVE").length;
    if (missingBank > 0 && alerts.length < 10) {
      alerts.push({
        severity: "WARNING",
        code: "MISSING_BANK_DETAILS",
        message: `${missingBank} active ${missingBank === 1 ? "employee has" : "employees have"} ` +
          `no bank details on file.`,
        entity_type: "employee",
        entity_id: inScope.find((e) => !e.bank_account)?.id ?? 0,
      });
    }

    /* ── The envelope ──────────────────────────────────────────────── */

    // One serialiser with a branch, not two endpoints — the two cannot drift.
    const seesMoney = user.role !== "HR_MANAGER";

    const dashboard: Dashboard = {
      kpis: {
        total_net_paid: seesMoney ? paiseToString(netPaise) : null,
        payslips_generated: payslips.length,
        average_net_salary: seesMoney
          ? paiseToString(payslips.length === 0 ? 0 : Math.round(netPaise / payslips.length))
          : null,
        approved_time_off_days: decimal(approvedDays),
        attendance_health_pct: decimal(Math.round(health * 10) / 10),
        headcount: inScope.filter((e) => e.status === "ACTIVE").length,
      },
      salary_cost_by_department: seesMoney
        ? [...costByDepartment.values()].sort((a, b) => Number(b.total_net) - Number(a.total_net))
        : null,
      monthly_net_trend: seesMoney ? trend : null,
      attendance_overview: {
        present: attendances.filter((a) => a.status === "PRESENT").length,
        late: attendances.filter((a) => a.status === "LATE").length,
        absent_days: decimal(payslips.reduce((sum, p) => sum + Number(p.absent_days), 0)),
        overtime_hours: decimal(
          Math.round(attendances.reduce((sum, a) => sum + Number(a.overtime_hours), 0) * 100) / 100,
        ),
        missing_checkouts: attendances.filter((a) => a.status === "MISSING_CHECKOUT").length,
        manual_edits: attendances.filter((a) => a.is_manual_edit).length,
        coverage_pct: decimal(Math.round(health * 10) / 10),
      },
      time_off_overview: {
        approved_days: decimal(approvedDays),
        pending_requests: requests.filter((r) => r.state === "TO_APPROVE").length,
        by_type: byType,
        low_balances: lowBalances,
      },
      alerts,
    };

    return ok(dashboard);
  }),
];

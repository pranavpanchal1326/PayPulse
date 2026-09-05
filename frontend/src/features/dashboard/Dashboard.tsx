/**
 * S18 · THE DASHBOARD — a command centre, not a KPI grid.
 *
 * §12 S18 is specific, and each part of it is a decision:
 *
 * **Five figures, each openable into its own derivation.** A dashboard number
 * you cannot interrogate is a claim, and this product's whole argument is that
 * a claim should open. Every figure here builds a `ProvenanceNode` and hands
 * it to the same drawer the payslip uses — not a similar one.
 *
 * **One call, one moment in time.** `/dashboard` returns the KPIs, both
 * charts, the attendance and time-off overviews and the alerts together (PRD
 * §5). Six calls would be six different instants, and a headcount that
 * disagreed with its own payslip count is exactly how a dashboard stops being
 * believed.
 *
 * **The alerts reuse the cockpit's warning cards.** Deliberately, and the
 * blueprint says why: identical language in both places. A `MISSING_BANK_
 * DETAILS` that reads one way here and another way in S16 is two facts as far
 * as the reader is concerned.
 *
 * **`HR_MANAGER` gets the money-free variant.** The API sends `null` for every
 * money field for that role, and the layout has to look *composed* without
 * them — not like a page with holes in it. So the money cells are replaced by
 * the two figures that role does own (attendance health and approved leave)
 * rather than left as gaps, and the salary chart is replaced by an explanation
 * rather than an empty frame.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Dashboard as DashboardData, DashboardAlert } from "@/api/contract";
import { WARNING_META } from "@/api/contract";
import { money } from "@/api/money";
import { useQuery } from "@/api/useQuery";
import { PageHeader } from "@/app/Shell";
import {
  EmptyState, Select, Skeleton, WarningCard, Well, cx,
} from "@/components/system";
import { Bars, Trend } from "@/components/charts";
import {
  ProvenanceDrawer, RollingCount, RollingNumber, type ProvenanceNode,
} from "@/components/signature";
import { openPeriod } from "@/lib/clock";
import { addMonths, monthEnd, monthLabel, monthStart } from "@/lib/date";
import { LoadFailure, decimalLabel, formatDate, useFilterParams } from "@/features/shared";
import { getDashboard, listDepartments } from "./api";

export function Dashboard() {
  const filters = useFilterParams();

  /**
   * **The default is the last *settled* period, not the open one.** The
   * dashboard counts validated and paid payslips (PRD §5), and the open period
   * is by definition the one still being computed — so landing on it shows a
   * screen of zeroes that is arithmetically correct and completely useless.
   * A reports screen opens on the last month that was actually paid.
   */
  const period = filters.get("period") ?? addMonths(openPeriod(), -1);
  const departmentId = filters.num("department_id");

  const [tree, setTree] = useState<ProvenanceNode | null>(null);

  const dashboard = useQuery(
    () =>
      getDashboard({
        period_start: monthStart(period),
        period_end: monthEnd(period),
        department_id: departmentId,
      }),
    [period, departmentId],
  );
  const departments = useQuery(() => listDepartments(), []);

  const data = dashboard.data;
  /** The role's own boundary, read from the payload rather than from the role. */
  const moneyFree = data !== undefined && data.kpis.total_net_paid === null;

  const departmentName = departments.data?.find((d) => d.id === departmentId)?.name;

  const figures = useMemo(() => (data ? figuresFor(data, period, moneyFree) : []), [
    data, period, moneyFree,
  ]);

  return (
    <>
      <PageHeader
        title="Reports"
        meta={
          dashboard.state === "ready"
            ? `${monthLabel(period)}${departmentName ? ` · ${departmentName}` : " · every department"} · ${data?.kpis.headcount ?? 0} people`
            : "Loading…"
        }
      />

      <div className="pp-filters">
        <Select
          label="Period"
          className="pp-filters__field"
          value={period}
          onChange={(e) => filters.set("period", e.target.value)}
          options={Array.from({ length: 14 }, (_, i) => addMonths(openPeriod(), 1 - i)).map((m) => ({
            value: m,
            label: monthLabel(m) + (m === openPeriod() ? " · open" : ""),
          }))}
        />
        <Select
          label="Department"
          className="pp-filters__field"
          value={departmentId === undefined ? "" : String(departmentId)}
          onChange={(e) => filters.set("department_id", e.target.value)}
          options={[
            { value: "", label: "Every department" },
            ...(departments.data ?? []).map((d) => ({
              value: String(d.id),
              label: d.name,
            })),
          ]}
        />
        <span className="pp-filters__count t-ui-sm">
          {formatDate(monthStart(period))} → {formatDate(monthEnd(period))}
        </span>
      </div>

      {dashboard.state === "error" ? (
        <LoadFailure what="The dashboard" error={dashboard.error} onRetry={dashboard.reload} />
      ) : dashboard.initial || !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {moneyFree && (
            <p className="t-ui-sm pp-dash__rolenote">
              Your role covers people and time, not pay. The salary figures and
              the cost chart are not included — everything else on this page is
              the full picture for {monthLabel(period)}.
            </p>
          )}

          {/* Five figures. Each opens. */}
          <div className="pp-dash__figures">
            {figures.map((figure) => (
              <button
                key={figure.label}
                type="button"
                className="pp-dash__figure focusable"
                onClick={() => setTree(figure.node)}
                title="Why this number?"
              >
                <span className="t-micro pp-dash__figurelabel">{figure.label}</span>
                {figure.money ? (
                  <RollingNumber value={figure.amount} scale="l" label={figure.label} />
                ) : (
                  <RollingCount value={figure.count} scale="l" label={figure.label} />
                )}
                <span className="t-ui-sm pp-dash__figuresupport">{figure.support}</span>
              </button>
            ))}
          </div>

          <div className="pp-dash__grid">
            {/* Salary by department — cobalt bars, one hue. */}
            <Panel
              title="Salary cost by department"
              note={moneyFree ? undefined : "Net paid in this period."}
            >
              {moneyFree ? (
                <EmptyState
                  title="Not included for your role"
                  body="Salary cost is a payroll figure. Headcount by department is on the People screen, which your role does cover."
                  action={
                    <Link to="/people" className="focusable t-ui-sm">
                      Open People →
                    </Link>
                  }
                />
              ) : (
                <Bars
                  data={(data.salary_cost_by_department ?? []).map((row) => ({
                    label: row.department,
                    value: Number(row.total_net),
                    display: `₹${Number(row.total_net).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
                    meta: `· ${row.headcount}`,
                  }))}
                  emptyLabel="NO PAYROLL DATA FOR THIS PERIOD"
                />
              )}
            </Panel>

            {/* Monthly net trend — 12 months, sparse-tolerant. */}
            <Panel
              title="Monthly net"
              note={moneyFree ? undefined : "Twelve months, whatever exists."}
            >
              {moneyFree ? (
                <EmptyState
                  title="Not included for your role"
                  body="The net trend is payroll history."
                />
              ) : (
                <Trend
                  points={(data.monthly_net_trend ?? []).map((point) => ({
                    key: point.month,
                    label: monthLabel(point.month).split(" ")[0].slice(0, 3),
                    value: Number(point.net),
                    display: `₹${Number(point.net).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
                  }))}
                />
              )}
            </Panel>

            <Panel title="Attendance" note="How much of the schedule is accounted for.">
              <Bars
                max={100}
                data={[
                  {
                    label: "Coverage",
                    value: Number(data.attendance_overview.coverage_pct),
                    display: `${decimalLabel(data.attendance_overview.coverage_pct)}%`,
                  },
                ]}
              />
              <dl className="pp-dash__stats">
                <Stat k="Present" v={data.attendance_overview.present} />
                <Stat k="Late" v={data.attendance_overview.late} tone="orange" />
                <Stat k="Absent days" v={decimalLabel(data.attendance_overview.absent_days)} />
                <Stat k="Overtime hours" v={decimalLabel(data.attendance_overview.overtime_hours)} tone="cobalt" />
                <Stat
                  k="Missing check-outs"
                  v={data.attendance_overview.missing_checkouts}
                  tone={data.attendance_overview.missing_checkouts > 0 ? "vermilion" : undefined}
                  to="/time?status=MISSING_CHECKOUT"
                />
                <Stat k="Manual edits" v={data.attendance_overview.manual_edits} />
              </dl>
            </Panel>

            <Panel title="Time off" note="Approved days in this period, by type.">
              <Bars
                data={data.time_off_overview.by_type.map((row) => ({
                  label: row.name,
                  value: Number(row.days),
                  display: decimalLabel(row.days),
                }))}
                emptyLabel="NO LEAVE TAKEN IN THIS PERIOD"
              />
              {data.time_off_overview.low_balances.length > 0 && (
                <div className="pp-dash__low">
                  <p className="t-micro">RUNNING LOW</p>
                  <ul>
                    {data.time_off_overview.low_balances.slice(0, 5).map((row) => (
                      <li key={`${row.employee_id}-${row.type_name}`} className="t-ui-sm">
                        <Link to={`/leave/balances?employee_id=${row.employee_id}`} className="focusable">
                          {row.employee_name}
                        </Link>{" "}
                        · {row.type_name} · {decimalLabel(row.remaining)} left
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.time_off_overview.pending_requests > 0 && (
                <p className="t-ui-sm pp-dash__pending">
                  <Link to="/leave?state=TO_APPROVE" className="focusable">
                    {data.time_off_overview.pending_requests} requests awaiting a decision
                  </Link>
                </p>
              )}
            </Panel>
          </div>

          {/* The same cards as S16 — identical language in both places. */}
          <section className="pp-dash__alerts" aria-label="Alerts">
            <h2 className="t-h3" style={{ margin: "0 0 var(--s-3)" }}>Alerts</h2>
            {data.alerts.length === 0 ? (
              <Well style={{ padding: "var(--s-5)" }}>
                <EmptyState
                  title="Nothing needs attention"
                  body="No blocking errors, no missing bank details, and no payslip that fails its own reconciliation."
                />
              </Well>
            ) : (
              <div className="pp-dash__alertlist">
                {data.alerts.map((alert, index) => (
                  <AlertCard key={`${alert.code}-${alert.entity_id}-${index}`} alert={alert} index={index} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ProvenanceDrawer
        open={tree !== null}
        onClose={() => setTree(null)}
        tree={tree}
        subject={`${monthLabel(period)}${departmentName ? ` · ${departmentName}` : ""}`}
      />
    </>
  );
}

/* ── The five figures, and their derivations ──────────────────────────── */

interface Figure {
  label: string;
  support: string;
  money: boolean;
  amount: ReturnType<typeof money>;
  count: number;
  node: ProvenanceNode;
}

/**
 * Each figure carries the tree that explains it. They are built here rather
 * than in the drawer for the same reason `provenance.ts` builds the payslip's:
 * §10.3 says the drawer must not know what it is explaining.
 */
function figuresFor(data: DashboardData, period: string, moneyFree: boolean): Figure[] {
  const k = data.kpis;
  const zero = money("0.00");

  const paid: Figure = {
    label: "TOTAL NET PAID",
    support: "Across every validated and paid payslip in the period.",
    money: true,
    amount: k.total_net_paid ? money(k.total_net_paid) : zero,
    count: 0,
    node: {
      id: "kpi-net",
      label: "Total net paid",
      code: "NET",
      amount: k.total_net_paid ? money(k.total_net_paid) : zero,
      formula: "sum(payslip.net) over settled payslips in the period",
      inputs: [
        { label: "payslips", value: String(k.payslips_generated) },
        { label: "period", value: monthLabel(period) },
        { label: "average", value: k.average_net_salary ?? "—" },
      ],
      children: [
        {
          id: "kpi-net-avg",
          label: "Average net salary",
          amount: k.average_net_salary ? money(k.average_net_salary) : zero,
          formula: "total_net_paid / payslips_generated",
          inputs: [{ label: "payslips_generated", value: String(k.payslips_generated) }],
        },
      ],
    },
  };

  const slips: Figure = {
    label: "PAYSLIPS",
    support: "Validated or paid. Draft payslips are not counted.",
    money: false,
    amount: zero,
    count: k.payslips_generated,
    node: {
      id: "kpi-slips",
      label: "Payslips generated",
      amount: null,
      formula: "count(payslip) where state in (VALIDATED, PAID)",
      inputs: [
        { label: "headcount", value: String(k.headcount) },
        { label: "period", value: monthLabel(period) },
      ],
      source: { kind: "employee", id: 0, label: "Open the payruns for this period", href: "/payroll" },
    },
  };

  const average: Figure = {
    label: "AVERAGE NET",
    support: "Per payslip, not per person on the payroll.",
    money: true,
    amount: k.average_net_salary ? money(k.average_net_salary) : zero,
    count: 0,
    node: {
      id: "kpi-avg",
      label: "Average net salary",
      amount: k.average_net_salary ? money(k.average_net_salary) : zero,
      formula: "total_net_paid / payslips_generated",
      inputs: [
        { label: "total_net_paid", value: k.total_net_paid ?? "—" },
        { label: "payslips_generated", value: String(k.payslips_generated) },
      ],
    },
  };

  const headcount: Figure = {
    label: "HEADCOUNT",
    support: "Employed for at least part of the period.",
    money: false,
    amount: zero,
    count: k.headcount,
    node: {
      id: "kpi-head",
      label: "Headcount",
      amount: null,
      formula: "count(employee) joined on or before the period end, not exited before its start",
      inputs: [{ label: "period", value: monthLabel(period) }],
      source: { kind: "employee", id: 0, label: "Open the directory", href: "/people" },
    },
  };

  const leave: Figure = {
    label: "APPROVED LEAVE",
    support: "Working days, not calendar days.",
    money: false,
    amount: zero,
    count: Math.round(Number(k.approved_time_off_days)),
    node: {
      id: "kpi-leave",
      label: "Approved time off",
      amount: null,
      formula: "sum(request.duration_days) where state = APPROVED and the request overlaps the period",
      inputs: [
        { label: "days", value: decimalLabel(k.approved_time_off_days) },
        { label: "pending requests", value: String(data.time_off_overview.pending_requests) },
      ],
      source: { kind: "leave", id: 0, label: "Open the request queue", href: "/leave" },
    },
  };

  const health: Figure = {
    label: "ATTENDANCE HEALTH",
    support: "Share of scheduled days present or excused.",
    money: false,
    amount: zero,
    count: Math.round(Number(k.attendance_health_pct)),
    node: {
      id: "kpi-health",
      label: "Attendance health",
      amount: null,
      formula: "(contract_days − absent_days) / contract_days, across the period's payslips",
      inputs: [
        { label: "coverage", value: `${decimalLabel(data.attendance_overview.coverage_pct)}%` },
        { label: "absent days", value: decimalLabel(data.attendance_overview.absent_days) },
        { label: "missing check-outs", value: String(data.attendance_overview.missing_checkouts) },
      ],
      source: { kind: "attendance", id: 0, label: "Open attendance", href: "/time" },
    },
  };

  /**
   * Five, either way. Removing two money figures and leaving three would make
   * a row designed for five look broken, which §12 S18 names as the failure
   * to avoid — so the money-free variant promotes the two figures that role
   * does own into the empty places.
   */
  return moneyFree
    ? [headcount, slips, leave, health, {
        ...slips,
        label: "PENDING REQUESTS",
        support: "Waiting on a decision from a manager.",
        count: data.time_off_overview.pending_requests,
        node: {
          id: "kpi-pending",
          label: "Pending requests",
          amount: null,
          formula: "count(request) where state = TO_APPROVE",
          source: { kind: "leave", id: 0, label: "Open the request queue", href: "/leave" },
        },
      }]
    : [paid, slips, average, headcount, health];
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pp-dash__panel" aria-label={title}>
      <header className="pp-dash__panelhead">
        <h2 className="t-h3" style={{ margin: 0 }}>{title}</h2>
        {note && <p className="t-micro">{note}</p>}
      </header>
      <div className="pp-dash__panelbody">{children}</div>
    </section>
  );
}

function Stat({
  k,
  v,
  tone,
  to,
}: {
  k: string;
  v: string | number;
  tone?: "orange" | "cobalt" | "vermilion";
  to?: string;
}) {
  const value = (
    <span className={cx("pp-dash__statv n-mono", tone && `pp-dash__statv--${tone}`)}>{v}</span>
  );
  return (
    <div className="pp-dash__stat">
      <dt className="t-micro">{k.toUpperCase()}</dt>
      <dd>{to ? <Link to={to} className="focusable">{value}</Link> : value}</dd>
    </div>
  );
}

function AlertCard({ alert, index }: { alert: DashboardAlert; index: number }) {
  const meta = WARNING_META[alert.code as keyof typeof WARNING_META];
  const blocks =
    meta?.blocks === "validate"
      ? "Blocks validation of its payrun."
      : meta?.blocks === "mark-paid"
        ? "Blocks payment unless released with a written reason."
        : meta?.blocks === "compute"
          ? "Blocks computation."
          : "Informational. It blocks nothing.";

  return (
    <WarningCard
      index={index}
      severity={alert.severity.toLowerCase() as "error" | "warning" | "info"}
      code={alert.code}
      detail={alert.message}
      blocks={blocks}
      action={
        <Link
          to={hrefFor(alert)}
          className="focusable t-ui-sm"
          style={{ whiteSpace: "nowrap" }}
        >
          Open →
        </Link>
      }
    />
  );
}

function hrefFor(alert: DashboardAlert): string {
  switch (alert.entity_type) {
    case "payrun": return `/payroll/${alert.entity_id}`;
    case "payslip": return `/payroll/payslips/${alert.entity_id}`;
    case "employee": return `/people/${alert.entity_id}`;
    case "contract": return `/contracts/${alert.entity_id}`;
    case "attendance": return "/time";
    default: return "/payroll";
  }
}

function DashboardSkeleton() {
  return (
    <>
      <div className="pp-dash__figures">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="pp-dash__figure" key={i}>
            <Skeleton width="60%" />
            <Skeleton width="80%" />
          </div>
        ))}
      </div>
      <div className="pp-dash__grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="pp-dash__panel" key={i}>
            <Skeleton width="40%" />
            <Skeleton width="100%" />
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * S6 · ATTENDANCE
 *
 * The densest screen in the product and the one that has to stay quick: three
 * thousand fixture rows, 36px compact rows, virtualised by `<Table>` from P1.
 *
 * **A missing check-out is the screen's headline, not a status.** It is the
 * one attendance defect with a payroll consequence — the row stands with zero
 * worked hours, so the day counts as attended and pays nothing — and PRD §4.9
 * raises `MISSING_CHECKOUT` for it during a payrun. Making somebody find that
 * out at validate time would be the product failing at its own promise, so
 * the count sits in the header, the strip marks the day, the chip is
 * vermilion, and the row says what it costs.
 *
 * **The role decides what the screen offers, not what it disables.** §11:
 * `EMPLOYEE` has create and read on attendance and no update, so an employee
 * sees Check in / Check out and *no correction affordance at all* — not a
 * greyed one. A disabled control that a role can never enable is an
 * advertisement for a permission you do not have.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, LogIn, LogOut, Pencil, Plus } from "lucide-react";
import type { Attendance as Row, WorkingSchedule } from "@/api/contract";
import { ATTENDANCE_STATUSES } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Badge, Button, EmptyState, Select, StateChip, Table, Tooltip, WarningCard, cx, useToast,
  type Column,
} from "@/components/system";
import { RollingCount } from "@/components/signature";
import { addMonths, monthEnd, monthLabel, monthOf, monthStart } from "@/mocks/seed/calendar";
import { ANCHOR_TODAY, OPEN_PERIOD } from "@/mocks/seed/anchor";
import {
  LoadFailure, clockOf, decimalLabel, formatDate, useFilterParams,
} from "@/features/shared";
import { checkIn, checkOut, listAllAttendance, listEmployees } from "./api";
import { listSchedules } from "@/features/contracts/api";
import { MonthStrip } from "./MonthStrip";
import { Correction } from "./Correction";
import { NewAttendance } from "./NewAttendance";

/**
 * **The screen opens on the last month that has rows, not on today.**
 *
 * The fixtures are anchored: `ANCHOR_TODAY` is the fifth of September and
 * attendance runs to the end of August, because payroll runs in arrears and
 * the open period is the month that has just closed. Opening on the calendar
 * month would show an empty register on first load — correct arithmetic, and
 * indistinguishable from a broken screen.
 */
const DEFAULT_MONTH = OPEN_PERIOD;

export function Attendance() {
  const { user, can } = useAuth();
  const toast = useToast();
  const filters = useFilterParams();

  const month = filters.get("month") ?? DEFAULT_MONTH;
  const employeeId = filters.num("employee_id");
  const status = filters.get("status");
  const day = filters.get("day");

  const [correcting, setCorrecting] = useState<Row>();
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const rows = useQuery(
    () =>
      listAllAttendance({
        employee_id: employeeId,
        date_from: monthStart(month),
        date_to: monthEnd(month),
        status: status as Row["status"],
      }),
    [month, employeeId, status],
  );
  const employees = useQuery(() => listEmployees(), []);
  const schedules = useQuery(() => listSchedules(), []);

  const all = rows.data ?? [];
  const shown = useMemo(() => (day ? all.filter((r) => r.work_date === day) : all), [all, day]);

  /** A day the strip selected can stop existing when the month changes. */
  useEffect(() => {
    if (day && monthOf(day) !== month) filters.set("day", undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, day]);

  const missing = all.filter((r) => r.status === "MISSING_CHECKOUT").length;
  const manual = all.filter((r) => r.is_manual_edit).length;
  const overtime = all.reduce((sum, r) => sum + Number(r.overtime_hours), 0);

  const editable = can("attendance", "update");
  const isEmployee = user?.role === "EMPLOYEE";

  /** Overtime past this is the schedule's, per employee. Defaults to eight. */
  const dailyHoursFor = (row: Row | undefined): number => {
    if (!row) return 8;
    const person = employees.data?.items.find((e) => e.id === row.employee_id);
    const schedule: WorkingSchedule | undefined = schedules.data?.items.find(
      (s) => s.id === person?.working_schedule_id,
    );
    return schedule ? Number(schedule.daily_hours) : 8;
  };

  async function punch(kind: "in" | "out") {
    setActionError(undefined);
    try {
      if (kind === "in") await checkIn({});
      else await checkOut({});
      toast(kind === "in" ? "Checked in." : "Checked out.", "jade");
      rows.reload();
    } catch (cause) {
      // A 409 here is "you are already checked in" or "there is nothing open"
      // — a state fact, not a failure, and it belongs on screen next to the
      // buttons that produced it rather than in a toast that leaves.
      setActionError(cause instanceof ApiError ? cause.message : "That did not work.");
    }
  }

  const columns: Column<Row>[] = useMemo(
    () => [
      {
        id: "date",
        header: "Date",
        accessorFn: (r) => r.work_date,
        cell: ({ row }) => (
          <span style={{ whiteSpace: "nowrap" }}>{formatDate(row.original.work_date)}</span>
        ),
      },
      {
        id: "employee",
        header: "Employee",
        accessorFn: (r) => r.employee_name,
        cell: ({ row }) => (
          <Link
            to={`/people/${row.original.employee_id}`}
            className="focusable"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.employee_name}
          </Link>
        ),
      },
      { id: "in", header: "In", accessorFn: (r) => clockOf(r.check_in), meta: { numeric: true } },
      {
        id: "out",
        header: "Out",
        accessorFn: (r) => r.check_out ?? "",
        meta: { numeric: true },
        cell: ({ row }) =>
          row.original.check_out ? (
            clockOf(row.original.check_out)
          ) : (
            /* Visible at a glance, and it says what it costs. */
            <Tooltip label="No check-out: this day is worth zero worked hours to payroll, and raises MISSING_CHECKOUT on the payrun.">
              <span className="pp-att__missing t-ui-sm">
                <AlertTriangle size={13} aria-hidden="true" /> none
              </span>
            </Tooltip>
          ),
      },
      {
        id: "break",
        header: "Break",
        accessorFn: (r) => r.break_minutes,
        meta: { numeric: true },
        cell: ({ row }) => `${row.original.break_minutes}m`,
      },
      {
        id: "worked",
        header: "Worked",
        accessorFn: (r) => Number(r.worked_hours),
        meta: { numeric: true },
        cell: ({ row }) => decimalLabel(row.original.worked_hours),
      },
      {
        id: "overtime",
        header: "Overtime",
        accessorFn: (r) => Number(r.overtime_hours),
        meta: { numeric: true },
        cell: ({ row }) =>
          Number(row.original.overtime_hours) > 0 ? (
            <span className="pp-att__ot">+{decimalLabel(row.original.overtime_hours)}</span>
          ) : (
            <span style={{ color: "var(--ink-300)" }}>—</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.status,
        cell: ({ row }) => <AttendanceChip status={row.original.status} />,
      },
      {
        id: "edited",
        header: "Edited",
        accessorFn: (r) => (r.is_manual_edit ? 1 : 0),
        cell: ({ row }) =>
          row.original.is_manual_edit ? (
            /* Permanent, per PRD §3.4 — and it carries its reason. */
            <Tooltip label={row.original.edit_reason ?? "Manually corrected."}>
              <Badge tone="orange">EDITED</Badge>
            </Tooltip>
          ) : (
            <span style={{ color: "var(--ink-300)" }}>—</span>
          ),
      },
      ...(editable
        ? [
            {
              id: "actions",
              header: "",
              enableSorting: false,
              cell: ({ row }: { row: { original: Row } }) => (
                <span className="pp-row-actions">
                  <Button
                    size="sm"
                    variant="quiet"
                    icon={<Pencil size={14} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCorrecting(row.original);
                    }}
                  >
                    Correct
                  </Button>
                </span>
              ),
            } as Column<Row>,
          ]
        : []),
    ],
    [editable],
  );

  const filtered = employeeId !== undefined || status !== undefined || day !== undefined;

  return (
    <>
      <PageHeader
        title={isEmployee ? "My time" : "Attendance"}
        meta={
          rows.state === "ready"
            ? `${shown.length} ${shown.length === 1 ? "row" : "rows"} in ${monthLabel(month)}${day ? ` · ${formatDate(day)}` : ""}`
            : "Loading attendance…"
        }
        action={
          <div className="pp-form__row">
            {can("attendance", "create") && isEmployee && (
              <>
                <Button size="md" variant="secondary" icon={<LogIn size={16} />} onClick={() => punch("in")}>
                  Check in
                </Button>
                <Button size="md" variant="primary" icon={<LogOut size={16} />} onClick={() => punch("out")}>
                  Check out
                </Button>
              </>
            )}
            {can("attendance", "create") && !isEmployee && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
                Add a row
              </Button>
            )}
          </div>
        }
      />

      {actionError && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="warning"
            code="punch_refused"
            detail={actionError}
            blocks="Nothing was recorded."
            action={<Button size="sm" variant="quiet" onClick={() => setActionError(undefined)}>Dismiss</Button>}
          />
        </div>
      )}

      {/* Three figures that answer "is this month clean?" before the table is
          read at all. Missing check-outs lead, because they are the one thing
          here that a payrun will refuse to ignore. */}
      <div className="pp-att__figures">
        <Figure
          label="MISSING CHECK-OUTS"
          value={missing}
          tone={missing > 0 ? "warn" : "calm"}
          support={
            missing > 0
              ? "Each one pays zero hours for a day that was attended."
              : "Every row in this month is closed."
          }
          loading={rows.initial}
        />
        <Figure
          label="OVERTIME HOURS"
          value={Math.round(overtime)}
          tone="calm"
          support="Above the schedule's daily hours."
          loading={rows.initial}
        />
        <Figure
          label="MANUAL EDITS"
          value={manual}
          tone="calm"
          support="Corrections carry a reason and stay marked."
          loading={rows.initial}
        />
      </div>

      <div className="pp-filters">
        <Select
          label="Month"
          className="pp-filters__field"
          value={month}
          onChange={(e) => filters.set("month", e.target.value)}
          options={monthOptions(monthOf(ANCHOR_TODAY))}
        />
        {!isEmployee && (
          <Select
            label="Employee"
            className="pp-filters__field"
            value={employeeId === undefined ? "" : String(employeeId)}
            onChange={(e) => filters.set("employee_id", e.target.value)}
            options={[
              { value: "", label: "Everyone" },
              ...(employees.data?.items ?? []).map((e) => ({
                value: String(e.id),
                label: e.full_name,
              })),
            ]}
          />
        )}
        <Select
          label="Status"
          className="pp-filters__field"
          value={status ?? ""}
          onChange={(e) => filters.set("status", e.target.value)}
          options={[
            { value: "", label: "Any status" },
            ...ATTENDANCE_STATUSES.map((s) => ({
              value: s,
              label: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " "),
            })),
          ]}
        />
        {filtered && (
          <Button size="sm" variant="quiet" className="pp-filters__view" onClick={filters.clear}>
            Clear filters
          </Button>
        )}
      </div>

      {rows.state === "error" ? (
        <LoadFailure what="This month's attendance" error={rows.error} onRetry={rows.reload} />
      ) : (
        <>
          <MonthStrip
            month={month}
            rows={all}
            selected={day}
            onSelect={(d) => filters.set("day", d)}
          />

          <Table
            caption={`Attendance for ${monthLabel(month)}`}
            data={shown}
            columns={columns}
            density="compact"
            getRowId={(r) => String(r.id)}
            loading={rows.initial}
            maxHeight={620}
            empty={
              filtered ? (
                <EmptyState
                  title="Nothing matches that"
                  body="This month has rows — that combination of day, person and status has none."
                  action={<Button variant="quiet" onClick={filters.clear}>Clear filters</Button>}
                />
              ) : (
                <EmptyState
                  title={`No attendance in ${monthLabel(month)}`}
                  body="A day with no row is an absent day: payroll counts it as unpaid rather than assuming it was worked. Pick another month, or record what happened."
                />
              )
            }
          />
        </>
      )}

      {editable && (
        <Correction
          row={correcting}
          dailyHours={dailyHoursFor(correcting)}
          onClose={() => setCorrecting(undefined)}
          onSaved={() => rows.reload()}
        />
      )}

      <NewAttendance
        open={adding}
        employees={employees.data?.items ?? []}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          rows.reload();
        }}
      />
    </>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

/**
 * `MISSING_CHECKOUT` is not a lifecycle state, so it is not a `StateChip` —
 * it is a defect, and it takes the colour every other blocking defect in this
 * product takes.
 */
function AttendanceChip({ status }: { status: Row["status"] }) {
  if (status === "MISSING_CHECKOUT") return <Badge tone="vermilion">MISSING OUT</Badge>;
  if (status === "LATE") return <Badge tone="orange">LATE</Badge>;
  if (status === "OVERTIME") return <Badge tone="cobalt">OVERTIME</Badge>;
  return <StateChip state="ACTIVE" />;
}

function Figure({
  label,
  value,
  support,
  tone,
  loading,
}: {
  label: string;
  value: number;
  support: string;
  tone: "calm" | "warn";
  loading: boolean;
}) {
  return (
    <section className={cx("pp-att__figure", tone === "warn" && value > 0 && "pp-att__figure--warn")}>
      <p className="t-micro pp-att__figure-label">{label}</p>
      {loading ? (
        <span className="pp-skel" style={{ width: 48 }} aria-hidden="true" />
      ) : (
        <RollingCount value={value} scale="l" label={label.toLowerCase()} />
      )}
      <p className="t-ui-sm pp-att__figure-support">{support}</p>
    </section>
  );
}

/** Twelve months back from the anchor — the span the fixtures actually cover. */
function monthOptions(from: string): Array<{ value: string; label: string }> {
  return Array.from({ length: 13 }, (_, i) => addMonths(from, -i)).map((m) => ({
    value: m,
    label: monthLabel(m),
  }));
}

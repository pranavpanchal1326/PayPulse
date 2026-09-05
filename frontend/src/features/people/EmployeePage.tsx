/**
 * S3 · THE EMPLOYEE PAGE — the operational hub.
 *
 * Two things define this screen.
 *
 * **One summary call.** The four wells — CONTRACT · TIME · LEAVE · PAYROLL —
 * are filled by `/employees/{id}/summary` (PRD §5 ★), not by five list calls
 * counting their own results. Five round-trips would be visible on stage, and
 * worse, each one would be a different moment in time.
 *
 * **THE LINE is real.** Its bands come from this person's contracts and its
 * ticks from their attendance rows. Nothing here is drawn from a shape that
 * looks plausible: a day with no row produces no tick, which is why the gaps
 * mean something (§10.1).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, Clock, FileSignature, Pencil, Wallet } from "lucide-react";
import type { Employee } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import { Button, EmptyState, Skeleton, StateChip, Well } from "@/components/system";
import { Line, RollingCount, buildLineModel } from "@/components/signature";
import {
  getEmployee, getEmployeeSummary, listAttendanceFor, listContractsFor, listDepartments,
  listEmployees, listJobPositions, listSchedules,
} from "./api";
import { EmployeeForm } from "./EmployeeForm";
import { Avatar, LoadFailure, Pair, formatDate, humanise, jobLineOf } from "@/features/shared";

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * THE LINE's window. It ends the day the person left, or today — drawing an
 * empty future for somebody who has gone is a lie about their record — and
 * starts a year before that, never earlier than the day they joined.
 */
function windowFor(employee: Employee): { from: string; to: string } {
  const today = iso(new Date());
  const to = employee.date_of_exit && employee.date_of_exit < today ? employee.date_of_exit : today;
  const yearBack = new Date(to);
  yearBack.setUTCFullYear(yearBack.getUTCFullYear() - 1);
  const from = iso(yearBack) < employee.date_of_joining ? employee.date_of_joining : iso(yearBack);
  return { from, to };
}

export function EmployeePage({ id, self }: { id: number; self?: boolean }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [bead, setBead] = useState<string>(iso(new Date()));

  const employee = useQuery(() => getEmployee(id), [id]);
  const summary = useQuery(() => getEmployeeSummary(id), [id]);
  const person = employee.data;

  const span = person ? windowFor(person) : null;
  const contracts = useQuery(() => listContractsFor(id), [id]);
  const attendance = useQuery(
    () => (span ? listAttendanceFor(id, span.from, span.to) : Promise.resolve([])),
    [id, span?.from, span?.to],
  );

  // Only fetched for the edit drawer, and only by someone who can open it.
  const editable = can("employee", "update") && !self;
  const departments = useQuery(() => (editable ? listDepartments() : Promise.resolve(null)), [editable]);
  const positions = useQuery(() => (editable ? listJobPositions() : Promise.resolve(null)), [editable]);
  const schedules = useQuery(() => (editable ? listSchedules() : Promise.resolve(null)), [editable]);
  // Managers are just employees. Fetched only when the drawer can open, so a
  // read-only visit to this page stays at three calls.
  const managers = useQuery(() => (editable ? listEmployees({}) : Promise.resolve(null)), [editable]);

  /**
   * The bead starts on today, which is outside the window for anybody who has
   * already left. Clamping keeps it on the record rather than in the blank
   * space after it.
   */
  useEffect(() => {
    if (!span) return;
    if (bead < span.from) setBead(span.from);
    else if (bead > span.to) setBead(span.to);
  }, [span?.from, span?.to, bead]);

  const model = useMemo(() => {
    if (!span) return null;
    return buildLineModel({
      from: span.from,
      to: span.to,
      activeOn: bead,
      contracts: contracts.data?.items ?? [],
      attendances: attendance.data ?? [],
      // The API exposes no holiday endpoint as of B0; the line simply draws
      // no holiday ticks rather than inventing a calendar. Fills in with B3.
      holidays: [],
    });
  }, [span?.from, span?.to, bead, contracts.data, attendance.data]);

  /* ── The three states that are not the page ────────────────────────── */

  if (employee.state === "error") {
    const gone = employee.error instanceof ApiError && employee.error.status === 404;
    return gone ? (
      <>
        <PageHeader title="Not found" meta="No employee with that id is visible to you." />
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="That employee is not here"
            body="It was deleted, or it belongs to a part of the organisation your role does not cover."
            action={<Button variant="quiet" onClick={() => navigate("/people")}>Back to People</Button>}
          />
        </Well>
      </>
    ) : (
      <LoadFailure what="This employee" error={employee.error} onRetry={employee.reload} />
    );
  }

  if (!person) return <IdentitySkeleton />;

  const bandsPending = contracts.initial || attendance.initial;

  return (
    <>
      <PageHeader
        title={self ? "Me" : "People"}
        meta={
          self ? (
            "Your record, as payroll reads it."
          ) : (
            <Link to="/people" className="focusable">← All people</Link>
          )
        }
        action={
          editable && (
            <Button variant="primary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      />

      <div className="pp-emp__identity">
        <Avatar name={person.full_name} size={72} inactive={person.status === "INACTIVE"} />
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>{person.full_name}</h1>
          <p className="t-ui-sm pp-emp__meta">
            <span>{jobLineOf(person)}</span>
            <span className="pp-emp__sep" aria-hidden="true">·</span>
            <span>{person.manager_name ? `Reports to ${person.manager_name}` : "No manager"}</span>
            <span className="pp-emp__sep" aria-hidden="true">·</span>
            <span>{person.employee_number}</span>
            <StateChip state={person.status} />
          </p>
        </div>
      </div>

      {/* THE LINE — full width, directly beneath the identity block (§12 S3). */}
      <Well style={{ padding: "var(--s-5)" }}>
        {model && !bandsPending ? (
          <Line
            model={model}
            value={bead}
            onChange={setBead}
            caption={
              <>
                {/* The window that is drawn, not the whole employment — the
                    line shows a year, and saying otherwise would make its
                    left edge read as a joining date. */}
                <span className="t-ui-sm" style={{ color: "var(--ink-500)" }}>
                  {formatDate(span?.from)} → {formatDate(span?.to)}
                  {span && span.from === person.date_of_joining ? " · since joining" : ""}
                </span>
                <span className="t-ui-sm" style={{ color: "var(--ink-900)" }}>{formatDate(bead)}</span>
              </>
            }
          />
        ) : (
          <Skeleton width="100%" />
        )}
      </Well>

      {/* CONTRACT · TIME · LEAVE · PAYROLL — one call fills all four. */}
      <div className="pp-summary">
        <SummaryWell
          label="Contract"
          icon={<FileSignature size={14} />}
          count={summary.data?.contracts}
          loading={summary.initial}
          to={`/contracts?employee_id=${person.id}`}
          allowed={can("contract", "read")}
          figure={summary.data?.contracts ?? 0}
          support={
            summary.data?.contracts
              ? "Bands on the line above are these."
              : "No contract yet — payroll cannot run for this person."
          }
        />
        <SummaryWell
          label="Time"
          icon={<Clock size={14} />}
          count={summary.data?.attendances}
          loading={summary.initial}
          to={`/time?employee_id=${person.id}`}
          allowed={can("attendance", "read")}
          figure={summary.data?.attendances ?? 0}
          support="Days with a recorded attendance row."
        />
        <SummaryWell
          label="Leave"
          icon={<CalendarClock size={14} />}
          count={summary.data?.time_off_requests}
          loading={summary.initial}
          to={`/leave?employee_id=${person.id}`}
          allowed={can("time_off_request", "read")}
          figure={summary.data?.time_off_requests ?? 0}
          support={`${summary.data?.allocations ?? 0} allocation${summary.data?.allocations === 1 ? "" : "s"} on record.`}
        />
        <SummaryWell
          label="Payroll"
          icon={<Wallet size={14} />}
          count={summary.data?.payslips}
          loading={summary.initial}
          to={`/payroll?employee_id=${person.id}`}
          allowed={can("payslip", "read")}
          figure={summary.data?.payslips ?? 0}
          support="Payslips issued to date."
        />
      </div>

      {summary.state === "error" && (
        <div style={{ marginTop: "var(--s-4)" }}>
          <LoadFailure what="The summary counts" error={summary.error} onRetry={summary.reload} />
        </div>
      )}

      <h2 className="t-h3" style={{ margin: "var(--s-6) 0 var(--s-3)" }}>Details</h2>
      <Well>
        <div className="pp-pairs">
          <Pair k="Email" v={person.email} />
          <Pair k="Phone" v={person.phone} />
          <Pair k="Employee type" v={humanise(person.employee_type)} />
          <Pair k="Department" v={person.department_name} />
          <Pair k="Job position" v={person.job_title} />
          <Pair k="Manager" v={person.manager_name} />
          <Pair k="Joined" v={formatDate(person.date_of_joining)} />
          <Pair k="Exited" v={person.date_of_exit ? formatDate(person.date_of_exit) : null} />
          <Pair k="Bank account" v={person.bank_account} />
          <Pair k="IFSC" v={person.bank_ifsc} />
        </div>
      </Well>

      {editable && (
        <EmployeeForm
          open={editing}
          onClose={() => setEditing(false)}
          employee={person}
          reference={{
            departments: departments.data ?? [],
            positions: positions.data ?? [],
            managers: managers.data?.items ?? [],
            schedules: schedules.data ?? [],
          }}
          onSaved={() => {
            employee.reload();
            summary.reload();
            contracts.reload();
          }}
        />
      )}
    </>
  );
}

/* ── One summary well ─────────────────────────────────────────────────── */

/**
 * The count chip is a **smart button**: it says how many, and it opens them.
 * A zero renders as `0` and stays visible — hiding it would make "no
 * contracts" indistinguishable from "not loaded", which is exactly the
 * confusion that stops somebody noticing a person payroll cannot pay.
 */
function SummaryWell({
  label,
  icon,
  count,
  figure,
  support,
  loading,
  to,
  allowed,
}: {
  label: string;
  icon: React.ReactNode;
  count: number | undefined;
  figure: number;
  support: string;
  loading: boolean;
  to: string;
  allowed: boolean;
}) {
  const navigate = useNavigate();
  return (
    <section className="pp-summary__well" aria-label={label}>
      <p className="t-micro pp-summary__label">
        <span aria-hidden="true" style={{ display: "inline-flex" }}>{icon}</span>
        {label}
        <button
          type="button"
          className="pp-summary__chip t-micro focusable"
          disabled={!allowed || loading}
          title={allowed ? `Open ${label.toLowerCase()} for this person` : "Your role does not cover this"}
          onClick={() => navigate(to)}
        >
          {loading ? <Skeleton width="18px" /> : (count ?? 0)}
        </button>
      </p>
      {loading ? <Skeleton width="48px" /> : <RollingCount value={figure} label={label} />}
      <p className="t-ui-sm pp-summary__support">{support}</p>
    </section>
  );
}

function IdentitySkeleton() {
  return (
    <>
      <PageHeader title="People" meta="Loading…" />
      <div className="pp-emp__identity">
        <Skeleton width="72px" />
        <div style={{ display: "grid", gap: "var(--s-2)" }}>
          <Skeleton width="220px" />
          <Skeleton width="320px" />
        </div>
      </div>
      <Well style={{ padding: "var(--s-5)" }}>
        <Skeleton width="100%" />
      </Well>
      <div className="pp-summary">
        {["Contract", "Time", "Leave", "Payroll"].map((label) => (
          <section className="pp-summary__well" key={label} aria-label={label}>
            <p className="t-micro pp-summary__label">{label}</p>
            <Skeleton width="48px" />
            <Skeleton width="80%" />
          </section>
        ))}
      </div>
    </>
  );
}

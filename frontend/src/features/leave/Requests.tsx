/**
 * S8 · TIME-OFF REQUESTS
 *
 * An approval queue, and the screen where the product's most-quoted beat
 * happens: approve three days and watch the balance count down.
 *
 * **The duration is the teaching moment.** §3.6 makes `duration_days`
 * schedule- and holiday-aware, so a Friday-to-Monday request on a five-day
 * week is **two days**, not four. That is correct and it is surprising, so the
 * row states the span and the count *and* the reason they differ — a number
 * that disagrees with the calendar in somebody's head, unexplained, reads as
 * a bug in the payroll system rather than as a working week.
 *
 * **A refusal names the shortfall.** Approval past `remaining` is a hard 422
 * (§3.6) whose message already says who is short and by how much. That
 * sentence is rendered as a warning card, attached to the queue, and stays
 * until it is dealt with — a toast would take the only actionable thing on
 * the screen away four seconds after it arrived.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Plus, X } from "lucide-react";
import type { TimeOffRequest } from "@/api/contract";
import { REQUEST_STATES } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Badge, Button, EmptyState, Select, StateChip, Table, WarningCard, cx, useToast,
  type Column,
} from "@/components/system";
import { RollingCount, Segment } from "@/components/signature";
import {
  LoadFailure, SectionNav, daysLabel, decimalLabel, formatDate, useFilterParams,
} from "@/features/shared";
import { approveRequest, cancelRequest, getBalances, listEmployees, listRequests, listTypes, refuseRequest } from "./api";
import { RequestForm } from "./RequestForm";
import { RequestDrawer } from "./RequestDrawer";
import { SECTION_NAV } from "./nav";

/** Calendar days in the range, inclusive — what the *dates* say. */
function calendarDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function Requests() {
  const { user, can } = useAuth();
  const toast = useToast();
  const filters = useFilterParams();

  const employeeId = filters.num("employee_id");
  const state = filters.get("state");
  const typeId = filters.num("time_off_type_id");
  const scope = filters.get("scope") === "my_team" ? ("my_team" as const) : undefined;

  const [filing, setFiling] = useState(false);
  const [open, setOpen] = useState<TimeOffRequest>();
  const [refusal, setRefusal] = useState<{ code: string; message: string }>();
  const [busyId, setBusyId] = useState<number>();

  const requests = useQuery(
    () =>
      listRequests({
        employee_id: employeeId,
        state: state as TimeOffRequest["state"],
        time_off_type_id: typeId,
        scope,
      }),
    [employeeId, state, typeId, scope],
  );
  const employees = useQuery(() => listEmployees(), []);
  const types = useQuery(() => listTypes(), []);

  /**
   * The header's balance figure. It exists only when the queue is narrowed to
   * one person, because "remaining leave" is not a property of a mixed list —
   * summing thirty people's casual leave would be a number with no meaning.
   */
  const balances = useQuery(
    () => (employeeId === undefined ? Promise.resolve(null) : getBalances(employeeId)),
    [employeeId],
  );

  const rows = requests.data?.items ?? [];

  /**
   * An `EMPLOYEE` sees their own requests and nothing else — the server scopes
   * the list, so a person picker and a "my team" toggle are controls that
   * cannot change the answer. §11: the role decides what the screen *offers*,
   * not what it disables.
   */
  const self = user?.role === "EMPLOYEE";
  const canApprove = can("time_off_request", "approve");
  const canCancel = can("time_off_request", "update");
  const pending = rows.filter((r) => r.state === "TO_APPROVE").length;

  async function act(
    request: TimeOffRequest,
    run: (id: number) => Promise<unknown>,
    done: string,
  ) {
    setRefusal(undefined);
    setBusyId(request.id);
    try {
      await run(request.id);
      toast(done, "jade");
      requests.reload();
      // The header figure and the drawer's meter both read this.
      balances.reload();
    } catch (cause) {
      if (cause instanceof ApiError) {
        // 422 `insufficient_balance` and 409 `paid period` both arrive here,
        // and both already carry a sentence naming the person and the number.
        setRefusal({ code: cause.code, message: cause.message });
      } else {
        setRefusal({ code: "unknown", message: "That did not work. Try again." });
      }
    } finally {
      setBusyId(undefined);
    }
  }

  const columns: Column<TimeOffRequest>[] = useMemo(
    () => [
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
      {
        id: "type",
        header: "Type",
        accessorFn: (r) => r.time_off_type_name,
        cell: ({ row }) => (
          <span className="pp-lv__type">
            {row.original.time_off_type_name}
            {!row.original.is_paid && <Badge tone="orange">UNPAID</Badge>}
          </span>
        ),
      },
      {
        id: "when",
        header: "Dates",
        accessorFn: (r) => r.date_from,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <span className="pp-lv__when">
              <span className="t-ui-sm" style={{ whiteSpace: "nowrap" }}>
                {formatDate(r.date_from)}
                {r.date_to !== r.date_from && ` → ${formatDate(r.date_to)}`}
              </span>
              <Segment
                from={r.date_from}
                to={r.date_to}
                start={r.date_from}
                end={r.date_to}
                active={r.state === "APPROVED"}
                label={`${formatDate(r.date_from)} to ${formatDate(r.date_to)}`}
              />
            </span>
          );
        },
      },
      {
        id: "duration",
        header: "Counts as",
        accessorFn: (r) => Number(r.duration_days),
        meta: { numeric: true },
        cell: ({ row }) => {
          const r = row.original;
          const calendar = calendarDays(r.date_from, r.date_to);
          const counted = Number(r.duration_days);
          const differs = calendar !== counted;
          return (
            /* The explanation lives on the number that surprises people. */
            <span
              className={cx("pp-lv__days", differs && "pp-lv__days--adjusted")}
              title={
                differs
                  ? `${calendar} calendar days, ${decimalLabel(counted)} working. Weekends, non-working days on this employee's schedule and public holidays are not deducted from leave — PRD §3.6.`
                  : undefined
              }
            >
              {decimalLabel(counted)}
              {differs && <span className="t-micro"> of {calendar}</span>}
            </span>
          );
        },
      },
      {
        id: "state",
        header: "State",
        accessorFn: (r) => r.state,
        cell: ({ row }) => <StateChip state={row.original.state} />,
      },
      {
        id: "approver",
        header: "Decided by",
        accessorFn: (r) => r.approver_name ?? "",
        cell: ({ row }) =>
          row.original.approver_name ?? (
            <span style={{ color: "var(--ink-300)" }}>—</span>
          ),
      },
      ...(canApprove || canCancel
        ? [
            {
              id: "actions",
              header: "",
              enableSorting: false,
              cell: ({ row }: { row: { original: TimeOffRequest } }) => {
                const r = row.original;
                const busy = busyId === r.id;
                return (
                  <span className="pp-row-actions" onClick={(e) => e.stopPropagation()}>
                    {canApprove && r.state === "TO_APPROVE" && (
                      <>
                        <Button
                          size="sm"
                          variant="quiet"
                          icon={<Check size={14} />}
                          loading={busy}
                          onClick={() =>
                            act(r, approveRequest, `${r.employee_name}'s leave approved.`)
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="quiet"
                          icon={<X size={14} />}
                          loading={busy}
                          onClick={() => act(r, refuseRequest, "Request refused.")}
                        >
                          Refuse
                        </Button>
                      </>
                    )}
                    {canCancel && (r.state === "APPROVED" || r.state === "TO_APPROVE") && (
                      <Button
                        size="sm"
                        variant="quiet"
                        loading={busy}
                        onClick={() => act(r, cancelRequest, "Request cancelled.")}
                      >
                        Cancel
                      </Button>
                    )}
                  </span>
                );
              },
            } as Column<TimeOffRequest>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canApprove, canCancel, busyId],
  );

  const filtered =
    employeeId !== undefined || state !== undefined || typeId !== undefined || scope !== undefined;

  const headline = balances.data?.reduce((sum, b) => sum + Number(b.remaining), 0);
  const canScopeToTeam = !self && user?.employee_id !== null && user?.employee_id !== undefined;

  return (
    <>
      <PageHeader
        title="Time off"
        meta={
          requests.state === "ready"
            ? `${rows.length} ${rows.length === 1 ? "request" : "requests"}${pending ? ` · ${pending} awaiting a decision` : " · nothing awaiting a decision"}`
            : "Loading requests…"
        }
        action={
          <div className="pp-form__row">
            {employeeId !== undefined && headline !== undefined && (
              /* Rolls down the moment an approval lands. */
              <span className="pp-lv__headline">
                <RollingCount value={headline} scale="l" label="days remaining" />
                <span className="t-micro"> DAYS LEFT</span>
              </span>
            )}
            {can("time_off_request", "create") && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFiling(true)}>
                Request time off
              </Button>
            )}
          </div>
        }
      />

      <SectionNav items={SECTION_NAV} />

      {refusal && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity={refusal.code === "insufficient_balance" ? "error" : "warning"}
            code={refusal.code.toUpperCase()}
            detail={refusal.message}
            blocks={
              refusal.code === "insufficient_balance"
                ? "This request cannot be approved until the employee has enough allocated."
                : "Nothing changed."
            }
            action={
              <Button size="sm" variant="quiet" onClick={() => setRefusal(undefined)}>
                Dismiss
              </Button>
            }
          />
        </div>
      )}

      <div className="pp-filters">
        {!self && (
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
          label="Type"
          className="pp-filters__field"
          value={typeId === undefined ? "" : String(typeId)}
          onChange={(e) => filters.set("time_off_type_id", e.target.value)}
          options={[
            { value: "", label: "Any type" },
            ...(types.data?.items ?? []).map((t) => ({ value: String(t.id), label: t.name })),
          ]}
        />
        <Select
          label="State"
          className="pp-filters__field"
          value={state ?? ""}
          onChange={(e) => filters.set("state", e.target.value)}
          options={[
            { value: "", label: "Any state" },
            ...REQUEST_STATES.map((s) => ({
              value: s,
              label: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " "),
            })),
          ]}
        />
        <div className="pp-filters__view">
          {canScopeToTeam && (
            <Button
              size="sm"
              variant={scope ? "key" : "quiet"}
              aria-pressed={!!scope}
              onClick={() => filters.set("scope", scope ? undefined : "my_team")}
            >
              My team
            </Button>
          )}
          {filtered && (
            <Button size="sm" variant="quiet" onClick={filters.clear}>Clear</Button>
          )}
        </div>
      </div>

      {requests.state === "error" ? (
        <LoadFailure what="The request queue" error={requests.error} onRetry={requests.reload} />
      ) : (
        <Table
          caption="Time-off requests"
          data={rows}
          columns={columns}
          getRowId={(r) => String(r.id)}
          selectedId={open ? String(open.id) : undefined}
          onRowClick={(r) => setOpen(r)}
          loading={requests.initial}
          empty={
            filtered ? (
              <EmptyState
                title="Nothing matches those filters"
                body="There are requests on file — this combination has none in it."
                action={<Button variant="quiet" onClick={filters.clear}>Clear filters</Button>}
              />
            ) : (
              <EmptyState
                title="No requests yet"
                body="Approved leave is what makes a payslip's paid and unpaid days differ from the calendar. Nothing is waiting on you."
              />
            )
          }
        />
      )}

      <RequestDrawer
        request={open}
        onClose={() => setOpen(undefined)}
        onActed={() => {
          requests.reload();
          balances.reload();
        }}
      />

      <RequestForm
        open={filing}
        employees={employees.data?.items ?? []}
        types={(types.data?.items ?? []).filter((t) => t.is_active)}
        onClose={() => setFiling(false)}
        onSaved={(created) => {
          setFiling(false);
          requests.reload();
          balances.reload();
          toast(
            `Request filed — ${daysLabel(created.duration_days)} of ${created.time_off_type_name}.`,
            "jade",
          );
        }}
      />
    </>
  );
}

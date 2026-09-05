/**
 * S9 · ALLOCATIONS
 *
 * An allocation is the thing a balance is made of, and it is *dated* — twelve
 * days of casual leave valid for this calendar year is a different fact from
 * twelve days valid forever. §12 S9 asks for the validity window as a
 * miniature LINE segment per row, which is the one drawing that makes an
 * expiring allocation visible before it expires.
 *
 * They are proposed and then approved, the same two steps a request takes, so
 * the screen is the same shape as S8 — deliberately. Two approval queues that
 * looked different would be two things to learn.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Plus, X } from "lucide-react";
import type { LeaveAllocation } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { useQuery, useSubmission } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Button, Drawer, EmptyState, Field, Select, StateChip, Table, Textarea, WarningCard,
  useToast, type Column,
} from "@/components/system";
import { Segment } from "@/components/signature";
import { today, yearEnd, yearStart } from "@/lib/clock";
import {
  LoadFailure, SectionNav, decimalLabel, formatDate, useFilterParams,
} from "@/features/shared";
import {
  approveAllocation, createAllocation, listAllocations, listEmployees, listTypes,
  refuseAllocation,
} from "./api";
import { SECTION_NAV } from "./nav";

const YEAR_START = yearStart();
const YEAR_END = yearEnd();

export function Allocations() {
  const { can } = useAuth();
  const toast = useToast();
  const filters = useFilterParams();

  const employeeId = filters.num("employee_id");
  const typeId = filters.num("time_off_type_id");
  const state = filters.get("state");

  const [adding, setAdding] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const [busyId, setBusyId] = useState<number>();

  const allocations = useQuery(
    () => listAllocations({ employee_id: employeeId, time_off_type_id: typeId, state }),
    [employeeId, typeId, state],
  );
  const employees = useQuery(() => listEmployees(), []);
  const types = useQuery(() => listTypes(), []);

  const rows = allocations.data?.items ?? [];

  /** Own-scoped roles see only their own rows; a person picker changes nothing. */
  const self = !can("leave_allocation", "approve");

  async function act(row: LeaveAllocation, run: (id: number) => Promise<unknown>, done: string) {
    setRefusal(undefined);
    setBusyId(row.id);
    try {
      await run(row.id);
      toast(done, "jade");
      allocations.reload();
    } catch (cause) {
      setRefusal(cause instanceof ApiError ? cause.message : "That did not work.");
    } finally {
      setBusyId(undefined);
    }
  }

  const canApprove = can("leave_allocation", "approve");

  const columns: Column<LeaveAllocation>[] = useMemo(
    () => [
      {
        id: "employee",
        header: "Employee",
        accessorFn: (a) => a.employee_name,
        cell: ({ row }) => (
          <Link to={`/people/${row.original.employee_id}`} className="focusable">
            {row.original.employee_name}
          </Link>
        ),
      },
      { id: "type", header: "Type", accessorFn: (a) => a.type_name },
      {
        id: "days",
        header: "Days",
        accessorFn: (a) => Number(a.days),
        meta: { numeric: true },
        cell: ({ row }) => decimalLabel(row.original.days),
      },
      {
        id: "validity",
        header: "Valid",
        accessorFn: (a) => a.validity_from,
        cell: ({ row }) => {
          const a = row.original;
          /* One shared calendar year as the window, so every row's bar is
             comparable — a per-row window would make them all look the same
             length, which is the failure mode this drawing exists to avoid. */
          return (
            <Segment
              from={YEAR_START}
              to={YEAR_END}
              start={a.validity_from}
              end={a.validity_to}
              active={a.state === "APPROVED" && a.validity_to >= today()}
              label={`Valid ${formatDate(a.validity_from)} to ${formatDate(a.validity_to)}`}
            />
          );
        },
      },
      {
        id: "dates",
        header: "Window",
        accessorFn: (a) => a.validity_from,
        cell: ({ row }) => (
          <span className="t-ui-sm" style={{ whiteSpace: "nowrap", color: "var(--ink-500)" }}>
            {formatDate(row.original.validity_from)} → {formatDate(row.original.validity_to)}
          </span>
        ),
      },
      {
        id: "state",
        header: "State",
        accessorFn: (a) => a.state,
        cell: ({ row }) => <StateChip state={row.original.state} />,
      },
      ...(canApprove
        ? [
            {
              id: "actions",
              header: "",
              enableSorting: false,
              cell: ({ row }: { row: { original: LeaveAllocation } }) =>
                row.original.state === "TO_APPROVE" ? (
                  <span className="pp-row-actions">
                    <Button
                      size="sm"
                      variant="quiet"
                      icon={<Check size={14} />}
                      loading={busyId === row.original.id}
                      onClick={() =>
                        act(row.original, approveAllocation, "Allocation approved — the balance is live.")
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      icon={<X size={14} />}
                      loading={busyId === row.original.id}
                      onClick={() => act(row.original, refuseAllocation, "Allocation refused.")}
                    >
                      Refuse
                    </Button>
                  </span>
                ) : null,
            } as Column<LeaveAllocation>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canApprove, busyId],
  );

  const filtered = employeeId !== undefined || typeId !== undefined || state !== undefined;
  const awaiting = rows.filter((a) => a.state === "TO_APPROVE").length;

  return (
    <>
      <PageHeader
        title="Allocations"
        meta={
          allocations.state === "ready"
            ? `${rows.length} on record${awaiting ? ` · ${awaiting} awaiting approval` : ""}`
            : "Loading allocations…"
        }
        action={
          can("leave_allocation", "create") && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
              Allocate leave
            </Button>
          )
        }
      />

      <SectionNav items={SECTION_NAV} />

      {refusal && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="warning"
            code="ALLOCATION_REFUSED"
            detail={refusal}
            blocks="Nothing changed."
            action={<Button size="sm" variant="quiet" onClick={() => setRefusal(undefined)}>Dismiss</Button>}
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
              ...(employees.data?.items ?? []).map((e) => ({ value: String(e.id), label: e.full_name })),
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
            ...(types.data ?? []).map((t) => ({ value: String(t.id), label: t.name })),
          ]}
        />
        <Select
          label="State"
          className="pp-filters__field"
          value={state ?? ""}
          onChange={(e) => filters.set("state", e.target.value)}
          options={[
            { value: "", label: "Any state" },
            { value: "TO_APPROVE", label: "To approve" },
            { value: "APPROVED", label: "Approved" },
            { value: "REFUSED", label: "Refused" },
          ]}
        />
      </div>

      {allocations.state === "error" ? (
        <LoadFailure what="The allocations" error={allocations.error} onRetry={allocations.reload} />
      ) : (
        <Table
          caption="Leave allocations"
          data={rows}
          columns={columns}
          getRowId={(a) => String(a.id)}
          loading={allocations.initial}
          empty={
            filtered ? (
              <EmptyState
                title="Nothing matches those filters"
                body="There are allocations on file — this combination has none."
                action={<Button variant="quiet" onClick={filters.clear}>Clear filters</Button>}
              />
            ) : (
              <EmptyState
                title="Nothing allocated yet"
                body="A leave type that requires allocation has a zero balance until somebody grants days against it — and approval of a request past zero is refused outright."
              />
            )
          }
        />
      )}

      <AllocationForm
        open={adding}
        employees={employees.data?.items ?? []}
        types={(types.data ?? []).filter((t) => t.is_active && t.requires_allocation)}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          allocations.reload();
          toast("Allocation created — it is live once approved.", "jade");
        }}
      />
    </>
  );
}

/* ── The form ─────────────────────────────────────────────────────────── */

function AllocationForm({
  open,
  employees,
  types,
  onClose,
  onSaved,
}: {
  open: boolean;
  employees: { id: number; full_name: string }[];
  types: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useSubmission();
  const [employeeId, setEmployeeId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [days, setDays] = useState("12");
  const [from, setFrom] = useState(YEAR_START);
  const [to, setTo] = useState(YEAR_END);
  const [notes, setNotes] = useState("");

  async function save() {
    const ok = await form.submit(async () => {
      await createAllocation({
        employee_id: Number(employeeId),
        time_off_type_id: Number(typeId),
        days: Number(days).toFixed(2),
        validity_from: from,
        validity_to: to,
        notes: notes.trim() === "" ? null : notes.trim(),
      });
    });
    if (ok) onSaved();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Allocate leave"
      footer={
        <div className="pp-form__row" style={{ justifyContent: "flex-end" }}>
          <Button variant="quiet" onClick={onClose} disabled={form.busy}>Cancel</Button>
          <Button
            variant="primary"
            loading={form.busy}
            disabled={employeeId === "" || typeId === "" || Number(days) <= 0}
            onClick={save}
          >
            Allocate
          </Button>
        </div>
      }
    >
      {form.message && <p className="pp-form__error t-ui-sm" role="alert">{form.message}</p>}

      <div className="pp-form">
        <Select
          label="Employee"
          required
          error={form.fields.employee_id}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          options={[
            { value: "", label: "Choose a person" },
            ...employees.map((e) => ({ value: String(e.id), label: e.full_name })),
          ]}
        />
        <Select
          label="Leave type"
          required
          help="Only types that require an allocation are listed — the others have no balance to grant."
          error={form.fields.time_off_type_id}
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          options={[
            { value: "", label: "Choose a type" },
            ...types.map((t) => ({ value: String(t.id), label: t.name })),
          ]}
        />
        <Field
          label="Days"
          type="number"
          min={0.5}
          step={0.5}
          required
          error={form.fields.days}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
        <div className="pp-form__row">
          <Field
            label="Valid from"
            type="date"
            required
            error={form.fields.validity_from}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Field
            label="Valid to"
            type="date"
            required
            min={from || undefined}
            error={form.fields.validity_to}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Textarea
          label="Notes"
          rows={2}
          error={form.fields.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <p className="t-ui-sm" style={{ color: "var(--ink-400)", margin: 0 }}>
          An allocation is proposed, then approved — the same two steps a
          request takes. It counts toward a balance only once approved.
        </p>
      </div>
    </Drawer>
  );
}

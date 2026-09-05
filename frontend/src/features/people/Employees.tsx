/**
 * S2 · EMPLOYEES — Kanban and List.
 *
 * **One data source, one filter state.** Both views read the same
 * `useQuery(listEmployees, …)` result; the segmented control changes how the
 * rows are drawn and nothing else. Switching views therefore cannot refetch,
 * cannot reorder, and cannot show a different count from the one in the
 * header — which is the failure mode a second query would introduce.
 *
 * Filters live in the URL. A filtered list is a thing people send to each
 * other, and it survives a reload and the back button for free.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import type { Department, Employee } from "@/api/contract";
import { EMPLOYEE_TYPES } from "@/api/contract";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Button, EmptyState, Field, SegmentedControl, Select, StateChip, Table, Well,
  type Column,
} from "@/components/system";
import {
  listDepartments, listEmployees, listJobPositions, listSchedules, type EmployeeFilters,
} from "./api";
import { EmployeeForm } from "./EmployeeForm";
import { Avatar, LoadFailure, formatDate, humanise, jobLineOf } from "@/features/shared";

type View = "kanban" | "list";

/** URL ⇄ filters, in one place so the two directions cannot disagree. */
function readFilters(params: URLSearchParams): EmployeeFilters {
  const num = (key: string) => {
    const raw = params.get(key);
    return raw ? Number(raw) : undefined;
  };
  return {
    q: params.get("q") || undefined,
    department_id: num("department_id"),
    status: params.get("status") || undefined,
    employee_type: params.get("employee_type") || undefined,
    scope: params.get("scope") === "my_team" ? "my_team" : undefined,
  };
}

export function Employees() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();

  const view = (params.get("view") === "list" ? "list" : "kanban") as View;
  const filters = useMemo(() => readFilters(params), [params]);
  const filtered = Object.values(filters).some((v) => v !== undefined);

  const [adding, setAdding] = useState(false);

  /**
   * The box is local and the URL trails it. Writing every keystroke straight
   * into the query string would put a request and a history entry behind each
   * letter; 220ms is long enough to type through and short enough that the
   * list still feels attached to the keyboard.
   */
  const [search, setSearch] = useState(params.get("q") ?? "");
  useEffect(() => {
    if (search === (params.get("q") ?? "")) return;
    const id = setTimeout(() => setParam("q", search), 220);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const people = useQuery(() => listEmployees(filters), [JSON.stringify(filters)]);
  const departments = useQuery(() => listDepartments(), []);
  const positions = useQuery(() => listJobPositions(), []);
  const schedules = useQuery(() => listSchedules(), []);

  const rows = people.data?.items ?? [];

  /** One writer for the URL, so a filter change always resets nothing else. */
  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params);
    if (value === undefined || value === "") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  /**
   * `?scope=my_team` is resolved server-side against the caller's own record,
   * so it is only offered to somebody who *has* one. An ADMIN account with no
   * employee row would filter to nothing and look broken.
   */
  const canScopeToTeam = user?.employee_id !== null && user?.employee_id !== undefined;

  const reference = {
    departments: departments.data?.items ?? [],
    positions: positions.data?.items ?? [],
    managers: rows,
    schedules: schedules.data?.items ?? [],
  };

  return (
    <>
      <PageHeader
        title="People"
        meta={
          people.state === "ready"
            ? `${people.data?.total ?? 0} ${people.data?.total === 1 ? "person" : "people"}${filtered ? " matching" : ""}`
            : "Loading the directory…"
        }
        action={
          can("employee", "create") && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
              Add employee
            </Button>
          )
        }
      />

      <div className="pp-filters">
        <Field
          label="Search"
          className="pp-filters__search"
          placeholder="Name, email, number or role"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="search"
        />
        <Select
          label="Department"
          className="pp-filters__field"
          value={filters.department_id === undefined ? "" : String(filters.department_id)}
          onChange={(e) => setParam("department_id", e.target.value)}
          options={[
            { value: "", label: "All departments" },
            ...reference.departments.map((d) => ({ value: String(d.id), label: d.name })),
          ]}
        />
        <Select
          label="Status"
          className="pp-filters__field"
          value={filters.status ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
          options={[
            { value: "", label: "Any status" },
            { value: "ACTIVE", label: "Active" },
            { value: "INACTIVE", label: "Inactive" },
          ]}
        />
        <Select
          label="Type"
          className="pp-filters__field"
          value={filters.employee_type ?? ""}
          onChange={(e) => setParam("employee_type", e.target.value)}
          options={[
            { value: "", label: "Any type" },
            ...EMPLOYEE_TYPES.map((t) => ({ value: t, label: humanise(t) })),
          ]}
        />

        <div className="pp-filters__view">
          {canScopeToTeam && (
            <Button
              size="sm"
              variant={filters.scope === "my_team" ? "key" : "quiet"}
              icon={<Users size={16} />}
              aria-pressed={filters.scope === "my_team"}
              onClick={() => setParam("scope", filters.scope === "my_team" ? undefined : "my_team")}
            >
              My team
            </Button>
          )}
          <SegmentedControl<View>
            label="View"
            value={view}
            onChange={(v) => setParam("view", v)}
            options={[
              { value: "kanban", label: "Kanban" },
              { value: "list", label: "List" },
            ]}
          />
        </div>
      </div>

      {people.state === "error" ? (
        <LoadFailure what="The employee directory" error={people.error} onRetry={people.reload} />
      ) : view === "list" ? (
        <EmployeeTable
          rows={rows}
          loading={people.initial}
          empty={<Emptiness filtered={filtered} onClear={() => setParams({}, { replace: true })} />}
          onOpen={(e) => navigate(`/people/${e.id}`)}
        />
      ) : (
        <Kanban
          rows={rows}
          departments={reference.departments}
          loading={people.initial}
          empty={<Emptiness filtered={filtered} onClear={() => setParams({}, { replace: true })} />}
          onOpen={(e) => navigate(`/people/${e.id}`)}
        />
      )}

      <EmployeeForm
        open={adding}
        onClose={() => setAdding(false)}
        reference={reference}
        onSaved={(saved) => navigate(`/people/${saved.id}`)}
      />
    </>
  );
}

/* ── Empty and filtered-empty are different screens ───────────────────── */

function Emptiness({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return filtered ? (
    <EmptyState
      title="Nobody matches those filters"
      body="The directory is not empty — this combination just has no one in it."
      action={<Button variant="quiet" onClick={onClear}>Clear filters</Button>}
    />
  ) : (
    <EmptyState
      title="No employees yet"
      body="Everything downstream — contracts, attendance, leave and payroll — starts with a person. Add the first one."
    />
  );
}

/* ── List ─────────────────────────────────────────────────────────────── */

function EmployeeTable({
  rows,
  loading,
  empty,
  onOpen,
}: {
  rows: Employee[];
  loading: boolean;
  empty: React.ReactNode;
  onOpen: (e: Employee) => void;
}) {
  const columns: Column<Employee>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (e) => e.full_name,
        cell: ({ row }) => (
          <span style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
            <Avatar name={row.original.full_name} size={26} inactive={row.original.status === "INACTIVE"} />
            <span>{row.original.full_name}</span>
          </span>
        ),
      },
      { id: "number", header: "Number", accessorFn: (e) => e.employee_number },
      { id: "role", header: "Role", accessorFn: (e) => e.job_title ?? "—" },
      { id: "department", header: "Department", accessorFn: (e) => e.department_name ?? "—" },
      { id: "manager", header: "Manager", accessorFn: (e) => e.manager_name ?? "—" },
      { id: "type", header: "Type", accessorFn: (e) => humanise(e.employee_type) },
      {
        id: "joined",
        header: "Joined",
        accessorFn: (e) => e.date_of_joining,
        cell: ({ row }) => formatDate(row.original.date_of_joining),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (e) => e.status,
        cell: ({ row }) => <StateChip state={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <Table
      caption="Employees"
      data={rows}
      columns={columns}
      density="compact"
      getRowId={(e) => String(e.id)}
      onRowClick={onOpen}
      loading={loading}
      empty={empty}
    />
  );
}

/* ── Kanban ───────────────────────────────────────────────────────────── */

function Kanban({
  rows,
  departments,
  loading,
  empty,
  onOpen,
}: {
  rows: Employee[];
  departments: Department[];
  loading: boolean;
  empty: React.ReactNode;
  onOpen: (e: Employee) => void;
}) {
  /**
   * Columns come from the department list, not from the rows: a department
   * that a filter has emptied must still be drawn, or the board silently
   * changes shape as you type. "No department" appears only when somebody is
   * actually in it — an empty column for nothing is noise, not information.
   */
  const columns = useMemo(() => {
    const byDept = new Map<number | null, Employee[]>();
    for (const person of rows) {
      const key = person.department_id;
      const bucket = byDept.get(key);
      if (bucket) bucket.push(person);
      else byDept.set(key, [person]);
    }
    const named = departments.map((d) => ({
      key: String(d.id),
      label: d.name,
      code: d.code,
      people: byDept.get(d.id) ?? [],
    }));
    const orphans = byDept.get(null) ?? [];
    return orphans.length
      ? [...named, { key: "none", label: "No department", code: "—", people: orphans }]
      : named;
  }, [rows, departments]);

  if (loading) {
    return (
      <div className="pp-kanban">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="pp-kanban__col" key={i}>
            <div className="pp-kanban__head">
              <span className="pp-skel" style={{ width: 90 }} aria-hidden="true" />
            </div>
            <div className="pp-kanban__body">
              {Array.from({ length: 3 }).map((_, j) => (
                <div className="pp-person" key={j}>
                  <span className="pp-skel" style={{ width: 28, height: 28 }} aria-hidden="true" />
                  <span className="pp-skel" style={{ width: 120 }} aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <Well style={{ padding: "var(--s-5)" }}>{empty}</Well>;
  }

  return (
    <div className="pp-kanban">
      {columns.map((column) => (
        <section className="pp-kanban__col" key={column.key} aria-label={column.label}>
          <header className="pp-kanban__head">
            <span className="t-micro">{column.label}</span>
            <span className="t-micro pp-kanban__count">{column.people.length}</span>
          </header>
          <div className="pp-kanban__body">
            {column.people.length === 0 ? (
              <p className="t-ui-sm pp-kanban__empty">Nobody here</p>
            ) : (
              column.people.map((person) => (
                <PersonCard key={person.id} person={person} onOpen={onOpen} />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * A raised clay key, not a `Card` — the card's own shadow and the column's
 * would fight, and this is a control you press, not an object you read.
 */
function PersonCard({ person, onOpen }: { person: Employee; onOpen: (e: Employee) => void }) {
  return (
    <button type="button" className="pp-person focusable" onClick={() => onOpen(person)}>
      <Avatar name={person.full_name} size={36} inactive={person.status === "INACTIVE"} />
      <span className="pp-person__text">
        <span className="t-ui pp-person__name">{person.full_name}</span>
        <span className="t-ui-sm pp-person__role">{jobLineOf(person)}</span>
      </span>
      {person.status === "INACTIVE" && <StateChip state="INACTIVE" />}
    </button>
  );
}

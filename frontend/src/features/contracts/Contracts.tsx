/**
 * S4 · CONTRACTS
 *
 * A contract is the row payroll actually reads. Everything on this screen is
 * arranged around one question — *which contract is in force?* — because that
 * is the question §4.3 step 1 asks, and a list that does not answer it at a
 * glance is a list that lets somebody run payroll against an expired wage.
 *
 * Three decisions carry the screen.
 *
 * **The active contract is a marker, not a badge.** A cobalt bar down the left
 * edge of the row and a lifted ground, per §12 S4. A chip saying `RUNNING`
 * would be a fourth state chip in a row that already has one, and would say
 * *"this contract's state field is RUNNING"* — which is not the same claim as
 * *"this is the one that would be used today"*. A contract can be RUNNING and
 * still not be the applicable one, if it starts next month.
 *
 * **The overlap is a warning card.** B2's exclusion constraint returns a 409
 * with a sentence explaining which contract it collides with, and that
 * sentence has to stay on screen while the user fixes the dates. A toast for
 * it — the obvious thing — would vanish four seconds into reading it (§09.10).
 *
 * **Every row carries a miniature LINE segment.** Contracts are periods, and a
 * table of two dates makes the reader do the arithmetic that the whole product
 * exists to stop them doing.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileSignature, Plus } from "lucide-react";
import type { Contract } from "@/api/contract";
import { CONTRACT_STATES } from "@/api/contract";
import { money } from "@/api/money";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Button, EmptyState, Field, Select, StateChip, Table, Well, cx, type Column,
} from "@/components/system";
import { RollingNumber, Segment } from "@/components/signature";
import { LoadFailure, SectionNav, formatDate, useFilterParams } from "@/features/shared";
import { listContracts, listEmployees, listSchedules, listStructures } from "./api";
import { ContractDrawer } from "./ContractForm";
import { SECTION_NAV } from "./nav";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The window every row's segment is drawn in. One shared window is the point —
 * per-row windows would size each bar to itself, and every contract would look
 * the same length. Thirteen months centred on today covers a year of history
 * plus the month a new contract is usually written into.
 */
function windowAround(today: string): { from: string; to: string } {
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return { from: iso(start), to: iso(end) };
}

export function Contracts() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const { can } = useAuth();
  const filters = useFilterParams();

  const employeeId = filters.num("employee_id");
  const state = filters.get("state");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contract | "new" | undefined>();

  const today = iso(new Date());
  const span = useMemo(() => windowAround(today), [today]);

  const contracts = useQuery(
    () => listContracts({ employee_id: employeeId, state: state as Contract["state"] }),
    [employeeId, state],
  );
  const employees = useQuery(() => listEmployees(), []);
  const schedules = useQuery(() => listSchedules(), []);
  const structures = useQuery(() => listStructures(), []);

  const all = contracts.data?.items ?? [];

  /**
   * Search is client-side here and server-side on People, and the difference
   * is not an inconsistency: `/contracts` has no `q` parameter (PRD §5), and
   * inventing one in the client would be a filter the backend cannot honour
   * once the swap happens. The whole set is already in memory.
   */
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (c) =>
        c.employee_name.toLowerCase().includes(needle) ||
        c.name.toLowerCase().includes(needle),
    );
  }, [all, search]);

  /**
   * §4.3 step 1, in the client, for presentation only: among the contracts
   * RUNNING today for one person, the one that started latest is the one
   * payroll would use. The server resolves this authoritatively at
   * `/contracts/active`; this marks the list without thirty round-trips.
   */
  const applicableIds = useMemo(() => {
    const best = new Map<number, Contract>();
    for (const c of all) {
      if (c.state !== "RUNNING") continue;
      if (c.date_start > today) continue;
      if (c.date_end !== null && c.date_end < today) continue;
      const held = best.get(c.employee_id);
      if (!held || c.date_start > held.date_start) best.set(c.employee_id, c);
    }
    return new Set([...best.values()].map((c) => c.id));
  }, [all, today]);

  /** `/contracts/:id` — there is no `GET /contracts/{id}` in §5, so the list resolves it. */
  const focused = useMemo(() => {
    if (!routeId) return undefined;
    return all.find((c) => String(c.id) === routeId);
  }, [routeId, all]);

  const reference = {
    employees: employees.data?.items ?? [],
    schedules: schedules.data ?? [],
    structures: structures.data ?? [],
  };

  const filtered = employeeId !== undefined || state !== undefined || search.trim() !== "";
  const open = editing ?? focused;

  const columns: Column<Contract>[] = useMemo(
    () => [
      {
        id: "employee",
        header: "Employee",
        accessorFn: (c) => c.employee_name,
        cell: ({ row }) => (
          <span className="pp-ct__who">
            {/* The marker is a real element rather than a row border: a border
                on a virtualised row disappears with the row, and this has to
                survive the scroll. */}
            <span
              className={cx(
                "pp-ct__marker",
                applicableIds.has(row.original.id) && "pp-ct__marker--active",
              )}
              aria-hidden="true"
            />
            <span>{row.original.employee_name}</span>
          </span>
        ),
      },
      { id: "name", header: "Contract", accessorFn: (c) => c.name },
      {
        id: "span",
        header: "Period",
        accessorFn: (c) => c.date_start,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <Segment
              from={span.from}
              to={span.to}
              start={c.date_start}
              end={c.date_end}
              active={applicableIds.has(c.id)}
              label={`${formatDate(c.date_start)} to ${c.date_end ? formatDate(c.date_end) : "open-ended"}`}
            />
          );
        },
      },
      {
        id: "dates",
        header: "Dates",
        accessorFn: (c) => c.date_start,
        cell: ({ row }) => (
          <span className="t-ui-sm" style={{ color: "var(--ink-500)", whiteSpace: "nowrap" }}>
            {formatDate(row.original.date_start)} →{" "}
            {row.original.date_end ? formatDate(row.original.date_end) : "open"}
          </span>
        ),
      },
      {
        id: "wage",
        header: "Wage",
        accessorFn: (c) => Number(c.wage),
        meta: { numeric: true },
        cell: ({ row }) => <RollingNumber value={money(row.original.wage)} scale="table" />,
      },
      {
        id: "state",
        header: "State",
        accessorFn: (c) => c.state,
        cell: ({ row }) => <StateChip state={row.original.state} />,
      },
      {
        id: "applicable",
        header: "Payroll uses",
        accessorFn: (c) => (applicableIds.has(c.id) ? "yes" : "no"),
        cell: ({ row }) =>
          applicableIds.has(row.original.id) ? (
            <span className="pp-ct__badge t-micro">TODAY</span>
          ) : (
            <span className="t-micro" style={{ color: "var(--ink-300)" }}>—</span>
          ),
      },
    ],
    [applicableIds, span.from, span.to],
  );

  return (
    <>
      <PageHeader
        title="Contracts"
        meta={
          contracts.state === "ready"
            ? `${rows.length} ${rows.length === 1 ? "contract" : "contracts"}${filtered ? " matching" : ""} · ${applicableIds.size} in force today`
            : "Loading contracts…"
        }
        action={
          can("contract", "create") && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing("new")}>
              New contract
            </Button>
          )
        }
      />

      <SectionNav items={SECTION_NAV} />

      <div className="pp-filters">
        <Field
          label="Search"
          className="pp-filters__search"
          type="search"
          placeholder="Employee or contract name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="Employee"
          className="pp-filters__field"
          value={employeeId === undefined ? "" : String(employeeId)}
          onChange={(e) => filters.set("employee_id", e.target.value)}
          options={[
            { value: "", label: "Everyone" },
            ...reference.employees.map((e) => ({ value: String(e.id), label: e.full_name })),
          ]}
        />
        <Select
          label="State"
          className="pp-filters__field"
          value={state ?? ""}
          onChange={(e) => filters.set("state", e.target.value)}
          options={[
            { value: "", label: "Any state" },
            ...CONTRACT_STATES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })),
          ]}
        />
      </div>

      {contracts.state === "error" ? (
        <LoadFailure what="The contract list" error={contracts.error} onRetry={contracts.reload} />
      ) : (
        <Table
          caption="Contracts"
          data={rows}
          columns={columns}
          density="default"
          getRowId={(c) => String(c.id)}
          selectedId={open && open !== "new" ? String(open.id) : undefined}
          onRowClick={(c) => navigate(`/contracts/${c.id}`)}
          loading={contracts.initial}
          empty={
            filtered ? (
              <EmptyState
                title="No contract matches those filters"
                body="There are contracts on file — this combination just has none in it."
                action={
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setSearch("");
                      filters.clear();
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No contracts yet"
                body="Payroll skips anybody without a contract covering the period — the wage, the schedule and the salary structure all come from here."
                art={<FileSignature size={24} aria-hidden="true" />}
                action={
                  can("contract", "create") && (
                    <Button variant="primary" onClick={() => setEditing("new")}>
                      Write the first contract
                    </Button>
                  )
                }
              />
            )
          }
        />
      )}

      <ContractDrawer
        open={open !== undefined}
        contract={open === "new" ? undefined : open}
        reference={reference}
        onClose={() => {
          setEditing(undefined);
          if (routeId) navigate("/contracts", { replace: true });
        }}
        onSaved={() => {
          contracts.reload();
          setEditing(undefined);
        }}
      />

      {/* A contract in the URL that is not in the loaded set — deleted, or
          outside this role's scope. Says so rather than opening blank. */}
      {routeId && !focused && contracts.state === "ready" && (
        <Well style={{ padding: "var(--s-5)", marginTop: "var(--s-4)" }}>
          <EmptyState
            title="That contract is not here"
            body="It was removed, or it belongs to someone outside the part of the organisation your role covers."
            action={<Button variant="quiet" onClick={() => navigate("/contracts")}>Back to contracts</Button>}
          />
        </Well>
      )}
    </>
  );
}

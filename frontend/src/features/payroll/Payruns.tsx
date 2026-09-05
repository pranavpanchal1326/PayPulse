/**
 * PAYRUNS — the list, and the way into the cockpit.
 *
 * Payroll is a monthly rhythm, so the list is ordered by period rather than by
 * when somebody happened to create a row, and the **open** run — the one that
 * is not yet paid — is lifted out of the table and put at the top as an object
 * you press. Everything below it is history, and history is a table.
 *
 * The totals roll. They are the same figures the cockpit shows, computed by
 * the same server, and seeing them here first is what makes opening a run feel
 * like walking toward something rather than into it.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import type { Payrun } from "@/api/contract";
import { PAYRUN_STATES } from "@/api/contract";
import { money } from "@/api/money";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Button, Card, EmptyState, Select, StateChip, Table, Well, type Column,
} from "@/components/system";
import { RollingCount, RollingNumber } from "@/components/signature";
import { monthLabel, monthOf } from "@/lib/date";
import { LoadFailure, SectionNav, formatDate, useFilterParams } from "@/features/shared";
import { listPayruns } from "./api";
import { SECTION_NAV } from "./nav";

/** Not yet money — a run anyone can still change. */
const isOpen = (p: Payrun) => p.state !== "PAID" && p.state !== "CANCELLED";

export function Payruns() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const filters = useFilterParams();
  const state = filters.get("state");

  const payruns = useQuery(
    () => listPayruns({ state: state as Payrun["state"] }),
    [state],
  );

  const rows = payruns.data?.items ?? [];
  const open = useMemo(() => rows.filter(isOpen), [rows]);
  const history = useMemo(() => rows.filter((p) => !isOpen(p)), [rows]);

  const columns: Column<Payrun>[] = useMemo(
    () => [
      { id: "name", header: "Payrun", accessorFn: (p) => p.name },
      {
        id: "period",
        header: "Period",
        accessorFn: (p) => p.period_start,
        cell: ({ row }) => (
          <span style={{ whiteSpace: "nowrap" }}>
            {formatDate(row.original.period_start)} → {formatDate(row.original.period_end)}
          </span>
        ),
      },
      {
        id: "count",
        header: "Payslips",
        accessorFn: (p) => p.payslip_count,
        meta: { numeric: true },
      },
      {
        id: "gross",
        header: "Gross",
        accessorFn: (p) => Number(p.total_gross),
        meta: { numeric: true },
        cell: ({ row }) => <RollingNumber value={money(row.original.total_gross)} scale="table" />,
      },
      {
        id: "net",
        header: "Net",
        accessorFn: (p) => Number(p.total_net),
        meta: { numeric: true },
        cell: ({ row }) => <RollingNumber value={money(row.original.total_net)} scale="table" />,
      },
      {
        id: "state",
        header: "State",
        accessorFn: (p) => p.state,
        cell: ({ row }) => <StateChip state={row.original.state} />,
      },
      {
        id: "paid",
        header: "Paid",
        accessorFn: (p) => p.paid_at ?? "",
        cell: ({ row }) =>
          row.original.paid_at ? (
            formatDate(row.original.paid_at.slice(0, 10))
          ) : (
            <span style={{ color: "var(--ink-300)" }}>—</span>
          ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Payroll"
        meta={
          payruns.state === "ready"
            ? `${rows.length} ${rows.length === 1 ? "run" : "runs"} · ${open.length} still open`
            : "Loading payruns…"
        }
        action={
          can("payrun", "create") && (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => navigate("/payroll/new")}
            >
              New payrun
            </Button>
          )
        }
      />

      <SectionNav items={SECTION_NAV} />

      {payruns.state === "error" ? (
        <LoadFailure what="The payruns" error={payruns.error} onRetry={payruns.reload} />
      ) : (
        <>
          {open.length > 0 && (
            <section className="pp-open" aria-label="Open payruns">
              {open.map((payrun) => (
                <OpenRun
                  key={payrun.id}
                  payrun={payrun}
                  onOpen={() => navigate(`/payroll/${payrun.id}`)}
                />
              ))}
            </section>
          )}

          <div className="pp-filters">
            <Select
              label="State"
              className="pp-filters__field"
              value={state ?? ""}
              onChange={(e) => filters.set("state", e.target.value)}
              options={[
                { value: "", label: "Any state" },
                ...PAYRUN_STATES.map((s) => ({
                  value: s,
                  label: s.charAt(0) + s.slice(1).toLowerCase(),
                })),
              ]}
            />
            <span className="pp-filters__count t-ui-sm">
              {history.length} closed {history.length === 1 ? "run" : "runs"} below.
            </span>
          </div>

          <Table
            caption="Payruns"
            data={state ? rows : history}
            columns={columns}
            getRowId={(p) => String(p.id)}
            onRowClick={(p) => navigate(`/payroll/${p.id}`)}
            loading={payruns.initial}
            empty={
              <EmptyState
                title={state ? "No payrun in that state" : "No closed payruns yet"}
                body={
                  state
                    ? "Clear the filter to see the rest."
                    : "Once a run is paid it moves here and stops being editable — paid payroll is immutable."
                }
                action={
                  state ? (
                    <Button variant="quiet" onClick={filters.clear}>Clear filter</Button>
                  ) : undefined
                }
              />
            }
          />

          {rows.length === 0 && payruns.state === "ready" && (
            <Well style={{ padding: "var(--s-5)", marginTop: "var(--s-4)" }}>
              <EmptyState
                title="No payruns at all"
                body="A payrun takes a salary structure and a period, works out who is eligible, and produces one payslip each. Nothing is created until you have seen who is in it."
                action={
                  can("payrun", "create") && (
                    <Button variant="primary" onClick={() => navigate("/payroll/new")}>
                      Start the first payrun
                    </Button>
                  )
                }
              />
            </Well>
          )}
        </>
      )}
    </>
  );
}

/**
 * The open run, as an object rather than a row.
 *
 * It is the only thing on this screen anybody can change, and §01's one
 * primary action per view means it should not have to be found in a table of
 * seven that all look alike.
 */
function OpenRun({ payrun, onOpen }: { payrun: Payrun; onOpen: () => void }) {
  return (
    <Card interactive className="pp-open__card" onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <div className="pp-open__top">
        <div>
          <p className="t-micro pp-open__period">
            {monthLabel(monthOf(payrun.period_end)).toUpperCase()} · OPEN
          </p>
          <h2 className="t-h2" style={{ margin: 0 }}>{payrun.name}</h2>
          <p className="t-ui-sm" style={{ color: "var(--ink-500)", margin: "var(--s-1) 0 0" }}>
            {formatDate(payrun.period_start)} → {formatDate(payrun.period_end)} ·{" "}
            {payrun.salary_structure_name}
          </p>
        </div>
        <StateChip state={payrun.state} />
      </div>

      <div className="pp-open__figures">
        <Figure label="PAYSLIPS">
          <RollingCount value={payrun.payslip_count} scale="l" label="payslips" />
        </Figure>
        <Figure label="GROSS">
          <RollingNumber value={money(payrun.total_gross)} scale="l" label="total gross" />
        </Figure>
        <Figure label="DEDUCTIONS">
          <RollingNumber value={money(payrun.total_deductions)} scale="l" label="total deductions" />
        </Figure>
        <Figure label="NET">
          <RollingNumber value={money(payrun.total_net)} scale="l" label="total net" />
        </Figure>
      </div>

      <p className="pp-open__cta t-ui">
        Open the cockpit <ArrowRight size={16} aria-hidden="true" />
      </p>
    </Card>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pp-open__figure">
      <p className="t-micro">{label}</p>
      {children}
    </div>
  );
}

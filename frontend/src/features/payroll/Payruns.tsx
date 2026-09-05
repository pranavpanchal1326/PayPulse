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
 *
 * **The open run carries its own rail.** The single question anybody arriving
 * at this screen is holding is *how far did last month get* — and answering it
 * used to cost a click into the cockpit. The card now shows the product's own
 * six-stage rail, and it is not a decoration drawn from the row's state: the
 * card fetches that one run's detail, so the rail's `blocked` is the real open
 * error count rather than an optimistic zero. One request, for the one object
 * on the screen that anybody is going to press.
 *
 * **The history is a rhythm before it is a table.** Twelve months of net,
 * drawn as proportional columns above the register. Payroll is the most
 * seasonal number a company has — a bonus month, a hiring quarter, a period
 * that was prorated — and a table sorted by date is the one shape that cannot
 * show that. The columns are the same figures the rows carry, they open the
 * same run, and the tallest is labelled, so the ribbon is a legend for the
 * table rather than a second version of it.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import type { Payrun } from "@/api/contract";
import { PAYRUN_STATES } from "@/api/contract";
import { formatMoney, money } from "@/api/money";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Button, Card, EmptyState, Select, StateChip, Table, Well, type Column,
} from "@/components/system";
import { RollingCount, RollingNumber } from "@/components/signature";
import { monthLabel, monthOf } from "@/lib/date";
import { LoadFailure, SectionNav, formatDate, useFilterParams } from "@/features/shared";
import { getPayrun, listPayruns } from "./api";
import { Rail, railStateFor } from "./Rail";
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

          {history.length > 1 && !state && (
            <Rhythm runs={history} onOpen={(id) => navigate(`/payroll/${id}`)} />
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
  /**
   * The detail, for the rail alone. A rail drawn from the list row would have
   * to assume no open errors, and "REVIEW is done" is exactly the sentence
   * this screen must not say wrongly — so the one card anybody presses pays
   * for the one request that makes it true.
   */
  const detail = useQuery(() => getPayrun(payrun.id), [payrun.id]);
  const blockers = detail.data
    ? detail.data.warnings.filter((w) => w.severity === "ERROR" && !w.is_resolved).length
    : 0;
  const rail = railStateFor(payrun.state, payrun.payslip_count > 0, blockers);

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

      {/* The product's rail, on this run's real numbers. It is not pressable
          here — the whole card is — so it is wrapped rather than nested as a
          control inside a control. */}
      {detail.state === "ready" && (
        <div className="pp-open__rail">
          <Rail
            state={rail}
            caption={
              blockers > 0
                ? `${blockers} blocking ${blockers === 1 ? "error" : "errors"} — review will not clear until they are resolved.`
                : rail.current
                  ? `Standing at ${rail.current.toLowerCase()}.`
                  : "Nothing left to do on this run."
            }
          />
        </div>
      )}

      <p className="pp-open__cta t-ui">
        Open the cockpit <ArrowRight size={16} aria-hidden="true" />
      </p>
    </Card>
  );
}

/* ── The rhythm ribbon ───────────────────────────────────────────────── */

/**
 * Twelve months of net, as proportional columns.
 *
 * **Proportional to the largest month, not to zero-plus-padding.** Payroll
 * totals sit in a narrow band — thirty people cost roughly the same every
 * month — so a chart drawn from zero is twelve identical columns and says
 * nothing. This one is drawn from the *smallest* month, which is what makes
 * the bonus month and the prorated month visible at all, and the axis says so
 * in words rather than leaving somebody to assume a zero baseline.
 */
function Rhythm({ runs, onOpen }: { runs: Payrun[]; onOpen: (id: number) => void }) {
  const months = useMemo(
    () => [...runs].sort((a, b) => a.period_end.localeCompare(b.period_end)).slice(-12),
    [runs],
  );

  const nets = months.map((p) => Number(p.total_net));
  const top = Math.max(...nets);
  const floor = Math.min(...nets);
  const band = top - floor || 1;
  const peak = months[nets.indexOf(top)];

  return (
    <section className="pp-rhythm" aria-label="Net paid, by period">
      <header className="pp-rhythm__head">
        <div>
          <p className="t-micro pp-rhythm__kicker">The rhythm</p>
          <p className="t-ui-sm pp-rhythm__note">
            Net paid across {months.length} closed {months.length === 1 ? "run" : "runs"} — drawn
            against the band between the smallest and largest month, not from zero.
          </p>
        </div>
        {peak && (
          <p className="t-ui-sm pp-rhythm__peak">
            Highest · <span className="n-table">{formatMoney(money(peak.total_net))}</span> in{" "}
            {monthLabel(monthOf(peak.period_end))}
          </p>
        )}
      </header>

      <ol className="pp-rhythm__track">
        {months.map((p) => {
          const share = (Number(p.total_net) - floor) / band;
          return (
            <li key={p.id} className="pp-rhythm__col">
              <button
                type="button"
                className="pp-rhythm__hit focusable"
                onClick={() => onOpen(p.id)}
                aria-label={`${p.name} — ${formatMoney(money(p.total_net))} net across ${p.payslip_count} payslips. Open the cockpit.`}
              >
                <span className="pp-rhythm__bar-well">
                  <span
                    className="pp-rhythm__bar"
                    /* 18% floor: the shortest month is still an object you can
                       point at, and the band is stated above rather than
                       implied by a bar that touches the baseline. */
                    style={{ height: `${18 + share * 82}%` }}
                  />
                </span>
                <span className="t-micro pp-rhythm__month">
                  {monthLabel(monthOf(p.period_end)).slice(0, 3)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
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

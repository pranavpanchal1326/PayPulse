/**
 * S16 · THE PAYRUN COCKPIT — the set piece.
 *
 * Everything about this screen is arranged around one sentence from the PRD:
 * **nothing gets paid until it makes sense.** The warnings are not a footnote
 * at the bottom; they are the left-hand column, they are a triage inbox, and
 * every one of them states what it blocks. The payslips are on the right,
 * because they are the *consequence* of the warnings being clear.
 *
 * Four decisions worth naming.
 *
 * **`Validate` is refused, not disabled-with-a-shrug.** An open ERROR means
 * the API answers 422 naming the errors, and the screen shows that sentence.
 * Disabling the key silently would leave "why can't I validate?" unanswered by
 * the interface that refused.
 *
 * **Force-pay demands a typed reason before the key enables.** §4.8 allows
 * releasing past an open `MISSING_BANK_DETAILS`; it does not allow doing so
 * silently. The reason is stored on the payrun and printed on this screen
 * forever after.
 *
 * **A PAID payrun offers no recompute path at all.** Not disabled — absent.
 * Money has moved and the record stands (§4.8). A greyed `Recompute` on a paid
 * run is an advertisement for an operation that must never happen.
 *
 * **The room is dark** (§04.4), and leaving it restores the theme.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Ban, Calculator, CheckCircle2, Mail, RotateCcw, Wallet,
} from "lucide-react";
import type { PayrollWarning, Payslip, PayrunDetail } from "@/api/contract";
import { WARNING_META } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { money } from "@/api/money";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Badge, Button, EmptyState, Modal, Skeleton, StateChip, Table, Textarea, WarningCard,
  Well, cx, useToast, type Column,
} from "@/components/system";
import { Ratio, RollingCount, RollingNumber } from "@/components/signature";
import { useSound } from "@/sound/useSound";
import { LoadFailure, decimalLabel, formatDate } from "@/features/shared";
import {
  cancelPayrun, computePayrun, getPayrun, markPaid, reopenPayrun, sendPayslips,
  validatePayrun,
} from "./api";
import { DarkRoom } from "./DarkRoom";
import { Rail, railStateFor } from "./Rail";

/** §4.8 — forcing is allowed; forcing silently is not. */
const MIN_REASON = 12;

export function Cockpit({ id }: { id: number }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const play = useSound();

  const payrun = useQuery(() => getPayrun(id), [id]);
  const [busy, setBusy] = useState<string>();
  const [refusal, setRefusal] = useState<{ code: string; message: string }>();
  const [forcing, setForcing] = useState(false);
  const [forceReason, setForceReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sent, setSent] = useState<string>();

  const detail = payrun.data;

  const openWarnings = useMemo(
    () => (detail?.warnings ?? []).filter((w) => !w.is_resolved),
    [detail],
  );
  const errors = openWarnings.filter((w) => w.severity === "ERROR");
  const payBlockers = openWarnings.filter((w) => w.blocks === "mark-paid");

  async function run(label: string, action: () => Promise<PayrunDetail>, done: string) {
    setRefusal(undefined);
    setBusy(label);
    try {
      await action();
      payrun.reload();
      toast(done, "jade");
    } catch (cause) {
      play("blocked");
      setRefusal(
        cause instanceof ApiError
          ? { code: cause.code, message: cause.message }
          : { code: "unknown", message: "That did not work. Nothing changed." },
      );
    } finally {
      setBusy(undefined);
    }
  }

  async function send() {
    setRefusal(undefined);
    setBusy("send");
    try {
      const result = await sendPayslips(id);
      play("send");
      setSent(result.message);
    } catch (cause) {
      setRefusal(
        cause instanceof ApiError
          ? { code: cause.code, message: cause.message }
          : { code: "unknown", message: "The payslips were not queued." },
      );
    } finally {
      setBusy(undefined);
    }
  }

  if (payrun.state === "error") {
    return (
      <DarkRoom>
        <PageHeader title="Payrun" meta="Could not load." />
        <LoadFailure what="This payrun" error={payrun.error} onRetry={payrun.reload} />
      </DarkRoom>
    );
  }

  if (!detail) {
    return (
      <DarkRoom>
        <PageHeader title="Payrun" meta="Loading…" />
        <Well style={{ padding: "var(--s-5)" }}><Skeleton width="100%" /></Well>
      </DarkRoom>
    );
  }

  const rail = railStateFor(detail.state, detail.payslip_count > 0, errors.length);
  const editable = can("payrun", "update");
  const paid = detail.state === "PAID";
  const cancelled = detail.state === "CANCELLED";

  return (
    <DarkRoom>
      <PageHeader
        title={detail.name}
        meta={
          <span>
            {formatDate(detail.period_start)} → {formatDate(detail.period_end)} ·{" "}
            {detail.salary_structure_name} · {detail.currency}
          </span>
        }
        action={
          <div className="pp-form__row">
            <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={() => navigate("/payroll")}>
              All payruns
            </Button>
            <StateChip state={detail.state} />
          </div>
        }
      />

      <Rail
        state={rail}
        caption={captionFor(detail, errors.length, payBlockers.length)}
      />

      {/* Four totals, rolling. They move when Compute lands. */}
      <div className="pp-cock__totals">
        <Total label="PAYSLIPS">
          <RollingCount value={detail.payslip_count} scale="l" label="payslips" />
        </Total>
        <Total label="GROSS">
          <RollingNumber value={money(detail.total_gross)} scale="l" label="total gross" />
        </Total>
        <Total label="DEDUCTIONS">
          <RollingNumber value={money(detail.total_deductions)} scale="l" label="total deductions" />
        </Total>
        <Total label="NET">
          <RollingNumber value={money(detail.total_net)} scale="l" label="total net" />
        </Total>
      </div>

      {refusal && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="error"
            code={refusal.code.toUpperCase()}
            detail={refusal.message}
            blocks="Nothing changed. The payrun is exactly where it was."
            action={<Button size="sm" variant="quiet" onClick={() => setRefusal(undefined)}>Dismiss</Button>}
          />
        </div>
      )}

      {sent && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="info"
            code="PAYSLIPS_QUEUED"
            detail={sent}
            blocks="Informational. Delivery happens in the background — the run is already paid."
            action={<Button size="sm" variant="quiet" onClick={() => setSent(undefined)}>Dismiss</Button>}
          />
        </div>
      )}

      {detail.force_paid_reason && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="warning"
            code="RELEASED_WITH_WARNINGS"
            detail={`Released past an open warning. Reason given: "${detail.force_paid_reason}"`}
            blocks="Informational, and permanent — this stays on the record."
          />
        </div>
      )}

      {/* ── The keys ────────────────────────────────────────────────── */}
      {editable && !cancelled && (
        <div className="pp-cock__keys">
          {!paid && (
            <Button
              variant="primary"
              size="lg"
              icon={<Calculator size={16} />}
              loading={busy === "compute"}
              disabled={detail.state === "VALIDATED"}
              onClick={() => run("compute", () => computePayrun(id), "Computed. Every payslip is fresh.")}
            >
              {detail.state === "DRAFT" ? "Compute" : "Recompute"}
            </Button>
          )}

          {(detail.state === "COMPUTED" || detail.state === "DRAFT") && (
            <Button
              variant="secondary"
              size="lg"
              icon={<CheckCircle2 size={16} />}
              loading={busy === "validate"}
              onClick={() => run("validate", () => validatePayrun(id), "Validated. The payslips are final.")}
            >
              Validate
            </Button>
          )}

          {detail.state === "VALIDATED" && (
            <>
              <Button
                variant="primary"
                size="lg"
                icon={<Wallet size={16} />}
                loading={busy === "pay"}
                onClick={() =>
                  payBlockers.length > 0
                    ? setForcing(true)
                    : run("pay", () => markPaid(id), "Marked paid. This run is now immutable.")
                }
              >
                Mark paid
              </Button>
              <Button
                variant="quiet"
                icon={<RotateCcw size={16} />}
                loading={busy === "reopen"}
                onClick={() => run("reopen", () => reopenPayrun(id), "Reopened as a draft.")}
              >
                Reopen
              </Button>
            </>
          )}

          {(detail.state === "VALIDATED" || paid) && (
            <Button
              variant="secondary"
              size="lg"
              icon={<Mail size={16} />}
              loading={busy === "send"}
              onClick={send}
            >
              Send payslips
            </Button>
          )}

          {/* A PAID run offers no recompute and no cancel. Absent, not disabled. */}
          {!paid && can("payrun", "delete") && (
            <Button variant="quiet" icon={<Ban size={16} />} onClick={() => setConfirmCancel(true)}>
              Cancel payrun
            </Button>
          )}
        </div>
      )}

      {paid && (
        <p className="t-ui-sm pp-cock__final">
          This run was paid on {formatDate((detail.paid_at ?? "").slice(0, 10))}. Paid
          payroll is immutable — there is no recompute, no reopen and no cancel
          from here. A correction is a separate run.
        </p>
      )}

      {/* ── Warnings left, payslips right ───────────────────────────── */}
      <div className="pp-cock__body">
        <WarningInbox warnings={detail.warnings} counts={detail.warning_counts} />
        <PayslipTable
          payslips={detail.payslips}
          onOpen={(slip) => navigate(`/payroll/payslips/${slip.id}`)}
        />
      </div>

      {/* Force-pay: the key stays disabled until a reason is typed. */}
      <Modal
        open={forcing}
        onClose={() => {
          setForcing(false);
          setForceReason("");
        }}
        title="Release with warnings open?"
        description={`${payBlockers.length} ${payBlockers.length === 1 ? "employee has" : "employees have"} no bank details on file. Their payslip is correct, but the payment cannot reach them. Releasing anyway is allowed — releasing silently is not.`}
        footer={
          <>
            <Button
              variant="quiet"
              onClick={() => {
                setForcing(false);
                setForceReason("");
              }}
            >
              Go back and fix them
            </Button>
            <Button
              variant="danger"
              loading={busy === "pay"}
              disabled={forceReason.trim().length < MIN_REASON}
              onClick={async () => {
                setForcing(false);
                await run(
                  "pay",
                  () => markPaid(id, { force: true, force_paid_reason: forceReason.trim() }),
                  "Marked paid, with the reason recorded on the run.",
                );
                setForceReason("");
              }}
            >
              Release and mark paid
            </Button>
          </>
        }
      >
        <ul className="pp-cock__blockers">
          {payBlockers.slice(0, 6).map((w) => (
            <li key={w.id} className="t-ui-sm">{w.employee_name ?? w.message}</li>
          ))}
          {payBlockers.length > 6 && (
            <li className="t-ui-sm">and {payBlockers.length - 6} more</li>
          )}
        </ul>
        <Textarea
          label="Why is this being released with warnings open?"
          required
          rows={3}
          placeholder="Bank details confirmed by finance; payment will be made by cheque this month."
          help={`Stored on the payrun and shown on this screen from now on. At least ${MIN_REASON} characters.`}
          value={forceReason}
          onChange={(e) => setForceReason(e.target.value)}
        />
      </Modal>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={`Cancel ${detail.name}?`}
        description="Every payslip in this run is cancelled with it. The run stays on the record as cancelled rather than disappearing, and the period can be run again."
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirmCancel(false)}>Keep it open</Button>
            <Button
              variant="danger"
              loading={busy === "cancel"}
              onClick={async () => {
                setConfirmCancel(false);
                await run("cancel", () => cancelPayrun(id), "Payrun cancelled.");
              }}
            >
              Cancel the payrun
            </Button>
          </>
        }
      />
    </DarkRoom>
  );
}

/* ── The rail's caption ───────────────────────────────────────────────── */

function captionFor(detail: PayrunDetail, errors: number, payBlockers: number): string {
  if (detail.state === "CANCELLED") return "This run was cancelled. Its payslips went with it.";
  if (detail.state === "PAID") return "Paid. This record is final.";
  if (detail.state === "VALIDATED") {
    return payBlockers > 0
      ? `Validated. ${payBlockers} ${payBlockers === 1 ? "employee has" : "employees have"} no bank details — paying needs a written reason.`
      : "Validated and ready to pay.";
  }
  if (errors > 0) {
    return `${errors} ${errors === 1 ? "error blocks" : "errors block"} validation. Clear them in the inbox on the left.`;
  }
  if (detail.state === "COMPUTED") return "Computed and clear. Validate when the numbers look right.";
  return "Draft. Compute to produce the payslips.";
}

/* ── The triage inbox ─────────────────────────────────────────────────── */

/**
 * §4.9's whole vocabulary, sorted by how much it stops. Every card states what
 * it blocks — a warning that blocks nothing says "Informational", because the
 * alternative is a reader who cannot tell the difference between a note and a
 * wall.
 */
function WarningInbox({
  warnings,
  counts,
}: {
  warnings: PayrollWarning[];
  counts: Record<string, number>;
}) {
  const [filter, setFilter] = useState<"open" | "all">("open");

  const shown = useMemo(() => {
    const rows = filter === "open" ? warnings.filter((w) => !w.is_resolved) : warnings;
    const rank = { ERROR: 0, WARNING: 1, INFO: 2 } as const;
    return [...rows].sort(
      (a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code),
    );
  }, [warnings, filter]);

  const open = warnings.filter((w) => !w.is_resolved);

  return (
    <section className="pp-inbox" aria-label="Warnings">
      <header className="pp-inbox__head">
        <h2 className="t-h3" style={{ margin: 0 }}>Warnings</h2>
        <span className="pp-inbox__counts">
          {(["ERROR", "WARNING", "INFO"] as const).map((severity) => (
            <span key={severity} className={cx("pp-inbox__count", `pp-inbox__count--${severity.toLowerCase()}`)}>
              {counts[severity] ?? 0} {severity.toLowerCase()}
            </span>
          ))}
        </span>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => setFilter((f) => (f === "open" ? "all" : "open"))}
        >
          {filter === "open" ? "Show resolved too" : "Open only"}
        </Button>
      </header>

      <div className="pp-inbox__list">
        {shown.length === 0 ? (
          <EmptyState
            title={open.length === 0 ? "Nothing is blocking this run" : "No warnings match"}
            body={
              open.length === 0
                ? "Every payslip reconciles, every employee has a contract covering the period, and the bank details are on file."
                : "Switch the filter to see resolved warnings."
            }
          />
        ) : (
          shown.map((warning, index) => (
            <WarningCard
              key={warning.id}
              index={index}
              severity={warning.severity.toLowerCase() as "error" | "warning" | "info"}
              code={warning.code}
              detail={
                warning.employee_name
                  ? `${warning.employee_name} — ${warning.message}`
                  : warning.message
              }
              blocks={blocksText(warning)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function blocksText(warning: PayrollWarning): string {
  if (warning.is_resolved) return "Resolved.";
  const meta = WARNING_META[warning.code];
  const blocks = warning.blocks ?? meta?.blocks ?? null;
  if (blocks === "validate") return "Blocks validation. This run cannot be finalised until it is fixed.";
  if (blocks === "compute") return "Blocks computation. Nothing can be produced until it is fixed.";
  if (blocks === "mark-paid") return "Blocks payment unless it is released with a written reason.";
  return "Informational. It blocks nothing.";
}

/* ── The payslip table ────────────────────────────────────────────────── */

function PayslipTable({
  payslips,
  onOpen,
}: {
  payslips: Payslip[];
  onOpen: (slip: Payslip) => void;
}) {
  const columns: Column<Payslip>[] = useMemo(
    () => [
      { id: "employee", header: "Employee", accessorFn: (p) => p.employee_name },
      {
        id: "days",
        header: "Days",
        accessorFn: (p) => p.contract_days,
        cell: ({ row }) => (
          <span className="pp-cock__days">
            <Ratio
              value={row.original.contract_days}
              of={row.original.period_days}
              warnBelowFull
              label={`On contract for ${row.original.contract_days} of ${row.original.period_days} days`}
            />
            <span className="t-micro">
              {row.original.contract_days}/{row.original.period_days}
            </span>
          </span>
        ),
      },
      {
        id: "unpaid",
        header: "Unpaid",
        accessorFn: (p) => Number(p.unpaid_days),
        meta: { numeric: true },
        cell: ({ row }) =>
          Number(row.original.unpaid_days) > 0 ? (
            <span style={{ color: "var(--orange-500)" }}>
              {decimalLabel(row.original.unpaid_days)}
            </span>
          ) : (
            <span style={{ color: "var(--ink-300)" }}>—</span>
          ),
      },
      {
        id: "gross",
        header: "Gross",
        accessorFn: (p) => Number(p.gross),
        meta: { numeric: true },
        cell: ({ row }) => <RollingNumber value={money(row.original.gross)} scale="table" />,
      },
      {
        id: "net",
        header: "Net",
        accessorFn: (p) => Number(p.net),
        meta: { numeric: true },
        cell: ({ row }) => <RollingNumber value={money(row.original.net)} scale="table" />,
      },
      {
        id: "flags",
        header: "Flags",
        accessorFn: (p) => p.warning_codes.length,
        cell: ({ row }) =>
          row.original.warning_codes.length === 0 ? (
            <span style={{ color: "var(--ink-300)" }}>—</span>
          ) : (
            <span className="pp-cock__flags">
              {row.original.warning_codes.slice(0, 2).map((code) => (
                <Badge
                  key={code}
                  tone={WARNING_META[code]?.severity === "ERROR" ? "vermilion" : "orange"}
                >
                  {code}
                </Badge>
              ))}
              {row.original.warning_codes.length > 2 && (
                <span className="t-micro">+{row.original.warning_codes.length - 2}</span>
              )}
            </span>
          ),
      },
      {
        id: "state",
        header: "State",
        accessorFn: (p) => p.state,
        cell: ({ row }) => <StateChip state={row.original.state} />,
      },
    ],
    [],
  );

  return (
    <section className="pp-cock__slips" aria-label="Payslips">
      <h2 className="t-h3" style={{ margin: "0 0 var(--s-3)" }}>Payslips</h2>
      <Table
        caption="Payslips in this run"
        data={payslips}
        columns={columns}
        density="compact"
        getRowId={(p) => String(p.id)}
        onRowClick={onOpen}
        maxHeight={520}
        empty={
          <EmptyState
            title="No payslips yet"
            body="Compute produces one payslip for every employee in the run. Until then this run holds only its scope."
          />
        }
      />
    </section>
  );
}

function Total({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pp-cock__total">
      <p className="t-micro">{label}</p>
      {children}
    </div>
  );
}

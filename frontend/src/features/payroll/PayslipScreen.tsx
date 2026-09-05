/**
 * S17 · THE PAYSLIP
 *
 * Back to light (§12). The cockpit is where money moves; this is the receipt,
 * and a receipt is a calm object on a flush field.
 *
 * **Every line opens.** §10.3 is the product's core promise — *any figure
 * anywhere is clickable and they all open the same drawer* — and this is the
 * screen where it has to be true without exception. The net figure, each
 * earnings line, each deduction: all of them build a node in the same
 * derivation tree and hand it to the same `ProvenanceDrawer`.
 *
 * **A failed rule renders at zero with its error, never blank.** §4.9's
 * `RULE_EVAL_FAILED` is the case people forget: a rule that could not evaluate
 * still has a line, because a missing line is indistinguishable from a rule
 * that was never configured — and one of those is a bug while the other is a
 * decision.
 *
 * **The STACK is in the margin**, flat SVG at the real proportions, and each
 * block opens the same drawer the line beside it does.
 *
 * **`Print PDF` resolves the card into a document.** The bytes come from the
 * API, with the bearer token — see `fetchPayslipPdf`.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileDown, RefreshCw, RotateCw } from "lucide-react";
import type { SalaryRule } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { money } from "@/api/money";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Button, EmptyState, Skeleton, WarningCard, Well, useToast,
} from "@/components/system";
import {
  PayslipCard, ProvenanceDrawer, Stack, buildPayslipProvenance,
  type ProvenanceNode, type StackBlock,
} from "@/components/signature";
import { useSound } from "@/sound/useSound";
import { LoadFailure, formatDate } from "@/features/shared";
import { fetchPayslipPdf, getPayslip, getStructure, recomputePayslip } from "./api";

export function PayslipScreen({ id }: { id: number }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const play = useSound();

  const payslip = useQuery(() => getPayslip(id), [id]);
  const detail = payslip.data;

  /**
   * The rules as *written* — the provenance tree shows a rule's formula, and
   * the payslip's own lines are denormalised copies that carry the amount but
   * not the expression that produced it.
   */
  const structureId = detail?.contract?.salary_structure_id ?? null;
  const structure = useQuery(
    () => (structureId === null ? Promise.resolve(null) : getStructure(structureId)),
    [structureId],
  );
  const rules: SalaryRule[] = structure.data?.rules ?? [];

  const [flipped, setFlipped] = useState(false);
  const [tree, setTree] = useState<ProvenanceNode | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  const root = useMemo(
    () => (detail ? buildPayslipProvenance({ payslip: detail, rules }) : null),
    [detail, rules],
  );

  /** Find one line's node inside the tree the payslip already built. */
  function openFor(code: string | null) {
    if (!root) return;
    if (code === null) {
      setTree(root);
    } else {
      const found = findNode(root, code);
      setTree(found ?? root);
    }
    setDrawerOpen(true);
  }

  async function printPdf() {
    if (!detail) return;
    setPdfBusy(true);
    setFailure(undefined);
    try {
      const { blob, filename } = await fetchPayslipPdf(detail.id);
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener");
      if (!opened) {
        // A blocked pop-up must not look like a failed request.
        setFailure(
          `The document was produced but the browser blocked the window. ` +
            `Allow pop-ups for this site, or use the download link. (${filename ?? "payslip.pdf"})`,
        );
      }
      play("send");
      // The object URL is revoked once the new tab has taken it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setFailure(
        cause instanceof ApiError ? cause.message : "The document could not be produced.",
      );
    } finally {
      setPdfBusy(false);
    }
  }

  async function recompute() {
    if (!detail) return;
    setFailure(undefined);
    try {
      await recomputePayslip(detail.id);
      payslip.reload();
      toast("Recomputed against the current attendance and leave.", "jade");
    } catch (cause) {
      // 409 here is "this belongs to a validated or paid run" — a state fact
      // with a sentence, and it belongs on screen.
      setFailure(cause instanceof ApiError ? cause.message : "It could not be recomputed.");
    }
  }

  if (payslip.state === "error") {
    const gone = payslip.error instanceof ApiError && payslip.error.status === 404;
    return gone ? (
      <>
        <PageHeader title="Payslip" meta="Not found." />
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="That payslip is not here"
            body="It was cancelled with its payrun, or it belongs to somebody outside the part of the organisation your role covers."
            action={<Button variant="quiet" onClick={() => navigate("/payroll")}>Back to payroll</Button>}
          />
        </Well>
      </>
    ) : (
      <LoadFailure what="This payslip" error={payslip.error} onRetry={payslip.reload} />
    );
  }

  if (!detail) {
    return (
      <>
        <PageHeader title="Payslip" meta="Loading…" />
        <Well style={{ padding: "var(--s-5)" }}><Skeleton width="100%" /></Well>
      </>
    );
  }

  const failed = detail.warnings.filter((w) => w.code === "RULE_EVAL_FAILED" && !w.is_resolved);

  /**
   * Which lines failed. §4.9's message names the rule, so the code is read
   * back out of it rather than guessed — a line marked wrongly is worse than
   * one not marked at all.
   */
  const failedCodes = detail.lines
    .map((l) => l.rule_code)
    .filter((code) => failed.some((w) => w.message.includes(code)));

  const blocks: StackBlock[] = detail.lines
    .filter((l) => l.category !== "GROSS" && l.category !== "NET")
    .map((l) => ({
      code: l.rule_code,
      name: l.name,
      kind: l.category === "DEDUCTION" ? "deduct" : "add",
      amount: money(l.amount),
      sequence: l.sequence,
      formula: rules.find((r) => r.code === l.rule_code)?.amount_formula ?? null,
    }));

  return (
    <>
      <PageHeader
        title="Payslip"
        meta={
          <span>
            <Link to={`/payroll/${detail.payrun_id}`} className="focusable">
              ← Back to the payrun
            </Link>
            {" · "}
            {formatDate(detail.period_start)} → {formatDate(detail.period_end)}
          </span>
        }
        action={
          <div className="pp-form__row">
            <Button
              variant="quiet"
              icon={<RotateCw size={16} />}
              onClick={() => setFlipped((f) => !f)}
            >
              {flipped ? "Show the payslip" : "Show the derivation"}
            </Button>
            {/* A validated or paid payslip has no recompute offered at all. */}
            {can("payslip", "update") && detail.state !== "PAID" && detail.state !== "VALIDATED" && (
              <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={recompute}>
                Recompute
              </Button>
            )}
            <Button
              variant="primary"
              icon={<FileDown size={16} />}
              loading={pdfBusy}
              onClick={printPdf}
            >
              Print PDF
            </Button>
          </div>
        }
      />

      {failure && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="warning"
            code="PAYSLIP_ACTION"
            detail={failure}
            blocks="The payslip itself is unchanged."
            action={<Button size="sm" variant="quiet" onClick={() => setFailure(undefined)}>Dismiss</Button>}
          />
        </div>
      )}

      {failed.length > 0 && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          {failed.map((w) => (
            <WarningCard
              key={w.id}
              severity="warning"
              code={w.code}
              detail={w.message}
              blocks="The line below stands at zero. It is printed rather than hidden, so the gap is visible."
            />
          ))}
        </div>
      )}

      <div className="pp-slip">
        {/*
          §12 S17: *the flip card, centred on a flush field.* The card **is**
          the document — it carries the day counts, the grouped lines, the
          totals and the net, and its back face is the derivation. A second
          rendering of the same lines below it would be the same payslip twice,
          which is exactly the duplication §10.4 exists to avoid: the object
          has two faces, not a face and a transcript.
        */}
        <div className="pp-slip__card">
          <PayslipCard
            payslip={detail}
            rules={rules}
            flipped={flipped}
            onFlip={setFlipped}
            onWhy={() => openFor(null)}
            onLine={(code) => openFor(code)}
            failedCodes={failedCodes}
          />
        </div>

        {/* THE STACK, in the right margin. Blocks open the same drawer the
            lines do — one figure, one derivation, one drawer. */}
        <aside className="pp-slip__stack" aria-label="How this payslip was built">
          {blocks.length > 0 ? (
            <Stack
              className="pp-stack--narrow"
              blocks={blocks}
              gross={money(detail.gross)}
              net={money(detail.net)}
              onOpen={(code) => openFor(code)}
            />
          ) : (
            <div className="pp-preview__empty"><p className="t-micro">NO LINES TO DRAW</p></div>
          )}

          <p className="t-ui-sm pp-slip__foot">
            Income Tax (simplified) is demo content, not statutory tax.
            Confidential — for the named employee only.
          </p>
        </aside>
      </div>

      <ProvenanceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        tree={tree}
        subject={`${detail.employee_name} · ${formatDate(detail.period_start)} → ${formatDate(detail.period_end)}`}
      />
    </>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

function findNode(node: ProvenanceNode, code: string): ProvenanceNode | null {
  if (node.code === code) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, code);
    if (found) return found;
  }
  return null;
}

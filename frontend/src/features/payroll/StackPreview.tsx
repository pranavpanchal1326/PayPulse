/**
 * S13's right-hand pane — THE STACK, live.
 *
 * The tower is the real §10.2 component with the real proportions: additive
 * rules stack, deductions carve, and the block heights are the amounts. That
 * is what makes an edit legible — 40% to 50% on `HRA` makes the tower visibly
 * taller and, because `SPECIAL` is the balancing figure, makes another block
 * visibly shorter. A bar chart would not have shown the second half of that.
 *
 * **The stale frame stays up while the next one computes.** Each formula rule
 * is a round-trip to the sandbox and they cannot be parallelised, so a
 * twelve-rule structure takes about a second. Blanking the pane for that
 * second would make every keystroke a flash; instead the previous tower dims
 * slightly and the label says what is happening.
 */
import { AlertTriangle } from "lucide-react";
import { Stack, type StackBlock } from "@/components/signature";
import { cx } from "@/components/system";
import { decimalLabel } from "@/features/shared";
import type { Preview } from "./preview";

export function StackPreview({
  preview,
  highlight,
}: {
  preview: Preview;
  /** The rule being edited — named under the tower so the eye can find it. */
  highlight?: string;
}) {
  const blocks: StackBlock[] = preview.lines
    // GROSS and NET are totals of the others; drawing them would double the
    // tower. Same exclusion the payslip's own stack makes.
    .filter((l) => l.category !== "GROSS" && l.category !== "NET")
    .map((l) => ({
      code: l.code,
      name: l.name,
      kind: l.category === "DEDUCTION" ? "deduct" : "add",
      amount: l.amount,
      sequence: l.sequence,
      formula: l.formula,
    }));

  const failures = preview.lines.filter((l) => l.error);
  const skipped = preview.lines.filter((l) => !l.applied && !l.error);

  return (
    <aside
      className={cx("pp-preview", preview.state === "computing" && "pp-preview--computing")}
      aria-label="Live preview of this structure"
    >
      <header className="pp-preview__head">
        <p className="t-micro pp-preview__label">
          {preview.state === "computing" ? "RECOMPUTING…" : "AGAINST ONE ORDINARY MONTH"}
        </p>
        <p className="t-ui-sm pp-preview__sub">
          The API's own sample context — not anybody's pay.
        </p>
      </header>

      {preview.state === "error" ? (
        <p className="t-ui-sm" style={{ color: "var(--vermilion-500)" }}>{preview.error}</p>
      ) : blocks.length === 0 ? (
        /* §14 — never a blank frame. The well keeps its shape. */
        <div className="pp-preview__empty">
          <p className="t-micro">NOTHING TO DRAW YET</p>
        </div>
      ) : (
        <Stack className="pp-stack--narrow" blocks={blocks} gross={preview.gross} net={preview.net} />
      )}

      {highlight && blocks.some((b) => b.code === highlight) && (
        <p className="t-ui-sm pp-preview__editing">
          Editing <code className="n-mono">{highlight}</code> — its block is in the
          tower above.
        </p>
      )}

      {failures.length > 0 && (
        <div className="pp-preview__notes">
          {failures.map((line) => (
            <p key={line.code} className="t-ui-sm pp-preview__fail">
              <AlertTriangle size={13} aria-hidden="true" />
              <span>
                <code className="n-mono">{line.code}</code> did not evaluate: {line.error} It
                would land on the payslip at zero with{" "}
                <code className="n-mono">RULE_EVAL_FAILED</code> against it.
              </span>
            </p>
          ))}
        </div>
      )}

      {skipped.length > 0 && (
        <p className="t-ui-sm pp-preview__skipped">
          Not firing in this sample:{" "}
          {skipped.map((l) => (
            <code key={l.code} className="n-mono">{l.code}</code>
          ))}
          . Their conditions are false for an ordinary month, so no line prints.
        </p>
      )}

      <dl className="pp-preview__totals">
        <div>
          <dt className="t-micro">GROSS</dt>
          <dd className="n-mono">{decimalLabel((preview.gross / 100).toFixed(2))}</dd>
        </div>
        <div>
          <dt className="t-micro">DEDUCTIONS</dt>
          <dd className="n-mono">−{decimalLabel((preview.deductions / 100).toFixed(2))}</dd>
        </div>
        <div>
          <dt className="t-micro">NET</dt>
          <dd className="n-mono">{decimalLabel((preview.net / 100).toFixed(2))}</dd>
        </div>
      </dl>
    </aside>
  );
}

/**
 * THE PAYSLIP · blueprint §10.4 — a physical object that flips.
 *
 * Not a page. A card with a real edge and two faces: the **document** on the
 * front, the **derivation** on the back — the same lines with their formulas,
 * their inputs, and the contract that applied.
 *
 * **The shadow is the whole trick.** A `rotateY` on its own reads as a CSS
 * transform, because nothing else in the scene acknowledges that the object
 * moved. So the cast shadow is a separate element driven by the same rotation:
 * as the card turns edge-on it narrows and sharpens — the card is presenting
 * less surface to the light — and at 90° it is at its thinnest. That is one
 * `useTransform` chain, and it is the difference between an object and a
 * texture.
 *
 * Reduced motion (§07.5) cross-fades the two faces instead of rotating. The
 * card still has two sides; it just stops moving between them.
 */
import { motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { RotateCw } from "lucide-react";
import type { PayslipDetail, SalaryRule } from "@/api/contract";
import { formatMoney, money } from "@/api/money";
import { spring } from "@/motion/springs";
import { Button } from "@/components/system";
import { cx } from "@/components/system/cx";
import { RollingNumber } from "./RollingNumber";

const CATEGORY_LABEL: Record<string, string> = {
  BASIC: "Basic",
  ALLOWANCE: "Allowances",
  DEDUCTION: "Deductions",
  GROSS: "Gross",
  NET: "Net",
};

/**
 * One line of the document.
 *
 * It becomes a **button** when the page hands it an `onOpen`. §10.3 is
 * absolute — *any figure anywhere is clickable and they all open the same
 * drawer* — and a payslip whose net opened but whose lines did not would be
 * the one place the promise visibly stopped. The element changes rather than
 * an overlay being added, so the keyboard gets it for free.
 */
function Rule({
  label,
  value,
  negative,
  total,
  failed,
  onOpen,
}: {
  label: string;
  value: string;
  negative?: boolean;
  total?: boolean;
  /** The rule did not evaluate: the line prints at zero and says so (§4.9). */
  failed?: boolean;
  onOpen?: () => void;
}) {
  const inner = (
    <>
      <span className={total ? "t-ui" : "t-ui-sm"} style={{ color: total ? undefined : "var(--ink-500)" }}>
        {label}
        {failed && <span className="pp-payslip__failed t-micro">DID NOT EVALUATE</span>}
      </span>
      <span
        className="n-table"
        style={negative ? { color: "var(--vermilion-500)" } : undefined}
      >
        {negative ? "− " : ""}
        {value}
      </span>
    </>
  );

  const className = cx(
    "pp-payslip__rule",
    total && "pp-payslip__rule--total",
    failed && "pp-payslip__rule--failed",
    onOpen && "pp-payslip__rule--open",
  );

  return onOpen ? (
    <button type="button" className={cx(className, "focusable")} onClick={onOpen} title="Why this number?">
      {inner}
    </button>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export interface PayslipCardProps {
  payslip: PayslipDetail;
  rules?: SalaryRule[];
  flipped?: boolean;
  onFlip?: (flipped: boolean) => void;
  /** Clicking the net figure asks the page to open the provenance drawer. */
  onWhy?: () => void;
  /** Clicking any *line* opens the same drawer, at that line. §10.3. */
  onLine?: (ruleCode: string) => void;
  /** Rule codes that failed to evaluate — printed at zero, marked, not hidden. */
  failedCodes?: string[];
  className?: string;
}

export function PayslipCard({
  payslip,
  rules = [],
  flipped = false,
  onFlip,
  onWhy,
  onLine,
  failedCodes = [],
  className,
}: PayslipCardProps) {
  const failed = new Set(failedCodes);
  const reduced = useReducedMotion();

  /**
   * One motion value drives everything: the card's rotation, and through it
   * the shadow. Driving the shadow off React state instead would let the two
   * fall a frame apart, which is exactly the tell that breaks the illusion.
   */
  /**
   * The rotation is animated **declaratively** — `animate` plus `transition`,
   * the same shape every other spring in this product is declared with — and
   * mirrored into a motion value on every frame so the shadow can read it.
   *
   * `onUpdate` rather than React state is what keeps the two together: the
   * shadow is recomputed inside the same frame as the rotation that caused it.
   * A `setState` per frame would put the shadow one render behind the card,
   * which is precisely the lag that stops it reading as one object.
   */
  const rotate = useMotionValue(flipped ? 180 : 0);

  /**
   * Edge-on at 90° and 270°: the card presents almost no surface, so the
   * shadow is at its narrowest and darkest. `Math.abs(sin)` gives exactly that
   * shape once per half-turn.
   */
  const face = useTransform(rotate, (r) => Math.abs(Math.sin((r * Math.PI) / 180)));
  const shadowScaleX = useTransform(face, (f) => 1 - f * 0.55);
  const shadowOpacity = useTransform(face, (f) => 0.55 + f * 0.35);
  const shadowBlur = useTransform(face, (f) => `blur(${12 - f * 6}px)`);
  // The card leans as it turns, so its shadow slides out from under it.
  const shadowX = useTransform(rotate, (r) => Math.sin((r * Math.PI) / 180) * 10);

  const earnings = payslip.lines.filter(
    (l) => l.category === "BASIC" || l.category === "ALLOWANCE",
  );
  const deductions = payslip.lines.filter((l) => l.category === "DEDUCTION");
  const ruleByCode = new Map(rules.map((r) => [r.code, r]));

  return (
    <div className={cx("pp-payslip", className)}>
      <motion.div
        className="pp-payslip__shadow"
        style={
          reduced
            ? undefined
            : {
                scaleX: shadowScaleX,
                opacity: shadowOpacity,
                filter: shadowBlur,
                x: shadowX,
              }
        }
        aria-hidden="true"
      />

      <motion.div
        className="pp-payslip__inner"
        animate={reduced ? undefined : { rotateY: flipped ? 180 : 0 }}
        transition={spring.card}
        onUpdate={(latest) => {
          const value = latest.rotateY;
          if (typeof value === "number") rotate.set(value);
          else if (typeof value === "string") rotate.set(parseFloat(value));
        }}
      >
        {/* ── Front · the document ─────────────────────────────────── */}
        <div
          className="pp-payslip__face"
          // Under reduced motion the faces cross-fade, so the hidden one must
          // leave the accessibility tree rather than sit behind the visible.
          aria-hidden={reduced && flipped ? true : undefined}
          style={reduced && flipped ? { display: "none" } : undefined}
        >
          <p className="t-micro" style={{ color: "var(--ink-400)", margin: 0 }}>
            Payslip · {payslip.period_start} to {payslip.period_end}
          </p>
          <h2 className="t-h2" style={{ margin: "var(--s-1) 0 0" }}>
            {payslip.employee_name}
          </h2>
          <p className="t-ui-sm" style={{ color: "var(--ink-500)", margin: "var(--s-1) 0 0" }}>
            {payslip.employee_number}
            {payslip.department_name ? ` · ${payslip.department_name}` : ""}
          </p>

          <div className="pp-payslip__group">
            <p className="t-micro" style={{ color: "var(--ink-400)", margin: "0 0 var(--s-2)" }}>
              Days
            </p>
            <Rule label="Payable / period" value={`${payslip.payable_days} / ${payslip.period_days}`} />
            {Number(payslip.unpaid_days) > 0 && (
              <Rule label="Unpaid" value={payslip.unpaid_days} negative />
            )}
            {Number(payslip.overtime_hours) > 0 && (
              <Rule label="Overtime hours" value={payslip.overtime_hours} />
            )}
          </div>

          <div className="pp-payslip__group">
            <p className="t-micro" style={{ color: "var(--ink-400)", margin: "0 0 var(--s-2)" }}>
              Earnings
            </p>
            {earnings.map((line) => (
              <Rule
                key={line.id}
                label={line.name}
                value={formatMoney(money(line.amount))}
                failed={failed.has(line.rule_code)}
                onOpen={onLine ? () => onLine(line.rule_code) : undefined}
              />
            ))}
            <Rule
              label="Gross"
              value={formatMoney(money(payslip.gross))}
              total
              onOpen={onLine ? () => onLine("GROSS") : undefined}
            />
          </div>

          <div className="pp-payslip__group">
            <p className="t-micro" style={{ color: "var(--ink-400)", margin: "0 0 var(--s-2)" }}>
              {CATEGORY_LABEL.DEDUCTION}
            </p>
            {deductions.map((line) => (
              <Rule
                key={line.id}
                label={line.name}
                value={formatMoney(money(line.amount))}
                negative
                failed={failed.has(line.rule_code)}
                onOpen={onLine ? () => onLine(line.rule_code) : undefined}
              />
            ))}
            <Rule
              label="Total deductions"
              value={formatMoney(money(payslip.total_deductions))}
              negative
              total
              onOpen={onLine ? () => onLine("DEDUCTIONS") : undefined}
            />
          </div>

          {/*
            The net is a button, because §10.3 says any figure is clickable and
            this is the figure people ask about.
          */}
          <button
            type="button"
            className="pp-payslip__net"
            onClick={onWhy}
            style={{ border: 0, width: "100%", cursor: onWhy ? "pointer" : "default" }}
            aria-label={`Net pay ${formatMoney(money(payslip.net))}. Why this number?`}
          >
            <span className="t-micro" style={{ color: "var(--ink-400)" }}>
              Net pay
            </span>
            <RollingNumber value={money(payslip.net)} scale="xl" label="Net pay" />
          </button>

          <p className="t-ui-sm" style={{ color: "var(--ink-400)", margin: "var(--s-4) 0 0" }}>
            Income Tax (simplified) is demo content, not statutory tax.
          </p>

          {onFlip && (
            <div style={{ marginTop: "var(--s-4)" }}>
              <Button variant="quiet" onClick={() => onFlip(true)} icon={<RotateCw size={16} />}>
                How it was derived
              </Button>
            </div>
          )}
        </div>

        {/* ── Back · the derivation ────────────────────────────────── */}
        <div
          className={cx("pp-payslip__face", "pp-payslip__face--back")}
          aria-hidden={reduced && !flipped ? true : undefined}
          style={
            reduced
              ? flipped
                ? { position: "static", transform: "none" }
                : { display: "none" }
              : undefined
          }
        >
          <p className="t-micro" style={{ color: "var(--ink-400)", margin: 0 }}>
            Derivation
          </p>
          <h3 className="t-h3" style={{ margin: "var(--s-1) 0 var(--s-3)" }}>
            {payslip.employee_name}
          </h3>

          {payslip.contract && (
            <p className="t-ui-sm" style={{ color: "var(--ink-500)", margin: "0 0 var(--s-4)" }}>
              Computed against <strong>{payslip.contract.name}</strong> —{" "}
              {formatMoney(money(payslip.contract.wage))} from {payslip.contract.date_start}
              {payslip.contract.date_end ? ` to ${payslip.contract.date_end}` : ""}.
            </p>
          )}

          {payslip.lines
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((line) => {
              const rule = ruleByCode.get(line.rule_code);
              const formula =
                rule?.amount_formula ??
                (rule?.percentage ? `${rule.percentage}% of ${rule.percentage_base_code}` : null);
              return (
                <div key={line.id} style={{ marginBottom: "var(--s-4)" }}>
                  <div className="pp-payslip__rule">
                    <span className="t-ui-sm">
                      {line.rule_code}
                      <span style={{ color: "var(--ink-400)" }}> · seq {line.sequence}</span>
                    </span>
                    <span className="n-table">{formatMoney(money(line.amount))}</span>
                  </div>
                  {formula && (
                    <code className="n-mono" style={{ color: "var(--ink-500)" }}>
                      {formula}
                    </code>
                  )}
                </div>
              );
            })}

          {onFlip && (
            <Button variant="quiet" onClick={() => onFlip(false)} icon={<RotateCw size={16} />}>
              Back to the payslip
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

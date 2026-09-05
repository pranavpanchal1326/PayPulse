/**
 * THE STACK · blueprint §10.2 — the signature.
 *
 * Salary rules as physical blocks. `BASIC` lands on the ground plane, the
 * allowances stack on it, `GROSS` is the tower's measured height — and then
 * the deductions **carve** rather than stack: each one is a notch taken out of
 * the tower, and the tower visibly shortens until what remains standing is
 * `NET`.
 *
 * That distinction is the entire idea. A chart that drew deductions as more
 * blocks in a different colour would say "eight things happened"; carving says
 * "this was built, and then this much was removed", which is what a payslip
 * actually records. It is also why the tower is not a bar chart: the blocks
 * are **sized proportionally to their amounts**, so the picture cannot
 * disagree with the arithmetic.
 *
 * **Flat SVG, not 3D.** The landing page (P13) renders this in R3F with real
 * depth and the key light from §03. Inside the app it is the same composition,
 * same shapes, same proportions, no WebGL on a working screen. Blueprint
 * §10.2: *"this is where 3D is justified and nowhere else."*
 */
import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { formatMoney, type Money } from "@/api/money";
import { spring, staggerDelay } from "@/motion/springs";
import { useSound } from "@/sound/useSound";
import { cx } from "@/components/system/cx";
import { RollingNumber } from "./RollingNumber";

/* ── The model ───────────────────────────────────────────────────────── */

export interface StackBlock {
  code: string;
  name: string;
  /** Additive blocks stack; `DEDUCTION` carves. */
  kind: "add" | "deduct";
  amount: Money;
  sequence: number;
  /** The rule as written — shown on hover, in `num-mono`. */
  formula?: string | null;
  /** The values it actually received. This is what makes it auditable. */
  inputs?: { label: string; value: string }[];
}

export interface StackProps {
  blocks: StackBlock[];
  gross: Money;
  net: Money;
  /** Clicking a block asks the page to open the provenance drawer for it. */
  onOpen?: (code: string) => void;
  className?: string;
}

/* ── Geometry ────────────────────────────────────────────────────────── */

const W = 300;
const H = 380;
const GROUND = H - 24;
/**
 * The tower is inset from the left by enough to hang the GROSS and NET labels
 * outside it. They are right-aligned into that gutter, so it has to be wide
 * enough for the longer of the two plus its tick.
 */
const TOWER_X = 74;
const TOWER_W = 160;
/** The carve is inset from both sides, so it reads as removed material. */
const CARVE_INSET = 18;
/** A block worth almost nothing still has to be clickable. */
const MIN_BLOCK_H = 4;

export function Stack({ blocks, gross, net, onOpen, className }: StackProps) {
  const [active, setActive] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const play = useSound();
  const titleId = useId();

  /**
   * A rule that evaluated to zero has nothing to draw. `TDS` does exactly this
   * below the tax threshold: it is a real line on the payslip at ₹0.00, and a
   * document should print it — but a four-pixel notch carved out of the tower
   * for nothing removed would be the picture disagreeing with the arithmetic,
   * which is the one thing this drawing must never do.
   */
  const drawn = blocks.filter((b) => b.amount !== 0);
  const additive = drawn.filter((b) => b.kind === "add");
  const deductions = drawn.filter((b) => b.kind === "deduct");

  /**
   * One scale for the whole drawing: rupees to pixels. Derived from the
   * *gross*, because the gross is the tower's full height by definition — so a
   * block's height on screen is its share of the tower, exactly.
   */
  const towerH = GROUND - 40;
  const perPaisa = gross > 0 ? towerH / gross : 0;
  const px = (amount: Money) => Math.max(MIN_BLOCK_H, Math.abs(amount) * perPaisa);

  /* Additive blocks, cumulative from the ground up. */
  let cursor = GROUND;
  const stacked = additive.map((block, i) => {
    const height = px(block.amount);
    cursor -= height;
    return { block, y: cursor, height, index: i };
  });

  const grossTop = cursor;

  /**
   * Deductions carve from the top down: the topmost slice of the tower, worth
   * `total deductions`, is recessed material. What is left below it — solid,
   * full width — is the net.
   */
  let carveCursor = grossTop;
  const carved = deductions.map((block, i) => {
    const height = px(block.amount);
    const y = carveCursor;
    carveCursor += height;
    return { block, y, height, index: additive.length + i };
  });

  const netTop = carveCursor;
  const selected = blocks.find((b) => b.code === active) ?? null;

  const land = (index: number) =>
    reduced
      ? { duration: 0 }
      : { ...spring.block, delay: staggerDelay(index) };

  const onEnter = (code: string, index: number) => {
    setActive(code);
    // §08.1 — one semitone lower per step down the stack.
    play("block", index);
  };

  return (
    <div className={cx("pp-stack", className)}>
      <div className="pp-stack__figure">
        <svg
          className="pp-stack__svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>
            {`Salary structure: ${additive.length} earnings totalling ${formatMoney(gross)}, ` +
              `${deductions.length} deductions, leaving ${formatMoney(net)} net.`}
          </title>

          {/* The ground plane the first block lands on. */}
          <line className="pp-stack__ground" x1={16} x2={W - 16} y1={GROUND} y2={GROUND} />

          {stacked.map(({ block, y, height, index }) => (
            <motion.g
              key={block.code}
              initial={reduced ? false : { y: -GROUND, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={land(index)}
              onHoverStart={() => onEnter(block.code, index)}
              onHoverEnd={() => setActive(null)}
            >
              <rect
                className={cx("pp-stack__block", active === block.code && "pp-stack__block--active")}
                x={TOWER_X}
                y={y}
                width={TOWER_W}
                height={height}
                rx={height > 20 ? 10 : 4}
                tabIndex={0}
                role="button"
                aria-label={`${block.name}, ${formatMoney(block.amount)}`}
                onFocus={() => setActive(block.code)}
                onBlur={() => setActive(null)}
                onClick={() => onOpen?.(block.code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen?.(block.code);
                  }
                }}
              />
              {/* The light model, per block: highlight on top, shade beneath. */}
              <line
                className="pp-stack__hl"
                x1={TOWER_X + 8}
                x2={TOWER_X + TOWER_W - 8}
                y1={y + 1}
                y2={y + 1}
              />
              <line
                className="pp-stack__sh"
                x1={TOWER_X + 8}
                x2={TOWER_X + TOWER_W - 8}
                y1={y + height - 1}
                y2={y + height - 1}
              />
              {height > 18 && (
                <>
                  <text className="pp-stack__block-label" x={TOWER_X + 12} y={y + height / 2 + 4}>
                    {block.code}
                  </text>
                  <text
                    className="pp-stack__amount"
                    x={TOWER_X + TOWER_W - 12}
                    y={y + height / 2 + 4}
                    textAnchor="end"
                  >
                    {formatMoney(block.amount)}
                  </text>
                </>
              )}
            </motion.g>
          ))}

          {/*
            The carves. They animate INWARD — scaling on the x axis from full
            width down to the recessed width — so the eye reads material being
            taken away rather than a new block appearing.
          */}
          {carved.map(({ block, y, height, index }) => (
            <motion.g
              key={block.code}
              initial={reduced ? false : { scaleX: 1, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={land(index)}
              style={{ originX: `${(TOWER_X + TOWER_W / 2) / W}` }}
              onHoverStart={() => onEnter(block.code, index)}
              onHoverEnd={() => setActive(null)}
            >
              <rect
                className={cx("pp-stack__carve", active === block.code && "pp-stack__carve--active")}
                x={TOWER_X + CARVE_INSET}
                y={y}
                width={TOWER_W - CARVE_INSET * 2}
                height={height}
                rx={4}
                tabIndex={0}
                role="button"
                aria-label={`${block.name}, minus ${formatMoney(block.amount)}`}
                onFocus={() => setActive(block.code)}
                onBlur={() => setActive(null)}
                onClick={() => onOpen?.(block.code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen?.(block.code);
                  }
                }}
              />
              {height > 14 && (
                <text
                  className="pp-stack__block-label"
                  x={TOWER_X + CARVE_INSET + 8}
                  y={y + height / 2 + 4}
                >
                  {block.code}
                </text>
              )}
            </motion.g>
          ))}

          {/* GROSS — the tower's full height, measured. */}
          <line className="pp-stack__rule" x1={TOWER_X - 20} x2={W - 8} y1={grossTop} y2={grossTop} />
          <text className="pp-stack__label" x={TOWER_X - 22} y={grossTop - 5} textAnchor="end">
            Gross
          </text>

          {/* NET — what remains standing. */}
          <line className="pp-stack__rule" x1={TOWER_X - 20} x2={W - 8} y1={netTop} y2={netTop} />
          <text className="pp-stack__label" x={TOWER_X - 22} y={netTop - 5} textAnchor="end">
            Net
          </text>

          {/* The measure down the left edge, so the proportions are readable. */}
          <line className="pp-stack__measure" x1={TOWER_X - 20} x2={TOWER_X - 20} y1={grossTop} y2={GROUND} />
        </svg>
      </div>

      {/*
        The inspector. §10.2 says hovering a block reveals its code, sequence,
        formula and inputs — it lives beside the tower rather than in a
        floating tooltip, because a formula plus four inputs is too much
        content to hang off a cursor, and it would cover the tower it explains.
      */}
      <div className="pp-stack__inspect">
        {selected ? (
          <>
            <p className="t-micro" style={{ color: "var(--ink-400)", margin: 0 }}>
              {selected.code} · sequence {selected.sequence}
            </p>
            <h3 className="t-h3" style={{ margin: "var(--s-1) 0 var(--s-2)" }}>
              {selected.name}
            </h3>
            <RollingNumber
              value={selected.amount}
              scale="l"
              label={selected.name}
              className={selected.kind === "deduct" ? "pp-roll--negative" : undefined}
            />

            {selected.formula && (
              <code className="pp-stack__formula n-mono">{selected.formula}</code>
            )}

            {selected.inputs && selected.inputs.length > 0 && (
              <dl className="pp-stack__inputs t-ui-sm">
                {selected.inputs.map((input) => (
                  <div key={input.label} style={{ display: "contents" }}>
                    <dt>{input.label}</dt>
                    <dd>{input.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {onOpen && (
              <p className="t-ui-sm" style={{ color: "var(--ink-400)", marginTop: "var(--s-4)" }}>
                Click the block to open its derivation.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="t-micro" style={{ color: "var(--ink-400)", margin: 0 }}>
              The tower
            </p>
            <h3 className="t-h3" style={{ margin: "var(--s-1) 0 var(--s-3)" }}>
              Gross, carved down to net
            </h3>
            <p className="t-body" style={{ color: "var(--ink-500)", margin: 0, maxWidth: "42ch" }}>
              Every block is sized to its own amount, so the shape is the
              arithmetic. Earnings stack; deductions are cut out of what was
              built. Hover a block for its rule, or click it to see where the
              figure came from.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

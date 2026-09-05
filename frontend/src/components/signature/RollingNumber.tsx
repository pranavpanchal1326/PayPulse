/**
 * ROLLING NUMERALS · blueprint §07.4
 *
 * Every money figure that can change rolls rather than re-rendering. Digits
 * move vertically like an odometer, **only the digits that actually changed
 * move**, 520ms with an 18ms per-digit stagger from the right, and the colour
 * flashes toward the direction of change before settling back to `--ink-900`.
 *
 * The canonical beat, from the blueprint: approve three days of leave and
 * watch `47,842 → 45,570` count down as the `LWP` line appears.
 *
 * **Three details are what make it read as an instrument rather than a
 * gimmick**, and all three are easy to get wrong:
 *
 *   1. **Only changed digits move.** Rolling all six for a change of forty
 *      rupees is noise; rolling two says "the last two digits moved". Digits
 *      are compared right-aligned, because that is how place value works —
 *      `9,999 → 10,000` changes every digit and should look like it does.
 *   2. **One announcement, of the final value.** The digit strips are
 *      `aria-hidden` and a single polite live region carries the formatted
 *      figure. A screen reader must not read ten digits of odometer.
 *   3. **Reduced motion keeps the flash.** §07.5: the value swaps instantly,
 *      but the jade-or-vermilion tells you which way it went. The meaning
 *      survives even when the motion does not.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { moneyParts, type Money } from "@/api/money";
import { ease } from "@/motion/springs";
import { cx } from "@/components/system/cx";

/** §07.4 — 520ms, and 18ms of stagger per digit, counted from the right. */
const ROLL_SECONDS = 0.52;
const DIGIT_STAGGER = 0.018;

/** How long the directional colour flash holds before settling to ink. */
const FLASH_MS = ROLL_SECONDS * 1000;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export type NumberScale = "hero" | "xl" | "l" | "m" | "table" | "mono";

const SCALE_CLASS: Record<NumberScale, string> = {
  hero: "n-hero",
  xl: "n-xl",
  l: "n-l",
  m: "n-m",
  table: "n-table",
  mono: "n-mono",
};

/**
 * One odometer column.
 *
 * Two paths, and the split is not decoration:
 *
 *   · **Animated** — the digit changed, so it rolls. The transition carries its
 *     own delay, which is what produces the stagger from the right.
 *   · **Instant** — a plain `<span>` with the transform written directly.
 *     Used for digits that did not change, and for the whole figure under
 *     reduced motion.
 *
 * The instant path deliberately does **not** go through `motion` with a
 * zero-duration transition. A digit that is not moving has nothing for an
 * animation library to do, and routing it through one makes the *correctness*
 * of a plain value swap depend on how that library treats a degenerate
 * transition — which is a bad thing for the reduced-motion path, where every
 * digit takes this route, to depend on. A written transform cannot be
 * mis-scheduled.
 */
function Digit({
  value,
  changed,
  delay,
  still,
}: {
  value: number;
  changed: boolean;
  delay: number;
  still: boolean;
}) {
  const column = DIGITS.map((d) => <span key={d}>{d}</span>);
  const y = `${-value}em`;

  return (
    <span className="pp-roll__slot">
      {/* Establishes the width and, crucially, the baseline. */}
      <span className="pp-roll__ghost" aria-hidden="true">
        0
      </span>
      <span className="pp-roll__window">
        {still || !changed ? (
          <span className="pp-roll__col" style={{ transform: `translateY(${y})` }}>
            {column}
          </span>
        ) : (
          <motion.span
            className="pp-roll__col"
            initial={false}
            animate={{ y }}
            transition={{ duration: ROLL_SECONDS, ease: ease.out, delay }}
          >
            {column}
          </motion.span>
        )}
      </span>
    </span>
  );
}

export interface RollingNumberProps {
  /** Integer paise. `api/money.ts` is the only place a money string is parsed. */
  value: Money;
  scale?: NumberScale;
  /** `₹` by default; pass "" for a bare figure such as a day count. */
  symbol?: string;
  /** Hide the paise. Day counts and headcounts are not two-decimal figures. */
  decimals?: boolean;
  /** Read instead of the figure — "net pay", "total gross". */
  label?: string;
  className?: string;
}

export function RollingNumber({
  value,
  scale = "m",
  symbol = "₹",
  decimals = true,
  label,
  className,
}: RollingNumberProps) {
  const reduced = useReducedMotion();
  const parts = moneyParts(value);
  const [flash, setFlash] = useState<"rising" | "falling" | null>(null);

  /**
   * Commas and the decimal point are static characters; only `0-9` gets a
   * column.
   */
  const text = decimals ? `${parts.whole}.${parts.decimals}` : parts.whole;

  /**
   * **Which digits changed is a property of the value, not of the render.**
   *
   * The obvious version — compare against a ref updated in a layout effect —
   * is wrong, and wrong in a way that looks fine until you watch it: the
   * colour flash is state, so setting it re-renders the component ~0 ms after
   * the value moved, and on that second render the "previous" value is already
   * the current one. Every digit then reports itself unchanged, mid-roll.
   *
   * So the comparison runs **only when the value actually differs** from the
   * one these refs describe, and the answer is kept until it changes again.
   * Recomputing in render rather than in an effect is safe because it is
   * idempotent for a given value — which also makes it correct under
   * StrictMode's double-render.
   */
  const previousValue = useRef<Money | null>(null);
  const previousText = useRef<string | null>(null);
  const changedIndices = useRef<Set<number>>(new Set());
  const direction = useRef<"rising" | "falling" | null>(null);

  if (previousValue.current !== value) {
    const before = previousText.current;
    const beforeValue = previousValue.current;
    const changed = new Set<number>();

    if (before !== null) {
      /**
       * Right-aligned comparison. `999 → 1,000` must not report the leading
       * `1` as unchanged merely because both strings start at index 0.
       */
      for (let i = 0; i < text.length; i++) {
        const fromRight = text.length - i;
        if (before[before.length - fromRight] !== text[i]) changed.add(i);
      }
    }

    changedIndices.current = changed;
    direction.current =
      beforeValue === null || beforeValue === value
        ? null
        : value > beforeValue
          ? "rising"
          : "falling";
    previousValue.current = value;
    previousText.current = text;
  }

  /**
   * Keyed on the value alone. Keying it on `direction` as well would re-fire
   * on the flash-clearing render and hold the colour forever.
   */
  useEffect(() => {
    if (!direction.current) return;
    setFlash(direction.current);
    const id = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [value]);

  /**
   * Stagger counts digits from the right, so the paise move first and the
   * lakhs settle last — the direction a number is actually read back in.
   */
  let digitsFromRight = 0;
  const slots = [...text].reverse().map((char, i) => {
    const index = text.length - 1 - i;
    if (!/[0-9]/.test(char)) return { char, index, delay: 0, changed: false };
    const delay = digitsFromRight * DIGIT_STAGGER;
    digitsFromRight += 1;
    return { char, index, delay, changed: changedIndices.current.has(index) };
  });
  slots.reverse();

  const glyph = (slot: (typeof slots)[number]) =>
    /[0-9]/.test(slot.char) ? (
      <Digit
        key={slot.index}
        value={Number(slot.char)}
        changed={slot.changed}
        delay={slot.delay}
        still={Boolean(reduced)}
      />
    ) : (
      <span key={slot.index}>{slot.char}</span>
    );

  /**
   * §05.3 rule 4 — the decimal portion is 0.62em and muted. `₹47,842` reads
   * instantly; `.00` should not compete with it. So the paise are split out
   * and wrapped, rather than rendered inline at full size.
   */
  const point = text.indexOf(".");
  const wholeSlots = point === -1 ? slots : slots.slice(0, point);
  const decimalSlots = point === -1 ? [] : slots.slice(point);

  return (
    <span
      className={cx(
        "pp-roll",
        SCALE_CLASS[scale],
        flash === "rising" && "pp-roll--rising",
        flash === "falling" && "pp-roll--falling",
        value < 0 && "pp-roll--negative",
        className,
      )}
    >
      {/*
        The odometer is decoration as far as assistive tech is concerned; the
        live region below is the figure. Announcing both would read the value
        twice, once as digit soup.
      */}
      <span aria-hidden="true" className="pp-roll">
        {parts.negative && <span>−</span>}
        {symbol && <span className="n-cur">{symbol}</span>}
        {wholeSlots.map(glyph)}
        {decimalSlots.length > 0 && (
          <span className="n-dec pp-roll">{decimalSlots.map(glyph)}</span>
        )}
      </span>

      {/*
        Built from the same `text` the odometer draws, not from
        `formatMoney`, which always carries paise: a `decimals={false}` count
        was being announced as "125.00 days", so the two halves of the
        component disagreed for exactly the users who cannot see the visible
        one. Found on P5's first `RollingCount`.
      */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {label ? `${label}: ` : ""}
        {parts.negative ? "−" : ""}
        {symbol}
        {text}
      </span>
    </span>
  );
}

/**
 * The same mechanism for a plain count — worked days, headcount, pending
 * requests. It is the same component with the currency mark and the paise
 * turned off, rather than a second implementation that drifts.
 */
export function RollingCount({
  value,
  scale = "l",
  label,
  className,
}: {
  value: number;
  scale?: NumberScale;
  label?: string;
  className?: string;
}) {
  return (
    <RollingNumber
      value={(Math.round(value) * 100) as Money}
      scale={scale}
      symbol=""
      decimals={false}
      label={label}
      className={className}
    />
  );
}

/**
 * THE LINE, ONE ROW HIGH.
 *
 * Three screens ask for the same drawing at table scale — a contract's span
 * inside the visible window (S4), an allocation's validity (S9), and a
 * payslip's `contract_days / period_days` (S15). The blueprint calls all
 * three "a miniature LINE segment", and they are one component or they are
 * three slightly different ones.
 *
 * It is deliberately **not** `<Line>` with a small height. The full line is an
 * instrument: it has a bead you can drag, ticks per day, month boundaries and
 * a legend, and every one of those is wrong inside a 36px table row — a
 * draggable control in a cell is a click target fighting the row's own. This
 * draws the one thing that survives the shrink: where a range sits inside a
 * window, at the same track geometry and in the same colours, so the eye reads
 * it as the same object seen from further away.
 *
 * The track is the window. The fill is the range. Nothing else.
 */
import { cx } from "@/components/system/cx";

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Days between two ISO dates, inclusive of both ends. */
function span(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export interface SegmentProps {
  /** The window the track represents. */
  from: string;
  to: string;
  /** The range drawn inside it. `null` on `end` means open-ended. */
  start: string;
  end: string | null;
  /** Cobalt rather than ink — the range is in force right now. */
  active?: boolean;
  /** Rendered in the row's accessible name, since the bar itself is a picture. */
  label: string;
  className?: string;
}

/**
 * A range inside a window. Open-ended ranges run to the right edge and lose
 * their end cap, which is how the drawing says "and onward" without a caption.
 */
export function Segment({ from, to, start, end, active, label, className }: SegmentProps) {
  const total = span(from, to);
  if (total <= 0) return null;

  const open = end === null || end > to;
  // Offsets in days from the window's start, clipped to the window: a contract
  // that began before the window is drawn from the left edge, not off it.
  const startsAt = start > from ? span(from, start) - 1 : 0;
  const endsAt = open ? total : span(from, end! < from ? from : end!);

  const left = clamp01(startsAt / total);
  const right = clamp01(endsAt / total);
  // A single-day range still has to be visible, so it never rounds to nothing.
  const width = Math.max(right - left, 1 / total);

  return (
    <span className={cx("pp-seg-line", className)} role="img" aria-label={label} title={label}>
      <span className="pp-seg-line__track" aria-hidden="true" />
      <span
        className={cx(
          "pp-seg-line__fill",
          active && "pp-seg-line__fill--active",
          open && "pp-seg-line__fill--open",
        )}
        style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
        aria-hidden="true"
      />
    </span>
  );
}

export interface RatioProps {
  /** The numerator — days worked, days on contract. */
  value: number;
  /** The denominator — days in the period. */
  of: number;
  label: string;
  /** Under 100%, the shortfall is the point: draw it orange, not cobalt. */
  warnBelowFull?: boolean;
  className?: string;
}

/**
 * `contract_days / period_days`, drawn. S15 shows this per employee, and it is
 * the whole reason step 1 of the wizard exists: proration is visible **before**
 * anybody commits to a payrun, not discovered afterwards on a payslip.
 */
export function Ratio({ value, of, label, warnBelowFull, className }: RatioProps) {
  const fraction = of > 0 ? clamp01(value / of) : 0;
  const partial = fraction < 1;
  return (
    <span className={cx("pp-seg-line", className)} role="img" aria-label={label} title={label}>
      <span className="pp-seg-line__track" aria-hidden="true" />
      <span
        className={cx(
          "pp-seg-line__fill",
          !partial && "pp-seg-line__fill--active",
          partial && warnBelowFull && "pp-seg-line__fill--short",
        )}
        style={{ left: 0, width: `${fraction * 100}%` }}
        aria-hidden="true"
      />
    </span>
  );
}

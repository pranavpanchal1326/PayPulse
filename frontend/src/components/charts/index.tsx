/**
 * CHARTS · blueprint §14
 *
 * **Deviation, recorded.** §14 names Recharts. These are hand-written SVG
 * instead, and the reason is the same one that made THE LINE and THE STACK
 * hand-written SVG in P4: every rule in §14 is a restriction — horizontal
 * gridlines only, no axis lines, no area fill under a line, radius on the top
 * corners only, two hues maximum — and satisfying a list of restrictions by
 * *overriding* a charting library's defaults is more code than drawing the
 * three marks the product actually needs, plus 90kb of library that draws
 * ninety other things it must not.
 *
 * It also keeps the charts in the same material as everything else: they are
 * inset wells, their type is `t-micro` in `--ink-400`, and their colours are
 * tokens rather than a theme object that has to be kept in sync with
 * `tokens.css`.
 *
 * Three rules are enforced here rather than left to each call site:
 *
 *   · **Never a blank frame.** An empty series keeps the well's shape and
 *     holds a `micro` line saying so (§14).
 *   · **Sparse is not broken.** Six points in a twelve-month window render as
 *     six points across the whole width, not as a chart that stops early.
 *   · **They animate in once.** `--t-scene`, left to right, and never again on
 *     re-render — the transition is declared on the element and keyed to the
 *     data, so a hover cannot replay it.
 */
import { useId, useMemo, useState } from "react";
import { cx } from "@/components/system";

/* ── The empty state, once ────────────────────────────────────────────── */

function EmptyFrame({ label }: { label: string }) {
  return (
    <div className="pp-chart__empty">
      <p className="t-micro">{label}</p>
    </div>
  );
}

/* ── Horizontal bars · salary by department ───────────────────────────── */

export interface BarDatum {
  label: string;
  value: number;
  /** Rendered in the tooltip and the accessible name, already formatted. */
  display: string;
  /** Secondary line — headcount, a count, anything small. */
  meta?: string;
}

/**
 * Horizontal because the labels are department names, and a vertical bar chart
 * with eight names under it either rotates them or truncates them. Neither is
 * a thing a careful reader should have to put up with.
 */
export function Bars({
  data,
  emptyLabel = "NO DATA FOR THIS PERIOD",
  max: forcedMax,
}: {
  data: BarDatum[];
  emptyLabel?: string;
  max?: number;
}) {
  const max = forcedMax ?? Math.max(...data.map((d) => d.value), 1);

  if (data.length === 0) return <EmptyFrame label={emptyLabel} />;

  return (
    <ul className="pp-bars">
      {data.map((datum, index) => (
        <li key={datum.label} className="pp-bars__row">
          <span className="t-ui-sm pp-bars__label" title={datum.label}>{datum.label}</span>
          <span className="pp-bars__track">
            <span
              className="pp-bars__bar"
              style={{
                width: `${Math.max((datum.value / max) * 100, datum.value > 0 ? 1.5 : 0)}%`,
                // The stagger draws the group left to right, once.
                transitionDelay: `${index * 40}ms`,
              }}
              aria-hidden="true"
            />
          </span>
          <span className="pp-bars__value n-table">
            {datum.display}
            {datum.meta && <span className="t-micro pp-bars__meta"> {datum.meta}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── Trend line · monthly net ─────────────────────────────────────────── */

export interface TrendPoint {
  /** `YYYY-MM`. */
  key: string;
  label: string;
  value: number;
  display: string;
}

/**
 * The viewBox is deliberately close to the size this chart actually renders at
 * (~360–420px in a dashboard panel). An SVG scaled down scales its *text* down
 * with it — a 640-wide box in a 400-wide panel turned 10px tick labels into
 * 6px ones, which is unreadable and is not what §05.2 specifies. Keeping the
 * user space near 1:1 keeps the type at the size the system chose.
 */
const CHART_W = 380;
const CHART_H = 150;
const PAD_X = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;

/**
 * A 2px jade line, no area fill — ever (§14). The fill is the thing every
 * dashboard reaches for and it is the thing that makes a trend look like a
 * claim about volume rather than about direction.
 */
export function Trend({
  points,
  emptyLabel = "NO PAYROLL DATA FOR THIS PERIOD",
}: {
  points: TrendPoint[];
  emptyLabel?: string;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const high = Math.max(...values);
    const low = Math.min(...values);

    /**
     * **The baseline is not zero, and that is deliberate.** Six months of
     * payroll are all within a few percent of each other, so a zero-based
     * axis draws them as one flat line pinned to the top of the frame — a
     * chart that answers "is payroll a large number?" instead of "is it
     * moving?". §14 makes this a *trend*: direction is the whole content.
     *
     * The price is that the reader must not mistake the visual span for the
     * real one, so the caption states the low and the high. A padded domain
     * with the range written underneath is honest; an unlabelled one is not.
     */
    const raw = high - low;
    const pad = raw === 0 ? Math.max(Math.abs(high) * 0.1, 1) : raw * 0.18;
    const max = high + pad;
    const min = low - pad;
    const span = max - min || 1;

    const x = (i: number) =>
      points.length === 1
        ? CHART_W / 2
        : PAD_X + (i * (CHART_W - PAD_X * 2)) / (points.length - 1);
    const y = (v: number) =>
      PAD_TOP + (1 - (v - min) / span) * (CHART_H - PAD_TOP - PAD_BOTTOM);

    return {
      max,
      min,
      high,
      low,
      path: points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" "),
      coords: points.map((p, i) => ({ x: x(i), y: y(p.value) })),
      /** Four horizontal gridlines, and nothing vertical (§14). */
      grid: [0, 0.25, 0.5, 0.75, 1].map(
        (t) => PAD_TOP + t * (CHART_H - PAD_TOP - PAD_BOTTOM),
      ),
    };
  }, [points]);

  if (!geometry) return <EmptyFrame label={emptyLabel} />;

  /**
   * Points only at data-dense breaks (§14): a twelve-point series would be a
   * row of dots, so they appear when the series is short enough for each one
   * to be a fact rather than a texture.
   */
  const showPoints = points.length <= 8;

  return (
    <figure className="pp-trend">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="pp-trend__svg"
        role="img"
        aria-label={`Monthly net: ${points.map((p) => `${p.label} ${p.display}`).join(", ")}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            {/* The one-time left-to-right draw. Keyed to the series, so a
                re-render with the same data does not replay it. */}
            <rect x="0" y="0" width={CHART_W} height={CHART_H} className="pp-trend__reveal" />
          </clipPath>
        </defs>

        {geometry.grid.map((y) => (
          <line key={y} x1="0" x2={CHART_W} y1={y} y2={y} className="pp-trend__grid" />
        ))}

        <path d={geometry.path} className="pp-trend__line" clipPath={`url(#${clipId})`} />

        {showPoints &&
          geometry.coords.map((c, i) => (
            <circle
              key={points[i].key}
              cx={c.x}
              cy={c.y}
              r={hover === i ? 5 : 3}
              className={cx("pp-trend__dot", hover === i && "pp-trend__dot--hover")}
              clipPath={`url(#${clipId})`}
            />
          ))}

        {/* Invisible hit areas — a 2px line is not a pointer target. */}
        {geometry.coords.map((c, i) => (
          <rect
            key={`hit-${points[i].key}`}
            x={c.x - (CHART_W - PAD_X * 2) / (points.length * 2)}
            y="0"
            width={(CHART_W - PAD_X * 2) / points.length}
            height={CHART_H - PAD_BOTTOM}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {points.map((point, i) => (
          <text
            key={`x-${point.key}`}
            x={geometry.coords[i].x}
            y={CHART_H - 6}
            textAnchor="middle"
            className="pp-trend__tick"
          >
            {/* Every label at three points, every other beyond that — labels
                that collide are worse than labels that are absent. */}
            {points.length <= 8 || i % 2 === 0 ? point.label : ""}
          </text>
        ))}
      </svg>

      <figcaption className="pp-trend__caption t-ui-sm">
        {hover === null ? (
          <>
            {points.length} {points.length === 1 ? "month" : "months"} ·{" "}
            {points.find((p) => p.value === geometry.low)?.display} →{" "}
            {points.find((p) => p.value === geometry.high)?.display}
            <span className="pp-trend__axisnote"> · axis is not zero-based</span>
          </>
        ) : (
          <>
            <strong>{points[hover].label}</strong> · {points[hover].display}
          </>
        )}
      </figcaption>
    </figure>
  );
}

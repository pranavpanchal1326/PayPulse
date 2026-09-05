/**
 * THE LINE · blueprint §10.1
 *
 * One horizontal track that is the timeline, the ledger line and the system
 * diagram at once. It appears on the landing hero, on every employee page and
 * across the top of the payrun.
 *
 * The element that carries the idea is **the gap**. Leave is not a coloured
 * mark on the line; it is a *hole in the ticks* — absence rendered as absence,
 * matching the PRD's own model, where an absent day is the absence of an
 * attendance row rather than a row with a status. Anything else would make the
 * picture disagree with the database.
 *
 * **SVG for the track, HTML for the bead.** Everything measured — bands,
 * ticks, boundaries — is SVG, because it is data. The bead is a DOM element
 * positioned over it, because the bead is raised clay and `--clay-1` is a
 * box-shadow, which SVG has no equivalent of. Faking it with a Gaussian blur
 * filter would produce a different material from every other raised object in
 * the product.
 *
 * Geometry is in **pixels measured from the container**, not a scaled viewBox.
 * A viewBox with `preserveAspectRatio="none"` would stretch horizontally and a
 * 2px tick would become 2.7px on a wide screen — the blueprint says 2px.
 */
import { useEffect, useRef, useState } from "react";
import { eachDay, monthLabel, monthOf, type ISODate } from "@/mocks/seed/calendar";
import { cx } from "@/components/system/cx";
import { useScrub } from "./Line.scrub";

/* ── The model ───────────────────────────────────────────────────────── */

/**
 * A day with a record. **There is no `leave` or `absent` kind** — those days
 * simply produce no tick, which is the whole point of §10.1.
 */
export type TickKind = "present" | "overtime" | "missing" | "holiday";

export interface LineTick {
  date: ISODate;
  kind: TickKind;
}

export interface LineBand {
  id: string | number;
  from: ISODate;
  /** `null` is open-ended, and draws to the end of the window. */
  to: ISODate | null;
  label: string;
  /** RUNNING and covering the bead — drawn in cobalt. */
  active?: boolean;
}

export interface LineBoundary {
  date: ISODate;
  label: string;
}

export interface LineModel {
  from: ISODate;
  to: ISODate;
  bands: LineBand[];
  ticks: LineTick[];
  boundaries: LineBoundary[];
}

/* ── Vertical layout, in one place ───────────────────────────────────── */

const BAND_Y = 8;
const BAND_H = 8;
const TRACK_Y = 34;
const TRACK_H = 3;
const TICK_TOP = TRACK_Y + TRACK_H + 3;
const TICK_LEN = 12;
const OVERTIME_LEN = 10;
const LABEL_Y = 70;
const HEIGHT = 76;

/** Ticks are 2px per the blueprint, and never wider than the day they mark. */
const TICK_WIDTH = 2;

/* ── Width measurement ───────────────────────────────────────────────── */

function useElementWidth(ref: React.RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // ResizeObserver rather than a window listener: the line lives inside
    // panels and drawers that resize without the window doing anything.
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

/* ── The component ───────────────────────────────────────────────────── */

export interface LineProps {
  model: LineModel;
  /** Where the bead sits. Controlled — the page owns the date. */
  value: ISODate;
  onChange?: (date: ISODate) => void;
  /** Rendered under the track, left and right. */
  caption?: React.ReactNode;
  legend?: boolean;
  className?: string;
}

export function Line({ model, value, onChange, caption, legend = true, className }: LineProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(hostRef);

  const scrub = useScrub({
    from: model.from,
    to: model.to,
    value,
    onChange: onChange ?? (() => {}),
    disabled: !onChange,
  });

  /**
   * `x()` is the only place a date becomes a coordinate. Every band, tick and
   * boundary goes through it, so they cannot drift apart by a pixel.
   */
  const days = eachDay(model.from, model.to);
  const span = Math.max(1, days.length - 1);
  const indexOf = (date: ISODate) => days.indexOf(date);
  const x = (date: ISODate): number => {
    const i = indexOf(date);
    // A date outside the window clamps rather than drawing off-canvas.
    const clamped = i === -1 ? (date < model.from ? 0 : span) : i;
    return (clamped / span) * width;
  };

  const dayWidth = width / span;

  return (
    <div className={cx("pp-line", className)} ref={hostRef}>
      <div className="pp-line__track" ref={scrub.trackRef} onPointerDown={scrub.onTrackPointerDown}>
        <svg
          className="pp-line__svg"
          width={width || undefined}
          height={HEIGHT}
          role="img"
          aria-label={
            `Timeline from ${model.from} to ${model.to}. ` +
            `${model.ticks.length} days with a record, ` +
            `${model.bands.length} contract ${model.bands.length === 1 ? "period" : "periods"}.`
          }
        >
          {/* The channel: a milled floor with a white lip below it (§02.2). */}
          <rect className="pp-line__floor" x={0} y={TRACK_Y} width={width} height={TRACK_H} rx={1} />
          <rect
            className="pp-line__lip"
            x={0}
            y={TRACK_Y + TRACK_H}
            width={width}
            height={1}
          />

          {/* Contract bands. */}
          {model.bands.map((band) => {
            const start = x(band.from);
            const end = x(band.to ?? model.to);
            return (
              <rect
                key={band.id}
                className={cx(
                  "pp-line__band",
                  band.active && "pp-line__band--active",
                  !band.active && "pp-line__band--future",
                )}
                x={start}
                y={BAND_Y}
                width={Math.max(TICK_WIDTH, end - start)}
                height={BAND_H}
                rx={BAND_H / 2}
              >
                <title>
                  {band.label} · {band.from} to {band.to ?? "open"}
                </title>
              </rect>
            );
          })}

          {/*
            Ticks. Overtime is the only kind that extends ABOVE the track —
            the visual says "this day went over", which is exactly what
            overtime is.
          */}
          {model.ticks.map((tick) => {
            const cx0 = x(tick.date);
            const overtime = tick.kind === "overtime";
            const holiday = tick.kind === "holiday";
            const y1 = overtime ? TRACK_Y - OVERTIME_LEN : TICK_TOP;
            const y2 = overtime ? TRACK_Y : TICK_TOP + (holiday ? TICK_LEN / 2 : TICK_LEN);

            return (
              <line
                key={`${tick.date}-${tick.kind}`}
                className={cx("pp-line__tick", `pp-line__tick--${tick.kind}`)}
                x1={cx0}
                x2={cx0}
                y1={y1}
                y2={y2}
                strokeWidth={Math.min(TICK_WIDTH, Math.max(1, dayWidth - 1))}
              />
            );
          })}

          {/* Payroll boundaries — the period ends the whole product turns on. */}
          {model.boundaries.map((boundary) => (
            <g key={boundary.date}>
              <line
                className="pp-line__boundary"
                x1={x(boundary.date)}
                x2={x(boundary.date)}
                y1={BAND_Y - 4}
                y2={TICK_TOP + TICK_LEN + 4}
              />
              <text
                className="pp-line__boundary-label"
                x={x(boundary.date)}
                y={LABEL_Y}
                textAnchor="middle"
              >
                {boundary.label}
              </text>
            </g>
          ))}
        </svg>

        {/*
          The bead. A button, so it is reachable and operable from the keyboard
          without any extra wiring — `useScrub` supplies the slider semantics.
        */}
        <button
          type="button"
          className="pp-line__bead"
          style={{ left: `${scrub.position * 100}%`, top: TRACK_Y + TRACK_H / 2 }}
          {...scrub.beadProps}
        />
      </div>

      {caption && <div className="pp-line__caption">{caption}</div>}

      {legend && (
        <div className="pp-line__legend t-ui-sm" style={{ color: "var(--ink-400)" }}>
          <span className="pp-line__legend-item">
            <span className="pp-line__swatch" style={{ background: "var(--cobalt-500)" }} />
            Contract
          </span>
          <span className="pp-line__legend-item">
            <span className="pp-line__swatch" style={{ background: "var(--ink-400)" }} />
            Day worked
          </span>
          <span className="pp-line__legend-item">
            <span className="pp-line__swatch" style={{ background: "var(--orange-500)" }} />
            Overtime
          </span>
          <span className="pp-line__legend-item">
            <span className="pp-line__swatch" style={{ background: "var(--vermilion-500)" }} />
            No check-out
          </span>
          <span className="pp-line__legend-item">
            <span className="pp-line__swatch" style={{ background: "var(--bone-700)" }} />
            Holiday
          </span>
          {/* The one that matters: leave has no mark, and the legend says so. */}
          <span className="pp-line__legend-item">
            <span className="pp-line__swatch pp-line__swatch--gap" />
            Leave or absence — a gap
          </span>
        </div>
      )}
    </div>
  );
}

/** The month a date falls in, spelled out — used for the line's caption. */
export const captionFor = (date: ISODate): string => monthLabel(monthOf(date));

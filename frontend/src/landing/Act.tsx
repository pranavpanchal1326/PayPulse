/**
 * THE SHAPE OF AN ACT · blueprint §13
 *
 * Eight acts, and the *composition* is doing as much work as the content:
 * *"Composition alternates asymmetrically; only the hero and the close are
 * centred."* That rule is not a note in a spec here — it is a prop with three
 * values, so an act cannot accidentally be centred and two acts cannot
 * accidentally lean the same way.
 *
 * The scroll mechanism is identical for every act and lives here too: a tall
 * `<section>` whose height is the act's *duration*, containing a sticky stage
 * that is what you actually see. Acts differ in what they draw, never in how
 * they are driven.
 */
import { forwardRef } from "react";
import { cx } from "@/components/system";

export type Lean = "left" | "right" | "centre";

export interface ActSectionProps {
  /** `act-04`, used for the anchor, the aria-label and the act index. */
  id: string;
  /** How many viewport heights the act lasts. One is a still; three is a scene. */
  beats?: number;
  lean?: Lean;
  /** The only dark act (§13, Act 05) opts in — nothing else may. */
  dark?: boolean;
  label: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * `beats` becomes `min-height: calc(beats * 100dvh)` — `dvh`, not `vh`,
 * because a mobile browser's collapsing address bar changes `vh` mid-scroll
 * and every act would resize under the reader's thumb at exactly the moment
 * they were reading it.
 */
export const ActSection = forwardRef<HTMLElement, ActSectionProps>(function ActSection(
  { id, beats = 2, lean = "left", dark, label, className, children },
  ref,
) {
  return (
    <section
      id={id}
      ref={ref}
      aria-label={label}
      data-theme={dark ? "dark" : undefined}
      className={cx("lp-act", dark && "lp-act--dark", className)}
      style={{ ["--act-beats" as string]: beats }}
    >
      <div className={cx("lp-stage", `lp-stage--${lean}`)}>{children}</div>
    </section>
  );
});

/**
 * The act's words. `index` prints as `01 / 08` in the corner — a reader who
 * has scrolled three screens into a scroll-driven page deserves to know how
 * much of it is left, and a progress bar would be a second, competing timeline
 * next to THE LINE.
 */
export function ActHead({
  index,
  kicker,
  headline,
  children,
}: {
  index: number;
  kicker: string;
  headline: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="lp-head">
      <p className="t-micro lp-head__kicker">
        <span className="lp-head__index">{String(index).padStart(2, "0")}</span>
        {kicker}
      </p>
      <h2 className="t-display-m lp-head__title">{headline}</h2>
      {children && <div className="lp-head__body t-body-l">{children}</div>}
    </header>
  );
}

/** A caption under an object. Small, muted, never a second headline. */
export function ActNote({ children }: { children: React.ReactNode }) {
  return <p className="t-ui-sm lp-note">{children}</p>;
}

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
import { forwardRef, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
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
 *
 * **The act takes its own composition away on the way out.**
 *
 * A `100dvh` sticky stage inside a taller section un-pins the moment the
 * section's bottom reaches the viewport's bottom, so the outgoing act used to
 * slide up while the incoming one slid in underneath — two compositions on
 * screen, each cut in half at a hard seam, for a full viewport of scroll per
 * act. Measured at 1890×900: **29.4% of the page**. On the 04 → 05 seam that
 * put a fragment of the payroll ledger above the dark room's headline, which
 * reads as a broken layout rather than as a transition.
 *
 * So the stage fades over the last stretch of its own act, and is gone by the
 * time it starts to move. The act arriving does *not* fade in — it is a
 * curtain coming up, and a curtain that is arriving should be solid. The
 * result is one legible composition at any scroll position.
 *
 * The fade rides the act's own scroll progress, so it is reversible like
 * everything else on this page: scroll back and the act returns. Under
 * reduced motion there is no fade at all — §07.5 asks for one composed static
 * frame per act, and the stages do not pin there in the first place.
 */
export const ActSection = forwardRef<HTMLElement, ActSectionProps>(function ActSection(
  { id, beats = 2, lean = "left", dark, label, className, children },
  ref,
) {
  /**
   * The section is both the caller's scroll target and ours, so the forwarded
   * ref is mirrored into a local one rather than read from — a forwarded ref
   * may be a callback, and `useScroll` needs an object it can measure.
   */
  const section = useRef<HTMLElement | null>(null);
  const attach = (node: HTMLElement | null) => {
    section.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
  };

  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });

  /* Solid for the whole act, gone over the last 8% — the stretch it spends
     un-pinning and being covered. */
  const opacity = useTransform(scrollYProgress, [0, 0.92, 1], [1, 1, 0]);

  return (
    <section
      id={id}
      ref={attach}
      aria-label={label}
      data-theme={dark ? "dark" : undefined}
      className={cx("lp-act", dark && "lp-act--dark", className)}
      style={{ ["--act-beats" as string]: beats }}
    >
      <motion.div
        className={cx("lp-stage", `lp-stage--${lean}`)}
        style={reduced ? undefined : { opacity }}
      >
        {children}
      </motion.div>
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

/**
 * THE ROSETTE · the figure's own engraving.
 *
 * A banknote is the one object in the world whose entire job is to say *this
 * number is real and could not have been invented* — and the way it says it is
 * guilloché: interfering hairline curves, cut on a rose engine, impossible to
 * draw twice by hand. That is the same sentence this page opens with, so the
 * hero is engraved rather than lit.
 *
 * **It is a fingerprint, not a pattern.** The lobe counts, radii and phases are
 * derived from the payslip itself — the net in paise, the rule count, the
 * payable and unpaid days. The same payslip always draws the same rosette; a
 * different one draws a visibly different figure. It is not a texture placed
 * behind a number, it is that number's own plate, which is the only reason a
 * decoration is allowed on a page whose argument is that nothing here is
 * decorative.
 *
 * **What it costs.** Fourteen closed curves, 300 points each, computed once in
 * a `useMemo` and handed over as static path data. No gradients, no filters,
 * no per-frame geometry.
 *
 * **The turn is on a wrapper, not on the `<g>`.** An SVG group's transform is
 * not a compositor property: animating it re-rasterises every path inside it
 * on every frame, and here that is four thousand points being re-drawn under
 * a mask for the entire time the hero is on screen — during the page's most
 * scroll-sensitive act. Rotating the HTML element that *contains* the SVG lets
 * the compositor promote it once and turn the finished raster instead, which
 * is the same picture for none of the work.
 *
 * The mask stays behind on the static parent, and that is a fix rather than a
 * detail: it used to live on the rotating group, so the reader's light turned
 * with the engraving instead of the engraving turning under the light. A lamp
 * that orbits with the thing it is lighting is not a lamp.
 */
import { useMemo } from "react";

export interface RosetteSeed {
  /** Net, in paise — the figure the whole page is about. */
  net: number;
  ruleCount: number;
  payableDays: number;
  unpaidDays: number;
}

/**
 * Fourteen rings and not seven. Guilloché is *interference* — the moiré where
 * two nearly-equal lobe counts cross — and interference needs neighbours. At
 * seven rings spaced 46 apart no two curves were close enough to cross, and
 * the result was seven concentric flowers reading as one soft blob. The tight
 * spacing is the whole effect.
 */
const RINGS = 14;
const STEPS = 300;

/**
 * A closed rose: a circle of radius `R` whose edge is displaced by `a` through
 * `k` lobes. Two rings whose lobe counts are close but not equal interfere,
 * and the interference is the guilloché — which is why `k` is nudged by the
 * data rather than stepped by a constant.
 */
function rose(R: number, a: number, k: number, phase: number): string {
  let d = "";
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * Math.PI * 2;
    const radius = R + a * Math.cos(k * t + phase);
    const x = 500 + radius * Math.cos(t);
    const y = 500 + radius * Math.sin(t);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

export function Rosette({ seed }: { seed: RosetteSeed }) {
  const paths = useMemo(() => {
    /*
      One integer carries the whole payslip into the geometry. The multipliers
      are coprime-ish so that two payslips differing in only one field still
      separate — the point of a fingerprint is that it is not nearly the same
      for nearly the same input.
    */
    const key =
      seed.net + seed.ruleCount * 7919 + seed.payableDays * 104729 + seed.unpaidDays * 1299709;

    return Array.from({ length: RINGS }, (_, i) => {
      const R = 120 + i * 24;
      /* The displacement exceeds the ring spacing, so every curve reaches into
         its neighbours and the crossings — the weave — actually happen. */
      const a = 34 + (i % 4) * 7;
      /* 7–24 lobes: below seven it reads as a flower, above two dozen the
         strokes collide at this size and the weave fills in as a grey ring. */
      const k = 7 + ((seed.ruleCount + i * 5 + Math.floor(key / (i + 1))) % 18);
      const phase = ((key >> (i % 12)) % 360) * (Math.PI / 180);
      return { d: rose(R, a, k, phase), i };
    });
  }, [seed.net, seed.ruleCount, seed.payableDays, seed.unpaidDays]);

  return (
    <svg
      className="lp-rosette"
      viewBox="0 0 1000 1000"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g className="lp-rosette__plate">
        {paths.map(({ d, i }) => (
          <path
            key={i}
            d={d}
            /* Outer rings sit back; the inner ones are what the figure is
               actually standing on, so they carry the most ink. */
            style={{ opacity: 1 - i * 0.045 }}
          />
        ))}
      </g>
    </svg>
  );
}

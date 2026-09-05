/**
 * SCROLL IS THE TRANSPORT · blueprint §13
 *
 * *"Scroll-driven, not autoplaying. The user controls time."*
 *
 * Every act on this page is the same shape: a tall `<section>` containing a
 * `position: sticky` stage. The section's height is the *duration* of the act;
 * the stage is what you actually see. Scrolling the section past the viewport
 * plays it, and scrolling back plays it backwards — which is the only honest
 * reading of "the user controls time".
 *
 * Two rules this file exists to hold:
 *
 * **1. Progress is a motion value, not React state.** A `setState` per scroll
 * event re-renders an act sixty times a second and turns a landing page into a
 * space heater. `useScroll` writes to a `MotionValue`, `motion` elements read
 * it directly, and React never hears about it.
 *
 * **2. Where React genuinely has to know — which block has landed, whether the
 * blocker is cleared — it hears about a *step*, not a position.** `useStep`
 * derives an integer and only re-renders when that integer changes, so a
 * ten-block stack costs ten renders for the whole act rather than six hundred.
 */
import { useEffect, useRef, useState } from "react";
import {
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

/**
 * How far through an act we are, 0 → 1.
 *
 * The offset pair is `["start start", "end end"]`: the act begins the instant
 * its top reaches the top of the viewport — which is also the instant the
 * sticky stage pins — and ends when its bottom does. Any other pairing makes
 * the animation start before the stage is pinned, so the first fifth of every
 * act plays while it is still sliding up the screen, unseen.
 */
export function useActProgress(ref: React.RefObject<HTMLElement>): MotionValue<number> {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  return scrollYProgress;
}

/**
 * The same thing, softened.
 *
 * A raw scroll position is *exactly* right for direct manipulation — §07.2's
 * timeline scrub, where the bead must be the finger — and *exactly* wrong for
 * a heavy object, where a trackpad's stepped deltas make clay look like it is
 * being dragged across a cattle grid. Anything with mass reads its progress
 * through here; anything the reader is pointing at does not.
 *
 * Under reduced motion the spring is bypassed entirely, because a spring that
 * settles is still motion.
 */
export function useSmoothProgress(source: MotionValue<number>): MotionValue<number> {
  const reduced = useReducedMotion();
  const smoothed = useSpring(source, { stiffness: 120, damping: 30, mass: 0.6 });
  return reduced ? source : smoothed;
}

/** `[from, to]` of the source mapped onto `[0, 1]`, clamped. A sub-beat. */
export function useBeat(
  progress: MotionValue<number>,
  from: number,
  to: number,
): MotionValue<number> {
  return useTransform(progress, [from, to], [0, 1], { clamp: true });
}

/**
 * An integer step derived from progress — `0 … count`.
 *
 * This is the one place the scroll is allowed to reach React. It is written as
 * a floor rather than a set of thresholds so that a step can never be skipped
 * by a fast flick: at any progress there is exactly one correct step, and it
 * is computed, not accumulated.
 */
export function useStep(progress: MotionValue<number>, count: number): number {
  const [step, setStep] = useState(() => Math.min(count, Math.floor(progress.get() * count)));

  useMotionValueEvent(progress, "change", (p) => {
    const next = Math.max(0, Math.min(count, Math.floor(p * count)));
    setStep((current) => (current === next ? current : next));
  });

  return step;
}

/**
 * Whether the element has ever been on screen.
 *
 * Latching rather than toggling is deliberate: an act that has played should
 * stay played. Un-composing a scene because its heading scrolled two pixels
 * off the top is the tell of a page built out of viewport triggers rather than
 * out of a timeline.
 */
export function useHasEntered(ref: React.RefObject<Element>, margin = "-15%"): boolean {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || entered) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { rootMargin: `0px 0px ${margin} 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, entered, margin]);

  return entered;
}

/**
 * Fires a callback the first time a step is reached, and never again while the
 * reader is inside that step.
 *
 * Sound lives on the far side of this hook. §08's rules cap the product at two
 * sounds per 500ms, and a scroll-driven page can cross a threshold twenty
 * times in a second by jittering on a trackpad — so "played this step already"
 * has to be remembered, not merely throttled downstream.
 */
export function useOnStep(step: number, fire: (step: number) => void): void {
  const played = useRef<number | null>(null);
  const latest = useRef(fire);
  latest.current = fire;

  useEffect(() => {
    if (played.current === step) return;
    played.current = step;
    latest.current(step);
  }, [step]);
}

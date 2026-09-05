/**
 * MOTION · blueprint §07
 *
 * Clay has mass, so it uses spring physics. A cubic-bezier easing on a clay
 * element is a defect — it reads as a sticker sliding, not an object moving.
 *
 * Duration tokens exist only for the properties springs cannot animate well:
 * colour, opacity and shadow.
 */
import type { Transition } from "motion/react";

export const spring = {
  /** chips, badges, tooltips — stiff and light */
  chip: { type: "spring", stiffness: 420, damping: 30, mass: 0.55 },
  /** buttons — the default feel */
  button: { type: "spring", stiffness: 260, damping: 24, mass: 0.9 },
  /** cards, popovers */
  card: { type: "spring", stiffness: 220, damping: 26, mass: 1.1 },
  /** panels, modals */
  panel: { type: "spring", stiffness: 180, damping: 26, mass: 1.4 },
  /** drawers — heavy, settles */
  drawer: { type: "spring", stiffness: 160, damping: 28, mass: 1.6 },
  /** rule blocks landing in the stack — ~4% overshoot, on purpose */
  block: { type: "spring", stiffness: 300, damping: 18, mass: 1.0 },
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof spring;

/** Milliseconds. Mirrors the --t-* custom properties. */
export const duration = {
  instant: 0.09,
  quick: 0.16,
  base: 0.24,
  slow: 0.42,
  scene: 0.9,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/**
 * §07.3 — lists stagger at 40ms, capped at 10 items. A 30-row table that
 * staggers for 1.2s is slow, not premium.
 */
export const STAGGER = 0.04;
export const STAGGER_CAP = 10;

export const staggerDelay = (index: number) =>
  Math.min(index, STAGGER_CAP) * STAGGER;

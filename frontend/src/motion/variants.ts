/**
 * Shared motion variants · blueprint §07.2
 *
 * Every entry here maps to a row in the motion vocabulary. If a variant does
 * not convey a cause, it does not belong (P5).
 */
import type { Variants } from "motion/react";
import { duration, ease, spring } from "./springs";

/** Detail lives beside, not on top. */
export const drawerVariants: Variants = {
  hidden: { x: "100%" },
  visible: { x: 0, transition: spring.drawer },
  exit: { x: "100%", transition: { duration: duration.slow, ease: ease.out } },
};

/** Modals are reserved for irreversible confirmations (§09.6). */
export const modalVariants: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.panel },
  exit: { opacity: 0, y: 4, scale: 0.99, transition: { duration: duration.quick } },
};

export const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  /* never a heavy scrim — the context must stay readable */
  visible: { opacity: 1, transition: { duration: duration.base } },
  exit: { opacity: 0, transition: { duration: duration.quick } },
};

/** Menus, tooltips, popovers. */
export const popVariants: Variants = {
  hidden: { opacity: 0, y: -4, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.chip },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.instant } },
};

/** Toasts rise from the bottom-left, above the pulse. */
export const toastVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.card },
  exit: { opacity: 0, x: -16, transition: { duration: duration.base } },
};

/**
 * Clearing a warning: the card lifts and fades, and the rest settle upward.
 * The lift is what makes it feel resolved rather than merely deleted.
 */
export const warningVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: spring.card },
  exit: { opacity: 0, y: -12, scale: 0.98, transition: { duration: duration.base } },
};

/** §07.2 — the system stopped you. Two cycles, lateral, 3px. */
export const blockedShake = {
  x: [0, -3, 3, -3, 3, 0],
  transition: { duration: 0.32, ease: ease.inOut },
};

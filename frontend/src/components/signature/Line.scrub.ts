/**
 * SCRUBBING THE LINE · blueprint §07.2, last row
 *
 * *"Timeline scrub — figures track the cursor with no easing at all. Direct
 * manipulation."*
 *
 * That row is the whole specification, and it is the opposite of every other
 * row in the motion vocabulary. Everywhere else in this product a change
 * settles with a spring, because clay has mass. Not here: while a finger is
 * down, the bead **is** the finger. Any smoothing at all — a spring, a
 * transition, even a `requestAnimationFrame` lerp — reads as lag, and lag on a
 * direct-manipulation control reads as a broken control.
 *
 * So there is no animation in this file. There is a pointer position, a date,
 * and a callback.
 *
 * Three implementation details that are not optional:
 *
 *   · **Pointer capture.** Without it, dragging faster than React can re-render
 *     loses the pointer the moment it leaves the 14px bead.
 *   · **Snap to whole days.** The model is days; a continuous position would
 *     let the bead sit between two days and make the figures ambiguous.
 *   · **Keyboard is a first-class input, not a fallback.** A slider you cannot
 *     drive from the keyboard is not a slider (§18). Arrows move a day, shift
 *     a week, Page keys a month, Home and End the ends.
 */
import { useCallback, useRef } from "react";
import { addDays, daysBetween, type ISODate } from "@/mocks/seed/calendar";

export interface ScrubOptions {
  /** Inclusive window the bead may travel over. */
  from: ISODate;
  to: ISODate;
  value: ISODate;
  onChange: (date: ISODate) => void;
  disabled?: boolean;
}

export interface Scrub {
  /** Attach to the element whose box defines the track's extent. */
  trackRef: React.RefObject<HTMLDivElement>;
  /** 0–1 along the window. Multiply by the track width to place anything. */
  position: number;
  /** Spread onto the bead. */
  beadProps: {
    role: "slider";
    tabIndex: 0;
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-valuenow": number;
    "aria-valuetext": string;
    "aria-label": string;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  /** Put on the track so a click anywhere on it moves the bead there. */
  onTrackPointerDown: (e: React.PointerEvent) => void;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * The window is measured in whole days, and the bead reports its position as a
 * **day index** rather than a date string, because `aria-valuenow` has to be a
 * number and "day 43 of 212" is the only honest numeric form of a date on a
 * fixed window. `aria-valuetext` carries the date a person actually hears.
 */
export function useScrub({ from, to, value, onChange, disabled }: ScrubOptions): Scrub {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const span = Math.max(1, daysBetween(from, to));
  const index = clamp(daysBetween(from, value), 0, span);

  const moveTo = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width === 0) return;

      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const next = addDays(from, Math.round(ratio * span));
      // Guarded so a drag inside one day does not re-render the page's figures
      // forty times — the recompute is the expensive half of a scrub.
      if (next !== value) onChange(next);
    },
    [from, span, value, onChange],
  );

  const step = useCallback(
    (days: number) => {
      const next = addDays(from, clamp(index + days, 0, span));
      if (next !== value) onChange(next);
    },
    [from, index, span, value, onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      dragging.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault(); // do not start a text selection or a page pan
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      moveTo(e.clientX);
    },
    [moveTo],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      const jump = e.shiftKey ? 7 : 1;
      const handled: Record<string, () => void> = {
        ArrowLeft: () => step(-jump),
        ArrowDown: () => step(-jump),
        ArrowRight: () => step(jump),
        ArrowUp: () => step(jump),
        PageDown: () => step(-30),
        PageUp: () => step(30),
        Home: () => step(-span),
        End: () => step(span),
      };
      const action = handled[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    },
    [disabled, span, step],
  );

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      // A click on the track is a scrub to that point — the same gesture,
      // started somewhere other than on the bead.
      moveTo(e.clientX);
    },
    [disabled, moveTo],
  );

  return {
    trackRef,
    position: span === 0 ? 0 : index / span,
    beadProps: {
      role: "slider",
      tabIndex: 0,
      "aria-valuemin": 0,
      "aria-valuemax": span,
      "aria-valuenow": index,
      "aria-valuetext": value,
      "aria-label": "Date being viewed",
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onKeyDown,
    },
    onTrackPointerDown,
  };
}

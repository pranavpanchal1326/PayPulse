/**
 * WHETHER THE 3D IS ALLOWED TO EXIST · blueprint P13, exit criterion 5
 *
 * *"The 3D never mounts below 768px, under reduced motion, or on
 * `hardwareConcurrency <= 4` — and the flat SVG substitute is genuinely
 * equivalent."*
 *
 * The gate is written as a **single function returning a reason**, not as
 * three booleans scattered through Act 04, because the substitute has to be
 * chosen once and stay chosen for the life of the page. A scene that mounts
 * when a phone is turned sideways, or unmounts mid-scrub because a resize
 * crossed 768px, is worse than no scene: the act would visibly change
 * identity underneath the reader.
 *
 * So this is sampled **once, on mount**, and the answer is frozen.
 */

export type ThreeVerdict =
  | { allowed: true }
  | { allowed: false; reason: "viewport" | "reduced-motion" | "cpu" | "no-webgl" };

/** §19 — the 3D is a desktop enhancement, and 768px is the blueprint's line. */
const MIN_WIDTH = 768;
/** A four-core machine has better things to do than render a tower of clay. */
const MIN_CORES = 4;

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ??
        canvas.getContext("webgl") ??
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    // A browser that throws while *asking* for a context is not a browser we
    // are going to hand a scene graph to.
    return false;
  }
}

export function inspectThreeSupport(): ThreeVerdict {
  if (typeof window === "undefined") return { allowed: false, reason: "no-webgl" };

  if (window.innerWidth < MIN_WIDTH) return { allowed: false, reason: "viewport" };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { allowed: false, reason: "reduced-motion" };
  }

  // `hardwareConcurrency` is absent on some Safari builds. Absent is not the
  // same as low, and refusing the scene for a missing number would punish a
  // capable machine for being private.
  const cores = navigator.hardwareConcurrency;
  if (typeof cores === "number" && cores <= MIN_CORES) {
    return { allowed: false, reason: "cpu" };
  }

  if (!hasWebGL()) return { allowed: false, reason: "no-webgl" };

  return { allowed: true };
}

/**
 * Why the flat version is showing, in the product's own voice (§17). Printed
 * under the substitute rather than hidden: a reader on a laptop who scrolls
 * past this and then opens it on a phone should be told the truth about what
 * changed, not left wondering whether the page is broken.
 */
export const SUBSTITUTE_REASON: Record<
  Exclude<ThreeVerdict, { allowed: true }>["reason"],
  string
> = {
  viewport: "Drawn flat on a narrow screen. Same blocks, same proportions.",
  "reduced-motion": "Drawn flat and still, because you asked for less motion.",
  cpu: "Drawn flat — this machine has better uses for its cores.",
  "no-webgl": "Drawn flat — this browser has no WebGL.",
};

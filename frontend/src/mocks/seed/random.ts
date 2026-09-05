/**
 * DETERMINISM
 *
 * PRD §9: *"Faker with a fixed seed so every run is byte-identical."* The same
 * promise has to hold on this side, and for a stronger reason than tidiness —
 * a screenshot taken in P5 is the visual reference reviewed in P15. If the
 * fixtures shuffle between reloads, every design decision made against them is
 * unverifiable.
 *
 * `Math.random()` cannot be seeded, so this is mulberry32: 32-bit state, one
 * multiply and two shifts, uniform enough for names and attendance jitter and
 * short enough to read in one sitting. It is not cryptographic and must never
 * be used for anything but fixtures.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  (): number;
  /** Uniform integer in [min, max] — both ends inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** One element. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
  /** A copy, Fisher–Yates shuffled. The input is never mutated. */
  shuffle<T>(items: readonly T[]): T[];
  /** `n` distinct elements, in shuffled order. */
  sample<T>(items: readonly T[], n: number): T[];
}

export function rng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (() => {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;

  next.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  next.chance = (p) => next() < p;

  next.pick = <T,>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError("rng.pick() on an empty list");
    return items[next.int(0, items.length - 1)];
  };

  next.shuffle = <T,>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = next.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  next.sample = <T,>(items: readonly T[], n: number): T[] =>
    next.shuffle(items).slice(0, n);

  return next;
}

/**
 * Each generator gets its own stream from its own seed.
 *
 * A single shared stream would couple every dataset to every other: adding one
 * employee would shift every attendance row, every leave request and every
 * payslip that followed it, and the diff of a one-line fixture change would be
 * the whole file. Separate streams keep changes local.
 */
export const SEEDS = {
  people: 0x50454f50, // "PEOP"
  contracts: 0x434f4e54, // "CONT"
  attendance: 0x41545444, // "ATTD"
  timeOff: 0x54494d45, // "TIME"
  payroll: 0x50415952, // "PAYR"
} as const;

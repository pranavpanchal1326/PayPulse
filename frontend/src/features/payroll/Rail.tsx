/**
 * THE SIX-STAGE RAIL — the cockpit's spine.
 *
 * `SCOPE · EMPLOYEES · COMPUTE · REVIEW · VALIDATE · PAY`, as raised keys.
 * Completed stages fill jade, the current one glows cobalt, future stages sit
 * inset and dark. It is a state machine drawn as an object, and its stages are
 * derived from the payrun's real state — never from a wizard step counter,
 * because a run that has been reopened has genuinely gone backwards and the
 * rail has to be able to say so.
 *
 * **The sweep.** Clearing the last blocking error lifts the whole rail from
 * vermilion to jade, left to right, over 900ms (§12 S16). It is the product's
 * loudest moment and it is earned: it fires only on the transition from *some
 * blockers* to *none*, never on a render that merely happens to have none.
 * Under `prefers-reduced-motion` the sweep is a colour change with no travel —
 * the meaning survives, the movement does not (§07.5).
 */
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cx } from "@/components/system";
import { useSound } from "@/sound/useSound";

export const STAGES = ["SCOPE", "EMPLOYEES", "COMPUTE", "REVIEW", "VALIDATE", "PAY"] as const;
export type Stage = (typeof STAGES)[number];

/** 900ms, per §12 S16 — six stages, so 150ms apart. */
const SWEEP_MS = 900;

export interface RailState {
  /** Stages that are behind us. */
  done: Stage[];
  /** The one being worked on. `null` when the run is finished or cancelled. */
  current: Stage | null;
  /** Blocking errors are open: REVIEW is not merely incomplete, it is stuck. */
  blocked: boolean;
}

export function Rail({ state, caption }: { state: RailState; caption: string }) {
  const play = useSound();
  const [sweeping, setSweeping] = useState(false);
  const wasBlocked = useRef(state.blocked);

  /**
   * The transition is the trigger, not the condition. Firing on `!blocked`
   * would replay the chord on every reload of a healthy payrun, which would
   * turn the product's one celebratory sound into background noise.
   */
  useEffect(() => {
    if (wasBlocked.current && !state.blocked) {
      setSweeping(true);
      play("validate");
      const timer = setTimeout(() => setSweeping(false), SWEEP_MS + 200);
      wasBlocked.current = state.blocked;
      return () => clearTimeout(timer);
    }
    wasBlocked.current = state.blocked;
  }, [state.blocked, play]);

  return (
    <section className="pp-rail" aria-label="Payrun progress">
      <ol className={cx("pp-rail__track", sweeping && "pp-rail__track--sweeping")}>
        {STAGES.map((stage, index) => {
          const done = state.done.includes(stage);
          const current = state.current === stage;
          const stuck = current && state.blocked;
          return (
            <li
              key={stage}
              className={cx(
                "pp-rail__stage",
                done && "pp-rail__stage--done",
                current && "pp-rail__stage--current",
                stuck && "pp-rail__stage--blocked",
              )}
              style={{ ["--sweep-delay" as string]: `${index * (SWEEP_MS / STAGES.length)}ms` }}
              aria-current={current ? "step" : undefined}
            >
              <span className="pp-rail__mark" aria-hidden="true">
                {done ? <Check size={13} /> : index + 1}
              </span>
              <span className="t-micro pp-rail__label">{stage}</span>
              <span className="sr-only">
                {done ? "complete" : stuck ? "blocked" : current ? "current step" : "not started"}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="t-ui-sm pp-rail__caption" role="status">{caption}</p>
    </section>
  );
}

/**
 * The payrun's state, read as six stages.
 *
 * `SCOPE` and `EMPLOYEES` are behind us the moment a payrun row exists — those
 * two steps *are* the wizard, and it created nothing until they were both
 * answered.
 */
export function railStateFor(
  payrunState: string,
  hasPayslips: boolean,
  openErrors: number,
): RailState {
  const done: Stage[] = ["SCOPE", "EMPLOYEES"];

  if (payrunState === "CANCELLED") {
    return { done, current: null, blocked: false };
  }

  const computed = payrunState !== "DRAFT" && hasPayslips;
  if (computed) done.push("COMPUTE");
  if (computed && openErrors === 0) done.push("REVIEW");
  if (payrunState === "VALIDATED" || payrunState === "PAID") done.push("VALIDATE");
  if (payrunState === "PAID") done.push("PAY");

  const current = (STAGES.find((s) => !done.includes(s)) ?? null) as Stage | null;
  return { done, current, blocked: openErrors > 0 && current === "REVIEW" };
}

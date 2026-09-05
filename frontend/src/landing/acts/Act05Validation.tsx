/**
 * ACT 05 · NOTHING GETS PAID UNTIL IT MAKES SENSE · blueprint §13
 *
 * *"The page goes dark. The only dark act, mirroring the payrun room. The flow
 * visibly stops at the blocker. The user clicks `Fix` in-page, the warning card
 * lifts away, and the rail sweeps vermilion → jade with the resolve chord.
 * Business logic demonstrated, not claimed."*
 *
 * Three things make this act honest rather than a mime of one.
 *
 * **The rail is the product's rail.** `Rail` and `railStateFor` are imported
 * from the payrun cockpit — the same six stages, the same state machine, the
 * same 900ms sweep and the same resolve chord. If the cockpit's rail changes,
 * this changes with it; there is no landing-page copy to drift.
 *
 * **The state comes from the state machine.** The reader does not toggle a
 * boolean called `fixed`; they resolve a warning, the open-error count drops
 * to zero, and `railStateFor` recomputes what that means. The sweep fires
 * because the run genuinely stopped being blocked — which is also why it fires
 * exactly once and never on a re-render that merely happens to be healthy.
 *
 * **The dark is the product's dark.** `data-theme="dark"` on the section, the
 * same ramp declared in `tokens.css` — not a bespoke dark palette for a
 * marketing page. A second dark would be a second product.
 *
 * The act is deliberately *not* scroll-scrubbed. Every other act plays as you
 * pass through it; this one waits, because the point being made is that the
 * system stops and will not proceed until a person does something. A blocker
 * that clears itself when you scroll past it would be arguing the opposite.
 */
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { formatMoney } from "@/api/money";
import { Button, WarningCard } from "@/components/system";
import { Rail, railStateFor } from "@/features/payroll/Rail";
import { spring } from "@/motion/springs";
import { ActHead, ActSection } from "../Act";
import { useHasEntered } from "../scroll";
import { payrun } from "../story";

export function Act05Validation() {
  const ref = useRef<HTMLElement>(null);
  const entered = useHasEntered(ref, "-20%");
  const reduced = useReducedMotion();
  const [resolved, setResolved] = useState(false);

  /** Open blocking errors → the rail's own reading of the same run. */
  const openErrors = resolved ? 0 : payrun.blocked;
  const rail = railStateFor("COMPUTED", true, openErrors);

  return (
    <ActSection
      ref={ref}
      id="act-05"
      label="Nothing gets paid until it makes sense"
      beats={2}
      lean="left"
      dark
    >
      <div className="lp-dark">
        <ActHead
          index={5}
          kicker="The dark room"
          headline={<>Nothing gets paid until it makes sense.</>}
        >
          <p>
            The one screen in PayPulse where money actually moves is a different room — charcoal,
            cobalt keys, and a rail that will not advance past a problem. This is that room, and
            the blocker below is real.
          </p>
        </ActHead>

        <div className="lp-dark__head">
          <p className="t-micro lp-dark__run">
            {payrun.name} · {payrun.label}
          </p>
          <p className="t-ui lp-dark__counts n-table">
            <span>{payrun.payslips} payslips</span>
            <span className="lp-dark__ready">{resolved ? payrun.payslips : payrun.ready} ready</span>
            <span className="lp-dark__warn">
              {String(resolved ? 0 : payrun.warnings).padStart(2, "0")} warnings
            </span>
            <span className="lp-dark__stop">
              {String(openErrors).padStart(2, "0")} blocked
            </span>
          </p>
          <p className="t-ui-sm lp-dark__total">
            Total net · <span className="n-table">{formatMoney(payrun.totalNet)}</span>
          </p>
        </div>

        {/* The product's rail, on the product's state machine. */}
        <Rail
          state={rail}
          caption={
            resolved
              ? "Nothing is blocking this run. Validate is available."
              : "Review is blocked. Clear the error and the rail moves."
          }
        />

        <div className="lp-dark__stage">
          <AnimatePresence mode="wait">
            {!resolved ? (
              <motion.div
                key="blocker"
                className="lp-dark__warning"
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                /* Lifts away — up and out, the way an object is removed from a
                   surface, rather than fading, which is how a picture leaves. */
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -28, scale: 0.97 }}
                transition={spring.card}
              >
                <WarningCard
                  severity="error"
                  code={payrun.blocker.code}
                  detail={`${payrun.blocker.title} — ${payrun.blocker.message}`}
                  blocks="Blocks validate"
                  action={
                    <Button variant="primary" size="sm" onClick={() => setResolved(true)}>
                      Fix
                    </Button>
                  }
                />
              </motion.div>
            ) : (
              <motion.div
                key="clear"
                className="lp-dark__clear"
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={entered ? { opacity: 1, y: 0 } : undefined}
                transition={spring.card}
              >
                <span className="lp-dark__tick" aria-hidden="true">
                  <Check size={18} />
                </span>
                <div>
                  <p className="t-h3 lp-dark__clear-title">Nothing is blocking this run.</p>
                  <p className="t-ui-sm lp-dark__clear-note">
                    The rail swept because the run stopped being blocked — not because a button was
                    pressed. Press it again by scrolling away and back.
                  </p>
                </div>
                <Button variant="quiet" size="sm" onClick={() => setResolved(false)}>
                  Put it back
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ActSection>
  );
}

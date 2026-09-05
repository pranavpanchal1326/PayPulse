/**
 * ACT 07 · THE CLOSE · blueprint §13
 *
 * ```
 * PEOPLE.
 * TIME.
 * PAY.
 *
 * ONE SYSTEM.
 *
 * [ ENTER PAYPULSE → ]
 * ```
 *
 * *"`display-xl`, flush field, enormous space, symmetric — one of only two
 * centred moments in the entire product. THE LINE, now fully assembled, runs
 * beneath and off both edges of the screen."*
 *
 * The line here is the same model the hero disassembled, drawn whole and
 * without its bead: nothing left to scrub, nothing left to take apart. It runs
 * past both edges because the month it draws did not begin or end on this
 * page — which is the last thing the page has to say.
 */
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Line } from "@/components/signature";
import { Button } from "@/components/system";
import { spring, staggerDelay } from "@/motion/springs";
import { ActSection } from "../Act";
import { useHasEntered } from "../scroll";
import { lineModel, period } from "../story";

const WORDS = ["People.", "Time.", "Pay."];

export function Act07Close({ onEnter }: { onEnter: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const entered = useHasEntered(ref, "-25%");
  const reduced = useReducedMotion();

  return (
    <ActSection ref={ref} id="act-07" label="One system" beats={2} lean="centre">
      <div className="lp-close">
        <h2 className="lp-close__words">
          {WORDS.map((word, i) => (
            <motion.span
              key={word}
              className="t-display-xl lp-close__word"
              initial={reduced ? false : { opacity: 0, y: 28 }}
              animate={entered ? { opacity: 1, y: 0 } : undefined}
              transition={{ ...spring.panel, delay: staggerDelay(i) }}
            >
              {word}
            </motion.span>
          ))}
          <motion.span
            className="t-display-xl lp-close__word lp-close__word--answer"
            initial={reduced ? false : { opacity: 0, y: 28 }}
            animate={entered ? { opacity: 1, y: 0 } : undefined}
            transition={{ ...spring.panel, delay: staggerDelay(WORDS.length + 1) }}
          >
            One system.
          </motion.span>
        </h2>

        <div className="lp-close__cta">
          <Button variant="primary" size="xl" iconAfter={<ArrowRight size={20} />} onClick={onEnter}>
            Enter PayPulse
          </Button>
          <p className="t-ui-sm lp-close__note">
            Five demo roles. {period.label} is open, six months are closed, and every figure on this
            page came out of them.
          </p>
        </div>
      </div>

      {/*
        Assembled, full-bleed, and not scrubbable: the bead is gone because
        there is nothing left to take apart. `legend` stays on — it is the last
        chance to say that a gap means leave.
      */}
      <div className="lp-close__line" aria-hidden="false">
        <Line model={lineModel} value={period.end} legend />
      </div>
    </ActSection>
  );
}

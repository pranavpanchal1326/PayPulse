/**
 * ACT 06 · THE PAYSLIP IS THE RECEIPT · blueprint §13
 *
 * *"Back to light, and quiet. The flip card, at rest, inviting a click. Flip
 * it, see the derivation. Then `GENERATE PDF` and the document resolves and
 * lifts away."*
 *
 * After the dark room this act does almost nothing, on purpose: §13's rhythm
 * is loud → quiet → loud, and Act 05 was loud. There is one object, one
 * gesture, and one button.
 *
 * The object is `PayslipCard` — the product's own flip card, holding the
 * product's own payslip, with the product's own rules on its back. Nothing is
 * re-implemented for the page, which is what lets the act make its claim
 * without saying it: this *is* the receipt, not a rendering of one.
 *
 * **The PDF gesture is honest about what it is.** Pressing it lifts the
 * document away and says where the real one comes from. It does not pretend to
 * download a file on a marketing page — a button that appears to produce a
 * payslip PDF for a person the reader has never met would be the only
 * dishonest control in the product.
 */
import { useRef, useState } from "react";
import { FileDown, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PayslipCard } from "@/components/signature";
import { Button } from "@/components/system";
import { spring } from "@/motion/springs";
import { useSound } from "@/sound/useSound";
import { ActHead, ActNote, ActSection } from "../Act";
import { useHasEntered } from "../scroll";
import { payslip, salaryRules } from "../story";

export function Act06Payslip({ onWhy }: { onWhy: (code: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const entered = useHasEntered(ref, "-20%");
  const reduced = useReducedMotion();
  const play = useSound();

  const [flipped, setFlipped] = useState(false);
  const [issued, setIssued] = useState(false);

  return (
    <ActSection ref={ref} id="act-06" label="The payslip is the receipt" beats={2} lean="right">
      <div className="lp-two lp-two--inverted">
        <div className="lp-two__object">
          <div className="lp-payslip">
            <AnimatePresence mode="wait">
              {!issued ? (
                <motion.div
                  key="card"
                  initial={reduced ? false : { opacity: 0, y: 20 }}
                  animate={entered ? { opacity: 1, y: 0 } : undefined}
                  /* Lifts away, up and out — the document leaving the desk. */
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: -40, scale: 0.96 }}
                  transition={spring.panel}
                >
                  <PayslipCard
                    payslip={payslip}
                    rules={salaryRules}
                    flipped={flipped}
                    onFlip={setFlipped}
                    onWhy={() => onWhy("NET")}
                    onLine={onWhy}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="issued"
                  className="lp-payslip__issued inset-2"
                  initial={reduced ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring.panel}
                >
                  <p className="t-micro">Issued</p>
                  <p className="t-h3 lp-payslip__issued-title">
                    The document leaves the room as a PDF.
                  </p>
                  <p className="t-ui-sm lp-payslip__issued-note">
                    Generated server-side from this payslip's own lines — the same figures, the
                    same rules, the same period. Inside the product it downloads. Here it does not,
                    because it is not your payslip.
                  </p>
                  <Button variant="secondary" size="sm" icon={<RotateCcw size={16} />} onClick={() => setIssued(false)}>
                    Bring it back
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="lp-two__words">
          <ActHead
            index={6}
            kicker="The payslip is the receipt"
            headline={<>Turn it over. The reasons are on the back.</>}
          >
            <p>
              A payslip that only shows totals asks to be trusted. This one shows its working: every
              line carries its rule, its sequence and the values that rule received.
            </p>
          </ActHead>

          <div className="lp-payslip__controls">
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setFlipped((f) => !f);
                play("toggle");
              }}
              disabled={issued}
            >
              {flipped ? "Show the front" : "Show the derivation"}
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<FileDown size={16} />}
              onClick={() => {
                setIssued(true);
                play("send");
              }}
              disabled={issued}
            >
              Generate PDF
            </Button>
          </div>

          <ActNote>
            Click any line on the card to open the derivation drawer — the same drawer, from the
            same tree, that the product opens.
          </ActNote>
        </div>
      </div>
    </ActSection>
  );
}

/**
 * ACT 02 · TIME SHOULD NOT DISAPPEAR BETWEEN HR AND PAYROLL · blueprint §13
 *
 * *"A live clock face milled into the ground. Numbers roll in real time. Then
 * those hours physically travel down THE LINE and land in the `OT` block of
 * the stack. Composition inverts — object left, content right."*
 *
 * The act is one sentence said twice: **the same hours, in two systems.** The
 * clock is an attendance row — a real one, the day inside the period with the
 * most overtime — and the block it lands in is the `OT` line of the same
 * person's payslip. Nothing is converted, illustrated or approximated between
 * them; the number that leaves the clock is the number that arrives, because
 * both were read out of the same computation.
 *
 * **The clock is genuinely live.** The seconds are the wall clock, ticking, in
 * `num-mono`. It is the only autoplaying motion on the page and it earns the
 * exception: a clock that is not moving is a photograph of a clock, and the
 * point being made is that time is *passing* whether or not payroll is
 * looking. It stops under reduced motion, and it stops when the act is off
 * screen — an interval running behind six other acts is a battery leak.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { motion, useReducedMotion, useTransform } from "motion/react";
import { ZERO, formatMoney } from "@/api/money";
import { RollingNumber } from "@/components/signature";
import { spring } from "@/motion/springs";
import { useSound } from "@/sound/useSound";
import { ActHead, ActSection } from "../Act";
import { useActProgress, useIsOnScreen, useOnStep, useSmoothProgress, useStep } from "../scroll";
import { day, overtimeBlock } from "../story";

/** The travelling packet crosses on this beat; the block lands on the next. */
const TRAVEL = [0.34, 0.66];
const LANDING = 0.66;

export function Act02Time() {
  const ref = useRef<HTMLElement>(null);
  const raw = useActProgress(ref);
  const progress = useSmoothProgress(raw);
  /*
    "Is anyone looking?", not "has this been seen?" — the live clock is this
    act's only repeating cost, so the latching `useHasEntered` was simply the
    wrong question. Nothing else in this act needed it.
  */
  const onScreen = useIsOnScreen(ref);
  const reduced = useReducedMotion();
  const play = useSound();
  const still = Boolean(reduced);

  /* ── The live face ────────────────────────────────────────────────── */

  const [now, setNow] = useState(() => new Date());

  /*
    Gated on `onScreen`, not `entered`. `useHasEntered` latches by design, so
    this interval used to survive the whole rest of the page — a `setState`
    every second, re-rendering an act nobody was looking at, behind six other
    acts. That is what the header comment above already promised did not
    happen. It does not happen now.
  */
  useEffect(() => {
    if (still || !onScreen) return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [still, onScreen]);

  /* ── The travel, and the landing ──────────────────────────────────── */

  const travel = useTransform(progress, TRAVEL, ["0%", "100%"]);
  const packetOpacity = useTransform(progress, [TRAVEL[0] - 0.06, TRAVEL[0], TRAVEL[1], LANDING + 0.04], [0, 1, 1, 0]);

  /** Two steps: travelling, landed. The sound belongs to the landing only. */
  const step = useStep(progress, 2);
  const landed = still || step >= 2 || progress.get() >= LANDING;

  useOnStep(step, (s) => {
    // §08.1 — the block sound, at the OT block's depth in the stack.
    if (s >= 2 && !still) play("block", 5);
  });

  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  return (
    <ActSection ref={ref} id="act-02" label="Time becomes pay" beats={3} lean="right">
      <div className="lp-two lp-two--inverted">
        {/* Object left. §13 inverts the composition here, and §06.2 forbids
            two consecutive acts leaning the same way. */}
        <div className="lp-two__object">
          <div className="lp-clock">
            <div className="lp-clock__face inset-2">
              <p className="t-micro lp-clock__label">
                Now · {still ? "paused" : "live"}
              </p>
              <p className="n-mono lp-clock__now" aria-hidden={still ? undefined : "true"}>
                {clock}
              </p>

              <hr className="hairline lp-clock__rule" />

              <p className="t-micro lp-clock__label">
                One day · {day.date}
              </p>

              <dl className="lp-clock__grid">
                <div>
                  <dt className="t-micro">Check-in</dt>
                  <dd className="n-m">{day.checkIn}</dd>
                </div>
                <div>
                  <dt className="t-micro">Check-out</dt>
                  <dd className="n-m">{day.checkOut}</dd>
                </div>
                <div>
                  <dt className="t-micro">Worked</dt>
                  <dd className="n-m">{day.worked}</dd>
                </div>
                <div className="lp-clock__over">
                  <dt className="t-micro">Overtime</dt>
                  <dd className="n-m">+{day.overtime}</dd>
                </div>
              </dl>
            </div>

            {/*
              The channel the hours travel down. It is THE LINE's own milled
              track, turned on its side — same floor, same white lip below it,
              because a second kind of groove would be a second material.
            */}
            <div className="lp-travel" aria-hidden="true">
              <span className="lp-travel__floor" />
              <motion.span
                className="lp-travel__packet"
                style={still ? { top: "100%", opacity: 1 } : { top: travel, opacity: packetOpacity }}
              />
              <ArrowDown size={16} className="lp-travel__arrow" />
            </div>

            {/*
              Where it lands. The `OT` block of the stack, at its real size
              relative to nothing — this is a landing pad, not a tower, so it
              carries its amount rather than its proportion.
            */}
            <motion.div
              className="lp-landing clay-2"
              initial={reduced ? false : { scale: 0.94, opacity: 0.45 }}
              animate={landed ? { scale: 1, opacity: 1 } : { scale: 0.94, opacity: 0.45 }}
              transition={spring.block}
            >
              <p className="t-micro lp-landing__code">
                OT · {overtimeBlock ? `sequence ${overtimeBlock.sequence}` : "overtime"}
              </p>
              {overtimeBlock ? (
                <RollingNumber
                  value={landed ? overtimeBlock.amount : ZERO}
                  scale="l"
                  label="Overtime paid"
                />
              ) : (
                <p className="n-l">{formatMoney(ZERO)}</p>
              )}
              <p className="t-ui-sm lp-landing__note">
                {day.overtimeHours.toFixed(2)} hours, at the contract's own hourly rate
              </p>
            </motion.div>
          </div>
        </div>

        {/* Content right. */}
        <div className="lp-two__words">
          <ActHead
            index={2}
            kicker="Time becomes pay"
            headline={<>Time should not disappear between HR and payroll.</>}
          >
            <p>
              A check-in is a fact. An overtime hour is the same fact, read by a rule. In most
              stacks those two live in different systems and are reconciled by a spreadsheet
              once a month.
            </p>
            <p>
              Here the hours travel. The row you can see on the left is the row the{" "}
              <code className="n-mono">OT</code> rule reads, and the figure it produces is the one
              printed on the payslip — the same number, not a matching one.
            </p>
          </ActHead>
        </div>
      </div>
    </ActSection>
  );
}

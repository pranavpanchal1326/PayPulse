/**
 * ACT 03 · LEAVE IS A STATE CHANGE · blueprint §13
 *
 * *"Quiet act. Mostly flush field. One inset meter, and one number that moves.
 * The roll is the only motion on screen. Beneath it, an `LWP` line appears on
 * a miniature payslip and the net figure counts down. Restraint here is what
 * makes Act 04 land."*
 *
 * So this act is defined by what it refuses. No object at an angle, no
 * travelling packet, no connectors: a flush field, a five-word chain, one
 * meter, and two figures that move. Everything that could have been added
 * here would have been borrowed from Act 04, which is the act that needs it.
 *
 * The chain is the state machine, spelled out — **allocated, requested,
 * approved, remaining, and then payroll**, which is the step every other
 * product in this category leaves as an export. The last arrow is the whole
 * argument: approving leave is not a calendar event, it is a change to a
 * number on a payslip, and the two figures at the bottom are that change
 * happening.
 */
import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ZERO, formatMoney, subMoney } from "@/api/money";
import { RollingCount, RollingNumber } from "@/components/signature";
import { Meter, cx } from "@/components/system";
import { spring, staggerDelay } from "@/motion/springs";
import { ActHead, ActSection } from "../Act";
import { useActProgress, useSmoothProgress, useStep } from "../scroll";
import { figures, leave, period } from "../story";

export function Act03Leave() {
  const ref = useRef<HTMLElement>(null);
  const raw = useActProgress(ref);
  const progress = useSmoothProgress(raw);
  const reduced = useReducedMotion();
  const still = Boolean(reduced);

  /**
   * Five steps for five links in the chain. Derived from scroll position
   * rather than accumulated, so a fast flick cannot skip `APPROVED` and leave
   * the reader looking at a balance that dropped for no stated reason.
   */
  const step = useStep(progress, 5);
  const reached = (n: number) => still || step >= n;

  const chain = [
    { label: "Allocated", value: `${leave.allocated} days`, note: leave.typeName },
    { label: "Requested", value: `${leave.taken} days`, note: "Submitted for approval" },
    { label: "Approved", value: "State change", note: "By the manager, dated" },
    { label: "Remaining", value: `${leave.remaining} days`, note: "Balance, drawn down" },
    { label: "Payroll", value: "Updated", note: "Without anyone exporting anything" },
  ];

  /** The two figures. Both move, and both move because of the same approval. */
  const balance = reached(4) ? leave.remaining : leave.allocated;
  const net = reached(5) ? figures.net : leave.netBefore;

  return (
    <ActSection ref={ref} id="act-03" label="Leave is a state change" beats={3} lean="left">
      <div className="lp-quiet">
        <ActHead
          index={3}
          kicker="Leave is a state change"
          headline={<>Approving leave is a payroll event.</>}
        >
          <p>
            {leave.allocated} allocated, {leave.taken} taken, {leave.remaining} left — and{" "}
            {leave.unpaidDays} {leave.unpaidDays === 1 ? "day" : "days"} of it unpaid, which is
            not a balance at all. It is a deduction, and it appears on the payslip the moment the
            approval does.
          </p>
        </ActHead>

        {/* The chain. Five links, revealed in order, and nothing else moves. */}
        <ol className="lp-chain">
          {chain.map((link, i) => (
            <motion.li
              key={link.label}
              className={cx("lp-chain__link", reached(i + 1) && "lp-chain__link--on")}
              initial={reduced ? false : { opacity: 0.25 }}
              animate={{ opacity: reached(i + 1) ? 1 : 0.25 }}
              transition={{ ...spring.chip, delay: still ? 0 : staggerDelay(i) }}
            >
              <p className="t-micro lp-chain__label">{link.label}</p>
              <p className="t-ui lp-chain__value">{link.value}</p>
              <p className="t-ui-sm lp-chain__note">{link.note}</p>
            </motion.li>
          ))}
        </ol>

        <div className="lp-quiet__pair">
          {/* The one inset meter §13 allows. */}
          <div className="lp-balance inset-2">
            <p className="t-micro lp-balance__label">
              {leave.typeName} · {period.label}
            </p>

            <div className="lp-balance__figure">
              <RollingCount value={balance} scale="xl" label="Days remaining" />
              <span className="t-ui-sm lp-balance__of">of {leave.allocated} allocated</span>
            </div>

            <Meter
              label={`${leave.typeName} balance`}
              segments={[
                { value: leave.taken, label: "taken", color: "var(--cobalt-500)", ink: "var(--on-solid)" },
                { value: leave.pending, label: "pending", color: "var(--orange-500)", ink: "var(--orange-deep)" },
                { value: Math.max(0, leave.remaining), label: "remaining", color: "var(--bone-500)", ink: "var(--ink-700)" },
              ]}
            />
          </div>

          {/*
            The miniature payslip. Two lines and a total — enough to show the
            `LWP` line arriving and the net moving, and not one line more. The
            real payslip is Act 06's subject and it is not spent here.
          */}
          <div className="lp-mini clay-3">
            <p className="t-micro lp-mini__label">Payslip · {period.label}</p>

            <dl className="lp-mini__lines t-ui-sm">
              <div>
                <dt>Gross</dt>
                <dd className="n-table">{formatMoney(figures.gross)}</dd>
              </div>
              <div>
                <dt>Deductions before leave</dt>
                <dd className="n-table">
                  −{formatMoney(subMoney(figures.deductions, leave.lwp?.amount ?? ZERO))}
                </dd>
              </div>

              {/* The line that appears. It is a real payslip line, at its real
                  amount — the deduction the approval created. */}
              <motion.div
                className="lp-mini__lwp"
                initial={reduced ? false : { opacity: 0, height: 0 }}
                animate={
                  reached(5)
                    ? { opacity: 1, height: "auto" }
                    : reduced
                      ? undefined
                      : { opacity: 0, height: 0 }
                }
                transition={spring.card}
              >
                <dt>{leave.lwp?.name ?? "Unpaid leave"}</dt>
                <dd className="n-table lp-mini__negative">
                  −{formatMoney(leave.lwp?.amount ?? ZERO)}
                </dd>
              </motion.div>
            </dl>

            <hr className="hairline lp-mini__rule" />

            <div className="lp-mini__net">
              <p className="t-micro">Net</p>
              <RollingNumber value={net} scale="l" label="Net salary" />
            </div>

            <p className="t-ui-sm lp-mini__note">
              {reached(5)
                ? `${leave.unpaidDays} unpaid ${leave.unpaidDays === 1 ? "day" : "days"}, charged once — in exactly one rule.`
                : "Before the approval reaches payroll."}
            </p>
          </div>
        </div>
      </div>
    </ActSection>
  );
}

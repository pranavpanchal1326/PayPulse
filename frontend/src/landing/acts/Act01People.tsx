/**
 * ACT 01 · PEOPLE ARE NOT ROWS · blueprint §13
 *
 * *"Show the real S3 employee page as a raised `--clay-4` object at a slight
 * angle. Connector lines run out from it to four small raised cards —
 * contracts, attendance, time off, payroll — drawn on hover as if the record
 * is reaching for its relations. Content left, object right."*
 *
 * **The connectors are drawn, not shown.** Each is a path with its own length
 * as its dash, and hovering a relation runs the dash offset to zero — so the
 * line grows out of the record toward the card rather than appearing between
 * them. That is the difference between "these are related" and "this record is
 * reaching for that one", and it is the whole reason the act is a drawing and
 * not a bulleted list.
 *
 * Quiet act, by composition: after the hero's five beats it does one thing.
 * §13's rhythm rule is loud → quiet → loud, and two consecutive high-energy
 * acts is a composition error.
 */
import { useRef, useState } from "react";
import { CalendarDays, Clock, FileText, Wallet } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { formatMoney } from "@/api/money";
import { Badge, cx } from "@/components/system";
import { spring, staggerDelay } from "@/motion/springs";
import { ActHead, ActSection } from "../Act";
import { useHasEntered } from "../scroll";
import { figures, period, person } from "../story";

/**
 * The four relations, in the order the product's own employee page lists them.
 * `y` is where the connector meets the card, as a fraction of the column's
 * height — so the four lines fan rather than run parallel, which is what makes
 * the record look like the centre of something.
 */
const RELATIONS = [
  {
    key: "contracts",
    icon: FileText,
    label: "Contracts",
    value: `${figures.contractCount} running`,
    note: "Wage, schedule, structure — dated, never overwritten",
  },
  {
    key: "attendance",
    icon: Clock,
    label: "Attendance",
    value: `${figures.payableDays} payable days`,
    note: `${figures.overtimeHours.toFixed(2)} hours over schedule`,
  },
  {
    key: "leave",
    icon: CalendarDays,
    label: "Time off",
    value: `${figures.unpaidDays} unpaid`,
    note: "Approved leave, and what it did to pay",
  },
  {
    key: "payroll",
    icon: Wallet,
    label: "Payroll",
    value: formatMoney(figures.net),
    note: `${figures.ruleCount} rules, in sequence`,
  },
] as const;

export function Act01People() {
  const ref = useRef<HTMLElement>(null);
  const entered = useHasEntered(ref);
  const reduced = useReducedMotion();
  const [reaching, setReaching] = useState<string | null>(null);

  /**
   * Under reduced motion every connector is drawn, permanently. The relations
   * are the content; hovering is only how the content is *paced*, and pacing
   * is exactly what §07.5 says to drop.
   */
  const allDrawn = Boolean(reduced);

  return (
    <ActSection ref={ref} id="act-01" label="People are not rows" beats={2} lean="left">
      <div className="lp-two">
        <div className="lp-two__words">
          <ActHead index={1} kicker="People are not rows" headline={<>One person.<br />One context.</>}>
            <p>
              A payroll question is never <em>"what is in the employees table"</em>. It is{" "}
              <em>"what was true for this person, in this period"</em> — and the answer lives in four
              places at once.
            </p>
            <p className="lp-two__aside t-ui">
              {allDrawn ? "Every relation, drawn." : "Point at a relation. The record reaches for it."}
            </p>
          </ActHead>
        </div>

        <div className="lp-two__object">
          <div className="lp-people">
            {/*
              The record. `clay-4` — the heaviest surface in the system, used
              for exactly one thing on this page, because §09.5 says a card is
              an object and this is the only object in the act.
            */}
            <motion.article
              className="lp-people__record clay-4"
              initial={reduced ? false : { opacity: 0, y: 24, rotate: -2.4 }}
              animate={entered ? { opacity: 1, y: 0, rotate: -1.6 } : undefined}
              transition={spring.card}
            >
              <header className="lp-people__head">
                <span className="lp-people__avatar clay-1" aria-hidden="true">
                  {person.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")}
                </span>
                <div>
                  <h3 className="t-h2 lp-people__name">{person.name}</h3>
                  <p className="t-ui-sm lp-people__meta">
                    {person.title} · {person.department}
                  </p>
                </div>
                <Badge tone="neutral">{person.number}</Badge>
              </header>

              <dl className="lp-people__facts t-ui-sm">
                <div>
                  <dt>Period</dt>
                  <dd>{period.label}</dd>
                </div>
                <div>
                  <dt>Gross</dt>
                  <dd className="n-table">{formatMoney(figures.gross)}</dd>
                </div>
                <div>
                  <dt>Deductions</dt>
                  <dd className="n-table">−{formatMoney(figures.deductions)}</dd>
                </div>
                <div>
                  <dt>Net</dt>
                  <dd className="n-table lp-people__net">{formatMoney(figures.net)}</dd>
                </div>
              </dl>
            </motion.article>

            {/*
              The connectors. One SVG layer behind the cards, sized in
              percentage units so it tracks the grid it is drawn over rather
              than a fixed viewport.
            */}
            <svg className="lp-people__wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {RELATIONS.map((relation, i) => {
                const y = 14 + i * 24;
                const on = allDrawn || reaching === relation.key;
                return (
                  <path
                    key={relation.key}
                    className={cx("lp-people__wire", on && "lp-people__wire--on")}
                    d={`M 4 ${y} C 34 ${y}, 46 ${y}, 96 ${y}`}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>

            <ul className="lp-people__relations">
              {RELATIONS.map((relation, i) => {
                const Icon = relation.icon;
                const on = allDrawn || reaching === relation.key;
                return (
                  <motion.li
                    key={relation.key}
                    className={cx("lp-relation clay-2", on && "lp-relation--on")}
                    initial={reduced ? false : { opacity: 0, x: 20 }}
                    animate={entered ? { opacity: 1, x: 0 } : undefined}
                    transition={{ ...spring.card, delay: staggerDelay(i + 1) }}
                    onMouseEnter={() => setReaching(relation.key)}
                    onMouseLeave={() => setReaching(null)}
                    onFocus={() => setReaching(relation.key)}
                    onBlur={() => setReaching(null)}
                    tabIndex={0}
                  >
                    <Icon size={16} className="lp-relation__icon" aria-hidden="true" />
                    <p className="t-micro lp-relation__label">{relation.label}</p>
                    <p className="t-ui lp-relation__value">{relation.value}</p>
                    <p className="t-ui-sm lp-relation__note">{relation.note}</p>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </ActSection>
  );
}

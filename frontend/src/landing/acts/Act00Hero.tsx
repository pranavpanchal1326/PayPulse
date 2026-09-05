/**
 * ACT 00 · THE HERO · blueprint §13
 *
 * *"Do not open with a tagline. Open with the answer."*
 *
 * One enormous tabular figure — a real net salary, computed by the real
 * engine — and then, as you scroll, it **disassembles along THE LINE into the
 * records that produced it**. The contract slides in, the attendance ticks
 * draw, the leave gap opens, the rules stack up and get carved, and the figure
 * lands where it started.
 *
 * Five beats, and each one is a different *kind* of record, in the order
 * payroll actually consumes them:
 *
 * ```
 *   0.00 → 0.22   the figure loosens its grip and the line appears beneath it
 *   0.20 → 0.42   THE CONTRACT — one band, the period of employment
 *   0.40 → 0.62   ATTENDANCE   — the ticks sweep in, day by day
 *   0.60 → 0.78   THE GAP      — leave, drawn as the absence of ticks
 *   0.76 → 0.92   THE RULES    — the tower assembles and is carved
 *   0.90 → 1.00   the figure lands where it started
 * ```
 *
 * **The user controls time, twice over.** Scrolling moves the bead along the
 * month. But the bead is also the product's real, draggable `Line` — and the
 * moment a reader touches it, scroll stops driving it and the reader owns it
 * for the rest of the page. A scroll position that fights a finger is the one
 * reliable way to make direct manipulation feel broken (§07.2), so it does not
 * fight: it concedes, once, permanently, and says so in the caption.
 */
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { addDays, daysBetween, type ISODate } from "@/mocks/seed/calendar";
import { formatMoney } from "@/api/money";
import { Line, RollingNumber } from "@/components/signature";
import { Button } from "@/components/system";
import { ActSection } from "../Act";
import { useActProgress, useSmoothProgress } from "../scroll";
import { additive, deductions, figures, lineModelAt, period, person } from "../story";

/** Beat boundaries, as a table rather than as numbers buried in transforms. */
const LOOSEN = [0, 0.22];
const CONTRACT = [0.2, 0.42];
const ATTENDANCE = [0.4, 0.62];
const GAP = [0.6, 0.78];
const RULES = [0.76, 0.92];
const LAND = [0.9, 1];

export function Act00Hero({ onEnter }: { onEnter: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const raw = useActProgress(ref);
  const progress = useSmoothProgress(raw);
  const reduced = useReducedMotion();

  /**
   * Under reduced motion the act is **one composed static frame** (§07.5, and
   * P13's exit criterion): the figure at full size, the line fully drawn,
   * every record present. Not a faster animation — no animation, and nothing
   * missing.
   */
  const still = Boolean(reduced);

  /**
   * The bead's date. Scroll writes it until the reader takes it; after that,
   * `owned` latches and only the reader writes it.
   */
  const [owned, setOwned] = useState(false);
  const [date, setDate] = useState<ISODate>(still ? period.end : period.start);

  const span = daysBetween(period.start, period.end);

  /**
   * Scroll → date, over the same beat the ticks are revealed on, so the bead
   * arrives at the end of the month exactly as the last tick is drawn.
   *
   * An *event*, not a transform: a transform is a pure mapping that may be
   * evaluated whenever the renderer likes, and putting a `setState` inside one
   * makes React's work a side effect of a frame the renderer scheduled. The
   * event fires once per genuine change, which is what this is.
   */
  useMotionValueEvent(progress, "change", (p) => {
    if (owned || still) return;
    const t = Math.max(0, Math.min(1, (p - ATTENDANCE[0]) / (ATTENDANCE[1] - ATTENDANCE[0])));
    const next = addDays(period.start, Math.round(t * span));
    setDate((current) => (current === next ? current : next));
  });

  /* ── The figure ───────────────────────────────────────────────────── */

  const figureScale = useTransform(progress, [0, LOOSEN[1], LAND[0], 1], [1, 0.6, 0.6, 1]);
  const figureY = useTransform(progress, [0, LOOSEN[1], LAND[0], 1], [0, -32, -32, 0]);

  /* ── The records, each on its own beat ────────────────────────────── */

  const contract = useTransform(progress, CONTRACT, [0, 1]);
  const attendance = useTransform(progress, ATTENDANCE, [0, 1]);
  const gap = useTransform(progress, GAP, [0, 1]);
  const rules = useTransform(progress, RULES, [0, 1]);

  /** The line is revealed left to right, as time passes over it. */
  const reveal = useTransform(
    progress,
    [CONTRACT[0], ATTENDANCE[1]],
    ["inset(0 100% 0 0)", "inset(0 0% 0 0)"],
  );

  const model = lineModelAt(date);

  return (
    <ActSection
      ref={ref}
      id="act-00"
      label="The answer, and the records behind it"
      beats={4}
      lean="centre"
    >
      <div className="lp-hero">
        <motion.div
          className="lp-hero__figure"
          style={still ? undefined : { scale: figureScale, y: figureY }}
        >
          <p className="t-micro lp-hero__who">
            Net salary · {person.name} · {period.label}
          </p>

          <RollingNumber value={figures.net} scale="hero" label="Net salary" />

          <hr className="hairline lp-hero__rule" />

          <p className="t-body-l lp-hero__claim">Every number has a reason.</p>

          <p className="t-ui-sm lp-hero__facts">
            {figures.payableDays}/{figures.periodDays} days ·{" "}
            {figures.contractCount === 1 ? "one contract" : `${figures.contractCount} contracts`} ·{" "}
            {figures.unpaidDays} {figures.unpaidDays === 1 ? "day" : "days"} unpaid ·{" "}
            {figures.ruleCount} rules
          </p>

          <div className="lp-hero__cta">
            <Button
              variant="primary"
              size="lg"
              iconAfter={<ArrowRight size={18} />}
              onClick={onEnter}
            >
              Enter PayPulse
            </Button>
          </div>
        </motion.div>

        {/*
          THE LINE runs full-bleed beneath the figure — §13 is explicit that
          the figure sits on columns 2–8 and the line does not share its
          measure. It is the product's own component, driven by the product's
          own model, and it is draggable here for the same reason it is
          draggable inside the app.
        */}
        <motion.div
          className="lp-hero__line"
          style={still ? undefined : { clipPath: reveal, opacity: contract }}
        >
          <Line
            model={model}
            value={date}
            onChange={(next) => {
              setOwned(true);
              setDate(next);
            }}
            legend={false}
            caption={
              <>
                <span className="t-ui-sm lp-hero__caption-l">
                  {person.title} · {person.number}
                </span>
                <span className="t-ui-sm lp-hero__caption-r">
                  {owned ? "The line is yours. Drag it." : "Scroll — or take the bead."}
                </span>
              </>
            }
          />
        </motion.div>

        {/*
          The records. Each is a real datum from the payslip, and each appears
          on the beat that produces it — so the reader is not shown four facts,
          they are shown four *steps*.
        */}
        <div className="lp-hero__records">
          <Record
            progress={contract}
            still={still}
            kicker="Contract"
            value={`${formatMoney(figures.gross)} gross`}
            note={`${figures.contractCount === 1 ? "One running contract" : `${figures.contractCount} contracts`} · ${period.label}`}
          />
          <Record
            progress={attendance}
            still={still}
            kicker="Attendance"
            value={`${figures.payableDays} payable days`}
            note={`${figures.overtimeHours.toFixed(2)} hours of overtime`}
          />
          <Record
            progress={gap}
            still={still}
            kicker="Leave"
            value={`${figures.unpaidDays} unpaid`}
            note="A gap in the ticks, not a mark on them"
          />
          <Record
            progress={rules}
            still={still}
            kicker="Rules"
            value={`${figures.ruleCount} in sequence`}
            note={`${additive.length} stack · ${deductions.length} carve`}
          />
        </div>

        {/*
          The miniature tower. Act 04 is where the stack is the subject; here
          it is only the last record in the list, so it is drawn small, without
          labels, and it assembles in one gesture rather than block by block.
          Two full performances of the stack on one page would spend the
          loudest moment before it arrived.
        */}
        <motion.div className="lp-hero__tower" style={still ? undefined : { opacity: rules }}>
          <MiniTower />
        </motion.div>
      </div>
    </ActSection>
  );
}

/* ── One record card ─────────────────────────────────────────────────── */

function Record({
  progress,
  still,
  kicker,
  value,
  note,
}: {
  progress: MotionValue<number>;
  still: boolean;
  kicker: string;
  value: string;
  note: string;
}) {
  const y = useTransform(progress, [0, 1], [16, 0]);

  return (
    <motion.div className="lp-record clay-2" style={still ? undefined : { opacity: progress, y }}>
      <p className="t-micro lp-record__kicker">{kicker}</p>
      <p className="t-ui lp-record__value">{value}</p>
      <p className="t-ui-sm lp-record__note">{note}</p>
    </motion.div>
  );
}

/* ── The miniature tower ─────────────────────────────────────────────── */

/**
 * Proportional, like everything else: each segment grows by its own amount, so
 * the shape is the arithmetic even at thumbnail size. Deductions are drawn
 * recessed rather than as more segments in another colour — because they
 * carve, and "eight things happened" is the wrong sentence.
 */
function MiniTower() {
  const total = additive.reduce((sum, b) => sum + b.amount, 0) || 1;

  return (
    <div
      className="lp-tower"
      role="img"
      aria-label={`Gross ${formatMoney(figures.gross)}, carved down to ${formatMoney(figures.net)} net.`}
    >
      {[...deductions].reverse().map((block) => (
        <span
          key={block.code}
          className="lp-tower__seg lp-tower__seg--carve"
          style={{ flexGrow: block.amount / total }}
          title={`${block.name} · −${formatMoney(block.amount)}`}
        />
      ))}
      {[...additive].reverse().map((block) => (
        <span
          key={block.code}
          className="lp-tower__seg"
          style={{ flexGrow: block.amount / total }}
          title={`${block.name} · ${formatMoney(block.amount)}`}
        />
      ))}
    </div>
  );
}

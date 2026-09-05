/**
 * ACT 04 · PAYROLL IS A SYSTEM, NOT A FORMULA · blueprint §13
 *
 * *"The loudest act. THE STACK in full 3D, scroll-scrubbed, with sound. Each
 * block lands as you scroll, labelled, sized to its real amount. Then the
 * deductions carve. `NET` remains standing. This is the technical
 * differentiator, and it gets the most screen time."*
 *
 * Six beats of scroll, one per rule plus the carve — the longest act on the
 * page, deliberately, because it is the only one making an argument that
 * cannot be made in a sentence.
 *
 * **The scene is loaded, not bundled.** `three` and `@react-three/fiber` are
 * roughly a third of a megabyte before this page's own code is counted, and
 * §19's budget is 180kb of initial JS. So the import is dynamic, it happens
 * only when the act is within a screen of the viewport, and it never happens
 * at all on a device the gate turns away — a phone does not download a
 * renderer in order to be shown an SVG.
 *
 * **The substitute is the product's own `Stack`.** Not a picture of it, not a
 * simplified version: the identical component the payslip screen renders,
 * driven by the identical blocks. That is what makes the exit criterion —
 * *"the flat SVG substitute is genuinely equivalent"* — true by construction
 * rather than by inspection.
 *
 * **The labels are HTML in both.** The 3D scene contains no text at all, so
 * the ledger beside it is the only copy of the rules, sizes and formulae, and
 * it is the same ledger in both versions. Nothing is lost by taking the
 * WebGL away.
 */
import { Suspense, lazy, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { formatMoney } from "@/api/money";
import { RollingNumber, Stack } from "@/components/signature";
import { cx } from "@/components/system";
import { useSound } from "@/sound/useSound";
import { ActHead, ActSection } from "../Act";
import { useActProgress, useHasEntered, useOnStep, useSmoothProgress, useStep } from "../scroll";
import { SUBSTITUTE_REASON, inspectThreeSupport, type ThreeVerdict } from "../capability";
import { additive, blocks, deductions, figures, provenance } from "../story";

const StackScene = lazy(() => import("@/three/StackScene"));

export function Act04Payroll({ onWhy }: { onWhy: (code: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const raw = useActProgress(ref);
  const progress = useSmoothProgress(raw);
  const entered = useHasEntered(ref, "-40%");
  const reduced = useReducedMotion();
  const play = useSound();

  /**
   * The gate is sampled **once**, on the first render, and frozen. A scene
   * that appeared when a tablet was turned sideways — or vanished mid-carve
   * because a resize crossed 768px — would change the act's identity under the
   * reader, which is worse than never having had a scene at all.
   */
  const [verdict] = useState<ThreeVerdict>(() => inspectThreeSupport());

  const [active, setActive] = useState<string | null>(null);

  /** One step per block: the landing sequence, and the sound's depth. */
  const step = useStep(progress, blocks.length);

  useOnStep(step, (s) => {
    // §08.1 — a rule block lands, one semitone lower per step down the stack.
    // Bounded by the engine's own two-per-500ms throttle, so a fast scroll
    // thins out rather than machine-gunning.
    if (s > 0 && s <= blocks.length && verdict.allowed) play("block", s - 1);
  });

  const landed = blocks.slice(0, reduced ? blocks.length : step);
  const selected = blocks.find((b) => b.code === active) ?? null;

  return (
    <ActSection
      ref={ref}
      id="act-04"
      label="Payroll is a system, not a formula"
      beats={6}
      lean="right"
    >
      <div className="lp-stack-act">
        <div className="lp-stack-act__words">
          <ActHead
            index={4}
            kicker="Payroll is a system, not a formula"
            headline={<>Know why the number is {formatMoney(figures.net)}.</>}
          >
            <p>
              {additive.length} rules build the tower and {deductions.length} carve it, in a fixed
              sequence, each one reading the results of the ones before it. The blocks are sized to
              their own amounts — so the shape you are looking at <em>is</em> the arithmetic.
            </p>
          </ActHead>

          {/*
            The ledger. It is the scene's caption, its accessible text and its
            substitute all at once — which is exactly why it is written once
            and shown in both versions.
          */}
          <ol className="lp-ledger">
            {blocks.map((block, i) => {
              const on = reduced || i < step;
              return (
                <li
                  key={block.code}
                  className={cx(
                    "lp-ledger__row",
                    on && "lp-ledger__row--on",
                    block.kind === "deduct" && "lp-ledger__row--carve",
                    active === block.code && "lp-ledger__row--active",
                  )}
                >
                  <button
                    type="button"
                    className="lp-ledger__hit"
                    onMouseEnter={() => setActive(block.code)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(block.code)}
                    onBlur={() => setActive(null)}
                    onClick={() => onWhy(block.code)}
                  >
                    <span className="t-micro lp-ledger__code">{block.code}</span>
                    <span className="t-ui-sm lp-ledger__name">{block.name}</span>
                    <span className="n-table lp-ledger__amount">
                      {block.kind === "deduct" ? "−" : ""}
                      {formatMoney(block.amount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="lp-ledger__totals">
            <div>
              <p className="t-micro">Gross</p>
              <p className="n-m">{formatMoney(figures.gross)}</p>
            </div>
            <div>
              <p className="t-micro">Deductions</p>
              <p className="n-m">−{formatMoney(figures.deductions)}</p>
            </div>
            <div className="lp-ledger__net">
              <p className="t-micro">Net — what remains standing</p>
              <RollingNumber
                value={landed.length === blocks.length || reduced ? figures.net : figures.gross}
                scale="l"
                label="Net salary"
              />
            </div>
          </div>

          {/* The formula for whatever the reader is pointing at. §10.2 says
              the inspector sits beside the tower, never on top of it. */}
          <div className="lp-ledger__inspect" aria-live="polite">
            {selected ? (
              <>
                <p className="t-micro lp-ledger__inspect-code">
                  {selected.code} · sequence {selected.sequence}
                </p>
                {selected.formula && <code className="n-mono">{selected.formula}</code>}
                <p className="t-ui-sm lp-ledger__inspect-note">
                  Click for the full derivation, the same drawer the product opens.
                </p>
              </>
            ) : (
              <p className="t-ui-sm lp-ledger__inspect-note">
                Point at a rule to see how it is written. {provenance.children?.length ?? 0} branches
                sit behind the figure.
              </p>
            )}
          </div>
        </div>

        <div className="lp-stack-act__object">
          {verdict.allowed ? (
            <div className="lp-scene">
              {entered && (
                <Suspense fallback={<SceneWaiting />}>
                  <StackScene
                    blocks={blocks}
                    gross={figures.gross}
                    progress={progress}
                    active={active}
                    onHover={setActive}
                    onSelect={onWhy}
                  />
                </Suspense>
              )}
              <motion.p
                className="t-ui-sm lp-scene__hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: step > 0 && step < blocks.length ? 1 : 0 }}
              >
                {step} of {blocks.length} rules · keep scrolling
              </motion.p>
            </div>
          ) : (
            <div className="lp-scene lp-scene--flat">
              {/*
                The product's own stack, unmodified. §10.2's flat rendering is
                not a fallback we wrote for this page — it is the version every
                working screen in PayPulse already uses.
              */}
              <Stack blocks={blocks} gross={figures.gross} net={figures.net} onOpen={onWhy} />
              <p className="t-ui-sm lp-scene__hint lp-scene__hint--static">
                {SUBSTITUTE_REASON[verdict.reason]}
              </p>
            </div>
          )}
        </div>
      </div>
    </ActSection>
  );
}

/**
 * What stands in while the renderer arrives. A milled well the size of the
 * scene, with no spinner: the tower is about to land in it, and a spinner
 * would be a second, unrelated piece of motion in the two hundred milliseconds
 * before the loudest moment on the page.
 */
function SceneWaiting() {
  return <div className="lp-scene__waiting inset-2" aria-hidden="true" />;
}

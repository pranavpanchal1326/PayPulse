/**
 * THE ORDERED RULE LIST — draggable raised keys.
 *
 * §12 S13: *"grabbing one lifts it to `--clay-4` and the others part to make
 * room."* The order is the mechanism — `SPECIAL`, `OT`, `PF`, `PT`, `TDS` and
 * `NET` all read results produced earlier — so dragging a key is not a
 * cosmetic sort. It changes what the payslip says.
 *
 * **Keyboard reordering is the primary implementation, not a fallback.**
 * Pointer drag is layered on top of the same `move(from, to)` the keyboard
 * calls, so the two cannot diverge. The interaction is the WAI-ARIA grab
 * pattern:
 *
 *   · `Space` or `Enter` picks a key up, and again puts it down
 *   · `↑` / `↓` move it while held; `Home` / `End` send it to the ends
 *   · `Escape` puts it back where it was
 *
 * A polite live region announces the position after every move, because a
 * reorder with no visual feedback available is a change with no feedback at
 * all — and "moved" without "to where" is not feedback.
 */
import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import type { SalaryRule } from "@/api/contract";
import { Badge, cx } from "@/components/system";
import { useSound } from "@/sound/useSound";

const CATEGORY_TONE = {
  BASIC: "cobalt",
  ALLOWANCE: "neutral",
  GROSS: "cobalt",
  DEDUCTION: "vermilion",
  NET: "jade",
} as const;

export function RuleList({
  rules,
  selectedId,
  onSelect,
  onReorder,
  forwardReferences,
  editable,
}: {
  /** Already in evaluation order. */
  rules: SalaryRule[];
  selectedId: number | undefined;
  onSelect: (rule: SalaryRule) => void;
  /** The complete new ordering — the endpoint refuses a subset. */
  onReorder: (ids: number[]) => void;
  forwardReferences: Map<string, string[]>;
  editable: boolean;
}) {
  const play = useSound();
  const [held, setHeld] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const heldFrom = useRef<number | null>(null);
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());

  /** Keeping focus on the key that moved is what makes the keyboard path usable. */
  useEffect(() => {
    if (held === null) return;
    itemRefs.current.get(held)?.focus();
  }, [held, rules]);

  function move(from: number, to: number) {
    if (to < 0 || to >= rules.length || from === to) return;
    const next = [...rules];
    const [lifted] = next.splice(from, 1);
    next.splice(to, 0, lifted);
    play("block", to / Math.max(rules.length - 1, 1));
    setAnnouncement(`${lifted.code} moved to position ${to + 1} of ${rules.length}.`);
    onReorder(next.map((r) => r.id));
  }

  function onKeyDown(event: React.KeyboardEvent, rule: SalaryRule, index: number) {
    if (!editable) return;

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (held === rule.id) {
        setHeld(null);
        heldFrom.current = null;
        setAnnouncement(`${rule.code} dropped at position ${index + 1} of ${rules.length}.`);
        play("toggle");
      } else {
        setHeld(rule.id);
        heldFrom.current = index;
        setAnnouncement(
          `${rule.code} grabbed, position ${index + 1} of ${rules.length}. ` +
            `Use the arrow keys to move it, space to drop it, escape to cancel.`,
        );
        play("toggle");
      }
      return;
    }

    if (held !== rule.id) {
      // Not holding anything: arrows just open the neighbouring rule.
      if (event.key === "ArrowDown" && rules[index + 1]) {
        event.preventDefault();
        onSelect(rules[index + 1]);
      } else if (event.key === "ArrowUp" && rules[index - 1]) {
        event.preventDefault();
        onSelect(rules[index - 1]);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (heldFrom.current !== null && heldFrom.current !== index) move(index, heldFrom.current);
      setHeld(null);
      heldFrom.current = null;
      setAnnouncement(`${rule.code} returned to its original position.`);
      return;
    }
    if (event.key === "ArrowUp") { event.preventDefault(); move(index, index - 1); }
    if (event.key === "ArrowDown") { event.preventDefault(); move(index, index + 1); }
    if (event.key === "Home") { event.preventDefault(); move(index, 0); }
    if (event.key === "End") { event.preventDefault(); move(index, rules.length - 1); }
  }

  return (
    <div className="pp-rules__list">
      {/* The announcement is the *only* feedback a screen-reader user gets from
          a reorder, so it names the rule and the destination, never "moved". */}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <ol className="pp-rules__keys">
        {rules.map((rule, index) => {
          const forward = forwardReferences.get(rule.code);
          return (
            <li key={rule.id}>
              <button
                type="button"
                ref={(node) => {
                  if (node) itemRefs.current.set(rule.id, node);
                  else itemRefs.current.delete(rule.id);
                }}
                className={cx(
                  "pp-rulekey",
                  selectedId === rule.id && "pp-rulekey--selected",
                  held === rule.id && "pp-rulekey--held",
                  dragging !== null && dragging !== rule.id && "pp-rulekey--parting",
                  !rule.is_active && "pp-rulekey--inactive",
                  forward && "pp-rulekey--forward",
                )}
                aria-pressed={held === rule.id}
                aria-current={selectedId === rule.id || undefined}
                aria-describedby={forward ? `fwd-${rule.id}` : undefined}
                draggable={editable}
                onClick={() => onSelect(rule)}
                onKeyDown={(e) => onKeyDown(e, rule, index)}
                onDragStart={(e) => {
                  setDragging(rule.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(index));
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => {
                  if (dragging === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  setDragging(null);
                  if (Number.isInteger(from)) move(from, index);
                }}
              >
                {editable && (
                  <GripVertical size={14} aria-hidden="true" className="pp-rulekey__grip" />
                )}
                <span className="pp-rulekey__seq t-micro">{rule.sequence}</span>
                <span className="pp-rulekey__text">
                  <span className="t-ui pp-rulekey__code">{rule.code}</span>
                  <span className="t-ui-sm pp-rulekey__name">{rule.name}</span>
                </span>
                <Badge tone={CATEGORY_TONE[rule.category]} dot={false}>
                  {rule.category}
                </Badge>
              </button>

              {forward && (
                /* The same defect is marked on the editor pane at the same
                   moment — §12 S13 asks for both, and one alone would leave
                   the reader hunting for the other half of the sentence. */
                <p className="pp-rules__forward t-ui-sm" id={`fwd-${rule.id}`}>
                  Reads {forward.map((f) => <code key={f} className="n-mono">{f}</code>)} , which is
                  evaluated later. It will resolve to zero — move this rule down,
                  or the one it needs up.
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

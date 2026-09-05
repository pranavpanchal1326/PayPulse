import { cx } from "./cx";

type Tone = "neutral" | "cobalt" | "orange" | "jade" | "vermilion";

export function Badge({
  tone = "neutral",
  solid,
  dot = true,
  className,
  children,
}: {
  tone?: Tone;
  solid?: boolean;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cx("pp-badge", solid ? "pp-badge--solid" : `pp-badge--${tone}`, className)}>
      {/* The dot carries state into greyscale and colour-blindness (§04.3). */}
      {dot && <span className="pp-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * The canonical lifecycle states. Defined once so payruns, payslips, requests
 * and allocations cannot drift apart — §09.4.
 */
export type StateName =
  | "DRAFT" | "COMPUTED" | "VALIDATED" | "PAID" | "CANCELLED"
  | "TO_APPROVE" | "APPROVED" | "REFUSED"
  | "RUNNING" | "EXPIRED" | "ACTIVE" | "INACTIVE" | "BLOCKED";

const STATE: Record<StateName, { tone: Tone; solid?: boolean; cancelled?: boolean }> = {
  DRAFT:      { tone: "neutral" },
  COMPUTED:   { tone: "cobalt" },
  VALIDATED:  { tone: "jade" },
  PAID:       { tone: "jade", solid: true },
  CANCELLED:  { tone: "neutral", cancelled: true },
  TO_APPROVE: { tone: "orange" },
  APPROVED:   { tone: "jade" },
  REFUSED:    { tone: "vermilion" },
  RUNNING:    { tone: "cobalt" },
  EXPIRED:    { tone: "neutral" },
  ACTIVE:     { tone: "jade" },
  INACTIVE:   { tone: "neutral" },
  BLOCKED:    { tone: "vermilion" },
};

export function StateChip({ state }: { state: StateName }) {
  const cfg = STATE[state];
  const label = state.replace(/_/g, " ");
  if (cfg.cancelled) {
    return <span className="pp-badge pp-badge--cancelled">{label}</span>;
  }
  return (
    <Badge tone={cfg.tone} solid={cfg.solid}>
      {label}
    </Badge>
  );
}

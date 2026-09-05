import { cx } from "./cx";

/**
 * INSET · where you read. Tables, data, the payslip body.
 * A container holding a table is a WELL, never a Card (§09.5).
 */
export function Well({
  deep,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { deep?: boolean }) {
  return (
    <div className={cx("pp-well", deep && "pp-well--deep", className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * PROUD · used for things that are genuinely objects — an employee, a
 * contract, a payrun, a warning. Not a generic container. Cards never nest.
 */
export function Card({
  interactive,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cx("pp-card", interactive && "pp-card--interactive", className)}
      tabIndex={interactive ? 0 : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="pp-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="pp-seg__item"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ width, className }: { width?: string; className?: string }) {
  return (
    <span
      className={cx("pp-skel", className)}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}

export interface MeterSegment {
  value: number;
  label: string;
  /** Any CSS colour token, e.g. `var(--jade-500)`. */
  color: string;
  /** Text colour on that segment — always the family's `deep` or `--on-solid`. */
  ink: string;
}

/**
 * Four-segment balance meter (§S11). Segments are sized proportionally, so the
 * shape *is* the data.
 */
export function Meter({ segments, label }: { segments: MeterSegment[]; label: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  return (
    <div
      className="pp-meter"
      role="img"
      aria-label={`${label}: ${segments.map((s) => `${s.value} ${s.label}`).join(", ")}`}
    >
      {segments.map((s) => (
        <div
          key={s.label}
          className="pp-meter__seg"
          style={{ flexGrow: s.value, background: s.color, color: s.ink }}
          title={`${s.label}: ${s.value}`}
        >
          {s.value / total > 0.12 ? s.value : ""}
        </div>
      ))}
    </div>
  );
}

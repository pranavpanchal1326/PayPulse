import { useMemo } from "react";
import { Field } from "./Field";
import { SegmentedControl } from "./Surfaces";

export interface DateRange {
  /** ISO `YYYY-MM-DD`, matching the API (§05 cross-cutting). */
  from: string;
  to: string;
}

type Preset = "this-month" | "last-month" | "this-quarter" | "custom";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function rangeFor(preset: Exclude<Preset, "custom">, today = new Date()): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "this-month":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "last-month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "this-quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) };
    }
  }
}

/**
 * Period selection is everywhere in this product — payruns, attendance,
 * dashboard filters — so the presets carry most of the traffic and the two
 * fields are the escape hatch.
 */
export function DateRangePicker({
  value,
  onChange,
  label = "Period",
  error,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  label?: string;
  error?: string;
}) {
  const active: Preset = useMemo(() => {
    for (const p of ["this-month", "last-month", "this-quarter"] as const) {
      const r = rangeFor(p);
      if (r.from === value.from && r.to === value.to) return p;
    }
    return "custom";
  }, [value]);

  // The API rejects an inverted range; the control should not let you build one.
  const inverted = value.from && value.to && value.to < value.from;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
      <SegmentedControl
        label={`${label} preset`}
        value={active}
        options={[
          { value: "this-month", label: "This month" },
          { value: "last-month", label: "Last month" },
          { value: "this-quarter", label: "This quarter" },
          { value: "custom", label: "Custom" },
        ]}
        onChange={(p) => {
          if (p !== "custom") onChange(rangeFor(p));
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
        <Field
          label="From"
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
        <Field
          label="To"
          type="date"
          value={value.to}
          min={value.from || undefined}
          error={error ?? (inverted ? "End date is before the start date." : undefined)}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>
    </div>
  );
}

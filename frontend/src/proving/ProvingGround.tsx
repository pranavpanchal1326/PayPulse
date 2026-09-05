/**
 * P0 · MATERIAL PROOF
 *
 * Not shipped to production. This page is how we judge the material, and it
 * stays in the repo as the visual reference. Every value on it comes from
 * tokens.css — nothing here is hand-tuned.
 *
 * The question this page exists to answer: does this feel like an object?
 */

import { Section } from "./Section";
import { Badge, Money, StateChip } from "@/components/system";


export function ProvingGround() {
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "0 var(--s-6) var(--s-12)" }}>
      <Intro />
      <Material />
      <Press />
      <LightModel />
      <Density />
      <Figure />
      <Typefaces />
      <Palette />
      <Verdict />
    </main>
  );
}

function Intro() {
  return (
    <div style={{ padding: "var(--s-9) 0 var(--s-7)", maxWidth: "54ch" }}>
      <h1 className="t-display-m" style={{ margin: 0 }}>
        Does this feel like an object?
      </h1>
      <p className="t-body-l" style={{ color: "var(--ink-500)", marginTop: "var(--s-4)" }}>
        Everything in PayPulse rests on one assumption: that clay reads as
        material rather than decoration. This page exists to answer that before
        anything is built on top of it.
      </p>
    </div>
  );
}

/* ── 01 · the three states ──────────────────────────────────────────────── */

function Material() {
  return (
    <Section
      n="01"
      title="The three states"
      note="PROUD is where you act. INSET is where you read. FLUSH is where you breathe. A screen with no flush area is exhausting; a screen with no inset area has nowhere to put information."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--s-5)" }}>
        <StateCard
          label="Proud"
          sub="raised · clay-3"
          body={<div className="clay-3" style={{ height: 128, borderRadius: "var(--r-lg)" }} />}
        />
        <StateCard
          label="Flush"
          sub="the ground itself"
          body={
            <div
              style={{
                height: 128,
                borderRadius: "var(--r-lg)",
                border: "1px dashed var(--bone-700)",
              }}
            />
          }
        />
        <StateCard
          label="Inset"
          sub="milled in · inset-2"
          body={<div className="inset-2" style={{ height: 128 }} />}
        />
      </div>

      <div style={{ display: "flex", gap: "var(--s-4)", marginTop: "var(--s-6)", flexWrap: "wrap" }}>
        {(["clay-1", "clay-2", "clay-3", "clay-4"] as const).map((c) => (
          <div key={c} style={{ flex: "1 1 200px" }}>
            <div className={c} style={{ height: 72 }} />
            <p className="t-micro" style={{ color: "var(--ink-400)", marginTop: "var(--s-2)" }}>
              {c}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "var(--s-4)", marginTop: "var(--s-5)", flexWrap: "wrap" }}>
        {(["inset-1", "inset-2", "inset-3"] as const).map((c) => (
          <div key={c} style={{ flex: "1 1 200px" }}>
            <div className={c} style={{ height: 72 }} />
            <p className="t-micro" style={{ color: "var(--ink-400)", marginTop: "var(--s-2)" }}>
              {c}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function StateCard({ label, sub, body }: { label: string; sub: string; body: React.ReactNode }) {
  return (
    <div>
      {body}
      <p className="t-h3" style={{ margin: "var(--s-3) 0 0" }}>
        {label}
      </p>
      <p className="t-micro" style={{ color: "var(--ink-400)", marginTop: 2 }}>
        {sub}
      </p>
    </div>
  );
}

/* ── 02 · the press ─────────────────────────────────────────────────────── */

function Press() {
  return (
    <Section
      n="02"
      title="The press"
      note="The most important interaction in the product. Highlight and shade swap, and the key physically descends 2px. Hover lifts it, so the shadow grows, softens and slides down-right — it does not merely scale. Press and hold to feel the difference."
    >
      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", alignItems: "center" }}>
        <Key variant="primary">Compute</Key>
        <Key variant="secondary">Validate</Key>
        <Key variant="danger">Cancel payrun</Key>
        <Key variant="secondary" disabled>
          Mark paid
        </Key>
      </div>

      <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-6)", flexWrap: "wrap" }}>
        <StateChip state="DRAFT" />
        <StateChip state="COMPUTED" />
        <StateChip state="VALIDATED" />
        <StateChip state="PAID" />
        <Badge tone="orange">Warning</Badge>
        <StateChip state="BLOCKED" />
      </div>

      <p className="t-ui-sm" style={{ color: "var(--ink-400)", marginTop: "var(--s-5)" }}>
        Tab to a key to see the focus ring — it sits outside the clay and never
        replaces it. The disabled key has not faded; it has sunk into the panel.
        Paid is the only filled chip in the product: it is terminal, and it
        should read as an achievement.
      </p>
    </Section>
  );
}

function Key({
  variant,
  disabled,
  children,
}: {
  variant: "primary" | "secondary" | "danger";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  // A solid signal surface always pairs `-solid` with `--on-solid`. Never the
  // 500, which is tuned to read as a mark on the field, not as a background.
  const skin =
    variant === "primary"
      ? { background: "var(--cobalt-solid)", color: "var(--on-solid)" }
      : variant === "danger"
        ? { background: "var(--vermilion-solid)", color: "var(--on-solid)" }
        : { background: "var(--bone-50)", color: "var(--ink-900)" };

  return (
    <button
      type="button"
      disabled={disabled}
      className="clay-2 pressable t-ui"
      style={{ height: 46, padding: "0 var(--s-5)", ...(disabled ? {} : skin) }}
    >
      {children}
    </button>
  );
}

/* ── 03 · the light model ───────────────────────────────────────────────── */

function LightModel() {
  return (
    <Section
      n="03"
      title="The light model"
      note="One key light, upper-left, 35 degrees. Stated once and obeyed everywhere — including illustrations, the 3D scene and chart elements. A shadow pointing the wrong way is the tell that this is decoration rather than matter."
    >
      <div
        className="inset-2"
        style={{
          padding: "var(--s-9)",
          display: "flex",
          justifyContent: "center",
          gap: "var(--s-9)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div className="clay-4" style={{ width: 168, height: 168, borderRadius: "var(--r-2xl)" }} />
          <p className="t-micro" style={{ color: "var(--ink-400)", marginTop: "var(--s-4)" }}>
            Highlight above · shade below
          </p>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="inset-3" style={{ width: 168, height: 168, borderRadius: "var(--r-2xl)" }} />
          <p className="t-micro" style={{ color: "var(--ink-400)", marginTop: "var(--s-4)" }}>
            Inverted · shade above · lip below
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ── 04 · inset at density ──────────────────────────────────────────────── */

const ROWS = [
  ["Aarav Mehta", "Engineering", "21 / 22", "6491000"],
  ["Diya Shah", "Engineering", "22 / 22", "7534000"],
  ["Nisha Rao", "Finance", "20 / 22", "4612000"],
  ["Kabir Nair", "Operations", "22 / 22", "4088000"],
  ["Sana Iyer", "Sales", "19 / 22", "4301050"],
];

function Density() {
  return (
    <Section
      n="04"
      title="Inset at density"
      note="The well carries the elevation. Rows stay flat inside it — that is both the material principle and the performance requirement, and they happen to agree. Multi-layer clay on 200 rows would drop frames."
    >
      <div className="inset-2" style={{ padding: "var(--s-1)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Employee", "Department", "Worked", "Net"].map((h, i) => (
                <th
                  key={h}
                  className="t-micro"
                  style={{
                    color: "var(--ink-400)",
                    textAlign: i === 3 ? "right" : "left",
                    padding: "var(--s-3) var(--s-4)",
                    fontWeight: 550,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([name, dept, worked, net]) => (
              <tr key={name} className="pg-row">
                <td className="t-ui" style={cell}>
                  {name}
                </td>
                <td className="t-ui" style={{ ...cell, color: "var(--ink-500)" }}>
                  {dept}
                </td>
                <td className="n-table" style={{ ...cell, color: "var(--ink-500)" }}>
                  {worked}
                </td>
                <td className="n-table" style={{ ...cell, textAlign: "right" }}>
                  <Money paise={Number(net)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-ui-sm" style={{ color: "var(--ink-400)", marginTop: "var(--s-4)" }}>
        Hover a row. The ground shifts, nothing moves. Money is right-aligned and
        decimal-aligned; the decimals recede so the figure reads first.
      </p>
    </Section>
  );
}

const cell: React.CSSProperties = {
  padding: "var(--s-3) var(--s-4)",
  borderTop: "1px solid color-mix(in srgb, var(--bone-600) 60%, transparent)",
};

/* ── 05 · the figure ────────────────────────────────────────────────────── */

function Figure() {
  return (
    <Section
      n="05"
      title="The figure"
      note="Money is the content of this product, so it gets its own scale. Tabular figures, without exception. The currency mark and the decimals recede — 47,842 should read instantly, and .00 must not compete."
    >
      <p className="t-micro" style={{ color: "var(--ink-400)" }}>
        Net salary · Aarav Mehta · September 2026
      </p>
      <div className="n-hero" style={{ marginTop: "var(--s-3)" }}>
        <Money paise={4784200} hero />
      </div>
      <p className="t-body-l" style={{ color: "var(--ink-500)", marginTop: "var(--s-4)" }}>
        Every number has a reason.
      </p>
      <p className="t-ui-sm" style={{ color: "var(--ink-400)", marginTop: "var(--s-2)" }}>
        21/22 days · one contract · 3 days leave · 12 rules, in order
      </p>
    </Section>
  );
}

/* ── 06 · typefaces ─────────────────────────────────────────────────────── */

function Typefaces() {
  return (
    <Section
      n="06"
      title="The four families"
      note="Warm display against precise data — the pairing is the concept. Bricolage Grotesque carries the voice; Geist carries the numbers, and its tabular figures are why it was chosen; Instrument Serif appears two or three times in the entire product."
    >
      <Spec family="Bricolage Grotesque" role="Display · the voice">
        <div className="t-display-m">People. Time. Pay.</div>
      </Spec>
      <Spec family="Geist" role="Text & UI · the numbers">
        <div className="t-h1" style={{ marginBottom: "var(--s-2)" }}>
          Nothing gets paid until it makes sense
        </div>
        <div className="n-l">1,234,567.89 · 0123456789</div>
      </Spec>
      <Spec family="Geist Mono" role="Data & code">
        <div className="n-mono t-ui">
          BASIC · seq 10 · wage * 0.5 * contract_days / period_days
        </div>
      </Spec>
      <Spec family="Instrument Serif" role="Editorial · used sparingly">
        <div className="t-quote">Know why the number is 47,842.</div>
      </Spec>
    </Section>
  );
}

function Spec({
  family,
  role,
  children,
}: {
  family: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "var(--s-6) 0", borderTop: "1px solid var(--bone-600)" }}>
      <div style={{ display: "flex", gap: "var(--s-4)", marginBottom: "var(--s-4)" }}>
        <span className="t-micro" style={{ color: "var(--ink-900)" }}>
          {family}
        </span>
        <span className="t-micro" style={{ color: "var(--ink-400)" }}>
          {role}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ── 07 · palette ───────────────────────────────────────────────────────── */

const BONE = ["50", "100", "200", "300", "400", "500", "600", "700", "800"];
const SIGNAL = [
  ["cobalt", "system · live · primary action"],
  ["orange", "needs a human"],
  ["jade", "settled · paid · validated"],
  ["vermilion", "blocked · refused · destructive"],
] as const;

function Palette() {
  return (
    <Section
      n="07"
      title="The palette"
      note="Desaturate the bodies, saturate only the signal. Under 6% of the pixels on any screen are allowed to be a signal colour — which is the rule that keeps clay out of the nursery."
    >
      <p className="t-micro" style={{ color: "var(--ink-400)", marginBottom: "var(--s-3)" }}>
        Bone — the foundation
      </p>
      <div style={{ display: "flex", gap: 2, marginBottom: "var(--s-7)" }}>
        {BONE.map((b) => (
          <div key={b} style={{ flex: 1 }}>
            <div
              style={{
                height: 64,
                background: `var(--bone-${b})`,
                border: "1px solid var(--bone-600)",
              }}
            />
            <p className="t-micro" style={{ color: "var(--ink-400)", marginTop: "var(--s-2)" }}>
              {b}
            </p>
          </div>
        ))}
      </div>

      {SIGNAL.map(([name, meaning]) => (
        <div key={name} style={{ marginBottom: "var(--s-5)" }}>
          <div style={{ display: "flex", gap: "var(--s-4)", marginBottom: "var(--s-2)" }}>
            <span className="t-micro" style={{ color: "var(--ink-900)" }}>
              {name}
            </span>
            <span className="t-micro" style={{ color: "var(--ink-400)" }}>
              {meaning}
            </span>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {(["tint", "500", "deep"] as const).map((stop) => (
              <div
                key={stop}
                style={{
                  flex: 1,
                  height: 56,
                  background: `var(--${name}-${stop})`,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 var(--s-4)",
                }}
              >
                <span
                  className="t-micro"
                  style={{
                    color: stop === "tint" ? `var(--${name}-deep)` : "var(--on-solid)",
                  }}
                >
                  {stop}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
}

/* ── verdict ────────────────────────────────────────────────────────────── */

function Verdict() {
  return (
    <Section n="—" title="The judgement call" note="">
      <div className="clay-3" style={{ padding: "var(--s-7)" }}>
        <p className="t-h2" style={{ margin: 0 }}>
          Does this feel like an object?
        </p>
        <p className="t-body" style={{ color: "var(--ink-500)", marginTop: "var(--s-3)" }}>
          If no, the material gets adjusted here and nowhere else. Discovering
          this at P10 would be catastrophic; discovering it now costs an
          afternoon. That is the entire reason P0 exists.
        </p>
      </div>
    </Section>
  );
}

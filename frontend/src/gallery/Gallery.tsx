/**
 * P1 · THE GALLERY
 *
 * Every primitive × every state. This is the phase's exit criterion made
 * inspectable, and the regression surface for every phase after it.
 */
import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge, Button, Card, DateRangePicker, Drawer, EmptyState, Field, IconButton,
  Menu, Meter, Modal, Money, SegmentedControl, Select, Skeleton, StateChip,
  Table, Textarea, Tooltip, WarningCard, Well, useToast,
  type Column, type DateRange, type Density, type StateName,
} from "@/components/system";
import { Section } from "@/proving/Section";

interface Row {
  id: string;
  name: string;
  department: string;
  worked: string;
  net: number;
  state: StateName;
}

const DEPTS = ["Engineering", "Sales", "Finance", "Operations", "Support"];
const FIRST = ["Aarav", "Diya", "Nisha", "Kabir", "Sana", "Rohan", "Meera", "Vikram", "Ishaan", "Priya"];
const LAST = ["Mehta", "Shah", "Rao", "Nair", "Iyer", "Patel", "Bose", "Kulkarni", "Menon", "Deshmukh"];

/** 500 rows — the exit criterion is 60fps while scrolling them. */
function makeRows(n: number): Row[] {
  const states: StateName[] = ["DRAFT", "COMPUTED", "VALIDATED", "PAID", "CANCELLED"];
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    department: DEPTS[i % DEPTS.length],
    worked: `${18 + (i % 5)} / 22`,
    net: 3_800_00 + ((i * 3137) % 5_200_00),
    state: states[i % states.length],
  }));
}

export function Gallery() {
  const [density, setDensity] = useState<Density>("default");
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [reason, setReason] = useState("");
  const [warnings, setWarnings] = useState([
    { id: "w1", severity: "error" as const, code: "NO_ACTIVE_CONTRACT", detail: "Rohan Patel has no RUNNING contract covering September 2026.", blocks: "Blocks: Validate" },
    { id: "w2", severity: "warning" as const, code: "MISSING_BANK_DETAILS", detail: "Kabir Nair, Sana Iyer, Vikram Bose", blocks: "Blocks: Mark paid" },
    { id: "w3", severity: "info" as const, code: "PRORATED_PERIOD", detail: "Meera Menon joined on the 20th — 7 of 22 days.", blocks: "Informational" },
  ]);
  const [range, setRange] = useState<DateRange>({ from: "2026-09-01", to: "2026-09-30" });
  const toast = useToast();

  const rows = useMemo(() => makeRows(500), []);

  const columns = useMemo<Column<Row>[]>(
    () => [
      { accessorKey: "name", header: "Employee" },
      { accessorKey: "department", header: "Department" },
      { accessorKey: "worked", header: "Worked", meta: { numeric: true } },
      {
        accessorKey: "net",
        header: "Net",
        meta: { numeric: true },
        cell: (c) => <Money paise={c.getValue() as number} />,
      },
      {
        id: "state",
        header: "State",
        cell: (c) => <StateChip state={c.row.original.state} />,
      },
      {
        id: "actions",
        header: "",
        cell: () => (
          <div className="pp-row-actions">
            <IconButton label="Edit" quiet size="sm"><Pencil size={14} /></IconButton>
            <IconButton label="Download payslip" quiet size="sm"><Download size={14} /></IconButton>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "var(--s-8) var(--s-6) var(--s-12)" }}>
      <p className="t-micro" style={{ color: "var(--ink-400)" }}>P1 · Primitives</p>
      <h1 className="t-display-m" style={{ margin: "var(--s-3) 0 0" }}>The gallery</h1>
      <p className="t-body-l" style={{ color: "var(--ink-500)", marginTop: "var(--s-4)", maxWidth: "54ch" }}>
        Every primitive in every state. Built once — everything after this is
        composition.
      </p>

      {/* ── buttons ─────────────────────────────────────────────────────── */}
      <Section n="01" title="Keys" note="Five variants, four sizes. One primary action per view — if a screen has two, the design is wrong.">
        <Row label="Variants">
          <Button variant="primary">Compute</Button>
          <Button>Validate</Button>
          <Button variant="quiet">Reopen</Button>
          <Button variant="danger">Cancel payrun</Button>
          <Button variant="key">Key</Button>
        </Row>
        <Row label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="xl">Extra large</Button>
        </Row>
        <Row label="States">
          <Button variant="primary" icon={<Plus size={16} />}>With icon</Button>
          <Button loading>Computing</Button>
          <Button disabled>Disabled</Button>
          <IconButton label="Delete"><Trash2 size={16} /></IconButton>
          <Tooltip label="Sound is muted by default">
            <IconButton label="Sound"><Download size={16} /></IconButton>
          </Tooltip>
        </Row>
      </Section>

      {/* ── chips ───────────────────────────────────────────────────────── */}
      <Section n="02" title="State" note="Every chip carries text and a dot, so state survives greyscale and colour-blindness. PAID is the only filled chip in the product — it is terminal, and should read as an achievement.">
        <Row label="Lifecycle">
          {(["DRAFT", "COMPUTED", "VALIDATED", "PAID", "CANCELLED"] as StateName[]).map((s) => (
            <StateChip key={s} state={s} />
          ))}
        </Row>
        <Row label="Approval">
          {(["TO_APPROVE", "APPROVED", "REFUSED", "BLOCKED"] as StateName[]).map((s) => (
            <StateChip key={s} state={s} />
          ))}
        </Row>
        <Row label="Tones">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="cobalt">System</Badge>
          <Badge tone="orange">Attention</Badge>
          <Badge tone="jade">Settled</Badge>
          <Badge tone="vermilion">Blocked</Badge>
        </Row>
      </Section>

      {/* ── forms ───────────────────────────────────────────────────────── */}
      <Section n="03" title="Fields" note="Inset — you read from them. The label sits above, never floating inside: floating labels are unreadable at density and break tabular alignment. Required is orange, because required is not an error.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--s-5)" }}>
          <Field label="Employee name" placeholder="Aarav Mehta" required />
          <Field label="Monthly wage" placeholder="50000" help="Serialised as a string, never a float." />
          <Field label="IFSC" defaultValue="hdfc0001" error="Must match ^[A-Z]{4}0[A-Z0-9]{6}$" />
          <Select
            label="Salary structure"
            options={[
              { value: "std", label: "Standard Indian Payroll" },
              { value: "int", label: "Intern stipend" },
            ]}
          />
          <Field label="Disabled" value="Read only" disabled onChange={() => {}} />
          <Textarea label="Correction reason" required placeholder="Why is this being changed?" />
        </div>
        <div style={{ marginTop: "var(--s-6)", maxWidth: 520 }}>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </Section>

      {/* ── table ───────────────────────────────────────────────────────── */}
      <Section n="04" title="Table" note="500 rows, virtualised above 60. The well carries the elevation and the rows stay flat — the material principle and the performance requirement happen to agree.">
        <div style={{ display: "flex", gap: "var(--s-3)", marginBottom: "var(--s-4)", flexWrap: "wrap" }}>
          <SegmentedControl
            label="Density"
            value={density}
            options={[
              { value: "compact", label: "Compact" },
              { value: "default", label: "Default" },
              { value: "comfortable", label: "Comfortable" },
            ]}
            onChange={setDensity}
          />
          <Button size="sm" onClick={() => setLoading((v) => !v)}>{loading ? "Show data" : "Show loading"}</Button>
          <Button size="sm" onClick={() => setShowEmpty((v) => !v)}>{showEmpty ? "Show data" : "Show empty"}</Button>
        </div>

        <Table
          caption="Payslips for September 2026"
          data={showEmpty ? [] : rows}
          columns={columns}
          density={density}
          loading={loading}
          getRowId={(r) => r.id}
          selectedId={selected}
          onRowClick={(r) => setSelected(r.id)}
          empty={
            <EmptyState
              title="No payslips for this period"
              body="Payroll will skip employees without a running contract. Create a payrun to get started."
              action={<Button variant="primary" icon={<Plus size={16} />}>New payrun</Button>}
            />
          }
        />
        <p className="t-ui-sm" style={{ color: "var(--ink-400)", marginTop: "var(--s-3)" }}>
          {rows.length} rows · click one to select · money is right- and decimal-aligned
        </p>
      </Section>

      {/* ── warnings ────────────────────────────────────────────────────── */}
      <Section n="05" title="Warnings" note="The unit of the triage inbox — not a toast, because these are work items. Every warning states what it blocks. Clearing one lifts the card and the rest settle upward.">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)", maxWidth: 620 }}>
          <AnimatePresence mode="popLayout">
            {warnings.map((w, i) => (
              <WarningCard
                key={w.id}
                index={i}
                severity={w.severity}
                code={w.code}
                detail={w.detail}
                blocks={w.blocks}
                action={
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => setWarnings((xs) => xs.filter((x) => x.id !== w.id))}
                  >
                    Fix
                  </Button>
                }
              />
            ))}
          </AnimatePresence>
        </div>
        {warnings.length === 0 && (
          <Button style={{ marginTop: "var(--s-4)" }} onClick={() => window.location.reload()}>
            Reset warnings
          </Button>
        )}
      </Section>

      {/* ── surfaces ────────────────────────────────────────────────────── */}
      <Section n="06" title="Surfaces" note="A Card is for things that are genuinely objects. A container holding a table is a Well, not a Card — and cards never nest.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--s-5)" }}>
          <Card>
            <p className="t-micro" style={{ color: "var(--ink-400)" }}>Current contract</p>
            <p className="n-l" style={{ margin: "var(--s-2) 0 0" }}><Money paise={5_000_000} /></p>
            <p className="t-ui-sm" style={{ color: "var(--ink-500)", marginTop: "var(--s-1)" }}>01 Jul — 31 Dec 2026</p>
          </Card>
          <Card interactive>
            <p className="t-micro" style={{ color: "var(--ink-400)" }}>Interactive card</p>
            <p className="t-body" style={{ marginTop: "var(--s-2)" }}>Hover me — I lift 2px and my shadow follows.</p>
          </Card>
          <Well style={{ padding: "var(--s-5)" }}>
            <p className="t-micro" style={{ color: "var(--ink-400)" }}>Leave balance</p>
            <div style={{ marginTop: "var(--s-3)" }}>
              <Meter
                label="Leave balance"
                segments={[
                  { value: 3, label: "taken", color: "var(--bone-700)", ink: "var(--ink-900)" },
                  { value: 2, label: "pending", color: "var(--orange-500)", ink: "var(--orange-deep)" },
                  { value: 9, label: "remaining", color: "var(--jade-500)", ink: "var(--jade-deep)" },
                ]}
              />
            </div>
          </Well>
        </div>

        <div style={{ marginTop: "var(--s-6)", display: "flex", gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
          <Button onClick={() => setDrawer(true)}>Open drawer</Button>
          <Button variant="danger" onClick={() => setModal(true)}>Force pay</Button>
          <span style={{ position: "relative", display: "inline-flex" }}>
            <Button onClick={() => setMenu((v) => !v)}>Menu</Button>
            <Menu
              open={menu}
              onClose={() => setMenu(false)}
              align="left"
              items={[
                { label: "Recompute", onSelect: () => toast("Payrun recomputed.", "jade"), icon: <Pencil size={14} /> },
                { label: "Export CSV", onSelect: () => toast("Export started."), icon: <Download size={14} /> },
                { label: "Cancel payrun", onSelect: () => toast("Payrun cancelled.", "vermilion"), icon: <Trash2 size={14} />, danger: true },
              ]}
            />
          </span>
          <Button variant="quiet" onClick={() => toast("Three employees have no bank details.", "vermilion")}>
            Raise a toast
          </Button>
        </div>

        <div style={{ marginTop: "var(--s-6)", display: "flex", gap: "var(--s-3)", flexDirection: "column", maxWidth: 320 }}>
          <p className="t-micro" style={{ color: "var(--ink-400)" }}>Skeleton</p>
          <Skeleton width="70%" />
          <Skeleton width="45%" />
          <Skeleton width="60%" />
        </div>
      </Section>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Aarav Mehta"
        footer={<Button variant="primary" onClick={() => setDrawer(false)}>Done</Button>}
      >
        <p className="t-body" style={{ color: "var(--ink-500)", marginTop: 0 }}>
          Detail lives beside the context, not on top of it — which is why the
          scrim is 8% and the table behind stays readable.
        </p>
        <div style={{ marginTop: "var(--s-5)", display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          <Field label="Department" defaultValue="Engineering" />
          <Field label="Manager" defaultValue="Imran Shaikh" />
        </div>
      </Drawer>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Mark this payrun paid anyway?"
        description="Three employees have no bank details. Paid payroll is immutable — this cannot be undone."
        footer={
          <>
            <Button onClick={() => setModal(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              onClick={() => {
                setModal(false);
                setReason("");
                toast("Payrun marked paid.", "jade");
              }}
            >
              Force pay
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this being forced?"
          help="Recorded against the payrun. The key stays disabled until this has content."
        />
      </Modal>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--s-5)" }}>
      <p className="t-micro" style={{ color: "var(--ink-400)", marginBottom: "var(--s-3)" }}>{label}</p>
      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", alignItems: "center" }}>
        {children}
      </div>
    </div>
  );
}

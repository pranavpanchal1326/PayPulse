/**
 * P4 · THE SIGNATURE SHOWCASE — `/dev/signature`
 *
 * The phase's exit criteria, made inspectable. Same job as the P1 gallery: a
 * place where every one of the four systems is driven by **real fixture data**
 * rather than a prop table, because the claims P4 has to satisfy are about
 * behaviour under real data — the line renders leave as a gap, the stack sizes
 * blocks to their amounts, scrubbing recomputes *every* figure on the page.
 *
 * The scrub is the load-bearing demonstration. Dragging the bead re-resolves
 * the contract, recounts the days and recomputes the payslip through the same
 * `computePayslip` the fixtures were generated with — so every figure below
 * moves because the arithmetic moved, not because a number was interpolated.
 * §10.1: *"the fastest possible proof that the systems are genuinely wired
 * together."*
 *
 * It is a dev route and lazily loaded, so the fixture dataset it imports never
 * reaches the production bundle.
 */
import { useMemo, useState } from "react";
import type { Contract, PayslipDetail, PayslipLine } from "@/api/contract";
import { formatMoney, money, type Money } from "@/api/money";
import {
  Line, PayslipCard, ProvenanceDrawer, RollingCount, RollingNumber, Stack,
  buildLineModel, buildPayslipProvenance,
  type ProvenanceNode, type StackBlock,
} from "@/components/signature";
import { Button, SegmentedControl, Well } from "@/components/system";
import { Section } from "@/proving/Section";
import { ATTENDANCE_FROM, ATTENDANCE_TO, CURRENCY, OPEN_PERIOD } from "@/mocks/seed/anchor";
import { addMonths, monthEnd, monthLabel, monthOf, monthStart, type ISODate } from "@/lib/date";
import { contractsCovering } from "@/mocks/seed/contracts";
import { computePayslip, paiseToString } from "@/mocks/seed/engine";
import { attendances } from "@/mocks/seed/attendance";
import { holidays, employeeById } from "@/mocks/seed/people";
import { salaryRules } from "@/mocks/seed/payroll";
import { timeOffRequests } from "@/mocks/seed/timeOff";

/* ── The cast, chosen for what each one breaks ───────────────────────── */

const CAST_CHOICES = [
  { value: "9", label: "Kavya · mid-month raise" },
  { value: "17", label: "Divya · unpaid leave" },
  { value: "30", label: "Rahul · joiner" },
  { value: "24", label: "Manoj · leaver" },
  { value: "22", label: "Harshad · night shift" },
] as const;

/**
 * How much time the line shows at once.
 *
 * Worth having as a control rather than a constant: at seven months a day is
 * three pixels and the ticks read as texture; at one period each day is its
 * own mark and a leave gap is unmistakable. Both are real — the payrun header
 * wants the wide view, an employee page wants the narrow one — so the line has
 * to hold up at both, and this is where that gets checked.
 */
const WINDOWS = [
  { value: "all", label: "All seven months" },
  { value: "quarter", label: "Three months" },
  { value: "period", label: "This period" },
] as const;

type WindowChoice = (typeof WINDOWS)[number]["value"];

function windowFor(choice: WindowChoice, date: ISODate): { from: ISODate; to: ISODate } {
  if (choice === "all") return { from: ATTENDANCE_FROM, to: ATTENDANCE_TO };
  const month = monthOf(date);
  if (choice === "period") return { from: monthStart(month), to: monthEnd(month) };
  const from = monthStart(addMonths(month, -1));
  const to = monthEnd(addMonths(month, 1));
  return {
    from: from < ATTENDANCE_FROM ? ATTENDANCE_FROM : from,
    to: to > ATTENDANCE_TO ? ATTENDANCE_TO : to,
  };
}

const dec = (n: number) => n.toFixed(2);

/**
 * One employee, one date → the whole page.
 *
 * Everything below this function is a rendering of its result, which is the
 * point: there is no second source of truth for "what does August look like
 * for Kavya", so the scrub cannot make two figures disagree.
 */
function computeFor(employeeId: number, date: ISODate) {
  const employee = employeeById.get(employeeId)!;
  const period = monthOf(date);
  const periodStart = monthStart(period);
  const periodEnd = monthEnd(period);

  const covering = contractsCovering(employeeId, periodStart, periodEnd);
  const contract: Contract | null = covering[0] ?? null;

  if (!contract) {
    return { employee, period, periodStart, periodEnd, contract: null, payslip: null };
  }

  const computed = computePayslip(employee, contract, periodStart, periodEnd);

  const lines: PayslipLine[] = computed.lines.map((line, i) => ({
    ...line,
    id: i + 1,
    payslip_id: 0,
  }));

  const payslip: PayslipDetail = {
    id: 0,
    payrun_id: 0,
    employee_id: employee.id,
    employee_name: employee.full_name,
    employee_number: employee.employee_number,
    department_name: employee.department_name,
    contract_id: contract.id,
    currency: CURRENCY,
    period_start: periodStart,
    period_end: periodEnd,
    basic: paiseToString(computed.basic),
    gross: paiseToString(computed.gross),
    total_deductions: paiseToString(computed.totalDeductions),
    net: paiseToString(computed.net),
    worked_hours: dec(computed.counts.worked_hours),
    overtime_hours: dec(computed.counts.overtime_hours),
    period_days: computed.counts.period_days,
    contract_days: computed.counts.contract_days,
    payable_days: dec(computed.counts.payable_days),
    unpaid_days: dec(computed.counts.unpaid_days),
    absent_days: dec(computed.counts.absent_days),
    paid_leave_days: dec(computed.counts.paid_leave_days),
    unpaid_leave_days: dec(computed.counts.unpaid_leave_days),
    state: "COMPUTED",
    warning_codes: [],
    lines,
    contract,
    warnings: [],
  };

  return { employee, period, periodStart, periodEnd, contract, payslip };
}

export function SignatureShowcase() {
  const [who, setWho] = useState<string>("9");
  const [span, setSpan] = useState<WindowChoice>("all");
  const [date, setDate] = useState<ISODate>(`${OPEN_PERIOD}-15`);
  const [flipped, setFlipped] = useState(false);
  const [drawer, setDrawer] = useState<ProvenanceNode | null>(null);

  const employeeId = Number(who);
  const state = useMemo(() => computeFor(employeeId, date), [employeeId, date]);
  const { employee, period, periodStart, periodEnd, contract, payslip } = state;

  /* ── THE LINE's model, from the fixtures ───────────────────────────── */

  const lineModel = useMemo(() => {
    const { from, to } = windowFor(span, date);
    return buildLineModel({
      from,
      to,
      activeOn: date,
      contracts: contractsCovering(employeeId, from, to),
      attendances: attendances.filter((a) => a.employee_id === employeeId),
      holidays,
    });
  }, [employeeId, date, span]);

  /* ── THE STACK's blocks, from the computed payslip ─────────────────── */

  const blocks: StackBlock[] = useMemo(() => {
    if (!payslip) return [];
    const ruleByCode = new Map(salaryRules.map((r) => [r.code, r]));
    return payslip.lines
      // GROSS and NET are totals of the others; drawing them as blocks would
      // count the same money twice and make the tower twice its real height.
      .filter((l) => l.category !== "GROSS" && l.category !== "NET")
      .sort((a, b) => a.sequence - b.sequence)
      .map((line) => {
        const rule = ruleByCode.get(line.rule_code);
        return {
          code: line.rule_code,
          name: line.name,
          kind: line.category === "DEDUCTION" ? ("deduct" as const) : ("add" as const),
          amount: money(line.amount),
          sequence: line.sequence,
          formula:
            rule?.amount_formula ??
            (rule?.percentage ? `${rule.percentage}% of ${rule.percentage_base_code}` : null),
          inputs: [
            { label: "quantity", value: line.quantity },
            { label: "rate", value: line.rate },
          ],
        };
      });
  }, [payslip]);

  /* ── The derivation tree ───────────────────────────────────────────── */

  const tree = useMemo(() => {
    if (!payslip) return null;
    return buildPayslipProvenance({
      payslip,
      rules: salaryRules,
      leave: timeOffRequests.filter(
        (r) =>
          r.employee_id === employeeId &&
          r.state === "APPROVED" &&
          r.date_to >= periodStart &&
          r.date_from <= periodEnd,
      ),
      attendances: attendances.filter(
        (a) =>
          a.employee_id === employeeId &&
          a.work_date >= periodStart &&
          a.work_date <= periodEnd,
      ),
    });
  }, [payslip, employeeId, periodStart, periodEnd]);

  const openFor = (code: string) => {
    if (!tree) return;
    const find = (node: ProvenanceNode): ProvenanceNode | null => {
      if (node.code === code) return node;
      for (const child of node.children ?? []) {
        const hit = find(child);
        if (hit) return hit;
      }
      return null;
    };
    setDrawer(find(tree) ?? tree);
  };

  return (
    <main className="pp-page" style={{ padding: "var(--s-7) var(--s-7) var(--s-11)" }}>
      <header style={{ marginBottom: "var(--s-6)" }}>
        <p className="t-micro" style={{ color: "var(--ink-400)", margin: 0 }}>
          P4 · Signature systems
        </p>
        <h1 className="t-display" style={{ margin: "var(--s-2) 0 0" }}>
          Four things people remember
        </h1>
        <p className="t-body" style={{ color: "var(--ink-500)", maxWidth: "64ch" }}>
          Every figure on this page comes from the P3 fixtures, through the same
          payroll engine that generated them. Drag the bead and watch all of it
          move together.
        </p>
      </header>

      <div style={{ display: "flex", gap: "var(--s-4)", flexWrap: "wrap", alignItems: "center" }}>
        <SegmentedControl
          label="Whose line"
          value={who}
          options={CAST_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
          onChange={setWho}
        />
        <SegmentedControl
          label="How much time the line shows"
          value={span}
          options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
          onChange={setSpan}
        />
      </div>

      {/* ── §10.1 ──────────────────────────────────────────────────────── */}

      <Section
        n="§10.1"
        title="THE LINE"
        note={
          "Time, the ledger and the system diagram at once. Contract bands sit " +
          "above the channel, days with a record tick below it, overtime ticks " +
          "upward — and leave is a gap, because absence is the absence of a row. " +
          "Scrub it: the period, the contract and every figure below recompute."
        }
      >
        <Well style={{ padding: "var(--s-5)" }}>
          <Line
            model={lineModel}
            value={date}
            onChange={setDate}
            caption={
              <>
                <span className="t-ui-sm" style={{ color: "var(--ink-500)" }}>
                  {employee.full_name} · {employee.job_title}
                </span>
                <span className="t-ui-sm" style={{ color: "var(--ink-900)" }}>
                  {date} · {monthLabel(period)}
                </span>
              </>
            }
          />
        </Well>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--s-4)",
            marginTop: "var(--s-5)",
          }}
        >
          <Figure label="Net pay" value={payslip ? money(payslip.net) : null} />
          <Figure label="Gross" value={payslip ? money(payslip.gross) : null} />
          <Figure label="Deductions" value={payslip ? money(payslip.total_deductions) : null} />
          <Count label="Payable days" value={payslip ? Number(payslip.payable_days) : 0} />
          <Count label="Period days" value={payslip ? payslip.period_days : 0} />
          <Count label="Overtime hours" value={payslip ? Number(payslip.overtime_hours) : 0} />
        </div>

        <p className="t-ui-sm" style={{ color: "var(--ink-400)", marginTop: "var(--s-3)" }}>
          {contract
            ? `Contract in force: ${contract.name} · ${formatMoney(money(contract.wage))}`
            : "No running contract covers this period — nothing to compute."}
        </p>
      </Section>

      {/* ── §10.2 ──────────────────────────────────────────────────────── */}

      <Section
        n="§10.2"
        title="THE STACK"
        note={
          "Earnings stack from the ground plane; deductions are carved out of " +
          "what was built, and the tower shortens to net. Every block is sized " +
          "to its own amount, so the picture cannot disagree with the payslip. " +
          "Hover for the rule, click for the derivation."
        }
      >
        {payslip ? (
          <Stack
            blocks={blocks}
            gross={money(payslip.gross)}
            net={money(payslip.net)}
            onOpen={openFor}
          />
        ) : (
          <p className="t-body" style={{ color: "var(--ink-500)" }}>
            Nothing to stack for {monthLabel(period)}.
          </p>
        )}
      </Section>

      {/* ── §07.4 ──────────────────────────────────────────────────────── */}

      <Section
        n="§07.4"
        title="ROLLING NUMERALS"
        note={
          "Only the digits that actually changed move, staggered 18ms from the " +
          "right, flashing jade rising and vermilion falling. Nudge the figure " +
          "by a rupee and watch two digits move; by a lakh and watch them all."
        }
      >
        <RollDemo />
      </Section>

      {/* ── §10.3 and §10.4 ────────────────────────────────────────────── */}

      <Section
        n="§10.3 · §10.4"
        title="PROVENANCE, AND THE PAYSLIP"
        note={
          "Any figure is clickable and they all open the same drawer: the tree " +
          "walks NET to GROSS to BASIC and ends at a record a human created. " +
          "The card is an object — flip it and its shadow narrows as it turns."
        }
      >
        {payslip && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 460px) minmax(0, 1fr)",
              gap: "var(--s-7)",
              alignItems: "start",
            }}
          >
            <PayslipCard
              payslip={payslip}
              rules={salaryRules}
              flipped={flipped}
              onFlip={setFlipped}
              onWhy={() => setDrawer(tree)}
            />

            <div>
              <p className="t-body" style={{ color: "var(--ink-500)", maxWidth: "52ch" }}>
                The net figure on the card is a button. So is every block in the
                stack above — each opens the drawer at its own node, which is
                what "any figure anywhere" has to mean if it is going to be
                believed.
              </p>
              <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
                <Button onClick={() => setDrawer(tree)}>Why this number?</Button>
                <Button variant="quiet" onClick={() => setFlipped((f) => !f)}>
                  Flip the card
                </Button>
              </div>
            </div>
          </div>
        )}
      </Section>

      <ProvenanceDrawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        tree={drawer}
        subject={`${employee.full_name} · ${monthLabel(period)}`}
      />
    </main>
  );
}

/* ── Small local pieces ──────────────────────────────────────────────── */

function Figure({ label, value }: { label: string; value: Money | null }) {
  return (
    <div>
      <p className="t-micro" style={{ color: "var(--ink-400)", margin: "0 0 var(--s-1)" }}>
        {label}
      </p>
      {value === null ? (
        <span className="n-l" style={{ color: "var(--ink-300)" }}>
          —
        </span>
      ) : (
        <RollingNumber value={value} scale="l" label={label} />
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="t-micro" style={{ color: "var(--ink-400)", margin: "0 0 var(--s-1)" }}>
        {label}
      </p>
      <RollingCount value={value} scale="l" label={label} />
    </div>
  );
}

/**
 * The "only changed digits move" claim, made falsifiable. A rupee moves two
 * digits; a lakh moves all of them; the same value twice moves none.
 */
function RollDemo() {
  const [value, setValue] = useState<Money>(money("47842.00"));

  const nudge = (paise: number) => setValue((v) => (v + paise) as Money);

  return (
    <Well style={{ padding: "var(--s-6)", display: "grid", gap: "var(--s-5)" }}>
      <RollingNumber value={value} scale="hero" label="Demonstration figure" />
      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
        <Button onClick={() => nudge(100)}>+ ₹1</Button>
        <Button onClick={() => nudge(-100)}>− ₹1</Button>
        <Button onClick={() => nudge(272_73)}>+ ₹272.73</Button>
        <Button onClick={() => nudge(-227_200)}>− ₹2,272 (three unpaid days)</Button>
        <Button onClick={() => nudge(1_00_000_00)}>+ ₹1,00,000</Button>
        <Button variant="quiet" onClick={() => setValue(money("47842.00"))}>
          Reset
        </Button>
        <Button variant="quiet" onClick={() => setValue((v) => v)}>
          Set the same value again
        </Button>
      </div>
      <p className="t-ui-sm" style={{ color: "var(--ink-400)", margin: 0 }}>
        The last button re-sets the identical figure: nothing should move, and
        nothing should flash.
      </p>
    </Well>
  );
}

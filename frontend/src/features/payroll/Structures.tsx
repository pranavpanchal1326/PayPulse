/**
 * S12 · SALARY STRUCTURES
 *
 * A card grid, each card showing a rule count, an employee count and a
 * miniature STACK glyph. The glyph is the point: a structure is an *ordered
 * set of rules that build a tower and then carve it*, and a row of two numbers
 * says nothing about the shape of the thing. Two structures with twelve rules
 * each can be completely different pay, and the drawing shows that before
 * either is opened.
 *
 * `employee_count` is *"distinct employees with a RUNNING contract pointing
 * here"* (PRD §5) — computed server-side. It is the number that makes editing
 * a rule frightening in the right way, so it is on the card, not hidden inside.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import type { SalaryRule, SalaryStructure } from "@/api/contract";
import { useQuery, useSubmission } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Badge, Button, Card, Drawer, EmptyState, Field, Skeleton, Well, useToast,
} from "@/components/system";
import { RollingCount } from "@/components/signature";
import { LoadFailure, SectionNav } from "@/features/shared";
import { createStructure, getStructure, listStructures } from "./api";
import { SECTION_NAV } from "./nav";

export function Structures() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const structures = useQuery(() => listStructures(), []);
  const [adding, setAdding] = useState(false);

  const rows = structures.data ?? [];

  return (
    <>
      <PageHeader
        title="Salary structures"
        meta={
          structures.state === "ready"
            ? `${rows.length} ${rows.length === 1 ? "structure" : "structures"} · a contract points at exactly one`
            : "Loading structures…"
        }
        action={
          can("salary_structure", "create") && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
              New structure
            </Button>
          )
        }
      />

      <SectionNav items={SECTION_NAV} />

      {structures.state === "error" ? (
        <LoadFailure what="The salary structures" error={structures.error} onRetry={structures.reload} />
      ) : structures.initial ? (
        <div className="pp-struct__grid">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}><Skeleton width="60%" /><Skeleton width="100%" /></Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="No salary structures yet"
            body="A structure is the ordered set of rules that turns a wage into a payslip. Without one, a payrun computes nothing and raises NO_STRUCTURE_RULES."
            action={
              can("salary_structure", "create") && (
                <Button variant="primary" onClick={() => setAdding(true)}>Create the first structure</Button>
              )
            }
          />
        </Well>
      ) : (
        <div className="pp-struct__grid">
          {rows.map((structure) => (
            <StructureCard
              key={structure.id}
              structure={structure}
              onOpen={() => navigate(`/payroll/structures/${structure.id}`)}
            />
          ))}
        </div>
      )}

      <NewStructure
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(created) => {
          setAdding(false);
          structures.reload();
          toast("Structure created. It has no rules yet.", "jade");
          navigate(`/payroll/structures/${created.id}`);
        }}
      />
    </>
  );
}

/* ── One card ─────────────────────────────────────────────────────────── */

function StructureCard({
  structure,
  onOpen,
}: {
  structure: SalaryStructure;
  onOpen: () => void;
}) {
  /**
   * The glyph needs the rules, and `/salary-structures` does not carry them —
   * so the card fetches its own detail. It is a handful of structures, not a
   * list of thousands, and the alternative is a card that describes a shape it
   * has not seen.
   */
  const detail = useQuery(() => getStructure(structure.id), [structure.id]);

  return (
    <Card interactive onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <div className="pp-struct__head">
        <div>
          <h3 className="t-h3" style={{ margin: 0 }}>{structure.name}</h3>
          <p className="t-micro pp-struct__code">{structure.code} · {structure.currency}</p>
        </div>
        {!structure.is_active && <Badge tone="neutral">ARCHIVED</Badge>}
      </div>

      {detail.data ? (
        <StackGlyph rules={detail.data.rules} />
      ) : (
        <div className="pp-struct__glyph"><Skeleton width="100%" /></div>
      )}

      <div className="pp-struct__counts">
        <span>
          <RollingCount value={structure.rule_count} scale="m" label="rules" />
          <span className="t-micro"> RULES</span>
        </span>
        <span>
          <RollingCount value={structure.employee_count} scale="m" label="employees" />
          <span className="t-micro"> ON THIS STRUCTURE</span>
        </span>
      </div>
    </Card>
  );
}

/**
 * THE STACK at glyph scale — additive rules build up, deductions carve in.
 *
 * It draws *shape*, not amounts: at this size a proportional tower would be
 * unreadable, and the card is not making a claim about anybody's pay. Each
 * band is one rule in sequence, coloured by what it does. The full,
 * proportional drawing lives on the payslip and in the rule editor, where the
 * amounts are real.
 */
function StackGlyph({ rules }: { rules: SalaryRule[] }) {
  const drawn = rules
    .filter((r) => r.is_active && r.category !== "GROSS" && r.category !== "NET")
    .sort((a, b) => a.sequence - b.sequence);

  if (drawn.length === 0) {
    return (
      <div className="pp-struct__glyph">
        <p className="t-micro pp-struct__glyph-empty">NO RULES — THIS STRUCTURE COMPUTES NOTHING</p>
      </div>
    );
  }

  return (
    <div
      className="pp-struct__glyph"
      role="img"
      aria-label={`${drawn.length} rules: ${drawn.map((r) => r.code).join(", ")}`}
    >
      {drawn.map((rule) => (
        <span
          key={rule.id}
          className={
            rule.category === "DEDUCTION"
              ? "pp-struct__band pp-struct__band--carve"
              : rule.category === "BASIC"
                ? "pp-struct__band pp-struct__band--basic"
                : "pp-struct__band"
          }
          title={`${rule.code} · ${rule.name}`}
        />
      ))}
    </div>
  );
}

/* ── New structure ────────────────────────────────────────────────────── */

function NewStructure({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (created: SalaryStructure) => void;
}) {
  const form = useSubmission();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  async function save() {
    let created: SalaryStructure | undefined;
    const ok = await form.submit(async () => {
      created = await createStructure({ name: name.trim(), code: code.trim().toUpperCase() });
    });
    if (ok && created) onSaved(created);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New salary structure"
      footer={
        <div className="pp-form__row" style={{ justifyContent: "flex-end" }}>
          <Button variant="quiet" onClick={onClose} disabled={form.busy}>Cancel</Button>
          <Button
            variant="primary"
            loading={form.busy}
            disabled={name.trim() === "" || code.trim() === ""}
            onClick={save}
          >
            Create
          </Button>
        </div>
      }
    >
      {form.message && <p className="pp-form__error t-ui-sm" role="alert">{form.message}</p>}
      <div className="pp-form">
        <Field
          label="Name"
          required
          placeholder="Standard monthly · India"
          error={form.fields.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Code"
          required
          placeholder="STD_IN"
          help="Capitals, digits and underscores. Permanent — payruns quote it."
          error={form.fields.code}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <p className="t-ui-sm" style={{ color: "var(--ink-400)", margin: 0 }}>
          A new structure starts empty. Until it has rules, a payrun against it
          raises <code className="n-mono">NO_STRUCTURE_RULES</code> and refuses
          to compute.
        </p>
      </div>
    </Drawer>
  );
}

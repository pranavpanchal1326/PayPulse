/**
 * S10 · LEAVE TYPES
 *
 * A small card grid, and §12 S10 is specific about the restraint: *"the type's
 * colour appears only as a 4px edge marker."* Filling a card with a leave
 * type's colour would make the screen a paint chart and would put six
 * competing hues on one page, against §04's whole argument for using colour
 * sparingly.
 *
 * **The colour is a token name, never a hex** (§20.3). The API stores
 * `"cobalt"`; this file maps that to `var(--cobalt-500)`. An unknown name
 * falls back to ink rather than to nothing, so a type added by the backend
 * with a colour this build has never heard of still draws its marker.
 *
 * Two flags decide everything downstream, so both are stated in words on the
 * card rather than as icons: `is_paid = false` is how unpaid leave reaches
 * payroll (§3.6), and `requires_allocation` is what makes a balance exist at
 * all.
 */
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { TimeOffType } from "@/api/contract";
import { LEAVE_UNITS } from "@/api/contract";
import { useQuery, useSubmission } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Badge, Button, Card, Drawer, EmptyState, Field, Select, Skeleton, Well, useToast,
} from "@/components/system";
import { LoadFailure, SectionNav } from "@/features/shared";
import { createType, listTypes, updateType } from "./api";
import { SECTION_NAV } from "./nav";

/** The four signal hues plus ink — §04.2's whole palette, and no more. */
const COLOURS = ["cobalt", "jade", "orange", "vermilion", "ink"] as const;

export const colourVar = (name: string): string =>
  (COLOURS as readonly string[]).includes(name) && name !== "ink"
    ? `var(--${name}-500)`
    : "var(--ink-700)";

export function Types() {
  const { can } = useAuth();
  const toast = useToast();
  const types = useQuery(() => listTypes(), []);
  const [editing, setEditing] = useState<TimeOffType | "new">();

  const rows = types.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Leave types"
        meta={
          types.state === "ready"
            ? `${rows.length} ${rows.length === 1 ? "type" : "types"} · ${rows.filter((t) => !t.is_paid).length} unpaid`
            : "Loading types…"
        }
        action={
          can("time_off_type", "create") && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing("new")}>
              New type
            </Button>
          )
        }
      />

      <SectionNav items={SECTION_NAV} />

      {types.state === "error" ? (
        <LoadFailure what="The leave types" error={types.error} onRetry={types.reload} />
      ) : types.initial ? (
        <div className="pp-types">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><Skeleton width="60%" /><Skeleton width="90%" /></Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="No leave types yet"
            body="A type decides whether leave is paid, whether it needs an allocation, and whether it is counted in days or hours. Nothing can be requested until one exists."
            action={
              can("time_off_type", "create") && (
                <Button variant="primary" onClick={() => setEditing("new")}>Create the first type</Button>
              )
            }
          />
        </Well>
      ) : (
        <div className="pp-types">
          {rows.map((type) => (
            <TypeCard
              key={type.id}
              type={type}
              editable={can("time_off_type", "update")}
              onEdit={() => setEditing(type)}
            />
          ))}
        </div>
      )}

      <TypeForm
        editing={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          types.reload();
          toast("Leave type saved.", "jade");
        }}
      />
    </>
  );
}

function TypeCard({
  type,
  editable,
  onEdit,
}: {
  type: TimeOffType;
  editable: boolean;
  onEdit: () => void;
}) {
  return (
    <Card className="pp-type">
      {/* The 4px edge marker — the only place a type's colour appears. */}
      <span
        className="pp-type__edge"
        style={{ background: colourVar(type.color) }}
        aria-hidden="true"
      />
      <div className="pp-type__body">
        <div className="pp-type__head">
          <h3 className="t-h3" style={{ margin: 0 }}>{type.name}</h3>
          <span className="t-micro pp-type__code">{type.code}</span>
        </div>

        <div className="pp-type__flags">
          {type.is_paid ? (
            <Badge tone="jade">PAID</Badge>
          ) : (
            <Badge tone="orange">UNPAID · reaches payroll as LWP</Badge>
          )}
          {type.requires_allocation ? (
            <Badge tone="cobalt">NEEDS ALLOCATION</Badge>
          ) : (
            <Badge tone="neutral">NO BALANCE</Badge>
          )}
          <Badge tone="neutral">IN {type.unit}</Badge>
          {!type.is_active && <Badge tone="neutral">ARCHIVED</Badge>}
        </div>

        <p className="t-ui-sm pp-type__note">
          {type.requires_allocation
            ? "Approval past the remaining balance is refused — a balance can never go negative."
            : "Requests of this type approve without touching a balance."}
        </p>

        {editable && (
          <Button size="sm" variant="quiet" onClick={onEdit} style={{ marginTop: "var(--s-2)" }}>
            Edit
          </Button>
        )}
      </div>
    </Card>
  );
}

function TypeForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: TimeOffType | "new" | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useSubmission();
  const existing = editing === "new" ? undefined : editing;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState<TimeOffType["unit"]>("DAYS");
  const [colour, setColour] = useState("cobalt");
  const [isPaid, setIsPaid] = useState(true);
  const [needsAllocation, setNeedsAllocation] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (editing === undefined) return;
    setName(existing?.name ?? "");
    setCode(existing?.code ?? "");
    setUnit(existing?.unit ?? "DAYS");
    setColour(existing?.color ?? "cobalt");
    setIsPaid(existing?.is_paid ?? true);
    setNeedsAllocation(existing?.requires_allocation ?? true);
    setIsActive(existing?.is_active ?? true);
    form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function save() {
    const ok = await form.submit(async () => {
      if (existing) {
        await updateType(existing.id, {
          name: name.trim(),
          color: colour,
          is_paid: isPaid,
          requires_allocation: needsAllocation,
          is_active: isActive,
        });
      } else {
        await createType({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          unit,
          color: colour,
          is_paid: isPaid,
          requires_allocation: needsAllocation,
        });
      }
    });
    if (ok) onSaved();
  }

  return (
    <Drawer
      open={editing !== undefined}
      onClose={onClose}
      title={existing ? existing.name : "New leave type"}
      footer={
        <div className="pp-form__row" style={{ justifyContent: "flex-end" }}>
          <Button variant="quiet" onClick={onClose} disabled={form.busy}>Cancel</Button>
          <Button variant="primary" loading={form.busy} disabled={name.trim() === ""} onClick={save}>
            {existing ? "Save" : "Create"}
          </Button>
        </div>
      }
    >
      {form.message && <p className="pp-form__error t-ui-sm" role="alert">{form.message}</p>}

      <div className="pp-form">
        <Field
          label="Name"
          required
          error={form.fields.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {!existing && (
          <Field
            label="Code"
            required
            placeholder="CASUAL"
            help="Capitals, digits and underscores. It is permanent — payslips and reports quote it."
            error={form.fields.code}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        )}
        <div className="pp-form__row">
          <Select
            label="Counted in"
            disabled={!!existing}
            help={existing ? "The unit cannot change once requests exist against it." : undefined}
            error={form.fields.unit}
            value={unit}
            onChange={(e) => setUnit(e.target.value as TimeOffType["unit"])}
            options={LEAVE_UNITS.map((u) => ({ value: u, label: u.toLowerCase() }))}
          />
          <Select
            label="Edge colour"
            error={form.fields.color}
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            options={COLOURS.map((c) => ({ value: c, label: c }))}
            help="A token name, never a hex — the palette is the system's, not this record's."
          />
        </div>

        <fieldset className="pp-form__legend">
          <legend className="t-micro">BEHAVIOUR</legend>
          <label className="pp-check">
            <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
            <span>
              <span className="t-ui">Paid</span>
              <span className="t-ui-sm">
                Unpaid leave is how loss of pay reaches payroll — it becomes the
                payslip's LWP line rather than needing a separate mechanism.
              </span>
            </span>
          </label>
          <label className="pp-check">
            <input
              type="checkbox"
              checked={needsAllocation}
              onChange={(e) => setNeedsAllocation(e.target.checked)}
            />
            <span>
              <span className="t-ui">Requires an allocation</span>
              <span className="t-ui-sm">
                Gives the type a balance. Approval past what remains is refused
                outright; a balance can never go negative.
              </span>
            </span>
          </label>
          {existing && (
            <label className="pp-check">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>
                <span className="t-ui">Available for new requests</span>
                <span className="t-ui-sm">
                  Archiving hides it from the request form. Existing requests
                  and balances are untouched.
                </span>
              </span>
            </label>
          )}
        </fieldset>
      </div>
    </Drawer>
  );
}

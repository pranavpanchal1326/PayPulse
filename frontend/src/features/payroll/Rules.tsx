/**
 * S13 · SALARY RULES — the split view.
 *
 * Left, the ordered rules as draggable keys. Middle, the editor. Right, a live
 * STACK that re-renders as you type. The three columns are one argument: a
 * rule is a thing in a *sequence* that produces a *shape*, and editing it in
 * isolation is how v1 shipped a `SPECIAL` line that always evaluated to zero.
 *
 * **The preview reads the draft, not the database.** Change HRA from 40% to
 * 50% and the tower grows before anything is saved — which is the point of
 * showing it at all. It is computed through the API's own sandbox (see
 * `preview.ts`); nothing here evaluates an expression.
 *
 * **A forward reference lights up in both panes at once.** §4.4 makes reading
 * a later rule a silent zero rather than an error, so it is the defect most
 * likely to reach a payslip unnoticed — and the fix is a *reorder*, which is
 * in the other pane. Marking only one of them would leave the reader holding
 * half a sentence.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import type { SalaryRule } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { useQuery, useSubmission } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Button, EmptyState, Modal, Skeleton, WarningCard, Well, useToast,
} from "@/components/system";
import { LoadFailure, SectionNav } from "@/features/shared";
import {
  createRule, deleteRule, getStructure, listStructures, reorderRules, updateRule,
} from "./api";
import { RuleList } from "./RuleList";
import { RuleEditor, blankDraft, draftOf, patchOf, type RuleDraft } from "./RuleEditor";
import { StackPreview } from "./StackPreview";
import { useStackPreview } from "./preview";
import { SECTION_NAV } from "./nav";

export function Rules({ structureId }: { structureId: number }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const form = useSubmission();

  const structure = useQuery(() => getStructure(structureId), [structureId]);
  const structures = useQuery(() => listStructures(), []);

  const [selectedId, setSelectedId] = useState<number | "new">();
  const [draft, setDraft] = useState<RuleDraft>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reorderError, setReorderError] = useState<string>();

  /**
   * The saved rules, with the currently edited draft substituted in. This one
   * value is what makes the preview live — the STACK is computed from it, so
   * an unsaved percentage is a taller tower without a round-trip.
   */
  const saved = useMemo(() => structure.data?.rules ?? [], [structure.data]);

  const drafted: SalaryRule[] = useMemo(() => {
    if (!draft || selectedId === undefined) return saved;
    if (selectedId === "new") {
      return [
        ...saved,
        { ...patchOf(draft, structureId), id: -1, structure_id: structureId } as SalaryRule,
      ];
    }
    return saved.map((r) =>
      r.id === selectedId ? ({ ...r, ...patchOf(draft, structureId) } as SalaryRule) : r,
    );
  }, [saved, draft, selectedId, structureId]);

  const ordered = useMemo(
    () => [...drafted].sort((a, b) => a.sequence - b.sequence),
    [drafted],
  );

  const preview = useStackPreview(ordered);

  /** Open the first rule on arrival, so the editor is never an empty column. */
  useEffect(() => {
    if (selectedId !== undefined || saved.length === 0) return;
    const first = [...saved].sort((a, b) => a.sequence - b.sequence)[0];
    setSelectedId(first.id);
    setDraft(draftOf(first));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.length]);

  const selectedRule = selectedId === "new" || selectedId === undefined
    ? undefined
    : saved.find((r) => r.id === selectedId);

  const dirty =
    draft !== undefined &&
    (selectedId === "new" || (selectedRule !== undefined &&
      JSON.stringify(draftOf(selectedRule)) !== JSON.stringify(draft)));

  const editable = can("salary_rule", "update");

  function select(rule: SalaryRule) {
    setSelectedId(rule.id);
    setDraft(draftOf(rule));
    form.reset();
  }

  function startNew() {
    const highest = saved.reduce((n, r) => Math.max(n, r.sequence), 0);
    setSelectedId("new");
    setDraft(blankDraft(highest + 10));
    form.reset();
  }

  async function save() {
    if (!draft) return;
    const ok = await form.submit(async () => {
      if (selectedId === "new") {
        const created = await createRule(patchOf(draft, structureId));
        setSelectedId(created.id);
        setDraft(draftOf(created));
      } else if (typeof selectedId === "number") {
        const updated = await updateRule(selectedId, patchOf(draft, structureId));
        setDraft(draftOf(updated));
      }
      structure.reload();
    });
    if (ok) toast("Rule saved. Every payrun computed from here uses it.", "jade");
  }

  async function reorder(ids: number[]) {
    setReorderError(undefined);
    // The list is optimistic: a reorder that reads as laggy is a reorder that
    // gets done twice. The server's answer replaces it either way.
    try {
      const updated = await reorderRules(structureId, ids);
      structure.reload();
      if (selectedId !== "new" && typeof selectedId === "number") {
        const still = updated.rules.find((r) => r.id === selectedId);
        if (still && !dirty) setDraft(draftOf(still));
      }
    } catch (cause) {
      setReorderError(
        cause instanceof ApiError
          ? cause.message
          : "The new order could not be saved. Reload and try again.",
      );
      structure.reload();
    }
  }

  async function remove() {
    if (typeof selectedId !== "number") return;
    setConfirmDelete(false);
    try {
      await deleteRule(selectedId);
      toast("Rule deleted. Existing payslips keep their lines.", "jade");
      setSelectedId(undefined);
      setDraft(undefined);
      structure.reload();
    } catch (cause) {
      toast(cause instanceof ApiError ? cause.message : "That rule could not be deleted.", "vermilion");
    }
  }

  if (structure.state === "error") {
    return (
      <>
        <PageHeader title="Salary rules" meta="Could not load." />
        <LoadFailure what="This salary structure" error={structure.error} onRetry={structure.reload} />
      </>
    );
  }

  if (structure.initial || !structure.data) {
    return (
      <>
        <PageHeader title="Salary rules" meta="Loading…" />
        <Well style={{ padding: "var(--s-5)" }}><Skeleton width="100%" /></Well>
      </>
    );
  }

  const detail = structure.data;

  return (
    <>
      <PageHeader
        title={detail.name}
        meta={
          <span>
            {detail.code} · {detail.rule_count} rules · {detail.employee_count} employees on this
            structure ·{" "}
            <button
              type="button"
              className="focusable"
              style={{ color: "var(--ink-500)", cursor: "pointer" }}
              onClick={() => navigate("/payroll/structures")}
            >
              all structures
            </button>
          </span>
        }
        action={
          can("salary_rule", "create") && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={startNew}>
              New rule
            </Button>
          )
        }
      />

      <SectionNav
        items={[
          ...SECTION_NAV,
          ...(structures.data?.items.length && structures.data.items.length > 1
            ? []
            : []),
        ]}
      />

      {reorderError && (
        <div style={{ marginBottom: "var(--s-4)" }}>
          <WarningCard
            severity="warning"
            code="REORDER_REFUSED"
            detail={reorderError}
            blocks="The order on screen has been reloaded from the server."
            action={<Button size="sm" variant="quiet" onClick={() => setReorderError(undefined)}>Dismiss</Button>}
          />
        </div>
      )}

      {saved.length === 0 && selectedId !== "new" ? (
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="This structure has no rules"
            body="Until it has at least one, a payrun against it raises NO_STRUCTURE_RULES and refuses to compute. A structure usually starts with a BASIC rule that the rest reference."
            action={
              can("salary_rule", "create") && (
                <Button variant="primary" onClick={startNew}>Write the first rule</Button>
              )
            }
          />
        </Well>
      ) : (
        <div className="pp-rules">
          <RuleList
            rules={ordered}
            selectedId={typeof selectedId === "number" ? selectedId : undefined}
            onSelect={select}
            onReorder={reorder}
            forwardReferences={preview.forwardReferences}
            editable={editable}
          />

          {draft ? (
            <RuleEditor
              draft={draft}
              isNew={selectedId === "new"}
              siblings={saved}
              forwardOffenders={preview.forwardReferences.get(draft.code)}
              dirty={dirty}
              saving={form.busy}
              fieldErrors={form.fields}
              message={form.message}
              editable={editable}
              onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
              onSave={save}
              onCancel={() => {
                if (selectedId === "new") {
                  setSelectedId(undefined);
                  setDraft(undefined);
                } else if (selectedRule) {
                  setDraft(draftOf(selectedRule));
                }
                form.reset();
              }}
              onDelete={can("salary_rule", "delete") ? () => setConfirmDelete(true) : undefined}
            />
          ) : (
            <div className="pp-rules__editor">
              <EmptyState
                title="Nothing selected"
                body="Choose a rule on the left to read or edit it. The preview on the right shows what the whole structure does to one ordinary month."
              />
            </div>
          )}

          <StackPreview preview={preview} highlight={draft?.code} />
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${draft?.code ?? "this rule"}?`}
        description="Payslips already issued keep their lines — they are denormalised, so history is safe. Every payrun computed from now on loses this line, and any rule that references it will resolve to zero."
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button variant="danger" onClick={remove}>Delete the rule</Button>
          </>
        }
      />
    </>
  );
}

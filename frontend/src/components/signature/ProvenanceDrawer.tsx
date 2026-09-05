/**
 * THE PROVENANCE DRAWER · blueprint §10.3 — "why this number?"
 *
 * The product's core promise, made into a component. Any figure anywhere is
 * clickable, and every one opens this same drawer: the figure at the top, then
 * the tree that produced it, each node openable into its rule code, sequence,
 * the formula **as written**, and the input values it **actually received**.
 *
 * *"Every step is openable until you reach a record a human created. That is
 * the product."*
 *
 * Two decisions that keep it honest:
 *
 *   · **The drawer takes a tree, not a payslip.** A dashboard KPI, a payrun
 *     total and a payslip line all open the same component with their own
 *     tree (`provenance.ts` builds the payslip one). A drawer that knew about
 *     payslips would need a sibling for every other figure, and they would
 *     diverge by P12.
 *   · **A leaf with a source is a link, not a label.** The chain has to
 *     actually end somewhere you can go. A node whose record is not routable
 *     yet renders as plain text rather than a dead link that lies about being
 *     clickable.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import { ChevronRight, FileText, CalendarDays, Clock, User, Sigma } from "lucide-react";
import { formatMoney } from "@/api/money";
import { duration, ease } from "@/motion/springs";
import { Drawer } from "@/components/system";
import { cx } from "@/components/system/cx";
import { RollingNumber } from "./RollingNumber";
import type { ProvenanceNode, ProvenanceSource } from "./provenance";

type IconComponent = typeof FileText;

const SOURCE_ICON: Record<ProvenanceSource["kind"], IconComponent> = {
  contract: FileText,
  leave: CalendarDays,
  attendance: Clock,
  employee: User,
  rule: Sigma,
};

const SOURCE_LABEL: Record<ProvenanceSource["kind"], string> = {
  contract: "Contract",
  leave: "Leave request",
  attendance: "Attendance",
  employee: "Employee",
  rule: "Salary rule",
};

function SourceLink({ source }: { source: ProvenanceSource }) {
  const Icon = SOURCE_ICON[source.kind];
  const body = (
    <>
      <Icon size={16} />
      <span className="pp-prov__source-kind t-ui-sm">{SOURCE_LABEL[source.kind]}</span>
      <span className="t-ui-sm">{source.label}</span>
    </>
  );

  if (!source.href) {
    return (
      <span className="pp-prov__source" aria-label={`${SOURCE_LABEL[source.kind]}: ${source.label}`}>
        {body}
      </span>
    );
  }

  return (
    <Link className="pp-prov__source" to={source.href}>
      {body}
    </Link>
  );
}

/**
 * A node's own evidence: the rule as written, the values it actually received,
 * and the record the chain ends at. Factored out of `Node` because **the root
 * needs it too** — P11 opens the drawer on a single payslip line, whose node is
 * a leaf, and a drawer that only rendered `children` showed that figure with
 * nothing under it at all. The one case where the promise is most direct —
 * "why is BASIC 34,000?" — was the one case it answered with a blank.
 */
function Detail({ node }: { node: ProvenanceNode }) {
  return (
    <div className="pp-prov__detail">
      {node.formula && <code className="pp-prov__eq n-mono">{node.formula}</code>}

      {node.inputs && node.inputs.length > 0 && (
        <dl className="pp-prov__inputs t-ui-sm">
          {node.inputs.map((input) => (
            <div key={input.label} style={{ display: "contents" }}>
              <dt className="n-mono">{input.label}</dt>
              <dd className="n-mono">{input.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {node.source && <SourceLink source={node.source} />}
    </div>
  );
}

export const hasDetailOf = (node: ProvenanceNode): boolean =>
  Boolean(node.formula || node.inputs?.length || node.source);

function Node({ node, depth, last }: { node: ProvenanceNode; depth: number; last: boolean }) {
  // The two top levels open by default: a drawer that starts fully collapsed
  // makes the user click twice to see the thing they asked about.
  const [open, setOpen] = useState(depth < 1);
  const hasDetail = hasDetailOf(node);
  const hasChildren = Boolean(node.children?.length);
  const expandable = hasDetail || hasChildren;

  return (
    <li className={cx(depth > 0 && "pp-prov__branch", last && "pp-prov__branch--last")}>
      {depth > 0 && <span className="pp-prov__elbow" aria-hidden="true" />}

      <button
        type="button"
        className="pp-prov__row"
        aria-expanded={expandable ? open : undefined}
        onClick={() => expandable && setOpen((o) => !o)}
      >
        {expandable ? (
          <ChevronRight
            size={14}
            className={cx("pp-prov__caret", open && "pp-prov__caret--open")}
            aria-hidden="true"
          />
        ) : (
          // Keeps the column aligned without pretending there is a control.
          <span className="pp-prov__caret" style={{ width: 14 }} aria-hidden="true" />
        )}

        <span className="pp-prov__name">
          <span className="t-ui">{node.label}</span>
          {node.code && (
            <span className="t-ui-sm" style={{ color: "var(--ink-400)" }}>
              {" "}
              · {node.code}
            </span>
          )}
        </span>

        {node.sequence !== undefined && (
          <span className="pp-prov__seq t-ui-sm">seq {node.sequence}</span>
        )}

        {node.amount !== null && (
          <span className="pp-prov__amount">
            <span className="n-table" style={node.negative ? { color: "var(--vermilion-500)" } : undefined}>
              {node.negative ? "− " : ""}
              {formatMoney(node.amount)}
            </span>
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.base, ease: ease.out }}
            style={{ overflow: "hidden" }}
          >
            {hasDetail && <Detail node={node} />}

            {hasChildren && (
              <ul className="pp-prov__tree">
                {node.children!.map((child, i) => (
                  <Node
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    last={i === node.children!.length - 1}
                  />
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export interface ProvenanceDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The root is the figure being explained. */
  tree: ProvenanceNode | null;
  /** "Kavya Reddy · August 2026" — who and when, under the figure. */
  subject?: string;
}

export function ProvenanceDrawer({ open, onClose, tree, subject }: ProvenanceDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title="Why this number?" wide>
      {tree && (
        <>
          <div className="pp-prov__head">
            {tree.amount !== null && (
              <RollingNumber value={tree.amount} scale="xl" label={tree.label} />
            )}
            <p className="t-micro" style={{ color: "var(--ink-400)", margin: 0 }}>
              {tree.label}
              {tree.code ? ` · ${tree.code}` : ""}
            </p>
            {subject && (
              <p className="t-ui-sm" style={{ color: "var(--ink-500)", margin: 0 }}>
                {subject}
              </p>
            )}
          </div>

          {/* The root's own evidence, before its children. A leaf root — one
              payslip line — has no children, and this is the whole answer. */}
          {hasDetailOf(tree) && <Detail node={tree} />}

          {(tree.children?.length ?? 0) > 0 && (
            <ul className="pp-prov__tree">
              {tree.children!.map((child, i) => (
                <Node
                  key={child.id}
                  node={child}
                  depth={0}
                  last={i === tree.children!.length - 1}
                />
              ))}
            </ul>
          )}

          <p
            className="t-ui-sm"
            style={{ color: "var(--ink-400)", marginTop: "var(--s-5)", maxWidth: "56ch" }}
          >
            Every step opens until it reaches a record someone created — a
            contract, a leave request, an attendance row. If a figure cannot be
            traced to one, it should not be on a payslip.
          </p>
        </>
      )}
    </Drawer>
  );
}

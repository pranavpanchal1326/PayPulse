/**
 * S11 · BALANCES
 *
 * One person, every type they hold, each as a raised card holding the
 * four-segment inset meter. The screen exists to answer a question that is
 * asked *before* a request is filed — how much is left, and is it about to
 * run out — which is why `remaining` under two days turns orange here rather
 * than at the moment of refusal.
 *
 * **It is per employee, and that is the API's shape, not a limitation.**
 * `/time-off/balances` takes one `employee_id` and returns a flat array (§5).
 * A cross-company balance table would be a different endpoint and a different
 * question; this screen answers the one the endpoint answers.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { LeaveBalance } from "@/api/contract";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import { Button, EmptyState, Select, Skeleton, Well } from "@/components/system";
import { RollingCount } from "@/components/signature";
import { LoadFailure, SectionNav, useFilterParams } from "@/features/shared";
import { getBalances, listEmployees } from "./api";
import { BalanceMeter, LOW_REMAINING } from "./BalanceMeter";
import { SECTION_NAV } from "./nav";

export function Balances() {
  const { user } = useAuth();
  const filters = useFilterParams();
  const employees = useQuery(() => listEmployees(), []);

  /**
   * An employee sees their own and is not offered a picker at all. Anybody
   * else lands on their own record if they have one — a screen that opens on
   * "choose somebody" makes the common case a decision.
   */
  const self = user?.role === "EMPLOYEE";
  const chosen = filters.num("employee_id") ?? user?.employee_id ?? undefined;
  const subject = self ? (user?.employee_id ?? undefined) : chosen;

  useEffect(() => {
    if (!self && filters.num("employee_id") === undefined && user?.employee_id) {
      filters.set("employee_id", user.employee_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balances = useQuery(
    () => (subject === undefined ? Promise.resolve(null) : getBalances(subject)),
    [subject],
  );

  const rows: LeaveBalance[] = balances.data ?? [];
  const low = rows.filter((b) => Number(b.remaining) < LOW_REMAINING);
  const total = rows.reduce((sum, b) => sum + Number(b.remaining), 0);
  const person = employees.data?.items.find((e) => e.id === subject);

  return (
    <>
      <PageHeader
        title="Balances"
        meta={
          subject === undefined
            ? "Choose whose balances to read."
            : balances.state === "ready"
              ? `${rows.length} ${rows.length === 1 ? "type" : "types"}${low.length ? ` · ${low.length} running low` : ""}`
              : "Loading balances…"
        }
        action={
          subject !== undefined &&
          balances.state === "ready" && (
            <span className="pp-lv__headline">
              <RollingCount value={total} scale="l" label="days remaining in total" />
              <span className="t-micro"> DAYS LEFT IN TOTAL</span>
            </span>
          )
        }
      />

      <SectionNav items={SECTION_NAV} />

      {!self && (
        <div className="pp-filters">
          <Select
            label="Employee"
            className="pp-filters__field"
            value={subject === undefined ? "" : String(subject)}
            onChange={(e) => filters.set("employee_id", e.target.value)}
            options={[
              { value: "", label: "Choose a person" },
              ...(employees.data?.items ?? []).map((e) => ({
                value: String(e.id),
                label: e.full_name,
              })),
            ]}
          />
          {person && (
            <span className="pp-filters__count t-ui-sm">
              <Link to={`/people/${person.id}`} className="focusable">
                Open {person.full_name}'s record
              </Link>
            </span>
          )}
        </div>
      )}

      {subject === undefined ? (
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="Nobody chosen"
            body="Balances are held per person, per leave type. Pick somebody above to see what they have left."
          />
        </Well>
      ) : balances.state === "error" ? (
        <LoadFailure what="These balances" error={balances.error} onRetry={balances.reload} />
      ) : balances.initial ? (
        <div className="pp-bal__grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="pp-bal" key={i}>
              <Skeleton width="50%" />
              <Skeleton width="100%" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Well style={{ padding: "var(--s-5)" }}>
          <EmptyState
            title="No balances for this person"
            body="Nothing has been allocated to them yet, so every type that requires an allocation stands at zero and any request would be refused at approval."
            action={
              <Button variant="quiet" onClick={() => filters.set("employee_id", undefined)}>
                Choose somebody else
              </Button>
            }
          />
        </Well>
      ) : (
        <div className="pp-bal__grid">
          {rows.map((balance) => (
            <BalanceMeter key={balance.time_off_type_id} balance={balance} />
          ))}
        </div>
      )}
    </>
  );
}

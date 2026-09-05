/**
 * ONE REQUEST, WITH THE BALANCE IT SPENDS.
 *
 * The queue can decide most requests without opening anything. This is for
 * the ones that need a judgement — and a judgement about leave is a judgement
 * about a *balance*, so the drawer puts the two next to each other: the
 * request on the left, the employee's balance for that type on the right.
 *
 * Approving from here rolls the meter down in place. That is not decoration —
 * it is the confirmation that the thing you just spent came out of the thing
 * you were looking at.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import type { TimeOffRequest } from "@/api/contract";
import { ApiError } from "@/api/errors";
import { useQuery } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { Badge, Button, Drawer, Skeleton, StateChip, WarningCard, Well } from "@/components/system";
import { Pair, daysLabel, decimalLabel, formatDate } from "@/features/shared";
import { approveRequest, cancelRequest, getBalances, refuseRequest } from "./api";
import { BalanceMeter } from "./BalanceMeter";

export function RequestDrawer({
  request,
  onClose,
  onActed,
}: {
  request: TimeOffRequest | undefined;
  onClose: () => void;
  onActed: () => void;
}) {
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();

  const balances = useQuery(
    () => (request ? getBalances(request.employee_id) : Promise.resolve(null)),
    [request?.employee_id],
  );

  const balance = balances.data?.find((b) => b.time_off_type_id === request?.time_off_type_id);

  async function act(run: (id: number) => Promise<unknown>) {
    if (!request) return;
    setRefusal(undefined);
    setBusy(true);
    try {
      await run(request.id);
      balances.reload();
      onActed();
      onClose();
    } catch (cause) {
      setRefusal(cause instanceof ApiError ? cause.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const canApprove = can("time_off_request", "approve");
  const canCancel = can("time_off_request", "update");

  return (
    <Drawer
      open={request !== undefined}
      onClose={onClose}
      title={request ? `${request.employee_name} · ${request.time_off_type_name}` : ""}
      wide
      footer={
        request && (
          <div className="pp-form__row" style={{ justifyContent: "flex-end" }}>
            {canCancel && (request.state === "APPROVED" || request.state === "TO_APPROVE") && (
              <Button variant="quiet" loading={busy} onClick={() => act(cancelRequest)}>
                Cancel request
              </Button>
            )}
            {canApprove && request.state === "TO_APPROVE" && (
              <>
                <Button variant="secondary" loading={busy} onClick={() => act(refuseRequest)}>
                  Refuse
                </Button>
                <Button variant="primary" loading={busy} onClick={() => act(approveRequest)}>
                  Approve {daysLabel(request.duration_days)}
                </Button>
              </>
            )}
          </div>
        )
      }
    >
      {request && (
        <>
          {refusal && (
            <div style={{ marginBottom: "var(--s-4)" }}>
              <WarningCard
                severity="error"
                code="REFUSED"
                detail={refusal}
                blocks="Nothing changed. The request is still where it was."
              />
            </div>
          )}

          <div className="pp-lv__drawer">
            <div>
              <div className="pp-lv__drawerhead">
                <StateChip state={request.state} />
                {!request.is_paid && <Badge tone="orange">UNPAID — reaches payroll as LWP</Badge>}
              </div>

              <Well style={{ marginTop: "var(--s-4)" }}>
                <div className="pp-pairs">
                  <Pair
                    k="Employee"
                    v={
                      <Link to={`/people/${request.employee_id}`} className="focusable">
                        {request.employee_name}
                      </Link>
                    }
                  />
                  <Pair k="Type" v={request.time_off_type_name} />
                  <Pair k="From" v={formatDate(request.date_from)} />
                  <Pair k="To" v={formatDate(request.date_to)} />
                  <Pair k="Counts as" v={daysLabel(request.duration_days)} />
                  <Pair k="Decided by" v={request.approver_name} />
                  <Pair k="Reason" v={request.reason} />
                </div>
              </Well>

              <p className="t-ui-sm pp-lv__explain">
                The duration is computed from this employee's working schedule
                and the public-holiday calendar, not from the calendar span —
                so weekends and holidays inside the range cost nothing. It is
                the server's number; this screen never recounts it.
              </p>
            </div>

            <aside aria-label="Balance">
              {balances.initial ? (
                <Skeleton width="100%" />
              ) : balance ? (
                <BalanceMeter balance={balance} />
              ) : (
                <p className="t-ui-sm" style={{ color: "var(--ink-400)" }}>
                  This type needs no allocation, so there is no balance to
                  spend — approving it deducts nothing.
                </p>
              )}

              {balance && request.state === "TO_APPROVE" && (
                <p
                  className="t-ui-sm pp-lv__afterward"
                  style={{
                    color:
                      Number(balance.remaining) < Number(request.duration_days)
                        ? "var(--vermilion-500)"
                        : "var(--ink-500)",
                  }}
                >
                  {Number(balance.remaining) < Number(request.duration_days)
                    ? `Approving this needs ${decimalLabel(request.duration_days)} and only ${decimalLabel(balance.remaining)} are left. It will be refused — allocate more first.`
                    : `After approval: ${decimalLabel(
                        Number(balance.remaining) - Number(request.duration_days),
                      )} left.`}
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </Drawer>
  );
}

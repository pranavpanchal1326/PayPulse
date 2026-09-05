"""Pick the one contract payroll should compute against.

The brief (A2): "Ensure payroll processes only the contract applicable to
the selected period" - singular. So this returns exactly one contract, plus
warnings describing anything it had to decide.

The rule, from PRD section 4.3:

    0 RUNNING contracts intersecting the period -> NO_ACTIVE_CONTRACT (ERROR)
    1                                           -> use it
    n                                           -> use the one applicable at
                                                   period_end, i.e. the latest
                                                   date_start, and raise
                                                   MULTI_CONTRACT_PERIOD
                                                   (WARNING, not an error)

That last line is the fix for PRD v1's worst defect. v1 raised a blocking
ERROR on n > 1, which meant an employee who got a raise mid-month could not
be paid at all - and a mid-month raise is the single commonest reason to
have two contracts. Adjacent contracts are legal (see models/contract.py);
only genuine overlap is wrong, and the database already prevents that.

`select_applicable` is deliberately a pure function over a list so the
decision can be unit-tested without a database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import ContractState, WarningCode
from app.models.contract import Contract


@dataclass(frozen=True)
class ResolvedWarning:
    """A finding, not yet persisted. B7's warnings service stores these."""

    code: WarningCode
    message: str


@dataclass
class ContractResolution:
    """The chosen contract plus everything the caller needs to explain it."""

    contract: Contract | None
    candidates: list[Contract] = field(default_factory=list)
    warnings: list[ResolvedWarning] = field(default_factory=list)

    @property
    def resolved(self) -> bool:
        """Whether a contract was found for the day in question."""
        return self.contract is not None

    @property
    def is_blocking(self) -> bool:
        """True when payroll must skip this employee entirely."""
        blocking = {
            WarningCode.NO_ACTIVE_CONTRACT,
            WarningCode.OVERLAPPING_CONTRACTS,
        }
        return any(w.code in blocking for w in self.warnings)

    @property
    def codes(self) -> list[WarningCode]:
        """Just the warning codes, for callers that do not need the text."""
        return [w.code for w in self.warnings]


def _true_overlaps(contracts: list[Contract]) -> list[tuple[Contract, Contract]]:
    """Pairs whose terms genuinely intersect.

    The exclusion constraint should make this impossible, so a hit here means
    the constraint is missing or a contract was activated behind the API.
    Checked anyway: silently paying against overlapping terms is worse than a
    loud error.
    """
    pairs = []
    ordered = sorted(contracts, key=lambda c: c.date_start)
    for index, earlier in enumerate(ordered):
        for later in ordered[index + 1 :]:
            if earlier.date_end is None or earlier.date_end >= later.date_start:
                pairs.append((earlier, later))
    return pairs


def select_applicable(
    contracts: list[Contract], period_start: date, period_end: date
) -> ContractResolution:
    """Choose the contract for a period from an already-filtered list.

    `contracts` must already be restricted to one employee's RUNNING
    contracts. Pure: no database access, so the decision is unit-testable.
    """
    candidates = [c for c in contracts if c.overlaps_period(period_start, period_end)]

    if not candidates:
        return ContractResolution(
            contract=None,
            candidates=[],
            warnings=[
                ResolvedWarning(
                    WarningCode.NO_ACTIVE_CONTRACT,
                    f"No running contract covers {period_start} to {period_end}.",
                )
            ],
        )

    # Latest start wins: that is the contract in force at the end of the
    # period, which is what "applicable to the selected period" means for a
    # raise partway through.
    ordered = sorted(candidates, key=lambda c: c.date_start, reverse=True)
    chosen = ordered[0]
    warnings: list[ResolvedWarning] = []

    if overlaps := _true_overlaps(candidates):
        earlier, later = overlaps[0]
        warnings.append(
            ResolvedWarning(
                WarningCode.OVERLAPPING_CONTRACTS,
                f"Contracts {earlier.id} and {later.id} have overlapping terms. "
                "This should be impossible; check the exclusion constraint.",
            )
        )
        # Genuine overlap is unresolvable, not a judgement call.
        return ContractResolution(
            contract=None, candidates=candidates, warnings=warnings
        )

    if len(candidates) > 1:
        others = ", ".join(str(c.id) for c in ordered[1:])
        warnings.append(
            ResolvedWarning(
                WarningCode.MULTI_CONTRACT_PERIOD,
                f"{len(candidates)} contracts fall in this period. Using "
                f"contract {chosen.id} (from {chosen.date_start}, the one in "
                f"force at {period_end}); not used: {others}.",
            )
        )

    if chosen.date_start > period_start or (
        chosen.date_end is not None and chosen.date_end < period_end
    ):
        warnings.append(
            ResolvedWarning(
                WarningCode.PRORATED_PERIOD,
                f"Contract {chosen.id} covers only part of the period; pay "
                "will be prorated.",
            )
        )

    if chosen.date_end is not None and 0 <= (chosen.date_end - period_end).days <= 30:
        warnings.append(
            ResolvedWarning(
                WarningCode.CONTRACT_EXPIRING,
                f"Contract {chosen.id} ends on {chosen.date_end}, "
                "within 30 days of the period end.",
            )
        )

    return ContractResolution(
        contract=chosen, candidates=candidates, warnings=warnings
    )


def running_contracts(
    db: Session, employee_id: int, period_start: date, period_end: date
) -> list[Contract]:
    """RUNNING contracts for one employee whose term touches the period."""
    stmt = (
        select(Contract)
        .where(
            Contract.employee_id == employee_id,
            Contract.state == ContractState.RUNNING,
            Contract.date_start <= period_end,
            (Contract.date_end.is_(None)) | (Contract.date_end >= period_start),
        )
        .order_by(Contract.date_start.desc())
    )
    return list(db.scalars(stmt))


def resolve_many(
    db: Session,
    employee_ids: list[int],
    period_start: date,
    period_end: date,
) -> dict[int, ContractResolution]:
    """Resolve a whole batch in one query.

    `resolve` is one query per employee, which a payrun over 500 people pays
    500 times. The decision itself is already pure, so batching is only a
    matter of loading the contracts together and grouping them.
    """
    if not employee_ids:
        return {}

    stmt = (
        select(Contract)
        .where(
            Contract.employee_id.in_(employee_ids),
            Contract.state == ContractState.RUNNING,
            Contract.date_start <= period_end,
            (Contract.date_end.is_(None)) | (Contract.date_end >= period_start),
        )
        .options(selectinload(Contract.working_schedule))
        .order_by(Contract.date_start.desc())
    )

    by_employee: dict[int, list[Contract]] = {eid: [] for eid in employee_ids}
    for contract in db.scalars(stmt):
        by_employee[contract.employee_id].append(contract)

    return {
        employee_id: select_applicable(contracts, period_start, period_end)
        for employee_id, contracts in by_employee.items()
    }


def resolve(
    db: Session, employee_id: int, period_start: date, period_end: date
) -> ContractResolution:
    """Full resolution for one employee. The entry point payroll calls."""
    return select_applicable(
        running_contracts(db, employee_id, period_start, period_end),
        period_start,
        period_end,
    )


def active_on(db: Session, employee_id: int, day: date) -> Contract | None:
    """The contract in force on a single day, or None."""
    return resolve(db, employee_id, day, day).contract

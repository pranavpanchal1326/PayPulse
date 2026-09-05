"""Payrun lifecycle: eligibility, compute, and state transitions (spec B5-B6).

Two things here carry the brief directly.

`eligible_employees` is **stateless**. Spec B5 is emphatic: "Clicking
Continue moves to employee selection *without creating the Payrun*." So
step 1 of the wizard previews who could be paid and persists nothing.

`compute` is idempotent and gated. It deletes and regenerates lines inside
one transaction, and refuses entirely once a payrun is VALIDATED or PAID -
which is what makes finalized batches historical records (B6) and means
editing a salary rule can never rewrite what was already paid.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import (
    EmployeeStatus,
    PayrunState,
    PayslipState,
    WarningCode,
)
from app.core.errors import BusinessRuleError, ConflictError
from app.models.employee import Employee
from app.models.payroll import Payrun, Payslip, PayslipLine
from app.models.salary import SalaryStructure
from app.models.schedule import WorkingSchedule
from app.services import (
    attendance_service,
    calendar,
    contract_resolver,
    leave_engine,
    payroll_engine,
    warnings,
)

COMPUTABLE_STATES = (PayrunState.DRAFT, PayrunState.COMPUTED)


@dataclass
class Eligibility:
    """One row of the wizard's step-2 table."""

    employee_id: int
    name: str
    department: str | None
    contract_wage: str | None
    currency: str
    period_days: int
    contract_days: int
    eligible: bool
    blockers: list[str]
    notes: list[str]


def eligible_employees(
    db: Session,
    period_start: date,
    period_end: date,
    department_id: int | None = None,
    employee_type=None,
) -> list[Eligibility]:
    """Preview who can be paid. Creates nothing (spec B5)."""
    stmt = select(Employee).where(Employee.status == EmployeeStatus.ACTIVE)
    if department_id is not None:
        stmt = stmt.where(Employee.department_id == department_id)
    if employee_type is not None:
        stmt = stmt.where(Employee.employee_type == employee_type)

    employees = list(
        db.scalars(stmt.options(selectinload(Employee.department)).order_by(
            Employee.first_name, Employee.last_name
        ))
    )
    holidays = calendar.holiday_dates(db, period_start, period_end)
    # One query for the whole batch instead of one per employee.
    resolutions = contract_resolver.resolve_many(
        db, [e.id for e in employees], period_start, period_end
    )

    # Employees already carrying a live payslip for this exact period, so the
    # user sees the clash before creating the payrun rather than hitting the
    # unique index afterwards.
    already_paid = set(
        db.scalars(
            select(Payslip.employee_id).where(
                Payslip.period_start == period_start,
                Payslip.period_end == period_end,
                Payslip.state != PayslipState.CANCELLED,
            )
        )
    )

    rows: list[Eligibility] = []
    for employee in employees:
        resolution = resolutions[employee.id]
        blockers = [
            w.code.value for w in resolution.warnings if resolution.is_blocking
        ]
        notes = [
            w.code.value
            for w in resolution.warnings
            if w.code
            in (WarningCode.MULTI_CONTRACT_PERIOD, WarningCode.CONTRACT_EXPIRING)
        ]

        basis = None
        if resolution.contract is not None:
            schedule = calendar.schedule_for(employee, resolution.contract)
            lines = schedule.lines if schedule else []
            basis = calendar.compute_basis(
                lines,
                employee,
                resolution.contract,
                period_start,
                period_end,
                holidays,
            )
            if basis.is_prorated:
                notes.append(WarningCode.PRORATED_PERIOD.value)

        if employee.id in already_paid:
            blockers.append("ALREADY_PAID_THIS_PERIOD")

        rows.append(
            Eligibility(
                employee_id=employee.id,
                name=employee.full_name,
                department=employee.department.name if employee.department else None,
                contract_wage=(
                    str(resolution.contract.wage) if resolution.contract else None
                ),
                currency=(
                    resolution.contract.currency if resolution.contract else "INR"
                ),
                period_days=basis.period_days if basis else 0,
                contract_days=basis.contract_days if basis else 0,
                eligible=not blockers,
                blockers=blockers,
                notes=sorted(set(notes)),
            )
        )
    return rows


def create(
    db: Session,
    name: str,
    structure: SalaryStructure,
    period_start: date,
    period_end: date,
    employee_ids: list[int],
) -> Payrun:
    """Step 2: create the batch with only the selected employees."""
    if period_end < period_start:
        raise BusinessRuleError(
            "period_end cannot be before period_start", code="invalid_date_range"
        )
    if (period_end - period_start).days > 62:
        raise BusinessRuleError(
            "A payrun period may not exceed 62 days.", code="period_too_long"
        )
    if not employee_ids:
        raise BusinessRuleError(
            "Select at least one employee.", code="no_employees_selected"
        )

    # DUPLICATE_PAYSLIP, caught before the partial unique index turns it
    # into a 500. The eligibility preview flags this too, but the API must
    # hold even when a client skips step 1.
    clashing = list(
        db.execute(
            select(Employee.first_name, Employee.last_name)
            .join(Payslip, Payslip.employee_id == Employee.id)
            .where(
                Payslip.employee_id.in_(employee_ids),
                Payslip.period_start == period_start,
                Payslip.period_end == period_end,
                Payslip.state != PayslipState.CANCELLED,
            )
        ).all()
    )
    if clashing:
        names = ", ".join(f"{first} {last}" for first, last in clashing[:5])
        raise ConflictError(
            f"{len(clashing)} employee(s) already have a payslip for "
            f"{period_start} to {period_end}: {names}. Cancel that payrun, or "
            "choose a different period.",
            code="DUPLICATE_PAYSLIP",
        )

    payrun = Payrun(
        name=name,
        salary_structure_id=structure.id,
        period_start=period_start,
        period_end=period_end,
        currency=structure.currency,
        state=PayrunState.DRAFT,
    )
    db.add(payrun)
    db.flush()

    for employee_id in employee_ids:
        db.add(
            Payslip(
                payrun_id=payrun.id,
                employee_id=employee_id,
                period_start=period_start,
                period_end=period_end,
                currency=structure.currency,
                state=PayslipState.DRAFT,
            )
        )
    db.flush()
    return payrun


def paid_payslip_covering(
    db: Session, employee_id: int, date_from: date, date_to: date
) -> Payslip | None:
    """A PAID payslip whose period overlaps [date_from, date_to], if any.

    Paid payroll is a historical record (PRD section 4.7), and `compute`
    refuses to run on a PAID payrun. That guard only protects the payrun
    itself - the attendance and leave rows a payslip was derived from stayed
    editable, so a correction after payment left the payslip's stored numbers
    unreproducible from its own inputs, with no way to reconcile them.
    Mutations of those inputs check here first.
    """
    return db.scalar(
        select(Payslip).where(
            Payslip.employee_id == employee_id,
            Payslip.state == PayslipState.PAID,
            Payslip.period_start <= date_to,
            Payslip.period_end >= date_from,
        )
    )


def assert_period_not_paid(
    db: Session, employee_id: int, date_from: date, date_to: date, what: str
) -> None:
    """Refuse a change to payroll input that a PAID payslip already consumed."""
    payslip = paid_payslip_covering(db, employee_id, date_from, date_to)
    if payslip is not None:
        raise ConflictError(
            f"{what} falls in {payslip.period_start} to {payslip.period_end}, "
            "which has already been paid. Paid payroll is preserved as a "
            "historical record and its inputs cannot be changed.",
            code="period_already_paid",
        )


def compute(db: Session, payrun: Payrun) -> Payrun:
    """(Re)generate every payslip in the batch. Idempotent.

    Refuses on VALIDATED / PAID / CANCELLED - PRD section 4.7. That single
    guard is what preserves finalized batches, and is why no rule-snapshot
    table is needed.
    """
    if payrun.state not in COMPUTABLE_STATES:
        raise ConflictError(
            f"A {payrun.state} payrun cannot be recomputed. Reopen it first, "
            "or create a new payrun.",
            code="payrun_not_editable",
        )

    structure = db.get(SalaryStructure, payrun.salary_structure_id)
    warnings.clear(db, payrun.id)

    # Days after today have no attendance yet, so they derive as absence and
    # charge a full day of LWP each. Running payroll before the period ends
    # is legitimate for a preview, but the user has to know why the numbers
    # look low.
    today = datetime.now(UTC).date()
    if payrun.period_end > today:
        remaining = (payrun.period_end - today).days
        warnings.record(
            db,
            payrun.id,
            WarningCode.FUTURE_PERIOD,
            f"This period ends in {remaining} day(s). Days after {today} have "
            "no attendance yet, so they count as absence and reduce pay. "
            "Recompute once the period has finished.",
        )

    # Pre-loaded once for the whole batch rather than per employee.
    holidays = calendar.holiday_dates(db, payrun.period_start, payrun.period_end)

    payslips = list(
        db.scalars(
            select(Payslip)
            .where(Payslip.payrun_id == payrun.id)
            .options(
                # department and working_schedule are both read per employee
                # while building the formula context and the pay basis, so
                # they are loaded with the batch rather than lazily one by one.
                selectinload(Payslip.employee).selectinload(Employee.department),
                selectinload(Payslip.employee)
                .selectinload(Employee.working_schedule)
                .selectinload(WorkingSchedule.lines),
            )
        )
    )

    # Three queries for the whole batch, rather than three per payslip.
    employee_ids = [p.employee_id for p in payslips]
    resolutions = contract_resolver.resolve_many(
        db, employee_ids, payrun.period_start, payrun.period_end
    )
    attendance_by_employee = attendance_service.summarise_many(
        db, employee_ids, payrun.period_start, payrun.period_end
    )
    leave_by_employee = leave_engine.approved_requests_many(
        db, employee_ids, payrun.period_start, payrun.period_end
    )

    for payslip in payslips:
        for line in list(payslip.lines):
            db.delete(line)
        payslip.lines.clear()

        employee = payslip.employee
        result = payroll_engine.compute(
            db,
            employee,
            structure,
            payrun.period_start,
            payrun.period_end,
            holidays,
            resolution=resolutions[employee.id],
            attendance=attendance_by_employee[employee.id],
            leave_requests=leave_by_employee[employee.id],
        )

        payslip.contract_id = result.contract_id
        payslip.currency = result.currency
        payslip.basic = result.basic
        payslip.gross = result.gross
        payslip.total_deductions = result.total_deductions
        payslip.net = result.net

        if result.basis is not None:
            payslip.period_days = result.basis.period_days
            payslip.contract_days = result.basis.contract_days
            payslip.payable_days = result.basis.payable_days
            payslip.unpaid_days = result.basis.unpaid_days
            payslip.paid_leave_days = result.basis.paid_leave_days
            payslip.unpaid_leave_days = result.basis.unpaid_leave_days
            payslip.absent_days = result.basis.absent_days
            payslip.worked_hours = result.basis.worked_hours
            payslip.overtime_hours = result.basis.overtime_hours

        for line in result.visible_lines:
            db.add(
                PayslipLine(
                    payslip_id=payslip.id,
                    rule_code=line.rule_code,
                    name=line.name,
                    category=line.category,
                    sequence=line.sequence,
                    quantity=line.quantity,
                    rate=line.rate,
                    amount=line.amount,
                )
            )

        payslip.state = PayslipState.COMPUTED
        for warning in result.warnings:
            warnings.record(
                db,
                payrun.id,
                warning.code,
                warning.message,
                payslip_id=payslip.id,
                employee_id=employee.id,
            )

        # Payout readiness is a property of the employee, not the engine.
        if not employee.has_bank_details:
            warnings.record(
                db,
                payrun.id,
                WarningCode.MISSING_BANK_DETAILS,
                f"{employee.full_name} has no bank account or IFSC on file.",
                payslip_id=payslip.id,
                employee_id=employee.id,
            )

    payrun.state = PayrunState.COMPUTED
    payrun.computed_at = datetime.now(UTC)
    db.flush()
    return payrun


def validate(db: Session, payrun: Payrun) -> Payrun:
    """COMPUTED -> VALIDATED, refused while any ERROR warning is open."""
    if payrun.state is not PayrunState.COMPUTED:
        raise ConflictError(
            f"Only a COMPUTED payrun can be validated (this one is "
            f"{payrun.state}).",
            code="invalid_transition",
        )

    blocking = warnings.blocking_for(db, payrun.id, "validate")
    if blocking:
        raise BusinessRuleError(
            f"{len(blocking)} error(s) must be resolved first: "
            + "; ".join(w.message for w in blocking[:3]),
            code="blocked_by_warnings",
        )

    payrun.state = PayrunState.VALIDATED
    payrun.validated_at = datetime.now(UTC)
    for payslip in payrun.payslips:
        payslip.state = PayslipState.VALIDATED
    db.flush()
    return payrun


def mark_paid(
    db: Session,
    payrun: Payrun,
    user_id: int,
    force: bool = False,
    reason: str | None = None,
) -> Payrun:
    """VALIDATED -> PAID. Refused on missing bank details unless forced.

    "The system stops you before you pay someone wrong" - and a force always
    carries a reason and an author.
    """
    if payrun.state is not PayrunState.VALIDATED:
        raise ConflictError(
            f"Only a VALIDATED payrun can be marked paid (this one is "
            f"{payrun.state}).",
            code="invalid_transition",
        )

    blocking = warnings.blocking_for(db, payrun.id, "mark-paid")
    if blocking and not force:
        raise BusinessRuleError(
            f"{len(blocking)} employee(s) have missing bank details. Fix the "
            "records, or force with a reason.",
            code="blocked_by_warnings",
        )
    if blocking and force and not (reason or "").strip():
        raise BusinessRuleError(
            "Forcing payment past an open warning requires a reason.",
            code="force_reason_required",
        )

    payrun.state = PayrunState.PAID
    payrun.paid_at = datetime.now(UTC)
    payrun.paid_by_id = user_id
    if force and blocking:
        payrun.force_paid_reason = reason
    for payslip in payrun.payslips:
        payslip.state = PayslipState.PAID
    db.flush()
    return payrun


def reopen(db: Session, payrun: Payrun) -> Payrun:
    """Back to DRAFT for correction. Never from PAID - paid is terminal."""
    if payrun.state is PayrunState.PAID:
        raise ConflictError(
            "A PAID payrun cannot be reopened. Paid payroll is preserved as a "
            "historical record.",
            code="payrun_is_paid",
        )
    if payrun.state is PayrunState.CANCELLED:
        raise ConflictError(
            "A cancelled payrun cannot be reopened.", code="invalid_transition"
        )
    payrun.state = PayrunState.DRAFT
    payrun.validated_at = None
    for payslip in payrun.payslips:
        payslip.state = PayslipState.DRAFT
    db.flush()
    return payrun


def cancel(db: Session, payrun: Payrun) -> Payrun:
    """Cancel a payrun and every payslip in it.

    Raises:
        ConflictError: If the payrun is already PAID. Paid runs are kept as
            historical records rather than unwound.
    """
    if payrun.state is PayrunState.PAID:
        raise ConflictError(
            "A PAID payrun cannot be cancelled.", code="payrun_is_paid"
        )
    payrun.state = PayrunState.CANCELLED
    for payslip in payrun.payslips:
        payslip.state = PayslipState.CANCELLED
    db.flush()
    return payrun

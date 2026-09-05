"""Warning severity and gating (spec B6, PRD section 4.9).

The brief wants problems surfaced *before* finalization: "Surface potential
payroll issues, such as duplicate entries or incomplete employee data, to
users before finalization."

Severity is defined in exactly one place so the payrun screen, the dashboard
alerts panel and the state-transition guards can never disagree about
whether something blocks.
"""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.enums import WarningCode, WarningSeverity
from app.models.payroll import PayrollWarning

# code -> (severity, which transition it blocks)
SEVERITY: dict[WarningCode, tuple[WarningSeverity, str | None]] = {
    WarningCode.NO_ACTIVE_CONTRACT: (WarningSeverity.ERROR, "validate"),
    WarningCode.OVERLAPPING_CONTRACTS: (WarningSeverity.ERROR, "validate"),
    WarningCode.NEGATIVE_NET: (WarningSeverity.ERROR, "validate"),
    WarningCode.NO_STRUCTURE_RULES: (WarningSeverity.ERROR, "validate"),
    WarningCode.PAYSLIP_NOT_RECONCILED: (WarningSeverity.ERROR, "validate"),
    WarningCode.MISSING_BANK_DETAILS: (WarningSeverity.WARNING, "mark-paid"),
    WarningCode.MULTI_CONTRACT_PERIOD: (WarningSeverity.WARNING, None),
    WarningCode.RULE_EVAL_FAILED: (WarningSeverity.WARNING, None),
    WarningCode.RULE_FORWARD_REFERENCE: (WarningSeverity.WARNING, None),
    WarningCode.MISSING_CHECKOUT: (WarningSeverity.WARNING, None),
    WarningCode.ATTENDANCE_ON_LEAVE_DAY: (WarningSeverity.WARNING, None),
    WarningCode.HIGH_ABSENCE: (WarningSeverity.WARNING, None),
    WarningCode.FUTURE_PERIOD: (WarningSeverity.WARNING, None),
    WarningCode.PRORATED_PERIOD: (WarningSeverity.INFO, None),
    WarningCode.CONTRACT_EXPIRING: (WarningSeverity.INFO, None),
    WarningCode.RECOMPUTE_REQUIRED: (WarningSeverity.INFO, None),
}


def severity_of(code: WarningCode) -> WarningSeverity:
    """The severity a warning code carries. Unlisted codes are WARNING."""
    return SEVERITY.get(code, (WarningSeverity.WARNING, None))[0]


def blocks(code: WarningCode) -> str | None:
    """The payrun transition this code blocks, or None if it only informs."""
    return SEVERITY.get(code, (WarningSeverity.WARNING, None))[1]


def record(
    db: Session,
    payrun_id: int,
    code: WarningCode,
    message: str,
    *,
    payslip_id: int | None = None,
    employee_id: int | None = None,
) -> PayrollWarning:
    """Attach one warning to a payrun.

    Args:
        payrun_id: The run the warning belongs to.
        code: What went wrong. Its severity is looked up, not passed in.
        message: Text shown to whoever reviews the run.
        payslip_id: Set when the warning is about one payslip.
        employee_id: Set when the warning is about one employee.

    Returns:
        The persisted warning.
    """
    warning = PayrollWarning(
        payrun_id=payrun_id,
        payslip_id=payslip_id,
        employee_id=employee_id,
        code=code,
        severity=severity_of(code),
        message=message,
    )
    db.add(warning)
    return warning


def clear(db: Session, payrun_id: int) -> None:
    """Drop a payrun's warnings before recompute, so they never accumulate."""
    db.execute(delete(PayrollWarning).where(PayrollWarning.payrun_id == payrun_id))


def blocking_for(
    db: Session, payrun_id: int, transition: str
) -> list[PayrollWarning]:
    """Warnings that must be resolved before a transition may proceed."""
    codes = [code for code, (_, gate) in SEVERITY.items() if gate == transition]
    if not codes:
        return []
    return list(
        db.scalars(
            select(PayrollWarning).where(
                PayrollWarning.payrun_id == payrun_id,
                PayrollWarning.code.in_(codes),
            )
        )
    )

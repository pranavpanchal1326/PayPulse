"""Domain enumerations.

Lives in `core` rather than `models` so that pure-policy modules (rbac) and
schemas can import the vocabulary without dragging in SQLAlchemy."""
from enum import StrEnum


class Role(StrEnum):
    """The five roles defined on page 3 of the problem statement."""

    EMPLOYEE = "EMPLOYEE"
    HR_MANAGER = "HR_MANAGER"
    HR_PAYROLL_USER = "HR_PAYROLL_USER"
    HR_PAYROLL_MANAGER = "HR_PAYROLL_MANAGER"
    ADMIN = "ADMIN"


class EmployeeStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class EmployeeType(StrEnum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACT = "CONTRACT"
    INTERN = "INTERN"


class ContractState(StrEnum):
    DRAFT = "DRAFT"
    RUNNING = "RUNNING"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class AttendanceStatus(StrEnum):
    """Status of an attendance ROW.

    There is deliberately no ABSENT member. Absence is the *absence of a
    row*, so it cannot be a property of one; it is derived against the
    schedule in services/attendance_service.py and reported as a count
    (PRD section 3.4). The brief wants "Absent" on the dashboard (B9),
    which the derived figure supplies.
    """

    PRESENT = "PRESENT"
    LATE = "LATE"
    OVERTIME = "OVERTIME"
    MISSING_CHECKOUT = "MISSING_CHECKOUT"


class AbsencePolicy(StrEnum):
    """Whether a scheduled day with no attendance and no leave costs pay.

    PRD section 4.1: PayPulse is schedule-anchored with attendance-derived
    absence. Configurable so both readings can be shown on stage.
    """

    TREAT_AS_UNPAID = "TREAT_AS_UNPAID"
    IGNORE = "IGNORE"


class LeaveUnit(StrEnum):
    DAYS = "DAYS"
    HOURS = "HOURS"


class RequestState(StrEnum):
    """Shared lifecycle for time-off requests and allocations."""

    DRAFT = "DRAFT"
    TO_APPROVE = "TO_APPROVE"
    APPROVED = "APPROVED"
    REFUSED = "REFUSED"
    CANCELLED = "CANCELLED"


class RuleCategory(StrEnum):
    BASIC = "BASIC"
    ALLOWANCE = "ALLOWANCE"
    GROSS = "GROSS"
    DEDUCTION = "DEDUCTION"
    NET = "NET"


class ConditionType(StrEnum):
    ALWAYS = "ALWAYS"
    EXPRESSION = "EXPRESSION"


class AmountType(StrEnum):
    FIXED = "FIXED"
    PERCENTAGE = "PERCENTAGE"
    FORMULA = "FORMULA"


class PayrunState(StrEnum):
    DRAFT = "DRAFT"
    COMPUTED = "COMPUTED"
    VALIDATED = "VALIDATED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class PayslipState(StrEnum):
    """Follows the parent payrun, except CANCELLED.

    CANCELLED may be set on a single payslip to drop one employee from a
    DRAFT or COMPUTED run (PRD section 3.9). It is also what the partial
    unique index excludes, so a cancelled payslip frees that employee's
    period for another payrun.
    """

    DRAFT = "DRAFT"
    COMPUTED = "COMPUTED"
    VALIDATED = "VALIDATED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class WarningSeverity(StrEnum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


class WarningCode(StrEnum):
    """Payroll warning vocabulary (PRD section 4.9).

    Defined here rather than in services/warnings.py so blocks that detect a
    condition before the persistence engine exists (B7) still emit the code
    the final system will use. Severity and gating live in the warnings
    service; this is only the vocabulary.
    """

    # --- contract resolution (B2) ---
    NO_ACTIVE_CONTRACT = "NO_ACTIVE_CONTRACT"
    OVERLAPPING_CONTRACTS = "OVERLAPPING_CONTRACTS"
    MULTI_CONTRACT_PERIOD = "MULTI_CONTRACT_PERIOD"
    PRORATED_PERIOD = "PRORATED_PERIOD"
    CONTRACT_EXPIRING = "CONTRACT_EXPIRING"

    # --- payslip integrity (B5, B7) ---
    NEGATIVE_NET = "NEGATIVE_NET"
    NO_STRUCTURE_RULES = "NO_STRUCTURE_RULES"
    PAYSLIP_NOT_RECONCILED = "PAYSLIP_NOT_RECONCILED"
    RULE_EVAL_FAILED = "RULE_EVAL_FAILED"
    RULE_FORWARD_REFERENCE = "RULE_FORWARD_REFERENCE"

    # --- time (B3, B4) ---
    MISSING_CHECKOUT = "MISSING_CHECKOUT"
    ATTENDANCE_ON_LEAVE_DAY = "ATTENDANCE_ON_LEAVE_DAY"
    HIGH_ABSENCE = "HIGH_ABSENCE"

    # --- payout (B7) ---
    MISSING_BANK_DETAILS = "MISSING_BANK_DETAILS"
    RECOMPUTE_REQUIRED = "RECOMPUTE_REQUIRED"
    # Payroll for a period that has not finished yet: days after today have
    # no attendance, so they read as absence and deduct a full day of pay.
    FUTURE_PERIOD = "FUTURE_PERIOD"

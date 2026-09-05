"""Domain enumerations.

Lives in `core` rather than `models` so that pure-policy modules (rbac) and
schemas can import the vocabulary without dragging in SQLAlchemy."""
from enum import IntEnum, StrEnum


class Role(StrEnum):
    """The five roles defined on page 3 of the problem statement."""

    EMPLOYEE = "EMPLOYEE"
    HR_MANAGER = "HR_MANAGER"
    HR_PAYROLL_USER = "HR_PAYROLL_USER"
    HR_PAYROLL_MANAGER = "HR_PAYROLL_MANAGER"
    ADMIN = "ADMIN"


class Weekday(IntEnum):
    """A day of the working week.

    An **IntEnum**, not a StrEnum like the rest of this module, and the value
    is `date.weekday()`'s: Monday is 0. That keeps three things working that a
    string would break - the column stays an integer so no data migration is
    needed, `line.day_of_week == day.weekday()` still compares directly, and
    sorting a schedule's lines still yields Monday first rather than
    alphabetical order (which would open the week on Friday).

    It replaces a bare `int` carrying a separate DAY_NAMES lookup list: two
    things that had to be kept in step, and could silently drift apart.
    """

    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4
    SATURDAY = 5
    SUNDAY = 6

    @property
    def label(self) -> str:
        """"Monday", for the schedule grid header."""
        return self.name.capitalize()

    @property
    def is_weekend(self) -> bool:
        return self in (Weekday.SATURDAY, Weekday.SUNDAY)


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


class HalfDay(StrEnum):
    """Which half of a single day a time-off request covers.

    Null on the request means a whole day, which is why this is not a boolean:
    "is_half_day = true" cannot say *which* half, and payroll does not care but
    the approver and the team calendar do - a morning off and an afternoon off
    are different arrangements on the same date.

    Only meaningful when date_from == date_to; the model rejects it otherwise.
    """

    FIRST_HALF = "FIRST_HALF"
    SECOND_HALF = "SECOND_HALF"


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

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
    PRESENT = "PRESENT"
    LATE = "LATE"
    ABSENT = "ABSENT"
    OVERTIME = "OVERTIME"
    MISSING_CHECKOUT = "MISSING_CHECKOUT"


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
    DRAFT = "DRAFT"
    COMPUTED = "COMPUTED"
    VALIDATED = "VALIDATED"
    PAID = "PAID"


class WarningSeverity(StrEnum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"

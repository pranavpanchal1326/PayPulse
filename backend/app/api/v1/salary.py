"""Salary structures and rules (spec A5, A6).

Everything about a rule is data. The scored behaviour is that a user edits
HRA from 40% to 50%, recomputes, and net salary moves - so nothing here may
be hardcoded, and rules must be creatable, editable, reorderable and
deletable.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import AccessContext, DbSession, require
from app.core.enums import AmountType
from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.core.rbac import Action, Resource
from app.models.contract import Contract
from app.models.salary import SalaryRule, SalaryStructure
from app.schemas.payroll import (
    FormulaCheckRequest,
    FormulaCheckResponse,
    ReorderRequest,
    SalaryRuleCreate,
    SalaryRuleOut,
    SalaryRuleUpdate,
    SalaryStructureCreate,
    SalaryStructureOut,
    SalaryStructureUpdate,
)
from app.services import formula

router = APIRouter(tags=["salary configuration"])

struct_read = Annotated[
    AccessContext, Depends(require(Resource.SALARY_STRUCTURE, Action.READ))
]
struct_write = Annotated[
    AccessContext, Depends(require(Resource.SALARY_STRUCTURE, Action.CREATE))
]
struct_update = Annotated[
    AccessContext, Depends(require(Resource.SALARY_STRUCTURE, Action.UPDATE))
]
rule_read = Annotated[
    AccessContext, Depends(require(Resource.SALARY_RULE, Action.READ))
]
rule_write = Annotated[
    AccessContext, Depends(require(Resource.SALARY_RULE, Action.CREATE))
]
rule_update = Annotated[
    AccessContext, Depends(require(Resource.SALARY_RULE, Action.UPDATE))
]
rule_delete = Annotated[
    AccessContext, Depends(require(Resource.SALARY_RULE, Action.DELETE))
]


def _employee_count(db: Session, structure_id: int) -> int:
    return (
        db.scalar(
            select(func.count(func.distinct(Contract.employee_id))).where(
                Contract.salary_structure_id == structure_id
            )
        )
        or 0
    )


def _structure_out(
    db: Session, structure: SalaryStructure, with_rules: bool = False
) -> SalaryStructureOut:
    return SalaryStructureOut(
        id=structure.id,
        name=structure.name,
        code=structure.code,
        description=structure.description,
        currency=structure.currency,
        is_active=structure.is_active,
        rule_count=len(structure.rules),
        employee_count=_employee_count(db, structure.id),
        rules=(
            [SalaryRuleOut.model_validate(r) for r in structure.rules]
            if with_rules
            else []
        ),
    )


def _assert_no_forward_reference(
    db: Session, rule: SalaryRule, structure_id: int
) -> None:
    """A rule may only read codes with a strictly lower sequence.

    Without this, drag-to-reorder can silently zero a rule: the referenced
    code simply has not been computed yet when the formula runs.
    """
    referenced: set[str] = set()
    if rule.amount_type is AmountType.FORMULA and rule.amount_formula:
        referenced |= formula.referenced_rule_codes(rule.amount_formula)
    if rule.condition_expr:
        referenced |= formula.referenced_rule_codes(rule.condition_expr)
    if rule.amount_type is AmountType.PERCENTAGE and rule.percentage_base_code:
        referenced.add(rule.percentage_base_code)
    if not referenced:
        return

    siblings = {
        row.code: row.sequence
        for row in db.scalars(
            select(SalaryRule).where(
                SalaryRule.structure_id == structure_id,
                SalaryRule.id != (rule.id or -1),
            )
        )
    }
    for code in sorted(referenced):
        if code not in siblings:
            raise BusinessRuleError(
                f"This rule references {code!r}, which does not exist in this "
                "structure.",
                code="unknown_rule_reference",
            )
        if siblings[code] >= rule.sequence:
            raise BusinessRuleError(
                f"This rule references {code!r} (sequence {siblings[code]}), "
                f"which is not evaluated before sequence {rule.sequence}. "
                "Rules may only read earlier results.",
                code="RULE_FORWARD_REFERENCE",
            )


def _validate_formulas(rule: SalaryRule) -> None:
    try:
        if rule.amount_type is AmountType.FORMULA and rule.amount_formula:
            formula.validate(rule.amount_formula)
        if rule.condition_expr:
            formula.validate(rule.condition_expr)
    except formula.FormulaError as exc:
        raise BusinessRuleError(str(exc), code="invalid_formula") from exc


# --- structures --------------------------------------------------------


@router.get("/salary-structures", response_model=list[SalaryStructureOut])
def list_structures(db: DbSession, _: struct_read) -> list[SalaryStructureOut]:
    rows = list(db.scalars(select(SalaryStructure).order_by(SalaryStructure.name)))
    return [_structure_out(db, s) for s in rows]


@router.get("/salary-structures/{structure_id}", response_model=SalaryStructureOut)
def get_structure(
    structure_id: int, db: DbSession, _: struct_read
) -> SalaryStructureOut:
    structure = db.get(SalaryStructure, structure_id)
    if structure is None:
        raise NotFoundError(f"Salary structure {structure_id} not found")
    return _structure_out(db, structure, with_rules=True)


@router.post(
    "/salary-structures",
    response_model=SalaryStructureOut,
    status_code=status.HTTP_201_CREATED,
)
def create_structure(
    payload: SalaryStructureCreate, db: DbSession, _: struct_write
) -> SalaryStructureOut:
    if db.scalar(
        select(SalaryStructure).where(SalaryStructure.code == payload.code)
    ):
        raise ConflictError(f"A structure with code {payload.code!r} already exists")
    structure = SalaryStructure(**payload.model_dump())
    db.add(structure)
    db.commit()
    db.refresh(structure)
    return _structure_out(db, structure)


@router.patch("/salary-structures/{structure_id}", response_model=SalaryStructureOut)
def update_structure(
    structure_id: int,
    payload: SalaryStructureUpdate,
    db: DbSession,
    _: struct_update,
) -> SalaryStructureOut:
    structure = db.get(SalaryStructure, structure_id)
    if structure is None:
        raise NotFoundError(f"Salary structure {structure_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(structure, field, value)
    db.commit()
    db.refresh(structure)
    return _structure_out(db, structure, with_rules=True)


@router.post(
    "/salary-structures/{structure_id}/reorder", response_model=SalaryStructureOut
)
def reorder_rules(
    structure_id: int, payload: ReorderRequest, db: DbSession, _: rule_update
) -> SalaryStructureOut:
    """Drag-to-reorder (spec A5). Sequences are rewritten in steps of 10 so
    a rule can later be inserted between two without another reorder."""
    structure = db.get(SalaryStructure, structure_id)
    if structure is None:
        raise NotFoundError(f"Salary structure {structure_id} not found")

    rules = {r.id: r for r in structure.rules}
    if set(payload.rule_ids) != set(rules):
        raise BusinessRuleError(
            "rule_ids must list every rule in this structure exactly once.",
            code="incomplete_reorder",
        )

    for position, rule_id in enumerate(payload.rule_ids, start=1):
        rules[rule_id].sequence = position * 10
    db.flush()

    for rule in structure.rules:
        _assert_no_forward_reference(db, rule, structure_id)

    db.commit()
    db.refresh(structure)
    return _structure_out(db, structure, with_rules=True)


# --- rules -------------------------------------------------------------


@router.get("/salary-rules", response_model=list[SalaryRuleOut])
def list_rules(
    db: DbSession, _: rule_read, structure_id: int | None = None
) -> list[SalaryRuleOut]:
    stmt = select(SalaryRule).order_by(SalaryRule.structure_id, SalaryRule.sequence)
    if structure_id is not None:
        stmt = stmt.where(SalaryRule.structure_id == structure_id)
    return [SalaryRuleOut.model_validate(r) for r in db.scalars(stmt)]


@router.post(
    "/salary-rules", response_model=SalaryRuleOut, status_code=status.HTTP_201_CREATED
)
def create_rule(
    payload: SalaryRuleCreate, db: DbSession, _: rule_write
) -> SalaryRuleOut:
    if db.get(SalaryStructure, payload.structure_id) is None:
        raise NotFoundError(f"Salary structure {payload.structure_id} not found")
    if db.scalar(
        select(SalaryRule).where(
            SalaryRule.structure_id == payload.structure_id,
            SalaryRule.code == payload.code,
        )
    ):
        raise ConflictError(
            f"Rule {payload.code!r} already exists in this structure",
            code="duplicate_rule_code",
        )

    rule = SalaryRule(**payload.model_dump())
    _validate_formulas(rule)
    _assert_no_forward_reference(db, rule, payload.structure_id)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return SalaryRuleOut.model_validate(rule)


@router.patch("/salary-rules/{rule_id}", response_model=SalaryRuleOut)
def update_rule(
    rule_id: int, payload: SalaryRuleUpdate, db: DbSession, _: rule_update
) -> SalaryRuleOut:
    """The scored edit: change HRA 40% -> 50%, recompute, watch net move."""
    rule = db.get(SalaryRule, rule_id)
    if rule is None:
        raise NotFoundError(f"Salary rule {rule_id} not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    _validate_formulas(rule)
    _assert_no_forward_reference(db, rule, rule.structure_id)

    db.commit()
    db.refresh(rule)
    return SalaryRuleOut.model_validate(rule)


@router.delete("/salary-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, db: DbSession, _: rule_delete) -> None:
    """Seeded rules must be deletable - the brief requires it, and the demo
    deletes one. Already-computed payslip lines are unaffected: they
    denormalise the rule's code and name."""
    rule = db.get(SalaryRule, rule_id)
    if rule is None:
        raise NotFoundError(f"Salary rule {rule_id} not found")

    dependents = [
        other.code
        for other in db.scalars(
            select(SalaryRule).where(
                SalaryRule.structure_id == rule.structure_id,
                SalaryRule.id != rule.id,
            )
        )
        if rule.code in formula.referenced_rule_codes(other.amount_formula or "")
        or other.percentage_base_code == rule.code
    ]
    if dependents:
        raise ConflictError(
            f"{', '.join(sorted(dependents))} reference {rule.code}. Update "
            "them first, or this payslip would silently lose a line.",
            code="rule_has_dependents",
        )

    db.delete(rule)
    db.commit()


@router.post("/salary-rules/validate-formula", response_model=FormulaCheckResponse)
def validate_formula(
    payload: FormulaCheckRequest, db: DbSession, _: rule_read
) -> FormulaCheckResponse:
    """Dry-run a formula against a sample context, so the author sees a real
    number rather than just "valid"."""

    class Namespace:
        def __init__(self, **values):
            self.__dict__.update(values)

    context = {
        "contract": Namespace(
            wage=payload.wage,
            daily_hours=Decimal("8"),
            hours_per_week=Decimal("40"),
        ),
        "employee": Namespace(employee_type="FULL_TIME", department="Engineering"),
        "rules": Namespace(
            BASIC=payload.wage / 2, HRA=payload.wage / 5, DA=payload.wage / 10
        ),
        "categories": Namespace(
            BASIC=payload.wage / 2,
            ALLOWANCE=payload.wage / 3,
            GROSS=payload.wage,
            DEDUCTION=Decimal("2000"),
            NET=payload.wage - Decimal("2000"),
        ),
        "period_days": payload.period_days,
        "contract_days": payload.contract_days,
        "payable_days": payload.contract_days,
        "worked_days": payload.contract_days,
        "unpaid_days": 0,
        "paid_leave_days": 0,
        "unpaid_leave_days": 0,
        "absent_days": 0,
        "worked_hours": Decimal("176"),
        "overtime_hours": Decimal("4"),
    }
    try:
        result = formula.evaluate(payload.expression, context)
    except formula.FormulaError as exc:
        return FormulaCheckResponse(
            valid=False,
            error=str(exc),
            references=sorted(formula.referenced_rule_codes(payload.expression)),
        )
    return FormulaCheckResponse(
        valid=True,
        sample_result=result.quantize(Decimal("0.01")),
        references=sorted(formula.referenced_rule_codes(payload.expression)),
    )

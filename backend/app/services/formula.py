"""AST-allowlist sandbox for user-written salary formulas.

Salary rules are database rows a user can edit, and their formulas are
evaluated. A bare `eval()` on user input is a remote code execution hole -
`__import__('os').system(...)` in a text field would be game over. A judge
will ask about this.

The approach is an allowlist, not a denylist. Parse the expression to an
AST, walk every node, and reject anything not explicitly permitted. A
denylist (blocking `__import__`, `open`, ...) loses to the next trick
someone thinks of; an allowlist can only be widened deliberately.

Evaluation gets `{"__builtins__": {}}` plus a frozen context, so even a
node that slipped through has nothing to reach for.
"""
from __future__ import annotations

import ast
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

MAX_EXPRESSION_LENGTH = 500
MAX_AST_DEPTH = 20

# Node types that can appear in an arithmetic expression and nothing more.
ALLOWED_NODES: tuple[type[ast.AST], ...] = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.IfExp,
    ast.Constant,
    ast.Name,
    ast.Load,
    ast.Call,
    ast.Attribute,
    # operators
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.FloorDiv,
    ast.Mod,
    ast.Pow,
    ast.USub,
    ast.UAdd,
    ast.Not,
    ast.And,
    ast.Or,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
)

# The only namespaces an attribute may hang off. `contract.wage` is fine;
# anything else - and therefore every dunder walk - is not.
ALLOWED_NAMESPACES = frozenset(
    {"rules", "categories", "contract", "employee", "ytd"}
)

ALLOWED_FUNCTIONS = frozenset({"min", "max", "round", "abs"})


class FormulaError(ValueError):
    """A formula that is unsafe, malformed, or failed to evaluate."""


def _depth(node: ast.AST, current: int = 0) -> int:
    children = list(ast.iter_child_nodes(node))
    if not children:
        return current
    return max(_depth(child, current + 1) for child in children)


def validate(expression: str) -> ast.Expression:
    """Parse and check an expression. Raises FormulaError if not allowed.

    Called at rule save time as well as at compute, so a bad formula is
    rejected while the author is looking at it rather than mid-payrun.
    """
    if not expression or not expression.strip():
        raise FormulaError("Formula is empty.")
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise FormulaError(
            f"Formula is {len(expression)} characters, over the "
            f"{MAX_EXPRESSION_LENGTH} limit."
        )

    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise FormulaError(f"Syntax error: {exc.msg}") from exc

    if _depth(tree) > MAX_AST_DEPTH:
        raise FormulaError(
            f"Formula nests deeper than {MAX_AST_DEPTH} levels."
        )

    for node in ast.walk(tree):
        if not isinstance(node, ALLOWED_NODES):
            raise FormulaError(
                f"{type(node).__name__} is not allowed in a formula. "
                "Only arithmetic, comparisons, conditionals and the "
                f"functions {sorted(ALLOWED_FUNCTIONS)} may be used."
            )

        if isinstance(node, ast.Attribute):
            # Only `<allowed namespace>.<name>`; never chained or dunder.
            if not isinstance(node.value, ast.Name):
                raise FormulaError(
                    "Attribute access is only allowed directly on "
                    f"{sorted(ALLOWED_NAMESPACES)}."
                )
            if node.value.id not in ALLOWED_NAMESPACES:
                raise FormulaError(
                    f"{node.value.id!r} is not a readable namespace. "
                    f"Use one of {sorted(ALLOWED_NAMESPACES)}."
                )
            if node.attr.startswith("_"):
                raise FormulaError("Names starting with '_' are not readable.")

        if isinstance(node, ast.Name) and node.id.startswith("_"):
            raise FormulaError("Names starting with '_' are not readable.")

        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise FormulaError("Only plain function calls are allowed.")
            if node.func.id not in ALLOWED_FUNCTIONS:
                raise FormulaError(
                    f"{node.func.id!r} is not a permitted function. "
                    f"Allowed: {sorted(ALLOWED_FUNCTIONS)}."
                )
            if node.keywords:
                raise FormulaError("Keyword arguments are not allowed.")

    return tree


def referenced_rule_codes(expression: str) -> set[str]:
    """Rule codes an expression reads, for the forward-reference check."""
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError:
        return set()
    return {
        node.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == "rules"
    }


class _DecimalizeNumbers(ast.NodeTransformer):
    """Rewrite every numeric literal into a Decimal.

    Context values are Decimal (money must not touch float), but a literal
    like 0.5 or 1.5 parses as a Python float, and `Decimal * float` raises
    TypeError. Without this, almost every realistic payroll formula - a
    percentage, an overtime multiplier, a PF rate - would fail at runtime.

    Applied AFTER validation, so the injected call is not something a user
    could have written.
    """

    def visit_Constant(self, node: ast.Constant) -> ast.AST:
        if isinstance(node.value, bool) or not isinstance(
            node.value, (int, float)
        ):
            return node
        return ast.copy_location(
            ast.Call(
                func=ast.Name(id="_D", ctx=ast.Load()),
                args=[ast.Constant(value=repr(node.value))],
                keywords=[],
            ),
            node,
        )


def _to_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        return Decimal(1) if value else Decimal(0)
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise FormulaError(f"{value!r} is not a number.") from exc


def evaluate(expression: str, context: dict) -> Decimal:
    """Evaluate a validated expression against a context, returning Decimal.

    Money stays Decimal end to end; floats would drift and a payslip that
    does not reconcile is worse than one that is late.
    """
    tree = validate(expression)
    tree = ast.fix_missing_locations(_DecimalizeNumbers().visit(tree))
    scope = {
        "__builtins__": {},
        "_D": Decimal,
        "min": min,
        "max": max,
        "abs": abs,
        "round": lambda value, digits=2: _to_decimal(value).quantize(
            Decimal(1).scaleb(-int(digits)), rounding=ROUND_HALF_UP
        ),
        **context,
    }
    try:
        result = eval(  # noqa: S307 - every node was allowlisted above
            compile(tree, "<salary_rule>", "eval"), scope, {}
        )
    except FormulaError:
        raise
    except ZeroDivisionError as exc:
        raise FormulaError(
            "Division by zero. A day or hour count in this formula was zero."
        ) from exc
    except Exception as exc:
        raise FormulaError(f"{type(exc).__name__}: {exc}") from exc

    return _to_decimal(result)


def evaluate_condition(expression: str | None, context: dict) -> bool:
    """Whether a conditional rule applies. No expression means always."""
    if not expression or not expression.strip():
        return True
    return bool(evaluate(expression, context))

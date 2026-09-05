"""B5-B7: salary structures and rules, payruns, payslips, lines, warnings.

Also promotes contract.salary_structure_id to a real foreign key, which it
could not be in 0003 because salary_structure did not exist yet - the same
staging 0001 used for app_user.employee_id.

Revision ID: 0007_b5_payroll
Revises: 0006_b4_timeoff
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_b5_payroll"
down_revision: str | None = "0006_b4_timeoff"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TIMESTAMPS = (
    sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        nullable=False,
    ),
    sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        nullable=False,
    ),
)


def upgrade() -> None:
    op.create_table(
        "salary_structure",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="INR"
        ),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        *_TIMESTAMPS,
    )
    op.create_index(
        "ix_salary_structure_name", "salary_structure", ["name"], unique=True
    )
    op.create_index(
        "ix_salary_structure_code", "salary_structure", ["code"], unique=True
    )

    op.create_table(
        "salary_rule",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "structure_id",
            sa.Integer(),
            sa.ForeignKey("salary_structure.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        # Ascending evaluation order - the brief's fourth hard part.
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column(
            "condition_type",
            sa.String(length=16),
            nullable=False,
            server_default="ALWAYS",
        ),
        sa.Column("condition_expr", sa.Text(), nullable=True),
        sa.Column(
            "amount_type",
            sa.String(length=16),
            nullable=False,
            server_default="FIXED",
        ),
        sa.Column("amount_fixed", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("percentage", sa.Numeric(precision=6, scale=3), nullable=True),
        sa.Column("percentage_base_code", sa.String(length=20), nullable=True),
        sa.Column("amount_formula", sa.Text(), nullable=True),
        sa.Column(
            "appears_on_payslip",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.UniqueConstraint("structure_id", "code", name="uq_salary_rule_code"),
        sa.CheckConstraint("sequence > 0", name="ck_salary_rule_sequence_positive"),
        *_TIMESTAMPS,
    )
    op.create_index("ix_salary_rule_structure_id", "salary_rule", ["structure_id"])
    op.create_index("ix_salary_rule_code", "salary_rule", ["code"])
    op.create_index("ix_salary_rule_category", "salary_rule", ["category"])
    op.create_index("ix_salary_rule_sequence", "salary_rule", ["sequence"])

    op.create_table(
        "payrun",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column(
            "salary_structure_id",
            sa.Integer(),
            sa.ForeignKey("salary_structure.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="INR"
        ),
        sa.Column(
            "state", sa.String(length=32), nullable=False, server_default="DRAFT"
        ),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "paid_by_id",
            sa.Integer(),
            sa.ForeignKey("app_user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("force_paid_reason", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "period_end >= period_start", name="ck_payrun_period_order"
        ),
        *_TIMESTAMPS,
    )
    op.create_index("ix_payrun_structure_id", "payrun", ["salary_structure_id"])
    op.create_index("ix_payrun_state", "payrun", ["state"])
    op.create_index("ix_payrun_period_start", "payrun", ["period_start"])
    op.create_index("ix_payrun_period_end", "payrun", ["period_end"])

    op.create_table(
        "payslip",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "payrun_id",
            sa.Integer(),
            sa.ForeignKey("payrun.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employee.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contract_id",
            sa.Integer(),
            sa.ForeignKey("contract.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="INR"
        ),
        sa.Column(
            "basic", sa.Numeric(precision=12, scale=2), server_default="0"
        ),
        sa.Column(
            "gross", sa.Numeric(precision=12, scale=2), server_default="0"
        ),
        sa.Column(
            "total_deductions", sa.Numeric(precision=12, scale=2), server_default="0"
        ),
        sa.Column("net", sa.Numeric(precision=12, scale=2), server_default="0"),
        sa.Column("period_days", sa.Integer(), server_default="0"),
        sa.Column("contract_days", sa.Integer(), server_default="0"),
        sa.Column("payable_days", sa.Integer(), server_default="0"),
        sa.Column("unpaid_days", sa.Integer(), server_default="0"),
        sa.Column("paid_leave_days", sa.Integer(), server_default="0"),
        sa.Column("unpaid_leave_days", sa.Integer(), server_default="0"),
        sa.Column("absent_days", sa.Integer(), server_default="0"),
        sa.Column(
            "worked_hours", sa.Numeric(precision=7, scale=2), server_default="0"
        ),
        sa.Column(
            "overtime_hours", sa.Numeric(precision=7, scale=2), server_default="0"
        ),
        sa.Column(
            "state", sa.String(length=32), nullable=False, server_default="DRAFT"
        ),
        sa.UniqueConstraint("payrun_id", "employee_id", name="uq_payslip_employee"),
        *_TIMESTAMPS,
    )
    op.create_index("ix_payslip_payrun_id", "payslip", ["payrun_id"])
    op.create_index("ix_payslip_employee_id", "payslip", ["employee_id"])
    op.create_index("ix_payslip_state", "payslip", ["state"])
    op.create_index(
        "ix_payslip_employee_period", "payslip", ["employee_id", "period_start"]
    )
    # Structural duplicate prevention (spec B6/B9): one live payslip per
    # employee per period, enforced rather than merely warned about.
    op.execute(
        """
        CREATE UNIQUE INDEX payslip_one_per_employee_period
          ON payslip (employee_id, period_start, period_end)
          WHERE state <> 'CANCELLED'
        """
    )

    op.create_table(
        "payslip_line",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "payslip_id",
            sa.Integer(),
            sa.ForeignKey("payslip.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Denormalised so the line stays readable after its rule is edited
        # or deleted - which the brief explicitly allows.
        sa.Column("rule_code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column(
            "quantity", sa.Numeric(precision=8, scale=2), server_default="1"
        ),
        sa.Column("rate", sa.Numeric(precision=12, scale=3), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
    )
    op.create_index("ix_payslip_line_payslip_id", "payslip_line", ["payslip_id"])

    op.create_table(
        "payroll_warning",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "payrun_id",
            sa.Integer(),
            sa.ForeignKey("payrun.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "payslip_id",
            sa.Integer(),
            sa.ForeignKey("payslip.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employee.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        *_TIMESTAMPS,
    )
    op.create_index("ix_payroll_warning_payrun_id", "payroll_warning", ["payrun_id"])
    op.create_index(
        "ix_payroll_warning_payslip_id", "payroll_warning", ["payslip_id"]
    )
    op.create_index("ix_payroll_warning_code", "payroll_warning", ["code"])
    op.create_index("ix_payroll_warning_severity", "payroll_warning", ["severity"])

    # 0003 left this a bare integer because salary_structure did not exist.
    op.create_foreign_key(
        "fk_contract_salary_structure_id",
        "contract",
        "salary_structure",
        ["salary_structure_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_contract_salary_structure_id", "contract", type_="foreignkey"
    )
    op.drop_table("payroll_warning")
    op.drop_table("payslip_line")
    op.execute("DROP INDEX IF EXISTS payslip_one_per_employee_period")
    op.drop_table("payslip")
    op.drop_table("payrun")
    op.drop_table("salary_rule")
    op.drop_table("salary_structure")

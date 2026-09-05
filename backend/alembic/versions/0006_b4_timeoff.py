"""B4: time off types, allocations and requests.

Revision ID: 0006_b4_timeoff
Revises: 0005_b3_attendance
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_b4_timeoff"
down_revision: str | None = "0005_b3_attendance"
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
        "time_off_type",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column(
            "unit", sa.String(length=16), nullable=False, server_default="DAYS"
        ),
        # False makes every approved day of this type an LWP deduction.
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "requires_allocation",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("color", sa.String(length=16), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        *_TIMESTAMPS,
    )
    op.create_index("ix_time_off_type_name", "time_off_type", ["name"], unique=True)
    op.create_index("ix_time_off_type_code", "time_off_type", ["code"], unique=True)

    op.create_table(
        "leave_allocation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employee.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "time_off_type_id",
            sa.Integer(),
            sa.ForeignKey("time_off_type.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("days", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("validity_from", sa.Date(), nullable=False),
        sa.Column("validity_to", sa.Date(), nullable=True),
        sa.Column(
            "state", sa.String(length=32), nullable=False, server_default="DRAFT"
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.CheckConstraint("days > 0", name="ck_allocation_days_positive"),
        sa.CheckConstraint(
            "validity_to IS NULL OR validity_to >= validity_from",
            name="ck_allocation_validity_order",
        ),
        *_TIMESTAMPS,
    )
    op.create_index(
        "ix_leave_allocation_employee_id", "leave_allocation", ["employee_id"]
    )
    op.create_index(
        "ix_leave_allocation_type_id", "leave_allocation", ["time_off_type_id"]
    )
    op.create_index("ix_leave_allocation_state", "leave_allocation", ["state"])

    op.create_table(
        "time_off_request",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employee.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "time_off_type_id",
            sa.Integer(),
            sa.ForeignKey("time_off_type.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date_from", sa.Date(), nullable=False),
        sa.Column("date_to", sa.Date(), nullable=False),
        # Schedule- and holiday-aware, frozen at write time so payroll reads
        # exactly the number that was approved.
        sa.Column(
            "duration_days",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("duration_hours", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column(
            "state", sa.String(length=32), nullable=False, server_default="DRAFT"
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "approver_id",
            sa.Integer(),
            sa.ForeignKey("app_user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.CheckConstraint("date_to >= date_from", name="ck_request_date_order"),
        sa.CheckConstraint(
            "duration_days >= 0", name="ck_request_duration_positive"
        ),
        *_TIMESTAMPS,
    )
    op.create_index(
        "ix_time_off_request_employee_id", "time_off_request", ["employee_id"]
    )
    op.create_index(
        "ix_time_off_request_type_id", "time_off_request", ["time_off_type_id"]
    )
    op.create_index("ix_time_off_request_state", "time_off_request", ["state"])
    op.create_index("ix_time_off_request_date_from", "time_off_request", ["date_from"])
    op.create_index("ix_time_off_request_date_to", "time_off_request", ["date_to"])
    # The payroll hot path: one employee's approved leave across a period.
    op.create_index(
        "ix_time_off_request_lookup",
        "time_off_request",
        ["employee_id", "state", "date_from"],
    )


def downgrade() -> None:
    for index in (
        "ix_time_off_request_lookup",
        "ix_time_off_request_date_to",
        "ix_time_off_request_date_from",
        "ix_time_off_request_state",
        "ix_time_off_request_type_id",
        "ix_time_off_request_employee_id",
    ):
        op.drop_index(index, table_name="time_off_request")
    op.drop_table("time_off_request")

    for index in (
        "ix_leave_allocation_state",
        "ix_leave_allocation_type_id",
        "ix_leave_allocation_employee_id",
    ):
        op.drop_index(index, table_name="leave_allocation")
    op.drop_table("leave_allocation")

    op.drop_index("ix_time_off_type_code", table_name="time_off_type")
    op.drop_index("ix_time_off_type_name", table_name="time_off_type")
    op.drop_table("time_off_type")

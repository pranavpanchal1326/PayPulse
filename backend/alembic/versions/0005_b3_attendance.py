"""B3: daily attendance.

Two things are enforced in the database rather than in Python:
UNIQUE (employee_id, work_date) so a second check-in cannot silently double
someone's hours, and a CHECK that a manual edit always carries a reason -
spec B3 restricts corrections to authorised users, and the dashboard counts
those edits, which is only meaningful if each one is explained.

Revision ID: 0005_b3_attendance
Revises: 0004_b25_holiday
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_b3_attendance"
down_revision: str | None = "0004_b25_holiday"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "attendance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employee.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # The calendar day in APP_TIMEZONE that check_in falls on.
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("check_in", sa.DateTime(timezone=True), nullable=False),
        sa.Column("check_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "break_minutes", sa.Integer(), nullable=False, server_default="0"
        ),
        # Computed by services/attendance_service, never client-supplied.
        sa.Column(
            "worked_hours",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "overtime_hours",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "is_manual_edit", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "edited_by_id",
            sa.Integer(),
            sa.ForeignKey("app_user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("edit_reason", sa.Text(), nullable=True),
        sa.Column(
            "is_holiday", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.UniqueConstraint("employee_id", "work_date", name="uq_attendance_day"),
        sa.CheckConstraint("break_minutes >= 0", name="ck_attendance_break_positive"),
        sa.CheckConstraint(
            "worked_hours >= 0 AND worked_hours <= 16",
            name="ck_attendance_worked_hours_range",
        ),
        sa.CheckConstraint(
            "edit_reason IS NOT NULL OR is_manual_edit = false",
            name="ck_attendance_edit_needs_reason",
        ),
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

    op.create_index("ix_attendance_employee_id", "attendance", ["employee_id"])
    op.create_index("ix_attendance_work_date", "attendance", ["work_date"])
    op.create_index("ix_attendance_status", "attendance", ["status"])
    op.create_index("ix_attendance_is_manual_edit", "attendance", ["is_manual_edit"])
    # The payroll hot path: one employee's rows across a period.
    op.create_index(
        "ix_attendance_employee_period", "attendance", ["employee_id", "work_date"]
    )


def downgrade() -> None:
    for index in (
        "ix_attendance_employee_period",
        "ix_attendance_is_manual_edit",
        "ix_attendance_status",
        "ix_attendance_work_date",
        "ix_attendance_employee_id",
    ):
        op.drop_index(index, table_name="attendance")
    op.drop_table("attendance")

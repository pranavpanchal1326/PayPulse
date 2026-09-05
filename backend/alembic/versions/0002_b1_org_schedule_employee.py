"""B1: departments, job positions, working schedules and the employee hub.

Also promotes app_user.employee_id to a real foreign key, which it could not
be in 0001 because the employee table did not exist yet.

Revision ID: 0002_b1_core
Revises: 0001_initial
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_b1_core"
down_revision: str | None = "0001_initial"
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
        "department",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        *_TIMESTAMPS,
    )
    op.create_index("ix_department_name", "department", ["name"], unique=True)

    op.create_table(
        "job_position",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("department.id", ondelete="SET NULL"),
            nullable=True,
        ),
        *_TIMESTAMPS,
    )
    op.create_index("ix_job_position_name", "job_position", ["name"])
    op.create_index(
        "ix_job_position_department_id", "job_position", ["department_id"]
    )

    op.create_table(
        "working_schedule",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        # Derived from working_schedule_line; spec A3 forbids manual entry.
        sa.Column(
            "hours_per_week",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default="0",
        ),
        *_TIMESTAMPS,
    )
    op.create_index(
        "ix_working_schedule_name", "working_schedule", ["name"], unique=True
    )

    op.create_table(
        "working_schedule_line",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "schedule_id",
            sa.Integer(),
            sa.ForeignKey("working_schedule.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column(
            "break_minutes", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.UniqueConstraint(
            "schedule_id", "day_of_week", name="uq_schedule_line_day"
        ),
        sa.CheckConstraint(
            "day_of_week >= 0 AND day_of_week <= 6",
            name="ck_schedule_line_day_range",
        ),
        sa.CheckConstraint(
            "break_minutes >= 0", name="ck_schedule_line_break_positive"
        ),
    )
    op.create_index(
        "ix_working_schedule_line_schedule_id",
        "working_schedule_line",
        ["schedule_id"],
    )

    op.create_table(
        "employee",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("first_name", sa.String(length=80), nullable=False),
        sa.Column("last_name", sa.String(length=80), nullable=False),
        sa.Column("work_email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("department.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "job_position_id",
            sa.Integer(),
            sa.ForeignKey("job_position.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "working_schedule_id",
            sa.Integer(),
            sa.ForeignKey("working_schedule.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "manager_id",
            sa.Integer(),
            sa.ForeignKey("employee.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "employee_type",
            sa.String(length=32),
            nullable=False,
            server_default="FULL_TIME",
        ),
        sa.Column("date_of_joining", sa.Date(), nullable=False),
        sa.Column("date_of_exit", sa.Date(), nullable=True),
        sa.Column(
            "status", sa.String(length=32), nullable=False, server_default="ACTIVE"
        ),
        sa.Column("bank_account", sa.String(length=34), nullable=True),
        sa.Column("bank_ifsc", sa.String(length=11), nullable=True),
        sa.CheckConstraint(
            "date_of_exit IS NULL OR date_of_exit >= date_of_joining",
            name="ck_employee_exit_after_joining",
        ),
        *_TIMESTAMPS,
    )
    op.create_index("ix_employee_work_email", "employee", ["work_email"], unique=True)
    for column in (
        "department_id",
        "job_position_id",
        "working_schedule_id",
        "manager_id",
        "employee_type",
        "status",
    ):
        op.create_index(f"ix_employee_{column}", "employee", [column])

    # 0001 left this as a bare integer because employee did not exist yet.
    op.create_foreign_key(
        "fk_app_user_employee_id",
        "app_user",
        "employee",
        ["employee_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_app_user_employee_id", "app_user", type_="foreignkey")

    for column in (
        "department_id",
        "job_position_id",
        "working_schedule_id",
        "manager_id",
        "employee_type",
        "status",
    ):
        op.drop_index(f"ix_employee_{column}", table_name="employee")
    op.drop_index("ix_employee_work_email", table_name="employee")
    op.drop_table("employee")

    op.drop_index(
        "ix_working_schedule_line_schedule_id", table_name="working_schedule_line"
    )
    op.drop_table("working_schedule_line")
    op.drop_index("ix_working_schedule_name", table_name="working_schedule")
    op.drop_table("working_schedule")

    op.drop_index("ix_job_position_department_id", table_name="job_position")
    op.drop_index("ix_job_position_name", table_name="job_position")
    op.drop_table("job_position")

    op.drop_index("ix_department_name", table_name="department")
    op.drop_table("department")

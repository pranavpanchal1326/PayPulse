"""B15: half-day leave.

Two changes, one feature. `time_off_request.half_day` records which half of a
single day a request covers, and the payslip's leave-derived day counts become
Numeric so half of one can be deducted. `period_days` and `contract_days` stay
integers: a period and an employment window begin and end on date boundaries.

The API contract has described these five as decimal strings from the start;
the columns are what was lagging.

Revision ID: 0011_b15_half_day
Revises: 0010_b14_payslip_uq
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0011_b15_half_day"
down_revision: str | None = "0010_b14_payslip_uq"
branch_labels = None
depends_on = None

_FRACTIONAL = ("payable_days", "unpaid_days", "paid_leave_days", "unpaid_leave_days")


def upgrade() -> None:
    op.add_column(
        "time_off_request",
        sa.Column("half_day", sa.String(length=16), nullable=True),
    )
    op.create_check_constraint(
        "ck_request_half_day_is_single_day",
        "time_off_request",
        "half_day IS NULL OR date_from = date_to",
    )
    for column in _FRACTIONAL:
        op.alter_column(
            "payslip",
            column,
            type_=sa.Numeric(6, 2),
            existing_type=sa.Integer(),
            server_default="0.00",
        )


def downgrade() -> None:
    for column in _FRACTIONAL:
        op.alter_column(
            "payslip",
            column,
            type_=sa.Integer(),
            existing_type=sa.Numeric(6, 2),
            postgresql_using=f"round({column})::integer",
            server_default="0",
        )
    op.drop_constraint("ck_request_half_day_is_single_day", "time_off_request")
    op.drop_column("time_off_request", "half_day")

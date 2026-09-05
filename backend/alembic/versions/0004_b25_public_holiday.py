"""B2.5: the public holiday calendar.

Three columns, but every day number in the product is downstream of it:
without holidays, period_days counts Diwali as a working day, which inflates
the pay denominator and mis-prorates every joiner and leaver.

Revision ID: 0004_b25_holiday
Revises: 0003_b2_contract
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_b25_holiday"
down_revision: str | None = "0003_b2_contract"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "public_holiday",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "is_optional", sa.Boolean(), nullable=False, server_default=sa.false()
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
    # Unique so the seed cannot double-count a day, and indexed because the
    # payroll engine range-scans it once per payrun.
    op.create_index(
        "ix_public_holiday_date", "public_holiday", ["date"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_public_holiday_date", table_name="public_holiday")
    op.drop_table("public_holiday")

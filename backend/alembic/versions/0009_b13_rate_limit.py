"""B13: move the rate-limit counter into the database.

The limiter was an in-process dictionary, which gives each worker its own
counter and therefore a caller N times the intended allowance. One row per
key here instead, shared by every process.

Revision ID: 0009_b13_rate_limit
Revises: 0008_b12_token_revocation
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0009_b13_rate_limit"
down_revision: str | None = "0008_b12_token_revocation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rate_limit",
        sa.Column("key", sa.String(length=255), primary_key=True),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hits", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("rate_limit")

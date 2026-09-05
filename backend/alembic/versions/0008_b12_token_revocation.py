"""B12: make refresh tokens revocable.

Refresh tokens live for days and were checked only for signature and expiry,
so a leaked one could not be cancelled short of disabling the account. This
adds the cutoff that logout stamps.

Revision ID: 0008_b12_token_revocation
Revises: 0007_b5_payroll
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0008_b12_token_revocation"
down_revision: str | None = "0007_b5_payroll"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_user",
        sa.Column("tokens_valid_from", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("app_user", "tokens_valid_from")

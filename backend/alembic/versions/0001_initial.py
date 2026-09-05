"""Initial schema: users, plus the extensions later migrations rely on.

Revision ID: 0001_initial
Revises:
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Needed by the contract overlap exclusion constraint added in B2.
    # Created here so the extension is never a surprise mid-hackathon.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.create_table(
        "app_user",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.String(length=32),
            nullable=False,
            server_default="EMPLOYEE",
        ),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column("employee_id", sa.Integer(), nullable=True),
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
    op.create_index("ix_app_user_email", "app_user", ["email"], unique=True)
    op.create_index("ix_app_user_role", "app_user", ["role"])
    op.create_index("ix_app_user_employee_id", "app_user", ["employee_id"])


def downgrade() -> None:
    op.drop_index("ix_app_user_employee_id", table_name="app_user")
    op.drop_index("ix_app_user_role", table_name="app_user")
    op.drop_index("ix_app_user_email", table_name="app_user")
    op.drop_table("app_user")

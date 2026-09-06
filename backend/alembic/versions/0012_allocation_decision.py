"""Allocation decisions carry an approver and a note.

`time_off_request` has recorded *who* decided and *why* since B4; the
allocation that funds it recorded neither. Refusing somebody's leave balance
was therefore an unattributable, unexplained act — the same audit gap the
request flow closed, still open one table over.

Both columns mirror `time_off_request` exactly, including the `SET NULL`
approver: a decision outlives the account that made it, and deleting a user
must not delete the record that they decided.

Revision ID: 0012_allocation_decision
Revises: 0011_b15_half_day
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0012_allocation_decision"
down_revision: str | None = "0011_b15_half_day"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leave_allocation",
        sa.Column("approver_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_leave_allocation_approver_id_app_user",
        "leave_allocation",
        "app_user",
        ["approver_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "leave_allocation",
        sa.Column("decision_note", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("leave_allocation", "decision_note")
    op.drop_constraint(
        "fk_leave_allocation_approver_id_app_user",
        "leave_allocation",
        type_="foreignkey",
    )
    op.drop_column("leave_allocation", "approver_id")

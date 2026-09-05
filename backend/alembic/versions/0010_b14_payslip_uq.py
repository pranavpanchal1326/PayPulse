"""B14: drop the redundant payslip unique constraint.

`uq_payslip_employee` on (payrun_id, employee_id) duplicated work the partial
index `payslip_one_per_employee_period` already does: every payslip in a
payrun carries that payrun's period, so any duplicate pair is also a duplicate
(employee, period) and the index rejects it first. The only case the
constraint added was a second CANCELLED payslip for one employee in one run,
which nothing cares about.

Revision ID: 0010_b14_payslip_uq
Revises: 0009_b13_rate_limit
"""
from __future__ import annotations

from alembic import op

# Keep revision ids under 32 characters: alembic_version.version_num is
# varchar(32), and a longer one fails only *after* the DDL has run.
revision: str = "0010_b14_payslip_uq"
down_revision: str | None = "0009_b13_rate_limit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_payslip_employee", "payslip", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_payslip_employee", "payslip", ["payrun_id", "employee_id"]
    )

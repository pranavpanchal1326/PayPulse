"""B2: employment contracts, with overlap made impossible in the database.

The exclusion constraint is the point of this migration. Spec A2 requires
"avoiding concurrent active contracts", and enforcing that in Python would
leave a race between two concurrent requests. Postgres enforces it instead.

Note the '[]' bounds: they are inclusive on both ends, so a contract ending
Jan 15 and one starting Jan 16 are adjacent, not overlapping, and both may
be RUNNING. That is a mid-month raise, which must stay legal - the resolver
picks between them (PRD section 3.2, 4.3).

Revision ID: 0003_b2_contract
Revises: 0002_b1_core
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_b2_contract"
down_revision: str | None = "0002_b1_core"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OVERLAP_CONSTRAINT = "no_overlapping_running_contracts"


def upgrade() -> None:
    op.create_table(
        "contract",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employee.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("wage", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="INR"
        ),
        sa.Column("date_start", sa.Date(), nullable=False),
        sa.Column("date_end", sa.Date(), nullable=True),
        sa.Column(
            "state", sa.String(length=32), nullable=False, server_default="DRAFT"
        ),
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
        # Promoted to a real FK in the B6 migration, once salary_structure
        # exists. Same staging 0001 used for app_user.employee_id.
        sa.Column("salary_structure_id", sa.Integer(), nullable=True),
        sa.CheckConstraint("wage > 0", name="ck_contract_wage_positive"),
        sa.CheckConstraint(
            "date_end IS NULL OR date_end >= date_start",
            name="ck_contract_end_after_start",
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

    op.create_index("ix_contract_employee_id", "contract", ["employee_id"])
    op.create_index("ix_contract_state", "contract", ["state"])
    op.create_index("ix_contract_date_start", "contract", ["date_start"])
    op.create_index("ix_contract_date_end", "contract", ["date_end"])
    op.create_index(
        "ix_contract_salary_structure_id", "contract", ["salary_structure_id"]
    )
    # The resolver's hot path: one employee's RUNNING contracts over a period.
    op.create_index(
        "ix_contract_resolution",
        "contract",
        ["employee_id", "state", "date_start", "date_end"],
    )

    # btree_gist was installed in 0001 precisely for this.
    op.execute(
        f"""
        ALTER TABLE contract ADD CONSTRAINT {OVERLAP_CONSTRAINT}
          EXCLUDE USING gist (
            employee_id WITH =,
            daterange(date_start, COALESCE(date_end, 'infinity'::date), '[]') WITH &&
          ) WHERE (state = 'RUNNING')
        """
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE contract DROP CONSTRAINT IF EXISTS {OVERLAP_CONSTRAINT}")
    for index in (
        "ix_contract_resolution",
        "ix_contract_salary_structure_id",
        "ix_contract_date_end",
        "ix_contract_date_start",
        "ix_contract_state",
        "ix_contract_employee_id",
    ):
        op.drop_index(index, table_name="contract")
    op.drop_table("contract")

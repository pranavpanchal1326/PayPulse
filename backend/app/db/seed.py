"""Seed script. B0 seeds one user per role so RBAC can be demoed immediately.

Later blocks extend this with departments, employees, contracts, attendance,
time off, salary rules and historical payruns (see PRD section 9).

Idempotent: re-running updates existing rows rather than duplicating them.
Run with:  docker compose exec api python -m app.db.seed
"""
from __future__ import annotations

import logging

from sqlalchemy import select

from app.core.enums import Role
from app.core.security import hash_password
from app.models.user import User

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("seed")

DEMO_PASSWORD = "peoplepay"  # nosec - local demo credentials only

SEED_USERS: list[tuple[str, str, Role]] = [
    ("admin@peoplepay360.com", "Asha Menon", Role.ADMIN),
    ("payroll.manager@peoplepay360.com", "Ravi Deshmukh", Role.HR_PAYROLL_MANAGER),
    ("payroll.user@peoplepay360.com", "Neha Kulkarni", Role.HR_PAYROLL_USER),
    ("hr.manager@peoplepay360.com", "Imran Shaikh", Role.HR_MANAGER),
    ("employee@peoplepay360.com", "Sneha Patil", Role.EMPLOYEE),
]


def seed_users() -> None:
    # Imported lazily so SEED_USERS can be introspected by tests without
    # constructing a database engine (and therefore needing psycopg).
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        for email, full_name, role in SEED_USERS:
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(email=email)
                db.add(user)
                action = "created"
            else:
                action = "updated"
            user.full_name = full_name
            user.role = role
            user.password_hash = hash_password(DEMO_PASSWORD)
            user.is_active = True
            logger.info("  %-8s %-40s %s", action, email, role)
        db.commit()


def main() -> None:
    logger.info("Seeding PeoplePay360 demo data")
    seed_users()
    logger.info("Done. All demo accounts use the password: %s", DEMO_PASSWORD)


if __name__ == "__main__":
    main()

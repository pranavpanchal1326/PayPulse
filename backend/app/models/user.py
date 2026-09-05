"""Authentication principal. The HR identity lives on Employee (B1)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import Role
from app.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    """A login: credentials, role and the employee record it maps to."""
    __tablename__ = "app_user"  # "user" is reserved in PostgreSQL

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(
        SAEnum(Role, name="role_enum", native_enum=False, length=32),
        default=Role.EMPLOYEE,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Tokens issued at or before this instant are rejected. Logout stamps it
    # with "now", which is what makes a refresh token revocable at all: they
    # live for days, are not checked against any store, and until this column
    # existed a leaked one could not be cancelled short of disabling the
    # account. One column revokes every session for the user at once, which
    # is the behaviour "log me out everywhere" wants anyway.
    tokens_valid_from: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Links this login to an HR record. Plain column for now; the FK to
    # employee.id is added in the B1 migration, once that table exists.
    employee_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<User {self.email} {self.role}>"

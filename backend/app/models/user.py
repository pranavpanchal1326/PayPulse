"""Authentication principal. The HR identity lives on Employee (B1)."""
from __future__ import annotations

from sqlalchemy import Boolean, Enum as SAEnum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.core.enums import Role


class User(Base, TimestampMixin):
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

    # Links this login to an HR record. Plain column for now; the FK to
    # employee.id is added in the B1 migration, once that table exists.
    employee_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<User {self.email} {self.role}>"

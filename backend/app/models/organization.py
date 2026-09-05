"""Department and JobPosition - the two lookup tables the Employee hangs off."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.employee import Employee


class Department(Base, TimestampMixin):
    __tablename__ = "department"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    employees: Mapped[list[Employee]] = relationship(
        back_populates="department", passive_deletes=True
    )
    job_positions: Mapped[list[JobPosition]] = relationship(
        back_populates="department", passive_deletes=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Department {self.name}>"


class JobPosition(Base, TimestampMixin):
    __tablename__ = "job_position"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # A position usually belongs to a department, but "Office Manager" style
    # roles that span departments are legitimate, so this stays nullable.
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("department.id", ondelete="SET NULL"), nullable=True, index=True
    )

    department: Mapped[Department | None] = relationship(
        back_populates="job_positions"
    )
    employees: Mapped[list[Employee]] = relationship(
        back_populates="job_position", passive_deletes=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<JobPosition {self.name}>"

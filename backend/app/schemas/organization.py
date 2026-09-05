from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    employee_count: int = 0


class JobPositionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    department_id: int | None = None


class JobPositionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    department_id: int | None = None


class JobPositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    department_id: int | None = None
    department_name: str | None = None
    employee_count: int = 0


class RefOut(BaseModel):
    """Minimal {id, name} shape for embedding in other payloads."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str

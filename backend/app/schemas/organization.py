"""Departments and job positions - the roster's grouping (spec B1)."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    """A new department."""
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None


class DepartmentUpdate(BaseModel):
    """Changes to a department. Omitted fields are left alone."""
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None


class DepartmentOut(BaseModel):
    """A department, with its current headcount."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    employee_count: int = 0


class JobPositionCreate(BaseModel):
    """A new job position."""
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    department_id: int | None = None


class JobPositionUpdate(BaseModel):
    """Changes to a job position. Omitted fields are left alone."""
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    department_id: int | None = None


class JobPositionOut(BaseModel):
    """A job position, with the department it belongs to."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    department_id: int | None = None
    department_name: str | None = None
    employee_count: int = 0

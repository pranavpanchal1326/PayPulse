from __future__ import annotations

from datetime import time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import Weekday

class WorkingScheduleLineIn(BaseModel):
    # Monday is 0, matching Python's date.weekday(). Serialises as that
    # integer, so the weekly grid editor is unaffected.
    day_of_week: Weekday
    start_time: time
    end_time: time
    break_minutes: int = Field(default=0, ge=0, lt=24 * 60)

    @model_validator(mode="after")
    def _reject_zero_length(self) -> WorkingScheduleLineIn:
        if self.start_time == self.end_time:
            raise ValueError(
                "start_time and end_time are identical, which is a zero-length "
                "shift. For a shift ending the next morning, set end_time "
                "earlier than start_time (e.g. 22:00 to 06:00)."
            )
        return self


class WorkingScheduleLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    day_of_week: Weekday
    day_name: str = ""
    start_time: time
    end_time: time
    break_minutes: int
    hours: Decimal = Decimal("0.00")
    crosses_midnight: bool = False


class WorkingScheduleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    lines: list[WorkingScheduleLineIn] = Field(default_factory=list)


class WorkingScheduleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    # Omit to leave the pattern alone; send a list to replace it wholesale.
    lines: list[WorkingScheduleLineIn] | None = None


class WorkingScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    # Read-only: spec A3 forbids entering this by hand. Any value a client
    # sends is ignored - it is recomputed from `lines` on every write.
    hours_per_week: Decimal
    working_days: int = 0
    daily_hours: Decimal = Decimal("0.00")
    employee_count: int = 0
    lines: list[WorkingScheduleLineOut] = []

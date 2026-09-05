"""Login, refresh and the identity the client caches."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.enums import Role


class LoginRequest(BaseModel):
    """Email and password, exchanged for a token pair."""
    email: EmailStr
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    """A refresh token, exchanged for a new token pair."""
    refresh_token: str


class UserOut(BaseModel):
    """The signed-in identity: who they are and what they may do."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: Role
    employee_id: int | None = None
    is_active: bool


class TokenPair(BaseModel):
    """A short-lived access token and the refresh token that renews it."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut

"""Authentication endpoints."""
from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import AuthenticationError
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenPair, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue(user: User) -> TokenPair:
    claims = {"role": user.role.value, "employee_id": user.employee_id}
    return TokenPair(
        access_token=create_access_token(user.id, claims),
        refresh_token=create_refresh_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenPair, status_code=status.HTTP_200_OK)
def login(payload: LoginRequest, db: DbSession) -> TokenPair:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    # One message for both branches so the endpoint can't be used to
    # enumerate which addresses have accounts.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AuthenticationError("Incorrect email or password")
    if not user.is_active:
        raise AuthenticationError("User account is disabled")
    return _issue(user)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: DbSession) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, expected_type="refresh")
    except TokenError as exc:
        raise AuthenticationError(str(exc)) from exc

    user = db.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        raise AuthenticationError("User no longer exists or is disabled")
    return _issue(user)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user

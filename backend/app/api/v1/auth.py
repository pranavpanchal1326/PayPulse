"""Authentication endpoints."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Request, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import AuthenticationError
from app.core.ratelimit import login_limiter
from app.core.security import (
    TokenError,
    assert_token_not_revoked,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
    waste_a_verify,
)
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenPair, UserOut
from app.schemas.common import Message

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue(user: User) -> TokenPair:
    claims = {"role": user.role.value, "employee_id": user.employee_id}
    return TokenPair(
        access_token=create_access_token(user.id, claims),
        refresh_token=create_refresh_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenPair, status_code=status.HTTP_200_OK)
def login(payload: LoginRequest, request: Request, db: DbSession) -> TokenPair:
    email = payload.email.lower()
    # Limited on both the address and the source, so neither spraying one
    # account from many hosts nor many accounts from one host is cheap.
    client = request.client.host if request.client else "unknown"
    for key in (f"email:{email}", f"ip:{client}"):
        login_limiter.check(key)

    user = db.scalar(select(User).where(User.email == email))
    # One message for both branches so the endpoint can't be used to
    # enumerate which addresses have accounts - and one bcrypt verification
    # either way, so the timing can't be used for it either.
    if user is None:
        waste_a_verify()
        raise AuthenticationError("Incorrect email or password")
    if not verify_password(payload.password, user.password_hash):
        raise AuthenticationError("Incorrect email or password")
    if not user.is_active:
        raise AuthenticationError("User account is disabled")

    for key in (f"email:{email}", f"ip:{client}"):
        login_limiter.reset(key)
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
    # This path builds its own user rather than going through
    # get_current_user, so the revocation cutoff has to be applied here too -
    # otherwise a revoked refresh token still mints fresh access tokens and
    # logout achieves nothing.
    try:
        assert_token_not_revoked(claims, user)
    except TokenError as exc:
        raise AuthenticationError(str(exc)) from exc
    return _issue(user)


@router.post("/logout", response_model=Message)
def logout(user: CurrentUser, db: DbSession) -> Message:
    """Revoke every token issued to the caller so far.

    Stamps the cutoff one second ahead, so a token minted in this same second
    is covered too - `iat` has whole-second resolution, and without the nudge
    the access token used to call logout could outlive it.
    """
    user.tokens_valid_from = datetime.now(UTC) + timedelta(seconds=1)
    db.commit()
    return Message(message="Signed out. All existing sessions were revoked.")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user

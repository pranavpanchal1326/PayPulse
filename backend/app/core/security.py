"""Password hashing and JWT issue/verify.

bcrypt is used directly rather than through passlib: passlib 1.7.4 breaks
against bcrypt >= 4.1 (it reads the removed `bcrypt.__about__`), and that
failure is noisy and easy to hit on a fresh install.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import bcrypt
import jwt

from app.core.config import settings

TokenType = Literal["access", "refresh"]

# bcrypt silently ignores everything past 72 bytes; truncate explicitly so a
# long password can never be mistaken for a different one that shares a prefix.
_BCRYPT_MAX_BYTES = 72


def _prepare(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")


# A real hash to check against when the email is unknown. Without it, a miss
# returns before bcrypt runs and answers in about a millisecond where a hit
# takes about a hundred, so the identical error message is undone by the
# clock and the endpoint enumerates accounts anyway.
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-constant-time-login", bcrypt.gensalt())


def waste_a_verify() -> None:
    """Burn one bcrypt verification, so a login miss costs what a hit costs."""
    bcrypt.checkpw(b"dummy-password-for-constant-time-login", _DUMMY_HASH)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed hash in the DB must read as "wrong password", not a 500.
        return False


def _create_token(
    subject: str | int,
    token_type: TokenType,
    expires_delta: timedelta,
    claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "jti": uuid.uuid4().hex,
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(
    subject: str | int, claims: dict[str, Any] | None = None
) -> str:
    return _create_token(
        subject,
        "access",
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        claims,
    )


def create_refresh_token(subject: str | int) -> str:
    return _create_token(
        subject, "refresh", timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )


class TokenError(Exception):
    """Raised when a token is malformed, expired, or the wrong type."""


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("Token is invalid") from exc

    if expected_type and payload.get("type") != expected_type:
        # Stops a refresh token being replayed as an access token.
        raise TokenError(f"Expected a {expected_type} token")
    return payload


def assert_token_not_revoked(payload: dict[str, Any], user) -> None:
    """Reject a token issued at or before the user's revocation cutoff.

    `iat` is a UTC timestamp; `tokens_valid_from` is stamped by logout. The
    comparison is `<=` so every token minted in the same second as the logout
    dies with it, rather than one of them surviving on a rounding accident.
    """
    cutoff = getattr(user, "tokens_valid_from", None)
    if cutoff is None:
        return
    issued_at = payload.get("iat")
    if issued_at is None:
        raise TokenError("Token is invalid")
    if isinstance(issued_at, (int, float)):
        issued_at = datetime.fromtimestamp(issued_at, UTC)
    if issued_at <= cutoff:
        raise TokenError("Token has been revoked. Sign in again.")

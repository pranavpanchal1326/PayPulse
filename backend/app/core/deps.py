"""FastAPI dependency wiring for auth and permissions."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.rbac import Action, Resource, Scope, grant_for
from app.core.security import (
    TokenError,
    assert_token_not_revoked,
    decode_token,
)
from app.db.session import get_db
from app.models.user import User

_bearer = HTTPBearer(auto_error=False, description="JWT access token")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer)
    ] = None,
) -> User:
    if credentials is None:
        raise AuthenticationError("Not authenticated")
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except TokenError as exc:
        raise AuthenticationError(str(exc)) from exc

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise AuthenticationError("User no longer exists")
    if not user.is_active:
        raise AuthenticationError("User account is disabled")
    try:
        assert_token_not_revoked(payload, user)
    except TokenError as exc:
        # Must be converted here: this runs outside the decode try/except, so
        # an escaping TokenError would surface as a 500 rather than a 401.
        raise AuthenticationError(str(exc)) from exc
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass(frozen=True)
class AccessContext:
    """Result of a permission check, handed to routers and services.

    `scope` is the important half: OWN means the caller may only touch rows
    belonging to their own employee record, and services must apply
    `employee_filter` to every query rather than trusting the router.
    """

    user: User
    resource: Resource
    action: Action
    scope: Scope

    @property
    def is_own_scoped(self) -> bool:
        return self.scope is Scope.OWN

    @property
    def employee_filter(self) -> int | None:
        """Employee id to constrain queries to, or None for unrestricted."""
        return self.user.employee_id if self.is_own_scoped else None


def require(resource: Resource, action: Action):
    """Build a dependency asserting `role` may perform `action` on `resource`."""

    def _dependency(user: CurrentUser) -> AccessContext:
        grant = grant_for(user.role, resource)
        if grant is None or action not in grant.actions:
            raise PermissionDeniedError(
                f"Role {user.role} may not {action} {resource}"
            )
        if grant.scope is Scope.OWN and user.employee_id is None:
            # An own-scoped role with no employee link can see nothing at all;
            # failing loudly beats silently returning an empty list.
            raise PermissionDeniedError(
                "This account is not linked to an employee record"
            )
        return AccessContext(
            user=user, resource=resource, action=action, scope=grant.scope
        )

    return _dependency

"""Uniform error envelope: {code, message, field_errors}.

Pranav maps `code` to toasts once, so every failure must carry a stable code.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Base for expected, client-facing failures."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        field_errors: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.field_errors = field_errors or []


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class AuthenticationError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthenticated"


class PermissionDeniedError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "permission_denied"


class BusinessRuleError(AppError):
    """A state transition or domain invariant refused the request."""

    status_code = 422
    code = "business_rule_violated"


def _envelope(
    code: str, message: str, field_errors: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    return {"code": code, "message": message, "field_errors": field_errors or []}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(exc.code, exc.message, exc.field_errors),
            headers=(
                {"WWW-Authenticate": "Bearer"}
                if isinstance(exc, AuthenticationError)
                else None
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {
                "field": ".".join(str(p) for p in err["loc"][1:]) or str(err["loc"][0]),
                "message": err["msg"],
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=_envelope("validation_error", "Request validation failed", fields),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        codes = {401: "unauthenticated", 403: "permission_denied", 404: "not_found"}
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(
                codes.get(exc.status_code, "http_error"), str(exc.detail)
            ),
            headers=getattr(exc, "headers", None),
        )

"""Application entrypoint."""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.db.session import engine

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s",'
    '"logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger("peoplepay360")

app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="0.1.0",
    description=(
        "Integrated HR & Payroll platform.\n\n"
        "This schema is the single source of truth for the frontend client: "
        "`npx openapi-typescript http://localhost:8000/openapi.json "
        "-o src/api/schema.d.ts`"
    ),
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

register_exception_handlers(app)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "%s %s -> %s (%.1fms) rid=%s",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
        request_id,
    )
    return response


@app.get("/healthz", tags=["meta"], summary="Liveness and database check")
def healthz() -> dict[str, str]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "up"
    except Exception as exc:  # pragma: no cover - surfaced in the payload
        logger.warning("health check: database unreachable: %s", exc)
        db_status = "down"
    return {"status": "ok" if db_status == "up" else "degraded", "database": db_status}


app.include_router(api_router, prefix=settings.API_V1_PREFIX)

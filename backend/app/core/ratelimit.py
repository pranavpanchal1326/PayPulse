"""Fixed-window rate limiting, counted in Postgres.

Shared across API processes, because the obvious in-process dictionary is
wrong the moment there is more than one worker: each would keep its own
counter and a caller would get N times the allowance. The counter lives in
the database the app already runs, so this needs no extra service.

Two things here are load-bearing.

First, each check runs in its *own* session and commits immediately. A
failed login raises, which rolls the request's transaction back - and an
attempt recorded in that transaction would roll back with it, so failures
would never accumulate and the limit would never trigger. The whole point is
to count the attempts that fail.

Second, the count and the increment are one statement. Read-then-write would
let concurrent guesses interleave and each see a stale count, which is the
same bug in a smaller window.

The window is fixed, not sliding: it resets in place once expired, so a
caller can in principle spend their allowance at the end of one window and
again at the start of the next. For throttling password guessing that is
immaterial, and it costs one row per key instead of one per attempt.

Nothing sweeps expired rows. A row is reused in place when its window has
passed, so the table holds one row per distinct key ever seen rather than
one per attempt - but a spread-out attack across many addresses would still
grow it. If that ever matters, a periodic
`DELETE FROM rate_limit WHERE window_start < now() - interval '1 day'`
is the whole fix; it is not worth a scheduler before then.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.errors import AppError
from app.models.ratelimit import RateLimit


class RateLimitedError(AppError):
    status_code = 429
    code = "rate_limited"


class RateLimiter:
    """Allows `limit` events per `window` seconds, per key, across processes."""

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = timedelta(seconds=window_seconds)

    def check(self, key: str) -> None:
        """Record an attempt, or raise if the key is over its allowance."""
        from app.db.session import SessionLocal

        now = datetime.now(UTC)
        expired = RateLimit.window_start < now - self.window

        statement = (
            pg_insert(RateLimit)
            .values(key=key, window_start=now, hits=1)
            .on_conflict_do_update(
                index_elements=[RateLimit.key],
                set_={
                    "hits": case((expired, 1), else_=RateLimit.hits + 1),
                    "window_start": case(
                        (expired, now), else_=RateLimit.window_start
                    ),
                },
            )
            .returning(RateLimit.hits, RateLimit.window_start)
        )

        with SessionLocal() as db:
            hits, window_start = db.execute(statement).one()
            db.commit()

        if hits > self.limit:
            retry_after = int((window_start + self.window - now).total_seconds()) + 1
            raise RateLimitedError(
                f"Too many attempts. Try again in {retry_after} second(s).",
                code="rate_limited",
            )

    def reset(self, key: str) -> None:
        """Forget a key's attempts. Called on a successful login."""
        from app.db.session import SessionLocal

        with SessionLocal() as db:
            db.execute(delete(RateLimit).where(RateLimit.key == key))
            db.commit()


# Five failures a minute per address, and per source address, is generous for
# a human and useless for a script.
login_limiter = RateLimiter(limit=5, window_seconds=60.0)

"""A small fixed-capacity sliding-window limiter for the login endpoint.

Deliberately in-process and dependency-free: the deployment is a single
uvicorn container with no Redis, and an in-memory counter is the honest fit
for that. It is *not* correct across replicas - with N workers a caller gets
N times the allowance - so if this ever runs multiple processes the store
below has to move to Redis. Nothing else about the interface would change.

The point is to make online password guessing expensive, not to be a general
traffic shaper.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from app.core.errors import AppError


class RateLimitedError(AppError):
    status_code = 429
    code = "rate_limited"


class SlidingWindow:
    """Allows `limit` events per `window` seconds, per key."""

    def __init__(self, limit: int, window: float) -> None:
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque[float]:
        hits = self._hits[key]
        cutoff = now - self.window
        while hits and hits[0] <= cutoff:
            hits.popleft()
        return hits

    def check(self, key: str) -> None:
        """Record an attempt, or raise if the key is over its allowance."""
        now = time.monotonic()
        hits = self._prune(key, now)
        if len(hits) >= self.limit:
            retry_after = int(self.window - (now - hits[0])) + 1
            raise RateLimitedError(
                f"Too many attempts. Try again in {retry_after} second(s).",
                code="rate_limited",
            )
        hits.append(now)

    def reset(self, key: str) -> None:
        """Forget a key's attempts. Called on a successful login."""
        self._hits.pop(key, None)


# Five failures a minute per address, and per source address, is generous for
# a human and useless for a script.
login_limiter = SlidingWindow(limit=5, window=60.0)

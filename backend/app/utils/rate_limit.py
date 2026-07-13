"""Minimal per-IP fixed-window rate limiting for auth endpoints.

In-memory and per-process — adequate for the current single-instance
deployment, and the dependency surface is one function, so swapping in a
Redis-backed limiter later touches only this module. Disabled under
ENV=test so the suite can exercise endpoints freely; the limiter class
itself is unit-tested directly.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.config.settings import settings


class FixedWindowLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        hits = self._hits[key]
        cutoff = now - self.window_seconds
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True


def _client_ip(request: Request) -> str:
    # Railway/Vercel sit behind proxies; first X-Forwarded-For hop is the client.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(limit: int, window_seconds: int):
    """FastAPI dependency: at most `limit` requests per IP per window."""
    limiter = FixedWindowLimiter(limit, window_seconds)

    async def dependency(request: Request) -> None:
        if settings.env == "test":
            return
        if not limiter.allow(_client_ip(request)):
            raise HTTPException(
                status_code=429,
                detail={"error_code": "rate_limited", "retry_after_seconds": window_seconds},
            )

    return dependency

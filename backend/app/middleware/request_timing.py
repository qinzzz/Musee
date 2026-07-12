import logging
import time

from fastapi import FastAPI, Request

from app.observability.telemetry import record_http_request_duration


logger = logging.getLogger(__name__)


def _route_template(request: Request) -> str:
    # Use the route template (/api/artworks/{artwork_id}) rather than the
    # raw path so metric label cardinality stays bounded.
    route = request.scope.get("route")
    return getattr(route, "path", None) or "unmatched"


def add_request_timing_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_timing_middleware(request: Request, call_next):
        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_seconds = time.perf_counter() - start
            duration_ms = round(duration_seconds * 1000, 2)
            record_http_request_duration(
                duration_seconds, request.method, _route_template(request), 500
            )
            logger.exception(
                "HTTP_TIMING %s %s failed %.2fms",
                request.method,
                request.url.path,
                duration_ms,
            )
            raise

        duration_seconds = time.perf_counter() - start
        duration_ms = round(duration_seconds * 1000, 2)
        record_http_request_duration(
            duration_seconds, request.method, _route_template(request), response.status_code
        )
        server_timing = f'app;dur={duration_ms:.2f}'
        existing_server_timing = response.headers.get("Server-Timing")

        response.headers["Server-Timing"] = (
            f"{existing_server_timing}, {server_timing}"
            if existing_server_timing
            else server_timing
        )
        response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"

        logger.info(
            "HTTP_TIMING %s %s %s %.2fms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response

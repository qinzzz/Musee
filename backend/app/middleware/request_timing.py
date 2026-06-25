import logging
import time

from fastapi import FastAPI, Request


logger = logging.getLogger(__name__)


def add_request_timing_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_timing_middleware(request: Request, call_next):
        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.exception(
                "HTTP_TIMING %s %s failed %.2fms",
                request.method,
                request.url.path,
                duration_ms,
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
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

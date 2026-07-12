"""OpenTelemetry latency metrics.

Histograms are pushed over OTLP/HTTP to any compatible collector — for
Musee that is the Grafana Cloud OTLP gateway. Export only activates when
OTEL_EXPORTER_OTLP_ENDPOINT is set; without it every instrument is a
no-op, so local dev and tests need no configuration.

Required environment (Railway service variables):
    OTEL_EXPORTER_OTLP_ENDPOINT  e.g. https://otlp-gateway-prod-us-west-0.grafana.net/otlp
    OTEL_EXPORTER_OTLP_HEADERS   e.g. Authorization=Basic <base64 instance_id:token>
    OTEL_SERVICE_NAME            e.g. musee-backend (optional, defaults below)
"""

import logging
import os
from typing import Optional, Sequence

from opentelemetry import metrics
from opentelemetry.metrics import Histogram

logger = logging.getLogger(__name__)

METER_NAME = "musee.backend"
HTTP_DURATION_NAME = "musee.http.server.duration"
STORAGE_DURATION_NAME = "musee.storage.operation.duration"
AI_DURATION_NAME = "musee.ai.request.duration"

DEFAULT_SERVICE_NAME = "musee-backend"

# The default OTel buckets stop at 10s; storage and AI calls have failure
# modes in the tens of seconds, so extend the upper range.
LATENCY_BUCKETS_SECONDS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0)

# Instrument cache keyed by name; invalidated when the provider changes so
# instruments created against the no-op provider don't outlive configuration.
_instrument_cache: dict = {}


def configure_metrics(metric_readers: Optional[Sequence] = None) -> bool:
    """Install a MeterProvider that exports latency histograms.

    Returns False (leaving the no-op provider in place) when export is not
    configured. Tests can pass explicit metric_readers (e.g. an
    InMemoryMetricReader) to bypass the environment check.
    """
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.view import ExplicitBucketHistogramAggregation, View
    from opentelemetry.sdk.resources import Resource

    if metric_readers is None:
        if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
            logger.info("OTEL_EXPORTER_OTLP_ENDPOINT not set; metrics export disabled")
            return False
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

        metric_readers = [PeriodicExportingMetricReader(OTLPMetricExporter())]

    views = [
        View(
            instrument_name=name,
            aggregation=ExplicitBucketHistogramAggregation(LATENCY_BUCKETS_SECONDS),
        )
        for name in (HTTP_DURATION_NAME, STORAGE_DURATION_NAME, AI_DURATION_NAME)
    ]
    provider = MeterProvider(
        resource=Resource.create(
            {"service.name": os.getenv("OTEL_SERVICE_NAME", DEFAULT_SERVICE_NAME)}
        ),
        metric_readers=list(metric_readers),
        views=views,
    )
    metrics.set_meter_provider(provider)
    _instrument_cache.clear()
    logger.info("OpenTelemetry metrics export configured")
    return True


def _histogram(name: str, description: str) -> Histogram:
    provider = metrics.get_meter_provider()
    cached = _instrument_cache.get(name)
    if cached is not None and cached[0] is provider:
        return cached[1]

    histogram = metrics.get_meter(METER_NAME).create_histogram(
        name, unit="s", description=description
    )
    _instrument_cache[name] = (provider, histogram)
    return histogram


def record_http_request_duration(
    seconds: float, method: str, route: str, status_code: int
) -> None:
    _histogram(HTTP_DURATION_NAME, "HTTP server request duration").record(
        seconds,
        {
            "http.request.method": method,
            "http.route": route,
            "http.response.status_code": status_code,
        },
    )


def record_storage_operation_duration(
    seconds: float, operation: str, success: bool = True
) -> None:
    _histogram(STORAGE_DURATION_NAME, "Object storage operation duration").record(
        seconds,
        {"operation": operation, "success": success},
    )


def record_ai_request_duration(
    seconds: float, job_type: str, model: Optional[str], status: str
) -> None:
    _histogram(AI_DURATION_NAME, "AI/LLM request duration").record(
        seconds,
        {
            "job_type": job_type,
            "model": model or "unknown",
            "status": status,
        },
    )

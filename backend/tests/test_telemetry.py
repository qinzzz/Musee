"""Tests for OpenTelemetry latency metrics (app/observability/telemetry.py)."""

import pytest
from opentelemetry.sdk.metrics.export import InMemoryMetricReader

from app.observability import telemetry


@pytest.fixture(scope="module")
def metric_reader():
    # set_meter_provider only honors the first global install per process,
    # so one module-scoped reader backs every test here.
    reader = InMemoryMetricReader()
    assert telemetry.configure_metrics(metric_readers=[reader]) is True
    return reader


def _find_metric(reader, name):
    data = reader.get_metrics_data()
    for resource_metrics in data.resource_metrics:
        for scope_metrics in resource_metrics.scope_metrics:
            for metric in scope_metrics.metrics:
                if metric.name == name:
                    return metric
    return None


def test_configure_metrics_returns_false_without_endpoint(monkeypatch):
    # Arrange
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)

    # Act / Assert — no readers passed and no endpoint configured
    assert telemetry.configure_metrics() is False


def test_records_http_request_duration_with_route_attributes(metric_reader):
    # Arrange / Act
    telemetry.record_http_request_duration(
        0.2, method="GET", route="/api/artworks/{artwork_id}", status_code=200
    )

    # Assert
    metric = _find_metric(metric_reader, telemetry.HTTP_DURATION_NAME)
    assert metric is not None
    points = [
        p
        for p in metric.data.data_points
        if p.attributes.get("http.route") == "/api/artworks/{artwork_id}"
    ]
    assert len(points) == 1
    assert points[0].attributes["http.request.method"] == "GET"
    assert points[0].attributes["http.response.status_code"] == 200
    assert points[0].sum == pytest.approx(0.2)


def test_records_storage_operation_duration(metric_reader):
    # Arrange / Act
    telemetry.record_storage_operation_duration(1.5, operation="save", success=True)

    # Assert
    metric = _find_metric(metric_reader, telemetry.STORAGE_DURATION_NAME)
    assert metric is not None
    points = [
        p for p in metric.data.data_points if p.attributes.get("operation") == "save"
    ]
    assert len(points) == 1
    assert points[0].attributes["success"] is True
    assert points[0].sum == pytest.approx(1.5)


def test_latency_view_extends_buckets_past_default_10s(metric_reader):
    # Arrange / Act
    telemetry.record_storage_operation_duration(65.0, operation="slow-op", success=False)

    # Assert — the explicit-bucket view must apply, so 60s+ tail latency
    # lands in a real bucket instead of the default catch-all above 10s
    metric = _find_metric(metric_reader, telemetry.STORAGE_DURATION_NAME)
    points = [
        p for p in metric.data.data_points if p.attributes.get("operation") == "slow-op"
    ]
    assert len(points) == 1
    assert tuple(points[0].explicit_bounds) == telemetry.LATENCY_BUCKETS_SECONDS


def test_records_ai_request_duration_with_labels(metric_reader):
    # Arrange / Act
    telemetry.record_ai_request_duration(
        4.2, job_type="artwork_identification", model="gpt-test", status="succeeded"
    )

    # Assert
    metric = _find_metric(metric_reader, telemetry.AI_DURATION_NAME)
    assert metric is not None
    points = [
        p
        for p in metric.data.data_points
        if p.attributes.get("job_type") == "artwork_identification"
    ]
    assert len(points) == 1
    assert points[0].attributes["model"] == "gpt-test"
    assert points[0].attributes["status"] == "succeeded"
    assert points[0].sum == pytest.approx(4.2)


def test_ai_request_duration_defaults_missing_model_to_unknown(metric_reader):
    # Arrange / Act
    telemetry.record_ai_request_duration(
        1.0, job_type="tag_explanation", model=None, status="failed"
    )

    # Assert
    metric = _find_metric(metric_reader, telemetry.AI_DURATION_NAME)
    points = [
        p
        for p in metric.data.data_points
        if p.attributes.get("job_type") == "tag_explanation"
    ]
    assert len(points) == 1
    assert points[0].attributes["model"] == "unknown"


def test_ai_usage_lifecycle_emits_duration_metric(metric_reader, db):
    # Arrange
    from app.services.ai_usage_service import start_ai_usage, succeed_ai_usage

    usage_id = start_ai_usage(
        user_id="user-metrics",
        job_type="session_chat",
        model="gemini-test",
    )
    assert usage_id

    # Act
    succeed_ai_usage(usage_id, input_tokens=1, output_tokens=2)

    # Assert
    metric = _find_metric(metric_reader, telemetry.AI_DURATION_NAME)
    points = [
        p
        for p in metric.data.data_points
        if p.attributes.get("job_type") == "session_chat"
        and p.attributes.get("model") == "gemini-test"
    ]
    assert len(points) == 1
    assert points[0].attributes["status"] == "succeeded"
    assert points[0].sum >= 0


def test_http_middleware_records_metric_for_real_request(metric_reader, client):
    # Arrange / Act
    response = client.get("/health")
    assert response.status_code == 200

    # Assert
    metric = _find_metric(metric_reader, telemetry.HTTP_DURATION_NAME)
    points = [
        p for p in metric.data.data_points if p.attributes.get("http.route") == "/health"
    ]
    assert len(points) == 1
    assert points[0].attributes["http.response.status_code"] == 200

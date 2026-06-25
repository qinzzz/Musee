def test_request_timing_headers_are_attached(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert "Server-Timing" in response.headers
    assert response.headers["Server-Timing"].startswith("app;dur=")
    assert "X-Response-Time" in response.headers
    assert response.headers["X-Response-Time"].endswith("ms")

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert "database_enabled" in data


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "version" in r.json()

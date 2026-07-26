"""Tests for user CRUD and quota endpoints."""

import pytest

from app.database.models import User


def test_create_user(client):
    r = client.post("/api/users", json={"device_id": "dev-001"})
    assert r.status_code == 200
    data = r.json()
    assert data["device_id"] == "dev-001"
    assert data["tier"] == "unlimited"


def test_create_user_idempotent(client):
    client.post("/api/users", json={"device_id": "dev-002"})
    r = client.post("/api/users", json={"device_id": "dev-002"})
    assert r.status_code == 200  # returns existing, no error


def test_registration_does_not_upgrade_existing_user(client, db):
    db.add(User(user_id="existing-free", device_id="existing-device", tier="free"))
    db.commit()

    r = client.post("/api/users", json={"device_id": "existing-device"})

    assert r.status_code == 200
    assert r.json()["tier"] == "free"


def test_get_user(client):
    created = client.post("/api/users", json={"device_id": "dev-003"}).json()
    r = client.get(f"/api/users/{created['user_id']}")
    assert r.status_code == 200
    assert r.json()["user_id"] == created["user_id"]


def test_get_user_not_found(client):
    r = client.get("/api/users/nonexistent-id")
    assert r.status_code == 404


def test_new_registration_has_unlimited_quota(client):
    user = client.post("/api/users", json={"device_id": "dev-quota"}).json()
    r = client.get(f"/api/users/{user['user_id']}/quota")
    assert r.status_code == 200
    data = r.json()
    assert data["tier"] == "unlimited"
    assert data["limit"] is None
    assert data["used"] == 0


def test_quota_unknown_user_gets_defaults(client):
    # Anonymous visitors have no row until their first action; they still
    # get the default free-tier quotas so clients can render meters.
    r = client.get("/api/users/no-such-user/quota")
    assert r.status_code == 200
    data = r.json()
    assert data["tier"] == "free"
    assert data["quotas"]["artwork_uploads"]["used"] == 0
    assert data["used"] == 0


def test_admin_set_tier(client):
    user = client.post("/api/users", json={"device_id": "dev-tier"}).json()
    uid = user["user_id"]

    # Wrong secret
    r = client.post("/api/admin/set-tier", json={"user_id": uid, "tier": "unlimited", "admin_secret": "wrong"})
    assert r.status_code == 403

    # Correct secret
    r = client.post("/api/admin/set-tier", json={"user_id": uid, "tier": "unlimited", "admin_secret": "test-secret"})
    assert r.status_code == 200
    assert r.json()["tier"] == "unlimited"

    # Verify quota updated
    r = client.get(f"/api/users/{uid}/quota")
    assert r.json()["tier"] == "unlimited"
    assert r.json()["limit"] is None  # unlimited tier is unmetered


def test_admin_set_tier_invalid(client):
    user = client.post("/api/users", json={"device_id": "dev-bad-tier"}).json()
    r = client.post("/api/admin/set-tier", json={
        "user_id": user["user_id"], "tier": "gold", "admin_secret": "test-secret"
    })
    assert r.status_code == 400


def test_update_user(client):
    user = client.post("/api/users", json={"device_id": "dev-upd"}).json()
    r = client.put(f"/api/users/{user['user_id']}", json={"username": "alice"})
    assert r.status_code == 200
    assert r.json()["username"] == "alice"

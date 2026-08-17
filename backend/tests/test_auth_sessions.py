"""Authentication lifecycle tests for rotating server-side sessions."""

from datetime import timedelta
from unittest.mock import patch

from jose import jwt

from app.config.settings import settings
from app.database.models import AuthSession
from app.services.auth_session_service import utc_now


def _google_login(client, google_id="refresh-user"):
    with patch("app.routers.auth.verify_google_token") as mock_verify:
        mock_verify.return_value = {
            "sub": google_id,
            "email": f"{google_id}@example.com",
            "name": "Refresh User",
            "picture": None,
        }
        return client.post("/api/auth/google", json={"id_token": "fake"})


def _refresh_cookie(client) -> str:
    value = client.cookies.get(settings.refresh_cookie_name)
    assert value
    return value


def test_login_creates_hashed_server_session_and_short_access_token(client, db):
    response = _google_login(client)

    assert response.status_code == 200
    assert response.json()["is_new_user"] is True
    assert response.json()["expires_in"] == 15 * 60
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=lax" in response.headers["set-cookie"].lower()

    raw_refresh = _refresh_cookie(client)
    auth_session = db.query(AuthSession).one()
    assert raw_refresh not in auth_session.current_token_hash
    assert len(auth_session.current_token_hash) == 64

    claims = jwt.decode(
        response.json()["access_token"],
        settings.secret_key,
        algorithms=[settings.algorithm],
    )
    assert 14 * 60 <= claims["exp"] - __import__("time").time() <= 15 * 60 + 5

    returning = _google_login(client)
    assert returning.status_code == 200
    assert returning.json()["is_new_user"] is False


def test_refresh_rotates_cookie_and_restores_authenticated_session(client, db):
    login = _google_login(client)
    old_refresh = _refresh_cookie(client)

    refreshed = client.post("/api/auth/refresh")

    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"] != login.json()["access_token"]
    assert _refresh_cookie(client) != old_refresh
    db.expire_all()
    assert db.query(AuthSession).one().rotation_version == 1

    session = client.get(
        "/api/auth/session",
        headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"},
    )
    assert session.status_code == 200
    assert session.json()["state"] == "authenticated"
    assert session.json()["principal"]["email"] == "refresh-user@example.com"


def test_recent_parallel_refresh_is_superseded_without_revocation(client, db):
    _google_login(client)
    old_refresh = _refresh_cookie(client)
    assert client.post("/api/auth/refresh").status_code == 200
    current_refresh = _refresh_cookie(client)

    client.cookies.clear()
    client.cookies.set(settings.refresh_cookie_name, old_refresh)
    duplicate = client.post("/api/auth/refresh")

    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["error_code"] == "refresh_superseded"
    db.expire_all()
    assert db.query(AuthSession).one().revoked_at is None

    client.cookies.clear()
    client.cookies.set(settings.refresh_cookie_name, current_refresh)
    assert client.post("/api/auth/refresh").status_code == 200


def test_reuse_outside_grace_revokes_token_family(client, db):
    _google_login(client)
    old_refresh = _refresh_cookie(client)
    assert client.post("/api/auth/refresh").status_code == 200

    auth_session = db.query(AuthSession).one()
    auth_session.previous_token_valid_until = utc_now() - timedelta(seconds=1)
    db.commit()
    client.cookies.clear()
    client.cookies.set(settings.refresh_cookie_name, old_refresh)

    replay = client.post("/api/auth/refresh")

    assert replay.status_code == 401
    assert replay.json()["detail"]["error_code"] == "refresh_reuse"
    db.expire_all()
    assert db.query(AuthSession).one().revocation_reason == "token_reuse"


def test_expired_refresh_and_logout_require_reauthentication(client, db):
    _google_login(client)
    auth_session = db.query(AuthSession).one()
    auth_session.absolute_expires_at = utc_now() - timedelta(seconds=1)
    db.commit()

    expired = client.post("/api/auth/refresh")
    assert expired.status_code == 401
    assert expired.json()["detail"]["error_code"] == "refresh_expired"

    _google_login(client, google_id="logout-user")
    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200
    assert settings.refresh_cookie_name not in client.cookies
    db.expire_all()
    logout_session = db.query(AuthSession).filter(AuthSession.user_id != auth_session.user_id).one()
    assert logout_session.revocation_reason == "logout"


def test_session_without_access_token_is_guest_even_if_refresh_cookie_exists(client):
    _google_login(client)

    response = client.get("/api/auth/session")

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "guest"
    assert body["principal"]["kind"] == "guest"
    assert body["principal"]["user_id"].startswith("guest_")
    assert body["capabilities"]["create_session"] is True
    assert body["capabilities"]["search_collection"] is False
    assert body["quotas"]["guest_messages"]["remaining"] == 3
    assert body["quotas"]["guest_artworks"]["remaining"] == 1
    assert body["plan"] == "guest"


def test_refresh_cookie_mutations_reject_untrusted_browser_origins(client, db):
    _google_login(client)

    response = client.post(
        "/api/auth/refresh",
        headers={"Origin": "https://attacker.example"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["error_code"] == "origin_not_allowed"
    db.expire_all()
    assert db.query(AuthSession).one().rotation_version == 0

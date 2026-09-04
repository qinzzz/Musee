"""Guest principal binding and server-enforced preview limits."""

import io
from unittest.mock import patch

from app.config.settings import settings
from app.database.models import AuthSession, GuestQuotaReservation, GuestWorkspace, Session as SessionModel, SessionEvent, User
from app.routers import artwork_ingest


class _FakeStorage:
    async def save(self, *_args, **_kwargs):
        return "r2://guest-artwork.jpg"


def _bootstrap_guest(client, db, legacy_user_id="legacy-device") -> str:
    db.add(User(user_id=legacy_user_id, device_id=legacy_user_id, tier="free"))
    db.commit()
    response = client.get("/api/auth/session", params={"guest_user_id": legacy_user_id})
    assert response.status_code == 200
    assert response.json()["state"] == "guest"
    assert response.json()["principal"]["user_id"] == legacy_user_id
    return legacy_user_id


def _start_message(client, user_id: str, session_id: str, event_id: str):
    return client.post(
        "/api/sessions/start-with-event",
        params={"user_id": user_id},
        json={
            "session_id": session_id,
            "title": "Guest preview",
            "event": {
                "id": event_id,
                "role": "user",
                "event_type": "user_input",
                "content": "Tell me about this work",
            },
        },
    )


def test_guest_bootstrap_binds_legacy_workspace_with_http_only_credential(client, db):
    user_id = "legacy-device"
    db.add(User(user_id=user_id, device_id=user_id, tier="free"))
    db.commit()
    initial = client.get("/api/auth/session", params={"guest_user_id": user_id})
    assert "httponly" in initial.headers["set-cookie"].lower()
    assert "path=/api" in initial.headers["set-cookie"].lower()

    response = client.get("/api/auth/session")

    assert response.status_code == 200
    assert response.json()["principal"] == {"kind": "guest", "user_id": user_id}
    workspace = db.query(GuestWorkspace).one()
    raw_cookie = client.cookies.get(settings.guest_cookie_name)
    assert raw_cookie
    assert raw_cookie not in workspace.credential_hash
    assert len(workspace.credential_hash) == 64
    set_cookie = response.request.headers.get("cookie", "")
    assert settings.guest_cookie_name in set_cookie


def test_guest_can_create_one_session_and_three_idempotent_messages(client, db):
    user_id = _bootstrap_guest(client, db)

    first = _start_message(client, user_id, "guest-session-1", "guest-event-1")
    retry = _start_message(client, user_id, "guest-session-1", "guest-event-1")
    second = client.post(
        "/api/sessions/guest-session-1/events",
        json=[{
            "id": "guest-event-2",
            "role": "user",
            "event_type": "user_input",
            "content": "Tell me more",
        }],
    )
    third = client.post(
        "/api/sessions/guest-session-1/events",
        json=[{
            "id": "guest-event-3",
            "role": "user",
            "event_type": "user_input",
            "content": "One last question",
        }],
    )

    assert first.status_code == 200
    assert retry.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 200
    assert db.query(SessionModel).filter(SessionModel.user_id == user_id).count() == 1
    assert db.query(SessionEvent).filter(SessionEvent.session_id == "guest-session-1").count() == 3
    assert db.query(GuestQuotaReservation).count() == 4


def test_legacy_guest_history_seeds_preview_usage(client, db):
    user_id = "legacy-with-history"
    db.add(User(user_id=user_id, device_id=user_id, tier="free"))
    db.add(SessionModel(id="legacy-session", user_id=user_id, title="Existing"))
    db.add(SessionEvent(
        id="legacy-event",
        session_id="legacy-session",
        role="user",
        type="user_input",
        content="An earlier question",
        sequence_number=1,
    ))
    db.commit()

    bootstrap = client.get("/api/auth/session", params={"guest_user_id": user_id})
    second = _start_message(client, user_id, "new-session", "new-event")

    assert bootstrap.json()["quotas"]["guest_sessions"]["used"] == 1
    assert bootstrap.json()["quotas"]["guest_messages"]["used"] == 1
    assert bootstrap.json()["quotas"]["guest_messages"]["remaining"] == 2
    assert second.status_code == 429


def test_second_guest_session_is_rejected_without_partial_writes(client, db):
    user_id = _bootstrap_guest(client, db)
    assert _start_message(client, user_id, "guest-session-1", "guest-event-1").status_code == 200

    second = _start_message(client, user_id, "guest-session-2", "guest-event-2")

    assert second.status_code == 429
    detail = second.json()["detail"]
    assert detail == {
        "error_code": "guest_quota_exhausted",
        "message": "The guest preview has reached its limit.",
        "capability": "create_session",
        "quota": "guest_sessions",
        "limit": 1,
        "used": 1,
        "requires_authentication": True,
    }
    assert db.query(SessionModel).filter(SessionModel.id == "guest-session-2").first() is None
    assert db.query(SessionEvent).filter(SessionEvent.id == "guest-event-2").first() is None


def test_fourth_message_in_guest_session_is_rejected(client, db):
    user_id = _bootstrap_guest(client, db)
    assert _start_message(client, user_id, "guest-session-1", "guest-event-1").status_code == 200

    for event_id in ("guest-event-2", "guest-event-3"):
        response = client.post(
            "/api/sessions/guest-session-1/events",
            json=[{
                "id": event_id,
                "role": "user",
                "event_type": "user_input",
                "content": "A follow-up",
            }],
        )
        assert response.status_code == 200

    response = client.post(
        "/api/sessions/guest-session-1/events",
        json=[{
            "id": "guest-event-4",
            "role": "user",
            "event_type": "user_input",
            "content": "Tell me more",
        }],
    )

    assert response.status_code == 429
    assert response.json()["detail"]["capability"] == "send_message"
    assert db.query(SessionEvent).filter(SessionEvent.id == "guest-event-4").first() is None


def test_guest_chat_must_reference_a_persisted_message(client, db):
    user_id = _bootstrap_guest(client, db)
    assert _start_message(client, user_id, "guest-session-1", "guest-event-1").status_code == 200

    response = client.post(
        "/api/session/chat-stream",
        json={
            "session_id": "guest-session-1",
            "trigger_event_id": "guest-event-2",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Trigger event not found"


def test_guest_cookie_cannot_access_another_user_workspace(client, db):
    user_id = _bootstrap_guest(client, db)
    db.add(User(user_id="other-guest", device_id="other-guest"))
    db.commit()

    response = client.get("/api/sessions", params={"user_id": "other-guest"})

    assert response.status_code == 403
    assert response.json()["detail"]["error_code"] == "principal_mismatch"
    assert user_id != "other-guest"


def test_session_routes_reject_uncredentialed_device_ids(client):
    response = client.post(
        "/api/sessions",
        params={"user_id": "uncredentialed-device"},
        json={"session_id": "forged-session"},
    )

    assert response.status_code == 401
    assert response.json()["detail"]["error_code"] == "guest_session_required"


def test_guest_cannot_save_artwork_outside_preview_session(client, db):
    user_id = _bootstrap_guest(client, db)

    response = client.post(
        "/api/artworks/upload",
        files={"image": ("art.jpg", io.BytesIO(b"stub"), "image/jpeg")},
        data={"user_id": user_id},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == {
        "error_code": "capability_required",
        "message": "Sign in to use this feature.",
        "capability": "save_artwork",
        "requires_authentication": True,
    }


def test_guest_can_upload_only_one_artwork_in_the_preview_session(client, db, monkeypatch):
    async def fake_process_image(_image):
        return b"image-bytes", {}

    monkeypatch.setattr(artwork_ingest, "process_image", fake_process_image)
    monkeypatch.setattr(artwork_ingest, "get_storage_service", lambda: _FakeStorage())
    user_id = _bootstrap_guest(client, db)
    assert _start_message(client, user_id, "guest-session-1", "guest-event-1").status_code == 200

    first = client.post(
        "/api/artworks/upload",
        files={"image": ("art.jpg", io.BytesIO(b"first"), "image/jpeg")},
        data={
            "user_id": user_id,
            "session_id": "guest-session-1",
            "request_id": "guest-artwork-request-1",
        },
    )
    assert first.status_code == 200

    # Simulate a workspace created before the artwork quota existed. The next
    # bootstrap must recover usage from the canonical artwork record.
    db.query(GuestQuotaReservation).filter(
        GuestQuotaReservation.quota_key == "guest_artworks",
    ).delete()
    db.commit()
    snapshot = client.get("/api/auth/session")
    assert snapshot.json()["quotas"]["guest_artworks"]["remaining"] == 0

    second = client.post(
        "/api/artworks/upload",
        files={"image": ("art.jpg", io.BytesIO(b"second"), "image/jpeg")},
        data={
            "user_id": user_id,
            "session_id": "guest-session-1",
            "request_id": "guest-artwork-request-2",
        },
    )

    assert second.status_code == 429
    assert second.json()["detail"]["quota"] == "guest_artworks"
    assert second.json()["detail"]["capability"] == "analyze_artwork"


def test_artwork_ingest_rejects_forged_guest_user_id(client, db):
    _bootstrap_guest(client, db)

    response = client.post(
        "/api/artworks/upload",
        files={"image": ("art.jpg", io.BytesIO(b"stub"), "image/jpeg")},
        data={"user_id": "someone-else"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["error_code"] == "principal_mismatch"


def test_guest_cannot_load_collection_data(client, db):
    user_id = _bootstrap_guest(client, db)

    artworks = client.get("/api/artworks", params={"user_id": user_id})
    boards = client.get("/api/collections", params={"user_id": user_id})

    for response in (artworks, boards):
        assert response.status_code == 403
        assert response.json()["detail"]["error_code"] == "capability_required"
        assert response.json()["detail"]["capability"] == "search_collection"


def test_collection_api_rejects_spoofed_user_id(client, db):
    _bootstrap_guest(client, db)

    response = client.get("/api/artworks", params={"user_id": "someone-else"})

    assert response.status_code == 403
    assert response.json()["detail"]["error_code"] == "principal_mismatch"


def test_guest_cookie_mutations_reject_untrusted_origins(client, db):
    user_id = _bootstrap_guest(client, db)

    response = client.post(
        "/api/sessions/start-with-event",
        params={"user_id": user_id},
        headers={"Origin": "https://attacker.example"},
        json={
            "session_id": "blocked-session",
            "event": {
                "id": "blocked-event",
                "role": "user",
                "event_type": "user_input",
                "content": "Consume the preview",
            },
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"]["error_code"] == "origin_not_allowed"
    assert db.query(GuestQuotaReservation).count() == 0


def test_google_login_promotes_only_cookie_bound_guest_workspace(client, db):
    user_id = _bootstrap_guest(client, db, legacy_user_id="guest-to-promote")
    assert _start_message(client, user_id, "promoted-session", "promoted-event").status_code == 200
    db.add(User(user_id="forged-guest", device_id="forged-guest", tier="free"))
    db.commit()

    with patch("app.routers.auth.verify_google_token") as verify:
        verify.return_value = {
            "sub": "promotion-google-id",
            "email": "promotion@example.com",
            "name": "Promoted User",
            "picture": None,
        }
        response = client.post("/api/auth/google", json={
            "id_token": "fake",
            "anonymous_user_id": "forged-guest",
        })

    assert response.status_code == 200
    target_user_id = response.json()["user"]["user_id"]
    assert response.json()["guest_promoted"] is True
    assert db.query(SessionModel).filter(
        SessionModel.id == "promoted-session",
        SessionModel.user_id == target_user_id,
    ).count() == 1
    assert db.query(User).filter(User.user_id == "guest-to-promote").first() is None
    assert db.query(User).filter(User.user_id == "forged-guest").first() is not None
    assert db.query(GuestWorkspace).count() == 0
    assert settings.guest_cookie_name not in client.cookies

    with patch("app.routers.auth.verify_google_token") as verify:
        verify.return_value = {
            "sub": "promotion-google-id",
            "email": "promotion@example.com",
            "name": "Promoted User",
            "picture": None,
        }
        retry = client.post("/api/auth/google", json={"id_token": "fake"})

    assert retry.status_code == 200
    assert retry.json()["guest_promoted"] is False
    assert db.query(SessionModel).filter(SessionModel.id == "promoted-session").count() == 1
    assert db.query(AuthSession).filter(AuthSession.user_id == target_user_id).count() == 2

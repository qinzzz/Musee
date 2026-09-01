"""End-to-end tests for email/password auth and account unification."""
import re
from unittest.mock import patch

import pytest

from app.config.settings import settings
from app.database.models import (
    DailyUsage,
    GuestWorkspace,
    SavedArtwork,
    TasteProfile,
    User,
    UserCredential,
)
from app.services.auth_session_service import CLIENT_PLATFORM_HEADER


@pytest.fixture
def sent_emails(monkeypatch):
    """Capture outbound emails; exposes the last token per recipient."""
    sent = []

    async def _capture(*, to, subject, html):
        sent.append({"to": to, "subject": subject, "html": html})
        return True

    monkeypatch.setattr("app.routers.auth_email.send_email", _capture)
    return sent


def _extract_token(email_html: str) -> str:
    match = re.search(r"token=([A-Za-z0-9_\-]+)", email_html)
    assert match, "no token link found in email"
    return match.group(1)


def _signup(client, email="ada@example.com", password="correct-horse", anon=None):
    return client.post("/api/auth/signup", json={
        "email": email, "password": password, "anonymous_user_id": anon,
    })


def _google_login(client, email, google_id="g-123", anon=None):
    with patch("app.routers.auth.verify_google_token") as mock_verify:
        mock_verify.return_value = {
            "sub": google_id, "email": email, "name": "Ada", "picture": None,
        }
        return client.post("/api/auth/google", json={
            "id_token": "fake", "anonymous_user_id": anon,
        })


class TestSignupVerifyLogin:
    def test_happy_path(self, client, sent_emails):
        r = _signup(client)
        assert r.status_code == 200
        assert r.json()["verification_required"] is True

        # Cannot log in before verifying.
        r = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "correct-horse"})
        assert r.status_code == 403
        assert r.json()["detail"]["error_code"] == "email_unverified"

        # Clicking the link verifies AND logs in.
        token = _extract_token(sent_emails[-1]["html"])
        r = client.post("/api/auth/verify-email", json={"token": token})
        assert r.status_code == 200
        body = r.json()
        assert body["access_token"]
        assert body["user"]["email"] == "ada@example.com"
        assert body["user"]["email_verified"] is True
        assert body["user"]["tier"] == "unlimited"
        assert body["is_new_user"] is True

        # Password login now works; email is case/whitespace-insensitive.
        r = client.post("/api/auth/login", json={"email": "  ADA@Example.com ", "password": "correct-horse"})
        assert r.status_code == 200
        assert r.json()["is_new_user"] is False

    def test_mobile_session_transport_covers_email_auth_entrypoints(self, client, sent_emails):
        mobile_headers = {CLIENT_PLATFORM_HEADER: "ios"}
        _signup(client)

        verification_token = _extract_token(sent_emails[-1]["html"])
        verified = client.post(
            "/api/auth/verify-email",
            json={"token": verification_token},
            headers=mobile_headers,
        )
        assert verified.status_code == 200
        assert verified.json()["refresh_token"]
        assert settings.refresh_cookie_name not in client.cookies

        logged_in = client.post(
            "/api/auth/login",
            json={"email": "ada@example.com", "password": "correct-horse"},
            headers=mobile_headers,
        )
        assert logged_in.status_code == 200
        assert logged_in.json()["refresh_token"]
        assert settings.refresh_cookie_name not in client.cookies

        client.post("/api/auth/request-password-reset", json={"email": "ada@example.com"})
        reset_token = _extract_token(sent_emails[-1]["html"])
        reset = client.post(
            "/api/auth/reset-password",
            json={"token": reset_token, "new_password": "mobile-new-password"},
            headers=mobile_headers,
        )
        assert reset.status_code == 200
        assert reset.json()["refresh_token"]
        assert settings.refresh_cookie_name not in client.cookies

    def test_wrong_password_and_unknown_email_are_indistinguishable(self, client, sent_emails):
        _signup(client)
        token = _extract_token(sent_emails[-1]["html"])
        client.post("/api/auth/verify-email", json={"token": token})

        wrong = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "nope-nope-nope"})
        unknown = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-nope"})
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json() == unknown.json()

    def test_signup_validation(self, client, sent_emails):
        assert _signup(client, email="not-an-email").status_code == 400
        assert _signup(client, password="short").status_code == 400

    def test_verified_email_cannot_be_resignup(self, client, sent_emails):
        _signup(client)
        token = _extract_token(sent_emails[-1]["html"])
        client.post("/api/auth/verify-email", json={"token": token})

        r = _signup(client, password="another-password")
        assert r.status_code == 409
        assert r.json()["detail"]["error_code"] == "email_exists"

    def test_unverified_resignup_resends_and_updates_password(self, client, sent_emails):
        _signup(client, password="first-password")
        r = _signup(client, password="second-password")
        assert r.status_code == 200
        assert len(sent_emails) == 2

        # Old link was invalidated by the reissue; new one works.
        old_token = _extract_token(sent_emails[0]["html"])
        new_token = _extract_token(sent_emails[1]["html"])
        assert client.post("/api/auth/verify-email", json={"token": old_token}).status_code == 400
        assert client.post("/api/auth/verify-email", json={"token": new_token}).status_code == 200

        # The most recently set password is the live one.
        assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "first-password"}).status_code == 401
        assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "second-password"}).status_code == 200


class TestAccountUnification:
    def test_google_after_password_lands_in_same_account(self, client, sent_emails, db):
        _signup(client)
        token = _extract_token(sent_emails[-1]["html"])
        user_id = client.post("/api/auth/verify-email", json={"token": token}).json()["user"]["user_id"]

        r = _google_login(client, "ada@example.com")
        assert r.status_code == 200
        assert r.json()["user"]["user_id"] == user_id
        # Verified password account keeps its credential after linking.
        assert db.query(UserCredential).filter(UserCredential.user_id == user_id).first()

    def test_google_link_removes_unverified_squatter_credential(self, client, sent_emails, db):
        # Attacker signs up with the victim's email but can never verify it.
        _signup(client, email="victim@example.com", password="attacker-pass")

        # Victim signs in with Google: same email, proven ownership.
        r = _google_login(client, "victim@example.com")
        assert r.status_code == 200
        user_id = r.json()["user"]["user_id"]

        # The unproven credential is gone: attacker's password no longer exists.
        # (The account is now Google-linked with no credential, so the login
        # returns the set-password guidance rather than generic 401 — either
        # way, the password does not work.)
        assert db.query(UserCredential).filter(UserCredential.user_id == user_id).first() is None
        r = client.post("/api/auth/login", json={"email": "victim@example.com", "password": "attacker-pass"})
        assert r.status_code == 403
        assert r.json()["detail"]["error_code"] == "password_not_set"

    def test_google_first_user_adds_password_via_reset_flow(self, client, sent_emails, db):
        google_signup = _google_login(client, "ada@example.com")
        assert google_signup.json()["user"]["tier"] == "unlimited"

        r = client.post("/api/auth/request-password-reset", json={"email": "ada@example.com"})
        assert r.status_code == 200
        assert "Set a password" in sent_emails[-1]["subject"]  # Google-first variant

        token = _extract_token(sent_emails[-1]["html"])
        r = client.post("/api/auth/reset-password", json={"token": token, "new_password": "my-new-pass"})
        assert r.status_code == 200

        # Both methods now reach the same account.
        password_login = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "my-new-pass"})
        google_login = _google_login(client, "ada@example.com")
        assert password_login.json()["user"]["user_id"] == google_login.json()["user"]["user_id"]


class TestPasswordReset:
    def test_reset_flow(self, client, sent_emails):
        _signup(client)
        client.post("/api/auth/verify-email", json={"token": _extract_token(sent_emails[-1]["html"])})

        client.post("/api/auth/request-password-reset", json={"email": "ada@example.com"})
        assert "Reset" in sent_emails[-1]["subject"]
        token = _extract_token(sent_emails[-1]["html"])

        r = client.post("/api/auth/reset-password", json={"token": token, "new_password": "brand-new-pass"})
        assert r.status_code == 200
        assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "correct-horse"}).status_code == 401
        assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "brand-new-pass"}).status_code == 200

        # Single use.
        r = client.post("/api/auth/reset-password", json={"token": token, "new_password": "again-again"})
        assert r.status_code == 400

    def test_unknown_email_is_silent(self, client, sent_emails):
        r = client.post("/api/auth/request-password-reset", json={"email": "ghost@example.com"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        assert sent_emails == []

    def test_invalid_token_rejected(self, client, sent_emails):
        r = client.post("/api/auth/reset-password", json={"token": "bogus", "new_password": "whatever-pass"})
        assert r.status_code == 400


class TestAnonymousAdoption:
    def _seed_anon(self, db, anon_id="device-1"):
        anon = User(user_id=anon_id, device_id=anon_id, tier="free")
        db.add(anon)
        db.flush()
        db.add(SavedArtwork(id="art-1", photo_uri="r2://a", artist_name="X", artwork_name="Y", user_id=anon_id))
        db.add(DailyUsage(user_id=anon_id, day=__import__("datetime").date.today(),
                          tokens_in=100, tokens_out=50, artworks_uploaded=3))
        db.add(TasteProfile(user_id=anon_id, status="ready"))
        db.commit()

    def _bind_guest_cookie(self, client, anon_id):
        response = client.get("/api/auth/session", params={"guest_user_id": anon_id})
        assert response.status_code == 200
        assert response.json()["principal"]["user_id"] == anon_id

    def test_records_carry_over_at_verification(self, client, sent_emails, db):
        self._seed_anon(db)
        self._bind_guest_cookie(client, "device-1")

        _signup(client, anon="forged-device")
        token = _extract_token(sent_emails[-1]["html"])
        # Verification may open outside the original guest tab. The email
        # token carries the server-resolved association from signup.
        client.cookies.delete(settings.guest_cookie_name)
        r = client.post("/api/auth/verify-email", json={"token": token})
        user_id = r.json()["user"]["user_id"]

        assert r.json()["guest_promoted"] is True
        promoted_artwork = db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id).one()
        assert promoted_artwork.device_id == user_id
        usage = db.query(DailyUsage).filter(DailyUsage.user_id == user_id).one()
        assert (usage.tokens_in, usage.tokens_out, usage.artworks_uploaded) == (100, 50, 3)
        assert db.query(TasteProfile).filter(TasteProfile.user_id == user_id).count() == 1
        assert db.query(User).filter(User.user_id == "device-1").first() is None
        assert db.query(GuestWorkspace).count() == 0
        assert settings.guest_cookie_name not in client.cookies

    def test_daily_usage_sums_when_both_have_counters(self, client, sent_emails, db):
        self._seed_anon(db)
        self._bind_guest_cookie(client, "device-1")
        _signup(client, anon="forged-device")
        token = _extract_token(sent_emails[-1]["html"])
        user_id = client.post("/api/auth/verify-email", json={"token": token}).json()["user"]["user_id"]

        # Second device with its own usage today adopts on login.
        import datetime
        anon2 = User(user_id="device-2", device_id="device-2", tier="free")
        db.add(anon2)
        db.add(DailyUsage(user_id="device-2", day=datetime.date.today(),
                          tokens_in=10, tokens_out=5, artworks_uploaded=2))
        db.commit()
        self._bind_guest_cookie(client, "device-2")

        r = client.post("/api/auth/login", json={
            "email": "ada@example.com", "password": "correct-horse", "anonymous_user_id": "forged-device",
        })
        assert r.status_code == 200

        usage = db.query(DailyUsage).filter(DailyUsage.user_id == user_id).one()
        assert (usage.tokens_in, usage.tokens_out, usage.artworks_uploaded) == (110, 55, 5)

    def test_forged_anonymous_id_is_ignored_without_guest_cookie(self, client, sent_emails, db):
        self._seed_anon(db, anon_id="forged-device")
        _signup(client)
        token = _extract_token(sent_emails[-1]["html"])
        client.post("/api/auth/verify-email", json={"token": token})

        response = client.post("/api/auth/login", json={
            "email": "ada@example.com",
            "password": "correct-horse",
            "anonymous_user_id": "forged-device",
        })

        assert response.status_code == 200
        assert response.json()["guest_promoted"] is False
        assert db.query(User).filter(User.user_id == "forged-device").first() is not None

    def test_real_accounts_are_never_absorbed(self, client, sent_emails, db):
        # A verified (real) account id passed as "anonymous" must be ignored.
        _signup(client, email="other@example.com", password="other-pass-123")
        token = _extract_token(sent_emails[-1]["html"])
        other_id = client.post("/api/auth/verify-email", json={"token": token}).json()["user"]["user_id"]

        r = _google_login(client, "ada@example.com", anon=other_id)
        assert r.status_code == 200
        assert db.query(User).filter(User.user_id == other_id).first() is not None


class TestGoogleFirstLoginGuidance:
    def test_google_only_account_gets_set_password_guidance(self, client, sent_emails):
        _google_login(client, "ada@example.com")

        r = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "any-password-1"})
        assert r.status_code == 403
        assert r.json()["detail"]["error_code"] == "password_not_set"

    def test_unknown_email_stays_generic(self, client, sent_emails):
        # The guidance must not widen the login oracle for unregistered emails.
        r = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "any-password-1"})
        assert r.status_code == 401
        assert r.json()["detail"]["error_code"] == "invalid_credentials"

    def test_google_account_with_password_set_uses_normal_login(self, client, sent_emails):
        _google_login(client, "ada@example.com")
        client.post("/api/auth/request-password-reset", json={"email": "ada@example.com"})
        token = _extract_token(sent_emails[-1]["html"])
        client.post("/api/auth/reset-password", json={"token": token, "new_password": "my-real-pass"})

        # Wrong password on a credentialed account: generic, not guidance.
        r = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "wrong-password"})
        assert r.status_code == 401
        assert r.json()["detail"]["error_code"] == "invalid_credentials"


class TestResetPasswordAdoption:
    def test_reset_password_adopts_device_account(self, client, sent_emails, db):
        # Google-first user sets a password from a device holding anonymous data
        # (the exact funnel the password_not_set guidance sends people through).
        _google_login(client, "ada@example.com")

        anon = User(user_id="device-9", device_id="device-9", tier="free")
        db.add(anon)
        db.flush()
        db.add(SavedArtwork(id="art-9", photo_uri="r2://a", artist_name="X", artwork_name="Y", user_id="device-9"))
        db.commit()
        guest = client.get("/api/auth/session", params={"guest_user_id": "device-9"})
        assert guest.json()["principal"]["user_id"] == "device-9"

        client.post("/api/auth/request-password-reset", json={"email": "ada@example.com"})
        token = _extract_token(sent_emails[-1]["html"])
        r = client.post("/api/auth/reset-password", json={
            "token": token, "new_password": "brand-new-pass", "anonymous_user_id": "forged-device",
        })
        assert r.status_code == 200
        user_id = r.json()["user"]["user_id"]

        assert db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id).count() == 1
        assert db.query(User).filter(User.user_id == "device-9").first() is None

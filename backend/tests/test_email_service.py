"""Email service: console fallback and template shape."""
import pytest

from app.services.email_service import (
    build_password_reset_email,
    build_verification_email,
    send_email,
)


@pytest.mark.asyncio
async def test_console_fallback_when_no_esp_key(caplog):
    # Test settings have no RESEND_API_KEY: the message is logged, not sent,
    # and the call reports success so flows proceed in dev/CI.
    with caplog.at_level("INFO"):
        ok = await send_email(to="user@example.com", subject="Hi", html="<p>link</p>")
    assert ok is True
    assert any("console fallback" in r.message and "user@example.com" in r.message for r in caplog.records)


def test_verification_email_contains_link():
    subject, html = build_verification_email("https://app.test/verify-email?token=abc")
    assert "Confirm" in subject
    assert "https://app.test/verify-email?token=abc" in html


def test_reset_email_adapts_to_google_first_accounts():
    _, reset_html = build_password_reset_email("https://app.test/reset?token=t", has_password=True)
    assert "Reset password" in reset_html

    subject, set_html = build_password_reset_email("https://app.test/reset?token=t", has_password=False)
    assert "Set a password" in subject
    assert "signs in with Google" in set_html

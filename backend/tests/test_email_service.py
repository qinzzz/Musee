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


@pytest.mark.asyncio
async def test_smtp_transport_selected_when_configured(monkeypatch):
    from unittest.mock import MagicMock, patch

    from app.config.settings import settings
    from app.services import email_service

    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_username", "musee@example.com")
    monkeypatch.setattr(settings, "smtp_password", "app-password")

    smtp_instance = MagicMock()
    with patch.object(email_service.smtplib, "SMTP") as mock_smtp:
        mock_smtp.return_value.__enter__.return_value = smtp_instance
        ok = await email_service.send_email(to="user@example.com", subject="Hi", html="<p>link</p>")

    assert ok is True
    smtp_instance.starttls.assert_called_once()
    smtp_instance.login.assert_called_once_with("musee@example.com", "app-password")
    (sent_message,) = smtp_instance.send_message.call_args.args
    assert sent_message["To"] == "user@example.com"
    assert sent_message["Subject"] == "Hi"


@pytest.mark.asyncio
async def test_smtp_failure_reports_false_without_raising(monkeypatch):
    from unittest.mock import patch

    from app.config.settings import settings
    from app.services import email_service

    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_username", "musee@example.com")
    monkeypatch.setattr(settings, "smtp_password", "wrong")

    with patch.object(email_service.smtplib, "SMTP", side_effect=OSError("connection refused")):
        ok = await email_service.send_email(to="user@example.com", subject="Hi", html="<p>x</p>")
    assert ok is False

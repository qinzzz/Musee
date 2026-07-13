"""Outbound email — thin wrapper over the ESP with a console fallback.

When RESEND_API_KEY is unset (local dev, CI), the message is logged instead
of sent, so every email flow is fully exercisable with zero external setup:
the link to click appears in the backend console.
"""
import logging
from typing import Optional

import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


async def send_email(*, to: str, subject: str, html: str) -> bool:
    """Send an email; returns True if handed off (or logged in dev mode).

    Never raises into product flow — a failed send is logged and reported
    as False so callers can surface "try again" without a 500.
    """
    if not settings.resend_api_key:
        logger.info("EMAIL (console fallback) to=%s subject=%r\n%s", to, subject, html)
        return True

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                RESEND_API_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
        if response.status_code >= 400:
            logger.error("Email send failed (%s): %s", response.status_code, response.text[:500])
            return False
        return True
    except Exception:
        logger.exception("Email send failed for %s", to)
        return False


def _layout(title: str, body_html: str, button_label: Optional[str], button_url: Optional[str]) -> str:
    button = (
        f'<a href="{button_url}" style="display:inline-block;padding:12px 24px;'
        f'background:#171717;color:#ffffff;text-decoration:none;border-radius:12px;'
        f'font-weight:600">{button_label}</a>'
        if button_url else ""
    )
    return f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#171717">
  <h2 style="margin:0 0 16px">{title}</h2>
  <div style="font-size:14px;line-height:1.6;color:#404040">{body_html}</div>
  <div style="margin:28px 0">{button}</div>
  <p style="font-size:12px;color:#a3a3a3">If you didn't request this, you can safely ignore this email.</p>
</div>"""


def build_verification_email(link: str) -> tuple[str, str]:
    subject = "Confirm your email for Musee"
    html = _layout(
        "Confirm your email",
        "<p>Click below to verify your email address and finish setting up your Musee account. "
        "This link expires in 24 hours.</p>",
        "Verify email",
        link,
    )
    return subject, html


def build_password_reset_email(link: str, *, has_password: bool) -> tuple[str, str]:
    if has_password:
        subject = "Reset your Musee password"
        intro = "<p>Click below to choose a new password. This link expires in 30 minutes.</p>"
        label = "Reset password"
    else:
        # Google-first account adding manual login for the first time.
        subject = "Set a password for your Musee account"
        intro = ("<p>Your account currently signs in with Google. Click below to set a password "
                 "so you can also log in with your email. This link expires in 30 minutes.</p>")
        label = "Set password"
    return subject, _layout(subject, intro, label, link)

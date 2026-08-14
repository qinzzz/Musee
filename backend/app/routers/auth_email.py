"""Email/password authentication.

Design rule shared with the Google flow: email is the account key, and
attaching any credential to an email requires proof of inbox ownership.
Password signups prove it by clicking the verification link (which also
adopts the device account and logs the user in); Google proves it via the
verified token. Until verified, a password account cannot log in and is
treated as unclaimed territory by the linking rules.
"""
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config.plans import NEW_REGISTRATION_TIER
from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import User, UserCredential
from app.services.account_service import adopt_anonymous_account
from app.services.email_service import (
    build_password_reset_email,
    build_verification_email,
    send_email,
)
from app.services.email_token_service import (
    PURPOSE_RESET_PASSWORD,
    PURPOSE_VERIFY_EMAIL,
    consume_email_token,
    create_email_token,
)
from app.services.auth_session_service import issue_login_session
from app.utils.passwords import MIN_PASSWORD_LENGTH, hash_password, verify_password
from app.utils.rate_limit import rate_limit

router = APIRouter()
logger = logging.getLogger(__name__)

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupRequest(BaseModel):
    email: str
    password: str
    anonymous_user_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str
    anonymous_user_id: Optional[str] = None


class VerifyEmailRequest(BaseModel):
    token: str


class RequestPasswordResetRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    anonymous_user_id: Optional[str] = None


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _validate_signup_input(email: str, password: str) -> None:
    if not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=400, detail={"error_code": "invalid_email"})
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail={
            "error_code": "weak_password",
            "message": f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        })


def _set_credential(db: Session, user_id: str, password: str) -> None:
    credential = db.query(UserCredential).filter(UserCredential.user_id == user_id).first()
    if credential:
        credential.password_hash = hash_password(password)
    else:
        db.add(UserCredential(user_id=user_id, password_hash=hash_password(password)))


async def _send_verification(db: Session, user: User, anonymous_user_id: Optional[str]) -> bool:
    raw_token = create_email_token(
        db,
        user_id=user.user_id,
        purpose=PURPOSE_VERIFY_EMAIL,
        anonymous_user_id=anonymous_user_id,
    )
    link = f"{settings.app_base_url}/verify-email?token={raw_token}"
    subject, html = build_verification_email(link)
    return await send_email(to=user.email, subject=subject, html=html)


@router.post("/auth/signup", dependencies=[Depends(rate_limit(5, 300))])
async def signup(request: SignupRequest, db: Session = Depends(get_db)):
    email = _normalize_email(request.email)
    _validate_signup_input(email, request.password)

    user = db.query(User).filter(User.email == email).first()

    if user and user.email_verified:
        # Signup necessarily reveals existence; keep the message actionable.
        raise HTTPException(status_code=409, detail={
            "error_code": "email_exists",
            "message": "An account with this email already exists. Sign in instead"
                       + (" (this account uses Google sign-in)." if user.google_id else "."),
        })

    if user:
        # Unverified re-signup: whoever proves the inbox owns the account, so
        # the latest password + a fresh link simply replace the previous try.
        _set_credential(db, user.user_id, request.password)
    else:
        user = User(
            email=email,
            email_verified=False,
            tier=NEW_REGISTRATION_TIER,
        )
        db.add(user)
        db.flush()
        _set_credential(db, user.user_id, request.password)

    email_sent = await _send_verification(db, user, request.anonymous_user_id)
    db.commit()
    return {"ok": True, "verification_required": True, "email_sent": email_sent}


@router.post("/auth/login", dependencies=[Depends(rate_limit(10, 60))])
async def login(request: LoginRequest, response: Response, db: Session = Depends(get_db)):
    email = _normalize_email(request.email)
    user = db.query(User).filter(User.email == email).first()
    credential = (
        db.query(UserCredential).filter(UserCredential.user_id == user.user_id).first()
        if user else None
    )

    # A Google-linked account with no password gets actionable guidance —
    # signup already discloses existence and method for any email, so this
    # reveals nothing new. Unknown emails and wrong passwords stay
    # indistinguishable from each other.
    if user and user.google_id and not credential:
        raise HTTPException(status_code=403, detail={
            "error_code": "password_not_set",
            "message": "This account signs in with Google. Set a password to log in with email.",
        })

    # One failure for every other wrong-credential case: no oracle for which part failed.
    if not user or not credential or not verify_password(request.password, credential.password_hash):
        raise HTTPException(status_code=401, detail={"error_code": "invalid_credentials"})

    if not user.email_verified:
        raise HTTPException(status_code=403, detail={
            "error_code": "email_unverified",
            "message": "Check your inbox for the verification link, or sign up again to resend it.",
        })

    if request.anonymous_user_id:
        adopt_anonymous_account(db, request.anonymous_user_id, user)
    return issue_login_session(db, response, user)


@router.post("/auth/verify-email", dependencies=[Depends(rate_limit(10, 60))])
async def verify_email(request: VerifyEmailRequest, response: Response, db: Session = Depends(get_db)):
    token = consume_email_token(db, raw_token=request.token, purpose=PURPOSE_VERIFY_EMAIL)
    if not token:
        raise HTTPException(status_code=400, detail={
            "error_code": "invalid_token",
            "message": "This link is invalid or has expired. Sign up again to get a new one.",
        })

    user = db.query(User).filter(User.user_id == token.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_token"})

    user.email_verified = True
    # Adoption happens here — at proof time, not signup — so device records
    # can never end up on an account someone else later proves to own.
    if token.anonymous_user_id:
        adopt_anonymous_account(db, token.anonymous_user_id, user)
    return issue_login_session(db, response, user)


@router.post("/auth/request-password-reset", dependencies=[Depends(rate_limit(3, 300))])
async def request_password_reset(request: RequestPasswordResetRequest, db: Session = Depends(get_db)):
    email = _normalize_email(request.email)
    user = db.query(User).filter(User.email == email).first()

    if user:
        has_password = (
            db.query(UserCredential).filter(UserCredential.user_id == user.user_id).first()
            is not None
        )
        raw_token = create_email_token(db, user_id=user.user_id, purpose=PURPOSE_RESET_PASSWORD)
        link = f"{settings.app_base_url}/reset-password?token={raw_token}"
        subject, html = build_password_reset_email(link, has_password=has_password)
        await send_email(to=user.email, subject=subject, html=html)
        db.commit()

    # Identical response whether or not the account exists (no enumeration).
    return {"ok": True}


@router.post("/auth/reset-password", dependencies=[Depends(rate_limit(10, 60))])
async def reset_password(request: ResetPasswordRequest, response: Response, db: Session = Depends(get_db)):
    if len(request.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail={
            "error_code": "weak_password",
            "message": f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        })

    token = consume_email_token(db, raw_token=request.token, purpose=PURPOSE_RESET_PASSWORD)
    if not token:
        raise HTTPException(status_code=400, detail={
            "error_code": "invalid_token",
            "message": "This link is invalid or has expired. Request a new one.",
        })

    user = db.query(User).filter(User.user_id == token.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_token"})

    _set_credential(db, user.user_id, request.new_password)
    # Clicking an emailed link is proof of inbox ownership.
    user.email_verified = True
    # Reset ends signed-in, so it adopts the device account like every other
    # door into an account (the id comes from the browser where the form was
    # filled — the right device for the data).
    if request.anonymous_user_id:
        adopt_anonymous_account(db, request.anonymous_user_id, user)
    return issue_login_session(db, response, user)

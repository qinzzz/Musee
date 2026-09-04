from __future__ import annotations

import asyncio

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.models import User as UserModel

from app.config.plans import ARTWORK_UPLOADS, STORED_ARTWORKS
from app.services.quota_service import check_quota

ACTIVE_ARTWORK_TASKS: set[asyncio.Task] = set()


def track_artwork_task(task: asyncio.Task) -> asyncio.Task:
    ACTIVE_ARTWORK_TASKS.add(task)
    task.add_done_callback(ACTIVE_ARTWORK_TASKS.discard)
    return task


def check_artwork_quota(user_id: str, db: Session) -> None:
    """Guard for artwork-creating endpoints.

    Policy lives in app/config/plans.py; this just surfaces blocking
    decisions as the HTTP 402 contract the frontend already understands.
    """
    user = db.query(UserModel).filter(UserModel.user_id == user_id).first()
    tier = (user.tier if user else None) or "free"

    for quota in (STORED_ARTWORKS, ARTWORK_UPLOADS):
        decision = check_quota(db, user_id, quota)
        if not decision.allowed:
            raise HTTPException(
                status_code=402,
                detail={
                    **decision.to_error_body(),
                    "code": "quota_exceeded",  # legacy alias of error_code
                    "tier": tier,
                    "message": _quota_message(quota, decision),
                },
            )


def _quota_message(quota: str, decision) -> str:
    limit = decision.status.limit
    if quota == ARTWORK_UPLOADS:
        return f"You have reached today's limit of {limit} artwork uploads."
    return f"You have reached the limit of {limit} stored artworks."

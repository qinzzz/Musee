from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Optional

from app.database.connection import SessionLocal
from app.database.models import AIUsage
from app.services.quota_service import record_token_usage

logger = logging.getLogger(__name__)

AI_USAGE_RUNNING = "running"
AI_USAGE_SUCCEEDED = "succeeded"
AI_USAGE_FAILED = "failed"


def get_ai_model_name(ai_service, fallback: Optional[str] = None) -> Optional[str]:
    """Best-effort model name extraction for real services and test doubles."""
    get_model_name = getattr(ai_service, "get_model_name", None)
    if not callable(get_model_name):
        return fallback
    try:
        return get_model_name()
    except Exception:
        return fallback


def start_ai_usage(
    *,
    user_id: Optional[str],
    job_type: str,
    model: Optional[str],
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
) -> Optional[str]:
    """Create an ai_usage row in a separate, best-effort DB session."""
    usage_id = f"aiu-{uuid.uuid4()}"
    db = None
    try:
        db = SessionLocal()
        db.add(
            AIUsage(
                id=usage_id,
                user_id=user_id,
                job_type=job_type,
                status=AI_USAGE_RUNNING,
                model=model,
                subject_type=subject_type,
                subject_id=subject_id,
                started_at=datetime.now(UTC),
            )
        )
        db.commit()
        return usage_id
    except Exception as exc:
        if db:
            db.rollback()
        logger.warning("Failed to start AI usage log for %s: %s", job_type, exc)
        return None
    finally:
        if db:
            db.close()


def finish_ai_usage(
    usage_id: Optional[str],
    *,
    status: str,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
    error_message: Optional[str] = None,
) -> None:
    """Mark an ai_usage row complete. Never raises into product flow."""
    if not usage_id:
        return

    db = None
    try:
        db = SessionLocal()
        usage = db.query(AIUsage).filter(AIUsage.id == usage_id).first()
        if not usage:
            return
        usage.status = status
        usage.input_tokens = input_tokens
        usage.output_tokens = output_tokens
        usage.error_message = error_message[:2000] if error_message else None
        usage.completed_at = datetime.now(UTC)
        db.commit()
        if usage.user_id and status == "succeeded":
            record_token_usage(
                db,
                usage.user_id,
                tokens_in=input_tokens or 0,
                tokens_out=output_tokens or 0,
            )
    except Exception as exc:
        if db:
            db.rollback()
        logger.warning("Failed to finish AI usage log %s: %s", usage_id, exc)
    finally:
        if db:
            db.close()


def succeed_ai_usage(
    usage_id: Optional[str],
    *,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
) -> None:
    finish_ai_usage(
        usage_id,
        status=AI_USAGE_SUCCEEDED,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


def fail_ai_usage(
    usage_id: Optional[str],
    error: Exception | str,
    *,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
) -> None:
    finish_ai_usage(
        usage_id,
        status=AI_USAGE_FAILED,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        error_message=str(error),
    )

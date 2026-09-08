from __future__ import annotations

import asyncio

import json
import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Session as SessionModel, User
from app.models.ai_job import AIJobType
from app.models.artwork import AIProvider
from app.services.ai_client_interface import AIStreamChunk, AITextResult
from app.services.ai_service import AIServiceFactory
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.artwork_analysis_service import determine_ai_provider
from app.services.auth_session_service import validate_auth_origin
from app.services.authorization_service import (
    GUEST_MESSAGE_QUOTA,
    SEND_MESSAGE,
    RequestPrincipal,
    get_request_principal,
    require_guest_quota_reservation,
    require_capability,
    require_principal_for_user,
    require_session_principal,
)
from app.services.session_chat_service import (
    ResolvedSessionChatRequest,
    SessionChatRequest,
    build_session_chat_items_payload,
    load_bootstrap_image_bytes,
    resolve_session_chat_request,
)
from app.services.retrieval import execute_collection_retrieval, plan_collection_context, retrieve_collection_context
from app.services.retrieval.contracts import RetrievalOutcome, RetrievalPlan, RetrievalTrace
from app.services.retrieval.context_composer import (
    compose_failed_collection_context,
    compose_no_collection_claims_context,
)

router = APIRouter(dependencies=[Depends(validate_auth_origin)])
logger = logging.getLogger(__name__)


@router.post("/session/chat")
async def session_chat(
    request: SessionChatRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
    db: Session = Depends(get_db),
    principal: Optional[RequestPrincipal] = Depends(get_request_principal),
):
    resolved_principal = require_principal_for_user(
        principal,
        principal.user_id if principal else None,
    )
    require_capability(resolved_principal, SEND_MESSAGE)
    session_record = db.query(SessionModel).filter(SessionModel.id == request.session_id).first()
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")
    require_session_principal(resolved_principal, session_record)
    resolved_request = resolve_session_chat_request(db, session_record, request.trigger_event_id)
    if resolved_principal.state == "guest":
        require_guest_quota_reservation(
            db,
            resolved_principal,
            GUEST_MESSAGE_QUOTA,
            request.trigger_event_id,
        )
    current_user = resolved_principal.user if resolved_principal.state == "authenticated" else None
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    retrieval_ai_service = AIServiceFactory.get_fast_service(ai_provider) if current_user else None
    image_bytes_list = await load_bootstrap_image_bytes(
        resolved_request.items,
        resolved_request.conversation_history,
    )

    try:
        retrieval_outcome = await _retrieve_for_request(
            ai_service=retrieval_ai_service,
            db=db,
            current_user=current_user,
            request=resolved_request,
        )
        usage_id = start_ai_usage(
            user_id=resolved_principal.user_id,
            job_type=AIJobType.SESSION_CHAT,
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="session_event",
            subject_id=request.trigger_event_id,
        )
        session_chat_result = getattr(ai_service, "session_chat_result", None)
        chat_kwargs = {
            "items": build_session_chat_items_payload(resolved_request.items),
            "history": resolved_request.conversation_history,
            "new_message": resolved_request.new_message,
            "image_bytes_list": image_bytes_list,
        }
        if retrieval_outcome.context:
            chat_kwargs["retrieval_context"] = retrieval_outcome.context
        if callable(session_chat_result):
            response = await session_chat_result(**chat_kwargs)
        else:
            response = AITextResult(text=await ai_service.session_chat(**chat_kwargs))
        succeed_ai_usage(
            usage_id,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )
        return {"response": response.text}
    except Exception as exc:
        fail_ai_usage(locals().get("usage_id"), exc)
        logger.exception("Session chat failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/session/chat-stream")
async def stream_session_chat(
    request: SessionChatRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
    db: Session = Depends(get_db),
    principal: Optional[RequestPrincipal] = Depends(get_request_principal),
):
    resolved_principal = require_principal_for_user(
        principal,
        principal.user_id if principal else None,
    )
    require_capability(resolved_principal, SEND_MESSAGE)
    session_record = db.query(SessionModel).filter(SessionModel.id == request.session_id).first()
    if session_record is None:
        raise HTTPException(status_code=404, detail="Session not found")
    require_session_principal(resolved_principal, session_record)
    resolved_request = resolve_session_chat_request(db, session_record, request.trigger_event_id)
    if resolved_principal.state == "guest":
        require_guest_quota_reservation(
            db,
            resolved_principal,
            GUEST_MESSAGE_QUOTA,
            request.trigger_event_id,
        )
    current_user = resolved_principal.user if resolved_principal.state == "authenticated" else None
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    retrieval_ai_service = AIServiceFactory.get_fast_service(ai_provider) if current_user else None

    async def event_generator():
        full_text = ""
        input_tokens = None
        output_tokens = None
        usage_id = start_ai_usage(
            user_id=resolved_principal.user_id,
            job_type=AIJobType.SESSION_CHAT,
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="session_event",
            subject_id=request.trigger_event_id,
        )
        try:
            yield _phase_event("planning")
            if current_user is None:
                retrieval_outcome = _skipped_retrieval_outcome()
            elif not resolved_request.has_user_text:
                retrieval_outcome = _planner_skipped_retrieval_outcome(
                    RetrievalPlan(needs_retrieval=False, filters={})
                )
            else:
                try:
                    retrieval_plan = await plan_collection_context(
                        ai_service=retrieval_ai_service,
                        user_id=current_user.user_id,
                        message=resolved_request.new_message,
                        history=resolved_request.conversation_history,
                    )
                except Exception as exc:
                    logger.warning("Personal collection retrieval planning failed: %s", exc)
                    retrieval_plan = None

                if retrieval_plan and retrieval_plan.needs_retrieval:
                    yield _phase_event("retrieving_collection")
                    try:
                        retrieval_outcome = await execute_collection_retrieval(
                            ai_service=retrieval_ai_service,
                            db=db,
                            user_id=current_user.user_id,
                            plan=retrieval_plan,
                            trigger_event_id=request.trigger_event_id,
                        )
                    except Exception as exc:
                        logger.warning("Personal collection retrieval execution failed: %s", exc)
                        retrieval_outcome = _failed_retrieval_outcome("retrieval")
                elif retrieval_plan:
                    retrieval_outcome = _planner_skipped_retrieval_outcome(retrieval_plan)
                else:
                    retrieval_outcome = _failed_retrieval_outcome("planning")

            image_bytes_list = await load_bootstrap_image_bytes(
                resolved_request.items,
                resolved_request.conversation_history,
            )
            stream_chat_result = getattr(ai_service, "stream_session_chat_result", None)
            stream_kwargs = {
                "items": build_session_chat_items_payload(resolved_request.items),
                "history": resolved_request.conversation_history,
                "new_message": resolved_request.new_message,
                "image_bytes_list": image_bytes_list,
            }
            if retrieval_outcome.context:
                stream_kwargs["retrieval_context"] = retrieval_outcome.context
            yield _phase_event("generating_response")
            if callable(stream_chat_result):
                stream = stream_chat_result(**stream_kwargs)
            else:
                async def _legacy_stream():
                    async for text in ai_service.stream_session_chat(**stream_kwargs):
                        yield AIStreamChunk(type="text", text=text)
                stream = _legacy_stream()

            async for chunk in stream:
                if chunk.type == "usage":
                    input_tokens = chunk.input_tokens
                    output_tokens = chunk.output_tokens
                    continue
                full_text += chunk.text
                yield f"event: chunk\ndata: {json.dumps({'type': 'text', 'content': chunk.text})}\n\n"
            succeed_ai_usage(usage_id, input_tokens=input_tokens, output_tokens=output_tokens)
            yield f"event: complete\ndata: {json.dumps({'type': 'result', 'response': full_text, 'retrieval': retrieval_outcome.trace.model_dump()})}\n\n"
        except asyncio.CancelledError:
            fail_ai_usage(usage_id, RuntimeError("Session chat stream cancelled"))
            raise
        except Exception as exc:
            fail_ai_usage(usage_id, exc)
            logger.exception("Session chat stream failed")
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _phase_event(phase: str) -> str:
    return f"event: phase\ndata: {json.dumps({'phase': phase})}\n\n"


async def _retrieve_for_request(
    *,
    ai_service,
    db: Session,
    current_user: Optional[User],
    request: ResolvedSessionChatRequest,
) -> RetrievalOutcome:
    if current_user is None:
        return _skipped_retrieval_outcome()
    if not request.has_user_text:
        return _planner_skipped_retrieval_outcome(
            RetrievalPlan(needs_retrieval=False, filters={})
        )

    try:
        return await retrieve_collection_context(
            ai_service=ai_service,
            db=db,
            user_id=current_user.user_id,
            message=request.new_message,
            history=request.conversation_history,
            trigger_event_id=request.trigger_event.id,
        )
    except Exception as exc:
        logger.warning("Personal collection retrieval failed: %s", exc)
        return _failed_retrieval_outcome("planning_or_retrieval")


def _skipped_retrieval_outcome() -> RetrievalOutcome:
    return RetrievalOutcome(
        plan=RetrievalPlan(needs_retrieval=False, filters={}),
        trace=RetrievalTrace(status="skipped", skip_reason="unauthenticated"),
        context=compose_no_collection_claims_context(),
    )


def _planner_skipped_retrieval_outcome(plan: RetrievalPlan) -> RetrievalOutcome:
    return RetrievalOutcome(
        plan=plan,
        trace=RetrievalTrace(status="skipped", skip_reason="planner_not_needed"),
        context=compose_no_collection_claims_context(),
    )


def _failed_retrieval_outcome(stage: str) -> RetrievalOutcome:
    return RetrievalOutcome(
        plan=RetrievalPlan(needs_retrieval=False, filters={}),
        trace=RetrievalTrace(status="failed", failure_stage=stage),
        context=compose_failed_collection_context(),
    )

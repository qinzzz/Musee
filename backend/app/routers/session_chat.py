from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.models.artwork import AIProvider
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Session as SessionModel
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
    SessionChatRequest,
    build_session_chat_items_payload,
    load_bootstrap_image_bytes,
)

router = APIRouter(dependencies=[Depends(validate_auth_origin)])
logger = logging.getLogger(__name__)


@router.post("/session/chat")
@router.post("/visit/chat")
async def session_chat(
    request: SessionChatRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
    db: Session = Depends(get_db),
    principal: Optional[RequestPrincipal] = Depends(get_request_principal),
):
    claimed_user_id = request.user_id or (principal.user_id if principal else None)
    resolved_principal = require_principal_for_user(principal, claimed_user_id)
    require_capability(resolved_principal, SEND_MESSAGE)
    if resolved_principal.state == "guest":
        if not request.session_id:
            require_guest_quota_reservation(db, resolved_principal, GUEST_MESSAGE_QUOTA, None)
        session_record = db.query(SessionModel).filter(SessionModel.id == request.session_id).first()
        if session_record is None:
            raise HTTPException(status_code=404, detail="Session not found")
        require_session_principal(resolved_principal, session_record)
        require_guest_quota_reservation(
            db,
            resolved_principal,
            GUEST_MESSAGE_QUOTA,
            request.trigger_event_id,
        )
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    image_bytes_list = await load_bootstrap_image_bytes(
        request.items,
        request.conversation_history,
    )

    try:
        usage_id = start_ai_usage(
            user_id=resolved_principal.user_id,
            job_type="session_chat",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="session_event" if request.trigger_event_id else "session",
            subject_id=request.trigger_event_id or request.session_id,
        )
        session_chat_result = getattr(ai_service, "session_chat_result", None)
        chat_kwargs = {
            "items": build_session_chat_items_payload(request.items),
            "history": request.conversation_history,
            "new_message": request.new_message,
            "image_bytes_list": image_bytes_list,
        }
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
        logger.exception("Exhibition chat failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/session/chat-stream")
@router.post("/visit/chat-stream")
async def stream_session_chat(
    request: SessionChatRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
    db: Session = Depends(get_db),
    principal: Optional[RequestPrincipal] = Depends(get_request_principal),
):
    claimed_user_id = request.user_id or (principal.user_id if principal else None)
    resolved_principal = require_principal_for_user(principal, claimed_user_id)
    require_capability(resolved_principal, SEND_MESSAGE)
    if resolved_principal.state == "guest":
        if not request.session_id:
            require_guest_quota_reservation(db, resolved_principal, GUEST_MESSAGE_QUOTA, None)
        session_record = db.query(SessionModel).filter(SessionModel.id == request.session_id).first()
        if session_record is None:
            raise HTTPException(status_code=404, detail="Session not found")
        require_session_principal(resolved_principal, session_record)
        require_guest_quota_reservation(
            db,
            resolved_principal,
            GUEST_MESSAGE_QUOTA,
            request.trigger_event_id,
        )
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    image_bytes_list = await load_bootstrap_image_bytes(
        request.items,
        request.conversation_history,
    )

    async def event_generator():
        full_text = ""
        input_tokens = None
        output_tokens = None
        usage_id = start_ai_usage(
            user_id=resolved_principal.user_id,
            job_type="session_chat",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="session_event" if request.trigger_event_id else "session",
            subject_id=request.trigger_event_id or request.session_id,
        )
        try:
            stream_chat_result = getattr(ai_service, "stream_session_chat_result", None)
            stream_kwargs = {
                "items": build_session_chat_items_payload(request.items),
                "history": request.conversation_history,
                "new_message": request.new_message,
                "image_bytes_list": image_bytes_list,
            }
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
            yield f"event: complete\ndata: {json.dumps({'type': 'result', 'response': full_text})}\n\n"
        except Exception as exc:
            fail_ai_usage(usage_id, exc)
            logger.exception("Exhibition chat stream failed")
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


# Backward-compat aliases for older imports/tests.
visit_chat = session_chat
visit_chat_stream = stream_session_chat

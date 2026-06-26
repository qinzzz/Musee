from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.models.artwork import AIProvider
from app.services.ai_service import AIServiceFactory
from app.services.artwork_analysis_service import determine_ai_provider
from app.services.session_chat_service import (
    SessionChatRequest,
    build_session_chat_items_payload,
    load_bootstrap_image_bytes,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/session/chat")
@router.post("/visit/chat")
async def session_chat(
    request: SessionChatRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    image_bytes_list = await load_bootstrap_image_bytes(
        request.items,
        request.conversation_history,
    )

    try:
        response_text = await ai_service.session_chat(
            items=build_session_chat_items_payload(request.items),
            history=request.conversation_history,
            new_message=request.new_message,
            image_bytes_list=image_bytes_list,
        )
        return {"response": response_text}
    except Exception as exc:
        logger.exception("Exhibition chat failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/session/chat-stream")
@router.post("/visit/chat-stream")
async def stream_session_chat(
    request: SessionChatRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    image_bytes_list = await load_bootstrap_image_bytes(
        request.items,
        request.conversation_history,
    )

    async def event_generator():
        full_text = ""
        try:
            async for chunk in ai_service.stream_session_chat(
                items=build_session_chat_items_payload(request.items),
                history=request.conversation_history,
                new_message=request.new_message,
                image_bytes_list=image_bytes_list,
            ):
                full_text += chunk
                yield f"event: chunk\ndata: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
            yield f"event: complete\ndata: {json.dumps({'type': 'result', 'response': full_text})}\n\n"
        except Exception as exc:
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

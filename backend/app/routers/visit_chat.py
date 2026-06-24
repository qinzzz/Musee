from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.models.artwork import AIProvider
from app.services.ai_service import AIServiceFactory
from app.services.artwork_analysis_service import determine_ai_provider
from app.services.visit_chat_service import (
    VisitChatRequest,
    build_visit_items_payload,
    load_bootstrap_image_bytes,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/visit/chat")
async def visit_chat(
    request: VisitChatRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    image_bytes_list = await load_bootstrap_image_bytes(
        request.items,
        request.conversation_history,
    )

    try:
        response_text = await ai_service.visit_chat(
            items=build_visit_items_payload(request.items),
            history=request.conversation_history,
            new_message=request.new_message,
            image_bytes_list=image_bytes_list,
        )
        return {"response": response_text}
    except Exception as exc:
        logger.exception("Exhibition chat failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/visit/chat-stream")
async def visit_chat_stream(
    request: VisitChatRequest = Body(...),
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
            async for chunk in ai_service.visit_chat_stream(
                items=build_visit_items_payload(request.items),
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

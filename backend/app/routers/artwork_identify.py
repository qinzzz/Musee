from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Optional

import anyio
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import User
from app.models.artwork import AIProvider
from app.services.ai_client_interface import AITextResult
from app.services.ai_service import AIServiceFactory
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.artwork_analysis_service import determine_ai_provider, parse_identify_result, resolve_image_bytes
from app.services.artwork_background_service import (
    check_artwork_quota,
    generate_fun_facts,
    track_artwork_task,
)
from app.services.artwork_enrichment_service import do_artist_bio, run_artist_bio_bg
from app.services.artwork_analysis_task_service import run_artwork_analysis
from app.services.artwork_ingest_service import parse_location_value, resolve_location_payload, save_analyzed_artwork_record_sync
from app.services.artwork_utilities_service import initialize_ai_services
from app.services.session_service import get_session_context, update_session_narrative_task
from app.services.storage import get_storage_service
from app.services.vision_service import get_vision_hint
from app.utils.auth_utils import get_current_user, require_same_user
from app.utils.image_processing import process_image, reverse_geocode

router = APIRouter()
logger = logging.getLogger(__name__)

initialize_ai_services(
    settings.openai_api_key,
    settings.claude_api_key,
    settings.gemini_api_key,
    settings.ai_model_power,
    settings.ai_model_fast,
)
async def _save_generated_photo_uri(
    *,
    photo_uri: Optional[str],
    client_type: Optional[str],
    user_id: Optional[str],
    image_bytes: bytes,
) -> str:
    if photo_uri:
        return photo_uri
    if client_type == "web" or not photo_uri:
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required to persist uploaded artwork")
        return await get_storage_service().save(image_bytes, "artwork.jpg", user_id)
    return f"artwork_{uuid.uuid4().hex[:12]}"


async def _resolve_uploaded_image_context(
    *,
    image: UploadFile,
    location: Optional[str],
    photo_time: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
    log_prefix: str,
) -> tuple[bytes, Optional[str], Optional[str]]:
    image_bytes, image_metadata = await process_image(image)

    if location and not location.strip().startswith("{"):
        logger.info("Metadata Source [%s Location]: FRONTEND (Value: %s)", log_prefix, location)
    elif image_metadata.get("location_data"):
        location = json.dumps(image_metadata["location_data"])
        logger.info("Metadata Source [%s Location]: PHOTO EXIF (Resolved: %s)", log_prefix, location)
    elif location or (latitude is not None and longitude is not None):
        location = await resolve_location_payload(location, latitude, longitude)
        logger.info("Metadata Source [%s Location]: FRONTEND COORDS (Resolved: %s)", log_prefix, location)
    else:
        logger.info("Metadata Source [%s Location]: NONE", log_prefix)

    if image_metadata.get("exif_timestamp"):
        photo_time = image_metadata["exif_timestamp"]
        logger.info("Metadata Source [%s Time]: PHOTO EXIF (Timestamp: %s)", log_prefix, photo_time)
    else:
        logger.info("Metadata Source [%s Time]: FRONTEND (Value: %s)", log_prefix, photo_time)

    return image_bytes, location, photo_time


@router.post("/artwork-analyze")
async def analyze_artist(
    image: UploadFile = File(...),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    photo_uri: Optional[str] = Form(None),
    client_type: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    photo_time: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    ai_provider = determine_ai_provider(model)
    logger.info("analyze_artist received session_id: %s, user_id: %s", session_id, user_id)

    require_same_user(current_user, user_id)
    if user_id and settings.use_database:
        check_artwork_quota(user_id, db)

    try:
        image_bytes, location, photo_time = await _resolve_uploaded_image_context(
            image=image,
            location=location,
            photo_time=photo_time,
            latitude=latitude,
            longitude=longitude,
            log_prefix="Location",
        )
        vision_hint, vision_ref_urls = await get_vision_hint(image_bytes)
        session_context = await get_session_context(session_id) if session_id else None

        ai_service = AIServiceFactory.get_service(ai_provider)
        usage_id = start_ai_usage(
            user_id=user_id,
            job_type="artwork_identification",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="session" if session_id else "user",
            subject_id=session_id or user_id,
        )
        try:
            identify_artist_result = getattr(ai_service, "identify_artist_result", None)
            identify_kwargs = {
                "image_bytes": image_bytes,
                "identity": identity,
                "language": language,
                "session_context": session_context,
                "vision_hint": vision_hint,
            }
            if callable(identify_artist_result):
                analysis_result = await identify_artist_result(**identify_kwargs)
            else:
                analysis_result = AITextResult(text=await ai_service.identify_artist(**identify_kwargs))
            analysis_text = analysis_result.text
            succeed_ai_usage(
                usage_id,
                input_tokens=analysis_result.input_tokens,
                output_tokens=analysis_result.output_tokens,
            )
        except Exception as exc:
            fail_ai_usage(usage_id, exc)
            raise
        parsed_result = parse_identify_result(analysis_text)
        response = {"analysis": parsed_result["analysis"], "model_used": ai_provider.value}

        if not user_id:
            response["analysis"] = parsed_result["analysis"] or analysis_text
            return response

        generated_photo_uri = await _save_generated_photo_uri(
            photo_uri=photo_uri,
            client_type=client_type,
            user_id=user_id,
            image_bytes=image_bytes,
        )
        parsed_location = parse_location_value(location)
        (
            artwork_id,
            entity_id_fast,
            artist_entity_id_fast,
            linked_artist_entity_id,
        ) = await anyio.to_thread.run_sync(
            save_analyzed_artwork_record_sync,
            user_id,
            session_id,
            generated_photo_uri,
            parsed_result,
            parsed_location,
            photo_time,
            vision_ref_urls,
            "upload",
        )

        if artist_entity_id_fast and background_tasks:
            background_tasks.add_task(run_artist_bio_bg, artist_entity_id_fast)
        if artwork_id:
            if background_tasks:
                background_tasks.add_task(run_artwork_analysis, artwork_id, image_bytes, False)
            else:
                track_artwork_task(
                    asyncio.create_task(run_artwork_analysis(artwork_id, image_bytes=image_bytes))
                )
        if artwork_id and parsed_result["artist_name"] and parsed_result["artist_name"] != "Unknown Artist":
            track_artwork_task(
                asyncio.create_task(
                    generate_fun_facts(
                        artwork_id,
                        parsed_result["artist_name"],
                        parsed_result["artwork_name"],
                        language,
                    )
                )
            )
        if session_id and background_tasks:
            background_tasks.add_task(
                update_session_narrative_task,
                session_id=session_id,
                new_artwork_data={
                    "artist": parsed_result["artist_name"],
                    "title": parsed_result["artwork_name"],
                    "description": parsed_result["analysis"],
                },
                identity=identity,
                language=language,
            )

        response.update(
            {
                "artwork_id": artwork_id,
                "artist_name": parsed_result["artist_name"],
                "artwork_name": parsed_result["artwork_name"],
                "photo_uri": generated_photo_uri,
                "date": parsed_result["date"],
                "medium": parsed_result["medium"],
                "location": location,
                "photo_time": photo_time,
                "tags": parsed_result["tags"],
                "analysis": parsed_result["analysis"],
                "artist_entity_id": linked_artist_entity_id,
            }
        )
        return response
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        logger.error("Error in analyze_artist: %s", exc, exc_info=True)
        db.rollback()
        if "API error" in str(exc):
            raise HTTPException(status_code=503, detail=str(exc))
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")


@router.post("/artwork-analyze-stream")
async def analyze_artist_stream(
    image: Optional[UploadFile] = File(None),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    photo_uri: Optional[str] = Form(None),
    client_type: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    photo_time: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    reasoning_effort: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
):
    t_request_received = time.time()
    request_id = f"stream_{int(t_request_received * 1000)}"
    ai_provider = determine_ai_provider(model)

    if user_id and settings.use_database:
        check_artwork_quota(user_id, db)

    try:
        if image and image.filename:
            image_bytes, image_metadata = await process_image(image)
            if not location:
                if image_metadata.get("location_data"):
                    location = json.dumps(image_metadata["location_data"])
                    logger.info("Metadata Source [Streaming Location]: PHOTO EXIF (Resolved: %s)", location)
                elif latitude is not None and longitude is not None:
                    location_data = await reverse_geocode(latitude, longitude)
                    location = json.dumps(location_data)
                    logger.info("Metadata Source [Streaming Location]: FRONTEND COORDS (Resolved: %s)", location)
                else:
                    logger.info("Metadata Source [Streaming Location]: NONE")
            if image_metadata.get("exif_timestamp") and not photo_time:
                photo_time = image_metadata["exif_timestamp"]
                logger.info("Metadata Source [Streaming Time]: PHOTO EXIF (Timestamp: %s)", photo_time)
        elif photo_uri:
            image_bytes = await resolve_image_bytes(None, photo_uri)
            logger.info("Analyze stream: loaded image from photo_uri=%s…", photo_uri[:60])
        else:
            raise HTTPException(status_code=400, detail="Either image or photo_uri is required")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Image processing failed: {exc}")

    t_image_processed = time.time()
    queue: asyncio.Queue = asyncio.Queue()

    async def _analyze_task() -> None:
        full_text = ""
        ai_service = AIServiceFactory.get_service(ai_provider)
        usage_id = start_ai_usage(
            user_id=user_id,
            job_type="artwork_identification",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="session" if session_id else "user",
            subject_id=session_id or user_id,
        )
        t_ai_call = t_first_chunk = t_streaming_done = None
        first_chunk_received = False
        generated_photo_uri: Optional[str] = None
        input_tokens = None
        output_tokens = None

        try:
            t_ai_call = time.time()
            vision_hint, vision_ref_urls = await get_vision_hint(image_bytes)
            session_context = await get_session_context(session_id) if session_id else None

            async for chunk in ai_service.identify_artist_stream_result(
                image_bytes,
                identity=identity,
                language=language,
                session_context=session_context,
                reasoning_effort=reasoning_effort,
                vision_hint=vision_hint,
            ):
                if chunk.type == "usage":
                    input_tokens = chunk.input_tokens
                    output_tokens = chunk.output_tokens
                    continue
                if not first_chunk_received:
                    t_first_chunk = time.time()
                    first_chunk_received = True
                full_text += chunk.text
                await queue.put(f"event: chunk\ndata: {json.dumps({'type': 'text', 'content': chunk.text})}\n\n")

            t_streaming_done = time.time()
            parsed_result = parse_identify_result(full_text)
            logger.info("[%s] Parsed: %s — %s", request_id, parsed_result["artist_name"], parsed_result["artwork_name"])

            result = {
                "type": "result",
                "artist_name": parsed_result["artist_name"],
                "artwork_name": parsed_result["artwork_name"],
                "date": parsed_result["date"],
                "medium": parsed_result["medium"],
                "movement": parsed_result["movement"],
                "period_bucket": parsed_result["period_bucket"],
                "description": parsed_result["analysis"],
                "tags": parsed_result["tags"],
                "analysis": parsed_result["analysis"],
                "model_used": ai_provider.value,
                "location": location,
                "photo_time": photo_time,
            }

            if user_id:
                generated_photo_uri = await _save_generated_photo_uri(
                    photo_uri=photo_uri,
                    client_type=client_type,
                    user_id=user_id,
                    image_bytes=image_bytes,
                )
                parsed_location = parse_location_value(location)
                try:
                    (
                        artwork_id,
                        entity_id,
                        artist_entity_id,
                        linked_artist_entity_id,
                    ) = await anyio.to_thread.run_sync(
                        save_analyzed_artwork_record_sync,
                        user_id,
                        session_id,
                        generated_photo_uri,
                        parsed_result,
                        parsed_location,
                        photo_time,
                        vision_ref_urls,
                        "upload",
                    )
                except Exception as db_error:
                    if generated_photo_uri and client_type == "web" and not photo_uri:
                        try:
                            await get_storage_service().delete(generated_photo_uri)
                        except Exception:
                            pass
                    raise db_error

                if artist_entity_id:
                    track_artwork_task(asyncio.create_task(do_artist_bio(artist_entity_id)))
                if artwork_id:
                    track_artwork_task(
                        asyncio.create_task(run_artwork_analysis(artwork_id, image_bytes=image_bytes))
                    )
                if parsed_result["artist_name"] and parsed_result["artist_name"] != "Unknown Artist":
                    track_artwork_task(
                        asyncio.create_task(
                            generate_fun_facts(
                                artwork_id,
                                parsed_result["artist_name"],
                                parsed_result["artwork_name"],
                                language,
                            )
                        )
                    )
                if session_id:
                    track_artwork_task(
                        asyncio.create_task(
                            update_session_narrative_task(
                                session_id=session_id,
                                new_artwork_data={
                                    "artist": parsed_result["artist_name"],
                                    "title": parsed_result["artwork_name"],
                                    "description": parsed_result["analysis"],
                                },
                                identity=identity,
                                language=language,
                            )
                        )
                    )

                result["artwork_id"] = artwork_id
                result["photo_uri"] = generated_photo_uri
                result["reference_urls"] = vision_ref_urls
                result["artist_entity_id"] = linked_artist_entity_id

            t_done = time.time()
            metrics = {
                "type": "metrics",
                "request_id": request_id,
                "timings": {
                    "image_processing_ms": round((t_image_processed - t_request_received) * 1000),
                    "time_to_ai_call_ms": round((t_ai_call - t_request_received) * 1000) if t_ai_call else None,
                    "time_to_first_chunk_ms": round((t_first_chunk - t_request_received) * 1000) if t_first_chunk else None,
                    "ai_first_chunk_latency_ms": round((t_first_chunk - t_ai_call) * 1000) if t_first_chunk and t_ai_call else None,
                    "streaming_duration_ms": round((t_streaming_done - t_first_chunk) * 1000) if t_streaming_done and t_first_chunk else None,
                    "total_duration_ms": round((t_done - t_request_received) * 1000),
                },
                "model": ai_provider.value,
            }
            logger.info("[%s] METRIC_SUMMARY: %s", request_id, json.dumps(metrics["timings"]))
            await queue.put(f"event: metrics\ndata: {json.dumps(metrics)}\n\n")
            await queue.put(f"event: complete\ndata: {json.dumps(result)}\n\n")
            succeed_ai_usage(usage_id, input_tokens=input_tokens, output_tokens=output_tokens)
        except Exception as exc:
            fail_ai_usage(usage_id, exc)
            logger.error("[%s] Streaming error: %s", request_id, exc, exc_info=True)
            await queue.put(f"event: error\ndata: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n")
        finally:
            await queue.put(None)

    track_artwork_task(asyncio.create_task(_analyze_task()))

    async def event_generator():
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
        except (asyncio.CancelledError, Exception):
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

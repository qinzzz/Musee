from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import json
import logging
import uuid
from typing import Optional

import anyio
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import SavedArtwork, Session as SessionModel, User
from app.models.artwork import AIProvider
from app.services.ai_client_interface import AITextResult
from app.services.ai_service import AIServiceFactory
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.artwork_analysis_service import (
    apply_analysis_to_saved_artwork,
    determine_ai_provider,
    load_stored_image_bytes,
    parse_identify_result,
)
from app.services.artwork_background_service import (
    check_artwork_quota,
    do_insights,
    run_dimension_analysis_bg,
    track_artwork_task,
)
from app.services.artwork_enrichment_service import run_artist_bio_bg as _run_artist_bio_bg
from app.services.artwork_event_service import (
    ARTWORK_EVENT_IDENTIFICATION_COMPLETED,
    ARTWORK_EVENT_IDENTIFICATION_FAILED,
    ARTWORK_EVENT_IDENTIFICATION_REQUESTED,
    ARTWORK_EVENT_REIDENTIFICATION_COMPLETED,
    ARTWORK_EVENT_REIDENTIFICATION_FAILED,
    ARTWORK_EVENT_REIDENTIFICATION_REQUESTED,
    log_artwork_event,
)
from app.services.artwork_ingest_service import (
    create_saved_artwork_record_sync,
    location_payload_needs_resolution,
    parse_location_value,
    resolve_location_payload,
    save_analyzed_artwork_record_sync,
)
from app.services.session_service import (
    get_artwork_session_ids as _get_artwork_session_ids,
    get_primary_session_id as _get_primary_session_id,
    get_session_context,
    refresh_session_title as _refresh_session_title,
    update_session_narrative_task,
)
from app.services.storage import get_storage_service
from app.services.vision_service import get_vision_hint
from app.utils.auth_utils import get_current_user, require_same_user
from app.utils.image_processing import process_image

router = APIRouter()
logger = logging.getLogger(__name__)


def _resolve_artwork_analysis_event_type(
    *,
    artwork_id: Optional[str],
    artist_name: Optional[str],
    artwork_name: Optional[str],
    additional_clue: Optional[str],
) -> tuple[str, str]:
    has_reidentify_hints = any(
        value is not None and str(value).strip()
        for value in (artist_name, artwork_name, additional_clue)
    )
    if artwork_id and has_reidentify_hints:
        return ARTWORK_EVENT_REIDENTIFICATION_REQUESTED, ARTWORK_EVENT_REIDENTIFICATION_COMPLETED
    if artwork_id and not has_reidentify_hints:
        return ARTWORK_EVENT_IDENTIFICATION_REQUESTED, ARTWORK_EVENT_IDENTIFICATION_COMPLETED
    return ARTWORK_EVENT_IDENTIFICATION_REQUESTED, ARTWORK_EVENT_IDENTIFICATION_COMPLETED


def _resolve_artwork_analysis_failed_event_type(requested_event_type: str) -> str:
    if requested_event_type == ARTWORK_EVENT_REIDENTIFICATION_REQUESTED:
        return ARTWORK_EVENT_REIDENTIFICATION_FAILED
    return ARTWORK_EVENT_IDENTIFICATION_FAILED


def _resolve_artwork_trigger_source(*, session_id: Optional[str], artwork_id: Optional[str]) -> str:
    if session_id:
        return "session"
    if artwork_id:
        return "collection"
    return "upload"


@router.post("/artworks/analyze")
async def analyze_artwork_unified(
    image: Optional[UploadFile] = File(None),
    label_image: Optional[UploadFile] = File(None),
    artwork_id: Optional[str] = Form(None),
    artist_name: Optional[str] = Form(None),
    artwork_name: Optional[str] = Form(None),
    additional_clue: Optional[str] = Form(None),
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
    if not image and not artwork_id:
        raise HTTPException(status_code=400, detail="Must provide either image or artwork_id")

    require_same_user(current_user, user_id)
    existing_artwork: Optional[SavedArtwork] = None
    parsed_location = None
    image_bytes: Optional[bytes] = None
    label_image_bytes: Optional[bytes] = None

    if artwork_id:
        existing_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
        if not existing_artwork:
            raise HTTPException(status_code=404, detail="Artwork not found")
        if not user_id:
            user_id = existing_artwork.user_id or existing_artwork.device_id
        if not session_id:
            session_id = _get_primary_session_id(db, artwork_id)
        if location is None:
            location = existing_artwork.location
        if photo_time is None:
            photo_time = existing_artwork.photo_time
        if photo_uri is None:
            photo_uri = existing_artwork.photo_uri

    if user_id and settings.use_database and not existing_artwork:
        check_artwork_quota(user_id, db)

    if image:
        image_bytes, image_metadata = await process_image(image)
        if location and not location_payload_needs_resolution(location):
            logger.info("Metadata Source [Location]: FRONTEND (Value: %s)", location)
        elif image_metadata.get("location_data"):
            location = json.dumps(image_metadata["location_data"])
            logger.info("Metadata Source [Location]: PHOTO EXIF (Resolved: %s)", location)
        elif location or (latitude is not None and longitude is not None):
            location = await resolve_location_payload(location, latitude, longitude)
            logger.info("Metadata Source [Location]: FRONTEND COORDS (Resolved: %s)", location)
        if image_metadata.get("exif_timestamp"):
            photo_time = image_metadata["exif_timestamp"]
    else:
        assert existing_artwork is not None
        image_bytes = await load_stored_image_bytes(
            existing_artwork.photo_uri,
            failure_detail="Could not load stored image for analysis",
        )

    if label_image:
        label_image_bytes, _ = await process_image(label_image)

    parsed_location = parse_location_value(location)

    if not existing_artwork and user_id:
        generated_photo_uri = photo_uri
        if not generated_photo_uri:
            if client_type == "web" or image is not None:
                storage = get_storage_service()
                generated_photo_uri = await storage.save(image_bytes, "artwork.jpg", user_id)
            else:
                generated_photo_uri = f"artwork_{uuid.uuid4().hex[:12]}"

        existing_artwork_id = await anyio.to_thread.run_sync(
            create_saved_artwork_record_sync,
            user_id,
            session_id,
            generated_photo_uri,
            parsed_location,
            photo_time,
            "upload",
            None,
        )
        existing_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == existing_artwork_id).first()

    if existing_artwork:
        existing_artwork.analysis_status = "analyzing"
        existing_artwork.analysis_error = None
        existing_artwork.analysis_attempted_at = datetime.now(UTC)
        requested_event_type, completed_event_type = _resolve_artwork_analysis_event_type(
            artwork_id=artwork_id,
            artist_name=artist_name,
            artwork_name=artwork_name,
            additional_clue=additional_clue,
        )
        trigger_source = _resolve_artwork_trigger_source(session_id=session_id, artwork_id=artwork_id)
        request_event = log_artwork_event(
            db,
            artwork_id=str(existing_artwork.id),
            event_type=requested_event_type,
            actor_role="user",
            trigger_source=trigger_source,
            trigger_session_id=session_id,
            payload={
                "artist_name_hint": artist_name,
                "artwork_name_hint": artwork_name,
                "additional_clue": additional_clue,
                "has_label_image": bool(label_image_bytes),
                "identity": identity,
            },
        )
        db.commit()
        db.refresh(existing_artwork)
    else:
        request_event = None
        requested_event_type = ARTWORK_EVENT_IDENTIFICATION_REQUESTED
        completed_event_type = ARTWORK_EVENT_IDENTIFICATION_COMPLETED
        trigger_source = _resolve_artwork_trigger_source(session_id=session_id, artwork_id=artwork_id)

    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    usage_id = start_ai_usage(
        user_id=user_id,
        job_type="artwork_reidentification" if artwork_id else "artwork_identification",
        model=get_ai_model_name(ai_service, ai_provider.value),
        subject_type="artwork" if existing_artwork else None,
        subject_id=str(existing_artwork.id) if existing_artwork else None,
    )

    try:
        vision_hint, vision_ref_urls = await get_vision_hint(image_bytes)
        session_context = await get_session_context(session_id) if session_id else None

        identify_artist_result = getattr(ai_service, "identify_artist_result", None)
        identify_kwargs = {
            "image_bytes": image_bytes,
            "label_image_bytes": label_image_bytes,
            "identity": identity,
            "language": language,
            "session_context": session_context,
            "vision_hint": vision_hint,
            "artist_name": artist_name,
            "artwork_name": artwork_name,
            "additional_clue": additional_clue,
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
        if existing_artwork:
            existing_artwork.analysis_status = "failed"
            existing_artwork.analysis_error = str(exc)
            existing_artwork.analysis_completed_at = None
            log_artwork_event(
                db,
                artwork_id=str(existing_artwork.id),
                event_type=_resolve_artwork_analysis_failed_event_type(requested_event_type),
                actor_role="system",
                trigger_source=trigger_source,
                trigger_session_id=session_id,
                parent_event_id=request_event.id if request_event else None,
                payload={"error_message": str(exc)},
            )
            db.commit()
        raise

    fallback_artist = (
        existing_artwork.artist_name if existing_artwork and existing_artwork.artist_name else "Unknown Artist"
    )
    fallback_title = (
        existing_artwork.artwork_name if existing_artwork and existing_artwork.artwork_name else "Untitled"
    )
    parsed_result = parse_identify_result(
        analysis_text,
        fallback_artist=fallback_artist,
        fallback_title=fallback_title,
    )

    linked_artist_entity_id = existing_artwork.artist_entity_id if existing_artwork else None

    if existing_artwork:
        bg_ids = apply_analysis_to_saved_artwork(
            db,
            existing_artwork,
            parsed_result,
            vision_ref_urls,
        )
        log_artwork_event(
            db,
            artwork_id=str(existing_artwork.id),
            event_type=completed_event_type,
            actor_role="system",
            trigger_source=trigger_source,
            trigger_session_id=session_id,
            parent_event_id=request_event.id if request_event else None,
            payload={
                "artist_name": parsed_result["artist_name"],
                "artwork_name": parsed_result["artwork_name"],
                "used_label_image": bool(label_image_bytes),
                "reference_urls": vision_ref_urls or [],
            },
        )
        entity_id_fast = bg_ids["entity_id_fast"]
        artist_entity_id_fast = bg_ids["artist_entity_id_fast"]
        linked_artist_entity_id = bg_ids["linked_artist_entity_id"]
        for linked_session_id in _get_artwork_session_ids(db, str(existing_artwork.id)):
            linked_session = db.query(SessionModel).filter(SessionModel.id == linked_session_id).first()
            _refresh_session_title(db, linked_session)
        db.commit()
        db.refresh(existing_artwork)

        if entity_id_fast and background_tasks:
            background_tasks.add_task(run_dimension_analysis_bg, entity_id_fast)
        if artist_entity_id_fast and background_tasks:
            background_tasks.add_task(_run_artist_bio_bg, artist_entity_id_fast)
        if existing_artwork.artist_name and existing_artwork.artist_name != "Unknown Artist":
            if background_tasks:
                background_tasks.add_task(
                    do_insights,
                    str(existing_artwork.id),
                    existing_artwork.artist_name,
                    existing_artwork.artwork_name or "Untitled",
                    language,
                )
            else:
                track_artwork_task(
                    asyncio.create_task(
                        do_insights(
                            str(existing_artwork.id),
                            existing_artwork.artist_name,
                            existing_artwork.artwork_name or "Untitled",
                            language,
                        )
                    )
                )

        return {
            "artist_name": parsed_result["artist_name"],
            "artwork_name": parsed_result["artwork_name"],
            "analysis": parsed_result["analysis"],
            "date": parsed_result["date"],
            "medium": parsed_result["medium"],
            "movement": parsed_result["movement"],
            "period_bucket": parsed_result["period_bucket"],
            "tags": parsed_result["tags"],
            "artwork_id": str(existing_artwork.id),
            "reference_urls": vision_ref_urls,
            "artist_entity_id": linked_artist_entity_id,
            "model_used": ai_provider.value,
            "analysis_status": existing_artwork.analysis_status,
            "analysis_error": existing_artwork.analysis_error,
        }

    response = {"analysis": parsed_result["analysis"], "model_used": ai_provider.value}
    if user_id:
        generated_photo_uri = photo_uri
        if not generated_photo_uri:
            if client_type == "web" or image is not None:
                storage = get_storage_service()
                generated_photo_uri = await storage.save(image_bytes, "artwork.jpg", user_id)
            else:
                generated_photo_uri = f"artwork_{uuid.uuid4().hex[:12]}"

        (
            artwork_id_result,
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
        )

        if entity_id_fast and background_tasks:
            background_tasks.add_task(run_dimension_analysis_bg, entity_id_fast)
        if artist_entity_id_fast and background_tasks:
            background_tasks.add_task(_run_artist_bio_bg, artist_entity_id_fast)
        if artwork_id_result and parsed_result["artist_name"] and parsed_result["artist_name"] != "Unknown Artist":
            track_artwork_task(
                asyncio.create_task(
                    do_insights(
                        artwork_id_result,
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
                "artwork_id": artwork_id_result,
                "artist_name": parsed_result["artist_name"],
                "artwork_name": parsed_result["artwork_name"],
                "photo_uri": generated_photo_uri,
                "date": parsed_result["date"],
                "medium": parsed_result["medium"],
                "location": location,
                "photo_time": photo_time,
                "tags": parsed_result["tags"],
                "artist_entity_id": linked_artist_entity_id,
                "reference_urls": vision_ref_urls,
            }
        )
        return response

    response.update(
        {
            "artist_name": parsed_result["artist_name"],
            "artwork_name": parsed_result["artwork_name"],
            "date": parsed_result["date"],
            "medium": parsed_result["medium"],
            "tags": parsed_result["tags"],
            "reference_urls": vision_ref_urls,
        }
    )
    return response


@router.post("/artworks/upload")
async def save_artwork_upload(
    image: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
    client_type: Optional[str] = Form("web"),
    photo_uri: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    photo_time: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    source: Optional[str] = Form("upload"),
    sequence_number: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_same_user(current_user, user_id)
    if user_id and settings.use_database:
        check_artwork_quota(user_id, db)

    image_bytes, image_metadata = await process_image(image)

    if location and not location_payload_needs_resolution(location):
        logger.info("Metadata Source [Upload Location]: FRONTEND (Value: %s)", location)
    elif image_metadata.get("location_data"):
        location = json.dumps(image_metadata["location_data"])
        logger.info("Metadata Source [Upload Location]: PHOTO EXIF (Resolved: %s)", location)
    elif location or (latitude is not None and longitude is not None):
        location = await resolve_location_payload(location, latitude, longitude)
        logger.info("Metadata Source [Upload Location]: FRONTEND COORDS (Resolved: %s)", location)

    if image_metadata.get("exif_timestamp"):
        photo_time = image_metadata["exif_timestamp"]

    if client_type == "web" or not client_type:
        storage = get_storage_service()
        generated_photo_uri = await storage.save(image_bytes, image.filename or "artwork.jpg", user_id)
    else:
        generated_photo_uri = photo_uri or f"artwork_{uuid.uuid4().hex[:12]}"

    parsed_location = parse_location_value(location)

    artwork_id = await anyio.to_thread.run_sync(
        create_saved_artwork_record_sync,
        user_id,
        session_id,
        generated_photo_uri,
        parsed_location,
        photo_time,
        source or "upload",
        sequence_number,
    )

    saved_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not saved_artwork:
        raise HTTPException(status_code=500, detail="Artwork was saved but could not be reloaded")

    response = saved_artwork.to_dict()
    response["photo_uri"] = generated_photo_uri
    return response


@router.post("/artworks/{artwork_id}/reanalyze")
async def reanalyze_artwork(artwork_id: str, db: Session = Depends(get_db)):
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    artwork.analysis_status = "analyzing"
    artwork.analysis_error = None
    artwork.analysis_attempted_at = datetime.now(UTC)
    request_event = log_artwork_event(
        db,
        artwork_id=str(artwork.id),
        event_type=ARTWORK_EVENT_REIDENTIFICATION_REQUESTED,
        actor_role="user",
        trigger_source="collection",
        payload={"request_kind": "reanalyze"},
    )
    db.commit()
    db.refresh(artwork)

    image_bytes = await load_stored_image_bytes(
        artwork.photo_uri,
        failure_detail="Could not load stored image for reanalysis",
    )

    ai_provider = determine_ai_provider()
    ai_service = AIServiceFactory.get_service(ai_provider)
    usage_id = start_ai_usage(
        user_id=artwork.user_id or artwork.device_id,
        job_type="artwork_reidentification",
        model=get_ai_model_name(ai_service, ai_provider.value),
        subject_type="artwork",
        subject_id=str(artwork.id),
    )

    vision_hint, vision_ref_urls = await get_vision_hint(image_bytes)

    try:
        identify_artist_result = getattr(ai_service, "identify_artist_result", None)
        identify_kwargs = {
            "image_bytes": image_bytes,
            "identity": "default",
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
        artwork.analysis_status = "failed"
        artwork.analysis_error = str(exc)
        artwork.analysis_completed_at = None
        log_artwork_event(
            db,
            artwork_id=str(artwork.id),
            event_type=ARTWORK_EVENT_REIDENTIFICATION_FAILED,
            actor_role="system",
            trigger_source="collection",
            parent_event_id=request_event.id if request_event else None,
            payload={"error_message": str(exc)},
        )
        db.commit()
        raise

    parsed_result = parse_identify_result(
        analysis_text,
        fallback_artist=artwork.artist_name or "Unknown Artist",
        fallback_title=artwork.artwork_name or "Untitled",
    )
    apply_analysis_to_saved_artwork(db, artwork, parsed_result, vision_ref_urls)
    log_artwork_event(
        db,
        artwork_id=str(artwork.id),
        event_type=ARTWORK_EVENT_REIDENTIFICATION_COMPLETED,
        actor_role="system",
        trigger_source="collection",
        parent_event_id=request_event.id if request_event else None,
        payload={
            "artist_name": parsed_result["artist_name"],
            "artwork_name": parsed_result["artwork_name"],
            "reference_urls": vision_ref_urls or [],
        },
    )
    db.commit()
    db.refresh(artwork)

    return {
        "artist_name": parsed_result["artist_name"],
        "artwork_name": parsed_result["artwork_name"],
        "analysis": parsed_result["analysis"],
        "date": parsed_result["date"],
        "medium": parsed_result["medium"],
        "movement": parsed_result["movement"],
        "period_bucket": parsed_result["period_bucket"],
        "tags": parsed_result["tags"],
        "artwork_id": str(artwork.id),
        "reference_urls": vision_ref_urls,
    }

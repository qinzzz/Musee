from __future__ import annotations

import base64
from datetime import UTC, datetime
import json
import logging
import re
from typing import Any, Dict, List, Optional, Union

from fastapi import HTTPException, UploadFile
import httpx
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.models import SavedArtwork, Tag
from app.models.artwork import AIProvider
from app.services.ai_service import AIServiceFactory
from app.services.artwork_entity_service import upsert_artist_entity, upsert_artwork_entity
from app.services.storage import StorageFactory
from app.utils.image_processing import compress_for_ai

logger = logging.getLogger(__name__)


def determine_ai_provider(requested_model: Optional[AIProvider] = None) -> AIProvider:
    available_providers = AIServiceFactory.get_available_providers()

    if not available_providers:
        raise HTTPException(
            status_code=503,
            detail="No AI services available. Please check configuration.",
        )

    if requested_model and requested_model in available_providers:
        return requested_model

    try:
        default_provider = AIProvider(settings.ai_provider)
        if default_provider in available_providers:
            return default_provider
    except ValueError:
        pass

    return available_providers[0]


def normalize_tag_name(tag: str) -> str:
    normalized = tag.strip().lower()
    if not normalized.startswith("#"):
        normalized = f"#{normalized}"
    return normalized


def batch_link_tags(db: Session, artwork: SavedArtwork, tags_input: Union[str, List[str]]) -> None:
    if not tags_input:
        return

    if isinstance(tags_input, str):
        tag_names = [normalize_tag_name(tag) for tag in tags_input.split(",") if tag.strip()]
    else:
        tag_names = [normalize_tag_name(tag) for tag in tags_input if tag.strip()]

    if not tag_names:
        return

    existing_tags = db.query(Tag).filter(Tag.name.in_(tag_names)).all()
    existing_tag_map = {tag.name: tag for tag in existing_tags}
    current_tag_ids = {tag.id for tag in artwork.artwork_tags}

    for name in tag_names:
        tag = existing_tag_map.get(name)
        if tag is None:
            tag = Tag(name=name)
            db.add(tag)
            db.flush()

        if tag.id not in current_tag_ids:
            artwork.artwork_tags.append(tag)


async def image_url_to_bytes(url: str) -> Optional[bytes]:
    if not url:
        return None

    if url.startswith("data:"):
        try:
            marker = url.find(",")
            if marker == -1:
                return None
            return base64.b64decode(url[marker + 1 :])
        except Exception:
            return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url)
            if response.status_code != 200:
                return None
            return response.content
    except Exception:
        return None


async def load_stored_image_bytes(
    photo_uri: str,
    *,
    status_code: int = 422,
    failure_detail: str,
) -> bytes:
    image_bytes = await image_url_to_bytes(photo_uri)
    if not image_bytes:
        try:
            storage = StorageFactory.get_service_for_uri(photo_uri)
            if storage:
                image_bytes = await storage.load(photo_uri)
        except Exception as exc:
            logger.warning("Could not load image from storage: %s", exc)

    if not image_bytes:
        raise HTTPException(status_code=status_code, detail=failure_detail)

    return compress_for_ai(image_bytes)


async def resolve_image_bytes(image: Optional[UploadFile], photo_uri: Optional[str]) -> bytes:
    image_bytes = None
    if image and image.filename:
        content = await image.read()
        if content:
            image_bytes = content

    if not image_bytes and photo_uri:
        image_bytes = await image_url_to_bytes(photo_uri)
        if not image_bytes:
            try:
                storage = StorageFactory.get_service_for_uri(photo_uri)
                if storage:
                    image_bytes = await storage.load(photo_uri)
            except Exception as exc:
                logger.warning("Could not load image from storage: %s", exc)

    if not image_bytes:
        raise HTTPException(status_code=400, detail="No image provided or loadable")

    return compress_for_ai(image_bytes)


def parse_identify_result(
    analysis_text: str,
    fallback_artist: str = "Unknown Artist",
    fallback_title: str = "Untitled",
) -> Dict[str, Any]:
    artist_name = fallback_artist
    artwork_name = fallback_title
    extracted_tags: List[str] = []
    extracted_analysis: Optional[str] = None
    date_val = None
    medium_val = None
    movement_val = None
    period_bucket_val = None

    try:
        json_str = analysis_text
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", analysis_text)
        if json_match:
            json_str = json_match.group(1).strip()
        parsed = json.loads(json_str)
        if isinstance(parsed, dict):
            artist_name = parsed.get("artist", artist_name)
            artwork_name = parsed.get("title", artwork_name)
            extracted_tags = parsed.get("tags", [])
            extracted_analysis = parsed.get("description", "")
            date_val = parsed.get("date")
            medium_val = parsed.get("medium")
            movement_val = parsed.get("movement")
            period_bucket_val = parsed.get("period_bucket")
        elif isinstance(parsed, list) and parsed:
            artist_info = next(
                (item for item in parsed if isinstance(item, dict) and "artist_name" in item),
                parsed[0] if isinstance(parsed[0], dict) else {},
            )
            analysis_info = next(
                (item for item in parsed if isinstance(item, dict) and "analysis" in item),
                {},
            )
            artist_name = artist_info.get("artist_name", artist_name)
            artwork_name = artist_info.get("artwork_name", artwork_name)
            extracted_tags = analysis_info.get("tags", [])
            extracted_analysis = analysis_info.get("analysis", "")
            date_val = artist_info.get("date") or analysis_info.get("date")
            medium_val = artist_info.get("medium") or analysis_info.get("medium")
    except Exception as exc:
        logger.warning("Failed to parse analysis payload: %s", exc)

    if not extracted_analysis:
        extracted_analysis = analysis_text

    return {
        "artist_name": artist_name,
        "artwork_name": artwork_name,
        "tags": extracted_tags,
        "analysis": extracted_analysis,
        "date": date_val,
        "medium": medium_val,
        "movement": movement_val,
        "period_bucket": period_bucket_val,
    }


def apply_analysis_to_saved_artwork(
    db: Session,
    artwork: SavedArtwork,
    parsed_result: Dict[str, Any],
    vision_ref_urls: Optional[List[str]],
) -> Dict[str, Optional[str]]:
    artwork.artist_name = parsed_result["artist_name"]
    artwork.artwork_name = parsed_result["artwork_name"]
    artwork.analysis = parsed_result["analysis"]
    artwork.movement = parsed_result["movement"]
    artwork.period_bucket = parsed_result["period_bucket"]
    artwork.is_recognized = 1 if (
        parsed_result["artist_name"].lower() != "unknown artist"
        and parsed_result["artwork_name"].lower() not in {"unknown", "untitled"}
    ) else 0
    artwork.analysis_status = "analyzed"
    artwork.analysis_error = None
    artwork.analysis_completed_at = datetime.now(UTC)
    if vision_ref_urls:
        artwork.reference_urls = vision_ref_urls

    current_params = dict(artwork.params) if isinstance(artwork.params, dict) else {}
    if parsed_result["date"] is not None:
        current_params["date"] = parsed_result["date"]
    if parsed_result["medium"] is not None:
        current_params["medium"] = parsed_result["medium"]
    artwork.params = current_params

    if parsed_result["tags"]:
        batch_link_tags(db, artwork, parsed_result["tags"])

    entity_id_fast = None
    artist_entity_id_fast = None
    linked_artist_entity_id = artwork.artist_entity_id
    if artwork.artist_name and artwork.artist_name != "Unknown Artist" and artwork.artwork_name:
        try:
            entity = upsert_artwork_entity(db, artwork.artist_name, artwork.artwork_name)
            artist_entity = upsert_artist_entity(db, artwork.artist_name)
            db.flush()
            artwork.artwork_entity_id = entity.id
            artwork.artist_entity_id = artist_entity.id
            linked_artist_entity_id = artist_entity.id
            if entity.dim_status in (None, "pending"):
                entity_id_fast = entity.id
            if artist_entity.bio_status in (None, "pending"):
                artist_entity_id_fast = artist_entity.id
        except Exception as exc:
            logger.warning("Entity upsert failed while enriching artwork %s: %s", artwork.id, exc)

    return {
        "entity_id_fast": entity_id_fast,
        "artist_entity_id_fast": artist_entity_id_fast,
        "linked_artist_entity_id": linked_artist_entity_id,
    }

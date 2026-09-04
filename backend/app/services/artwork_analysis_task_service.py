"""Per-artwork artwork analysis: one image-based structured AI call producing
visual_description + six dimension scores + open-vocabulary tags, persisted
as a versioned row in artwork_analyses.

Runs in the background AFTER identification settles, because the identified
metadata (artist/title/year/medium) is part of the prompt input. Runs for
every saved artwork — including unrecognized ones — unlike the legacy
entity-level dimension analysis, which it will eventually replace.
"""

from __future__ import annotations

from datetime import UTC, datetime
import json
import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.ai_job import AIJobType
from app.prompts.registry import ArtworkAnalysisPromptContext, render_prompt
from app.config.taste_taxonomy import (
    ANALYZABILITY_OK,
    ANALYZABILITY_STATUSES,
    ARTWORK_ANALYSIS_RESPONSE_SCHEMA,
    ARTWORK_ANALYSIS_STATUS_ANALYZED,
    ARTWORK_ANALYSIS_STATUS_FAILED,
    ARTWORK_ANALYSIS_STATUS_PROCESSING,
    ARTWORK_ANALYSIS_STATUS_UNANALYZABLE,
    ARTWORK_ANALYSIS_TERMINAL_STATUSES,
    ARTWORK_ANALYSIS_VERSION,
    TASTE_DIMENSION_KEYS,
    TASTE_DIMENSION_SCORE_MAX,
    TASTE_DIMENSION_SCORE_MIN,
    TASTE_TAG_CATEGORIES,
    TASTE_TAG_SOURCES,
)
from app.database.connection import SessionLocal
from app.database.models import ArtworkAnalysis, SavedArtwork
from app.models.artwork import AIProvider
from app.services.ai_client_interface import AITextResult
from app.services.ai_service import AIServiceFactory
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.artwork_analysis_service import determine_ai_provider, load_stored_image_bytes

logger = logging.getLogger(__name__)

ARTWORK_ANALYSIS_MAX_TOKENS = 3000
# Dimension scoring should be as repeatable as possible across artworks.
ARTWORK_ANALYSIS_TEMPERATURE = 0.2

_UNKNOWN_ARTIST_NAMES = {"unknown artist", "unknown"}
_UNKNOWN_TITLE_NAMES = {"untitled", "unknown"}


def build_metadata_snapshot(artwork: SavedArtwork) -> Dict[str, Optional[str]]:
    """The identification-derived metadata fed to the prompt. Persisted with
    the analysis row so each result records what context produced it."""
    artist = (artwork.artist_name or "").strip()
    if artist.lower() in _UNKNOWN_ARTIST_NAMES:
        artist = ""
    title = (artwork.artwork_name or "").strip()
    if title.lower() in _UNKNOWN_TITLE_NAMES:
        title = ""
    params = artwork.params if isinstance(artwork.params, dict) else {}
    year = str(params.get("date") or "").strip()
    medium = str(params.get("medium") or "").strip()
    context_parts = []
    if artwork.movement and artwork.movement.lower() != "unknown":
        context_parts.append(f"movement: {artwork.movement}")
    if artwork.museum_name:
        context_parts.append(f"seen at: {artwork.museum_name}")
    return {
        "artist": artist or None,
        "title": title or None,
        "year": year or None,
        "medium": medium or None,
        "context": "; ".join(context_parts) or None,
    }


def get_current_analysis(db: Session, artwork_id: str) -> Optional[ArtworkAnalysis]:
    return (
        db.query(ArtworkAnalysis)
        .filter(ArtworkAnalysis.artwork_id == artwork_id, ArtworkAnalysis.is_current.is_(True))
        .first()
    )


def needs_artwork_analysis(db: Session, artwork_id: str) -> bool:
    """True unless a current row already exists at the current version.
    Current rows are terminal by construction, so failed runs stay retryable
    and a version bump re-qualifies every artwork."""
    current = get_current_analysis(db, artwork_id)
    return not (
        current
        and current.analysis_version == ARTWORK_ANALYSIS_VERSION
        and current.status in ARTWORK_ANALYSIS_TERMINAL_STATUSES
    )


def _parse_response_payload(text: str) -> Dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    payload = json.loads(cleaned)
    if not isinstance(payload, dict):
        raise ValueError("Artwork analysis response is not a JSON object")
    return payload


def _normalize_dimensions(raw: Any) -> Dict[str, Dict[str, Any]]:
    if not isinstance(raw, dict):
        raise ValueError("Artwork analysis response has no dimensions object")
    dimensions: Dict[str, Dict[str, Any]] = {}
    for key in TASTE_DIMENSION_KEYS:
        entry = raw.get(key)
        if not isinstance(entry, dict) or not isinstance(entry.get("score"), int):
            raise ValueError(f"Missing or invalid score for dimension '{key}'")
        score = max(TASTE_DIMENSION_SCORE_MIN, min(TASTE_DIMENSION_SCORE_MAX, entry["score"]))
        evidence = entry.get("evidence")
        evidence_list = [str(item).strip() for item in evidence if str(item).strip()] if isinstance(evidence, list) else []
        dimensions[key] = {"score": score, "evidence": evidence_list}
    return dimensions


def _normalize_tags(raw: Any) -> Dict[str, List[Dict[str, str]]]:
    tags: Dict[str, List[Dict[str, str]]] = {}
    if not isinstance(raw, dict):
        return tags
    for category in TASTE_TAG_CATEGORIES:
        entries = raw.get(category)
        if not isinstance(entries, list):
            continue
        normalized = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            label = str(entry.get("label") or "").strip()
            if not label:
                continue
            source = entry.get("source")
            if source not in TASTE_TAG_SOURCES:
                source = "visual_inferred"
            normalized.append({"label": label, "source": source})
        if normalized:
            tags[category] = normalized
    return tags


def _set_current_analysis(db: Session, row: ArtworkAnalysis) -> None:
    db.query(ArtworkAnalysis).filter(
        ArtworkAnalysis.artwork_id == row.artwork_id,
        ArtworkAnalysis.is_current.is_(True),
        ArtworkAnalysis.id != row.id,
    ).update({"is_current": False}, synchronize_session=False)
    row.is_current = True


async def run_artwork_analysis(
    artwork_id: str,
    image_bytes: Optional[bytes] = None,
    force: bool = False,
) -> None:
    """Analyze one artwork. Safe to call repeatedly: skips when a current
    result already exists at the current version (unless force)."""
    db = SessionLocal()
    usage_id: Optional[str] = None
    try:
        artwork = db.query(SavedArtwork).filter(
            SavedArtwork.id == artwork_id,
            SavedArtwork.active_filter(),
        ).first()
        if not artwork:
            return
        if not force and not needs_artwork_analysis(db, artwork_id):
            return

        snapshot = build_metadata_snapshot(artwork)
        row = ArtworkAnalysis(
            artwork_id=artwork_id,
            analysis_version=ARTWORK_ANALYSIS_VERSION,
            status=ARTWORK_ANALYSIS_STATUS_PROCESSING,
            metadata_snapshot=snapshot,
        )
        db.add(row)
        db.commit()

        try:
            if image_bytes is None:
                image_bytes = await load_stored_image_bytes(
                    artwork.photo_uri,
                    failure_detail="Could not load artwork image for artwork analysis",
                )

            prompt = render_prompt(
                AIJobType.ARTWORK_ANALYSIS,
                ArtworkAnalysisPromptContext(metadata=snapshot),
            )
            ai_provider = determine_ai_provider(AIProvider.GEMINI)
            ai_service = AIServiceFactory.get_service(ai_provider)
            row.model = get_ai_model_name(ai_service, ai_provider.value)
            usage_id = start_ai_usage(
                user_id=artwork.user_id,
                job_type=AIJobType.ARTWORK_ANALYSIS,
                model=row.model,
                subject_type="artwork",
                subject_id=artwork_id,
            )
            call_result = getattr(ai_service.ai_client, "call_with_image_and_text_result", None)
            call_kwargs = {
                "prompt": prompt,
                "image_data": image_bytes,
                "max_tokens": ARTWORK_ANALYSIS_MAX_TOKENS,
                "temperature": ARTWORK_ANALYSIS_TEMPERATURE,
                "response_schema": ARTWORK_ANALYSIS_RESPONSE_SCHEMA,
            }
            if callable(call_result):
                response = await call_result(**call_kwargs)
            else:
                response = AITextResult(text=await ai_service.ai_client.call_with_image_and_text(**call_kwargs))

            payload = _parse_response_payload(response.text)
            analyzability = payload.get("analyzability") if isinstance(payload.get("analyzability"), dict) else {}
            analyzability_status = analyzability.get("status")
            if analyzability_status not in ANALYZABILITY_STATUSES:
                raise ValueError(f"Invalid analyzability status: {analyzability_status!r}")

            if analyzability_status == ANALYZABILITY_OK:
                row.dimensions = _normalize_dimensions(payload.get("dimensions"))
                row.tags = _normalize_tags(payload.get("tags"))
                row.visual_description = str(payload.get("visual_description") or "").strip() or None
                proposed = payload.get("proposed_categories")
                row.proposed_categories = proposed if isinstance(proposed, list) else []
                row.status = ARTWORK_ANALYSIS_STATUS_ANALYZED
            else:
                row.status = ARTWORK_ANALYSIS_STATUS_UNANALYZABLE
                row.analyzability_note = str(analyzability.get("note") or "").strip() or analyzability_status

            row.completed_at = datetime.now(UTC)
            _set_current_analysis(db, row)
            db.commit()
            succeed_ai_usage(
                usage_id,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            )
            logger.info("Artwork analysis %s for artwork %s", row.status, artwork_id)
        except Exception as exc:
            fail_ai_usage(usage_id, exc)
            db.rollback()
            row = db.query(ArtworkAnalysis).filter(ArtworkAnalysis.id == row.id).first()
            if row:
                row.status = ARTWORK_ANALYSIS_STATUS_FAILED
                row.error = str(exc)
                row.completed_at = datetime.now(UTC)
                db.commit()
            logger.warning("Artwork analysis failed for artwork %s: %s", artwork_id, exc)
    finally:
        db.close()

async def backfill_artwork_analyses(db: Session, limit: Optional[int] = None, force: bool = False) -> Dict[str, int]:
    """Sweep artworks lacking a current-version terminal analysis. Also the
    migration path for the pre-existing library and the retry path for
    failed runs."""
    current_ids = (
        db.query(ArtworkAnalysis.artwork_id)
        .filter(
            ArtworkAnalysis.is_current.is_(True),
            ArtworkAnalysis.analysis_version == ARTWORK_ANALYSIS_VERSION,
            ArtworkAnalysis.status.in_(ARTWORK_ANALYSIS_TERMINAL_STATUSES),
        )
        .subquery()
    )
    query = db.query(SavedArtwork.id).filter(SavedArtwork.active_filter())
    if not force:
        query = query.filter(~SavedArtwork.id.in_(current_ids.select()))
    if limit:
        query = query.limit(limit)
    artwork_ids = [row[0] for row in query.all()]

    done = 0
    failed = 0
    for artwork_id in artwork_ids:
        await run_artwork_analysis(artwork_id, force=force)
        db.expire_all()
        current = get_current_analysis(db, artwork_id)
        if current and current.status in ARTWORK_ANALYSIS_TERMINAL_STATUSES and current.analysis_version == ARTWORK_ANALYSIS_VERSION:
            done += 1
        else:
            failed += 1
    return {"total": len(artwork_ids), "done": done, "failed": failed}

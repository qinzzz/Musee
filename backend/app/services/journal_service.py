from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
import hashlib
import json
import logging
from typing import Any, Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.models import ArtworkAnalysis, Journal, SavedArtwork, Session as SessionModel, SessionEvent, User
from app.services.ai_client_interface import AITextResult
from app.services.ai_service import AIServiceFactory
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.artwork_analysis_service import determine_ai_provider
from app.services.session_event_service import derive_session_event_artwork_ids, normalize_session_event_type
from app.utils.prompt_loader import get_journal_generation_prompt

logger = logging.getLogger(__name__)

EVIDENCE_SCHEMA_VERSION = "journal-evidence-v2"
PROMPT_VERSION = "journal-generation-v6"
MAX_EVENTS = 100
MAX_EVENT_TEXT_CHARS = 1_500
MAX_TOTAL_TEXT_CHARS = 40_000
MAX_ARTWORKS = 30
MAX_ARTWORK_TAGS = 5
MAX_VISUAL_DESCRIPTION_CHARS = 700
MAX_TITLE_CHARS = 160
MAX_REFLECTION_CHARS = 1_500
MAX_FOCUS_LABEL_CHARS = 240
MAX_NARRATIVE_ARC_CHARS = 800
MAX_FOCUSES = 3
MAX_REPRESENTATIVE_ARTWORKS = 3

JOURNAL_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "title": {"type": "STRING", "nullable": True},
        "reflection": {"type": "STRING"},
        "focuses": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "label": {"type": "STRING"},
                    "evidenceEventIds": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                    },
                },
                "required": ["label", "evidenceEventIds"],
            },
        },
        "narrativeArc": {"type": "STRING", "nullable": True},
        "representativeArtworkIds": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
        },
    },
    "required": ["reflection"],
}


def _display_location_from_evidence(evidence: Any) -> Optional[str]:
    if not isinstance(evidence, dict):
        return None

    locations: List[str] = []
    for artwork in evidence.get("artworks") or []:
        if not isinstance(artwork, dict):
            continue
        location = artwork.get("location")
        if isinstance(location, dict):
            museum = str(location.get("museum") or "").strip()
            city = str(location.get("city") or "").strip()
            country = str(location.get("country") or "").strip()
            if museum:
                locations.append(museum)
            elif city and country:
                locations.append(f"{city}, {country}")
            elif city or country:
                locations.append(city or country)
        legacy_museum = str(artwork.get("museum") or "").strip()
        if legacy_museum:
            locations.append(legacy_museum)

    unique_locations = _ordered_unique(locations)
    if unique_locations:
        return " · ".join(unique_locations[:2])
    return None


def list_user_journals(db: Session, *, user_id: str) -> List[Dict[str, Any]]:
    user_exists = db.query(User.user_id).filter(User.user_id == user_id).first()
    if not user_exists:
        raise HTTPException(status_code=404, detail="User not found")

    journals = (
        db.query(Journal)
        .filter(Journal.user_id == user_id)
        .order_by(Journal.local_date.desc(), Journal.generated_at.desc())
        .all()
    )

    representative_ids = _ordered_unique(
        artwork_id
        for journal in journals
        for artwork_id in (journal.representative_artwork_ids or [])
        if isinstance(artwork_id, str)
    )
    artwork_by_id = {
        artwork.id: artwork
        for artwork in (
            db.query(SavedArtwork)
            .filter(
                SavedArtwork.user_id == user_id,
                SavedArtwork.id.in_(representative_ids),
            )
            .all()
            if representative_ids
            else []
        )
    }

    return [
        {
            "id": journal.id,
            "local_date": journal.local_date.isoformat(),
            "location": _display_location_from_evidence(journal.evidence_snapshot),
            "reflection": journal.reflection,
            "representative_artworks": [
                {
                    "id": artwork.id,
                    "photo_uri": artwork.photo_uri,
                    "artwork_name": artwork.artwork_name,
                    "artist_name": artwork.artist_name,
                }
                for artwork_id in (journal.representative_artwork_ids or [])[:2]
                if (artwork := artwork_by_id.get(artwork_id)) is not None
            ],
        }
        for journal in journals
    ]


def resolve_utc_period(local_date: date, timezone_name: str) -> tuple[datetime, datetime]:
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=422, detail="Invalid IANA timezone") from exc

    local_start = datetime.combine(local_date, time.min, tzinfo=timezone)
    local_end = datetime.combine(local_date + timedelta(days=1), time.min, tzinfo=timezone)
    return (
        local_start.astimezone(UTC).replace(tzinfo=None),
        local_end.astimezone(UTC).replace(tzinfo=None),
    )


def _evenly_limit(items: List[Any], limit: int) -> tuple[List[Any], bool]:
    if len(items) <= limit:
        return items, False
    if limit == 1:
        return [items[0]], True
    last_index = len(items) - 1
    indexes = [(position * last_index) // (limit - 1) for position in range(limit)]
    return [items[index] for index in indexes], True


def _allocate_text_limits(texts: List[str]) -> List[str]:
    capped = [text[:MAX_EVENT_TEXT_CHARS] for text in texts]
    total = sum(len(text) for text in capped)
    if total <= MAX_TOTAL_TEXT_CHARS:
        return capped

    base_allowance = min(200, MAX_TOTAL_TEXT_CHARS // max(1, len(capped)))
    base_lengths = [min(len(text), base_allowance) for text in capped]
    remaining = MAX_TOTAL_TEXT_CHARS - sum(base_lengths)
    excess = [max(0, len(text) - base) for text, base in zip(capped, base_lengths)]
    total_excess = sum(excess)
    if total_excess <= 0:
        return [text[:length] for text, length in zip(capped, base_lengths)]

    allocations = [
        base + int(remaining * extra / total_excess)
        for base, extra in zip(base_lengths, excess)
    ]
    unused = MAX_TOTAL_TEXT_CHARS - sum(allocations)
    for index, extra in enumerate(excess):
        if unused <= 0:
            break
        if allocations[index] < len(capped[index]) and extra > 0:
            allocations[index] += 1
            unused -= 1
    return [text[:length] for text, length in zip(capped, allocations)]


def _ordered_unique(values: Iterable[str]) -> List[str]:
    result: List[str] = []
    seen: set[str] = set()
    for value in values:
        if value and value not in seen:
            result.append(value)
            seen.add(value)
    return result


def _build_artwork_context(
    artwork: SavedArtwork,
    visual_description: Optional[str],
) -> Dict[str, Any]:
    params = artwork.params if isinstance(artwork.params, dict) else {}
    tags = [
        tag.name
        for tag in (artwork.artwork_tags or [])
        if tag.name
    ][:MAX_ARTWORK_TAGS]
    normalized_visual_description = (visual_description or "").strip()
    location_payload = artwork.location if isinstance(artwork.location, dict) else {}
    location_context = {
        key: location_payload.get(key)
        for key in ("museum", "city", "country")
        if location_payload.get(key)
    }
    if artwork.museum_name and "museum" not in location_context:
        location_context["museum"] = artwork.museum_name
    return {
        "artworkId": artwork.id,
        "title": artwork.artwork_name,
        "artist": artwork.artist_name,
        "date": params.get("date"),
        "medium": params.get("medium"),
        "movement": artwork.movement,
        "location": location_context or None,
        "tags": tags,
        "visualDescription": normalized_visual_description[:MAX_VISUAL_DESCRIPTION_CHARS] or None,
    }


def _build_event_artwork_entries(
    event: SessionEvent,
    valid_artwork_ids: set[str],
) -> List[Dict[str, str]]:
    payload = event.payload if isinstance(event.payload, dict) else {}
    raw_entries = payload.get("artworks")
    if not isinstance(raw_entries, list):
        return []
    result: List[Dict[str, str]] = []
    for raw_entry in raw_entries:
        if not isinstance(raw_entry, dict):
            continue
        artwork_id = str(raw_entry.get("artwork_id") or "").strip()
        source = str(raw_entry.get("source") or "").strip()
        if artwork_id not in valid_artwork_ids:
            continue
        entry = {"artworkId": artwork_id}
        if source in {"capture", "upload", "library"}:
            entry["source"] = source
        result.append(entry)
    return result


def build_daily_evidence(
    db: Session,
    *,
    user_id: str,
    local_date: date,
    timezone_name: str,
    configured_language: Optional[str] = None,
) -> Dict[str, Any]:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    period_start_utc, period_end_utc = resolve_utc_period(local_date, timezone_name)
    rows = (
        db.query(SessionEvent, SessionModel)
        .join(SessionModel, SessionModel.id == SessionEvent.session_id)
        .filter(
            SessionModel.user_id == user_id,
            SessionEvent.role == "user",
            SessionEvent.created_at >= period_start_utc,
            SessionEvent.created_at < period_end_utc,
        )
        .order_by(SessionEvent.created_at.asc(), SessionEvent.sequence_number.asc())
        .all()
    )

    eligible_rows: List[tuple[SessionEvent, SessionModel, List[str]]] = []
    referenced_artwork_ids: List[str] = []
    for event, session in rows:
        event_type = normalize_session_event_type(event.type, role=event.role)
        if event_type != "user_input":
            continue
        artwork_ids = derive_session_event_artwork_ids(event_type, event.payload)
        content = (event.content or "").strip()
        if not content and not artwork_ids:
            continue
        eligible_rows.append((event, session, artwork_ids))
        referenced_artwork_ids.extend(artwork_ids)

    limited_rows, events_truncated = _evenly_limit(eligible_rows, MAX_EVENTS)
    candidate_artwork_ids = _ordered_unique(
        artwork_id
        for _, _, artwork_ids in limited_rows
        for artwork_id in artwork_ids
    )[:MAX_ARTWORKS]
    artwork_rows = (
        db.query(SavedArtwork)
        .filter(
            SavedArtwork.user_id == user_id,
            SavedArtwork.id.in_(candidate_artwork_ids),
        )
        .all()
        if candidate_artwork_ids
        else []
    )
    artwork_by_id = {artwork.id: artwork for artwork in artwork_rows}
    analysis_rows = (
        db.query(ArtworkAnalysis)
        .filter(
            ArtworkAnalysis.artwork_id.in_(candidate_artwork_ids),
            ArtworkAnalysis.is_current.is_(True),
        )
        .all()
        if candidate_artwork_ids
        else []
    )
    visual_description_by_artwork_id = {
        analysis.artwork_id: analysis.visual_description
        for analysis in analysis_rows
        if analysis.visual_description
    }
    valid_artwork_ids = [
        artwork_id for artwork_id in candidate_artwork_ids if artwork_id in artwork_by_id
    ]
    valid_artwork_id_set = set(valid_artwork_ids)

    raw_texts = [(event.content or "").strip() for event, _, _ in limited_rows]
    limited_texts = _allocate_text_limits(raw_texts)
    events: List[Dict[str, Any]] = []
    session_ranges: Dict[str, Dict[str, Any]] = {}
    timezone = ZoneInfo(timezone_name)
    for (event, session, artwork_ids), content in zip(limited_rows, limited_texts):
        occurred_at_utc = event.created_at.replace(tzinfo=UTC)
        occurred_at_local = occurred_at_utc.astimezone(timezone)
        valid_event_artwork_ids = [
            artwork_id for artwork_id in artwork_ids if artwork_id in valid_artwork_id_set
        ]
        if not content and not valid_event_artwork_ids:
            continue
        events.append(
            {
                "eventId": event.id,
                "type": "user_input",
                "occurredAt": occurred_at_local.isoformat(),
                "sessionId": session.id,
                "text": content or None,
                "artworkIds": valid_event_artwork_ids,
                "artworks": _build_event_artwork_entries(event, valid_artwork_id_set),
            }
        )
        session_range = session_ranges.setdefault(
            session.id,
            {
                "sessionId": session.id,
                "title": session.user_title or session.system_title or session.title,
                "firstIncludedEventAt": occurred_at_local.isoformat(),
                "lastIncludedEventAt": occurred_at_local.isoformat(),
            },
        )
        session_range["lastIncludedEventAt"] = occurred_at_local.isoformat()

    artworks = [
        _build_artwork_context(
            artwork_by_id[artwork_id],
            visual_description_by_artwork_id.get(artwork_id),
        )
        for artwork_id in valid_artwork_ids
    ]
    valid_event_ids = [event["eventId"] for event in events]
    return {
        "schemaVersion": EVIDENCE_SCHEMA_VERSION,
        "dateContext": {
            "localDate": local_date.isoformat(),
            "timezone": timezone_name,
            "periodStartUtc": period_start_utc.isoformat(),
            "periodEndUtc": period_end_utc.isoformat(),
            "configuredLanguage": configured_language or "en",
        },
        "sessions": list(session_ranges.values()),
        "events": events,
        "artworks": artworks,
        "validEventIds": valid_event_ids,
        "validArtworkIds": valid_artwork_ids,
        "limitsApplied": {
            "eventsTruncated": events_truncated,
            "originalEligibleEventCount": len(eligible_rows),
            "includedEventCount": len(events),
            "artworksTruncated": len(_ordered_unique(referenced_artwork_ids)) > len(valid_artwork_ids),
        },
    }


def _parse_json_object(raw_text: str) -> Dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
    try:
        parsed = json.loads(text.strip())
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Journal model returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="Journal model returned an invalid object")
    return parsed


def _nullable_text(value: Any, *, max_length: int) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=502, detail="Journal model returned invalid text")
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > max_length:
        raise HTTPException(status_code=502, detail="Journal model returned text that exceeds limits")
    return normalized


def _fallback_reflection(evidence: Dict[str, Any]) -> str:
    messages = [
        event["text"]
        for event in evidence["events"]
        if isinstance(event.get("text"), str) and event["text"].strip()
    ]
    combined_text = " ".join(messages)
    uses_chinese = any("\u4e00" <= character <= "\u9fff" for character in combined_text)
    artworks = evidence["artworks"]
    if artworks:
        artwork = artworks[0]
        title = artwork.get("title") or "an artwork"
        artist = artwork.get("artist")
        if uses_chinese:
            return f"今天留下的是《{title}》" + (f"（{artist}）" if artist else "") + "。"
        return f"{title}" + (f" by {artist}" if artist else "") + " stayed in view today."
    if uses_chinese:
        return "你记录了一段与艺术有关的思考。"
    return "You recorded an art-related thought."


def validate_journal_output(raw_text: str, evidence: Dict[str, Any]) -> Dict[str, Any]:
    parsed = _parse_json_object(raw_text)
    valid_event_ids = set(evidence["validEventIds"])
    valid_artwork_ids = set(evidence["validArtworkIds"])

    raw_focuses = parsed.get("focuses") or []
    if not isinstance(raw_focuses, list) or len(raw_focuses) > MAX_FOCUSES:
        raise HTTPException(status_code=502, detail="Journal model returned invalid focuses")
    focuses: List[Dict[str, Any]] = []
    for raw_focus in raw_focuses:
        if not isinstance(raw_focus, dict):
            raise HTTPException(status_code=502, detail="Journal model returned an invalid focus")
        label = _nullable_text(raw_focus.get("label"), max_length=MAX_FOCUS_LABEL_CHARS)
        evidence_event_ids = raw_focus.get("evidenceEventIds")
        if not label or not isinstance(evidence_event_ids, list):
            raise HTTPException(status_code=502, detail="Journal focus is incomplete")
        normalized_event_ids = _ordered_unique(
            event_id for event_id in evidence_event_ids if isinstance(event_id, str)
        )
        if not normalized_event_ids or not set(normalized_event_ids).issubset(valid_event_ids):
            raise HTTPException(status_code=502, detail="Journal focus references unknown events")
        focuses.append({"label": label, "evidenceEventIds": normalized_event_ids})

    representative_ids = parsed.get("representativeArtworkIds") or []
    if not isinstance(representative_ids, list):
        raise HTTPException(status_code=502, detail="Journal model returned invalid artworks")
    representative_ids = _ordered_unique(
        artwork_id for artwork_id in representative_ids if isinstance(artwork_id, str)
    )
    if len(representative_ids) > MAX_REPRESENTATIVE_ARTWORKS:
        raise HTTPException(status_code=502, detail="Journal model returned too many artworks")
    if not set(representative_ids).issubset(valid_artwork_ids):
        raise HTTPException(status_code=502, detail="Journal model referenced unknown artworks")

    reflection = _nullable_text(parsed.get("reflection"), max_length=MAX_REFLECTION_CHARS)
    return {
        "title": _nullable_text(parsed.get("title"), max_length=MAX_TITLE_CHARS),
        "reflection": reflection or _fallback_reflection(evidence),
        "focuses": focuses,
        "narrative_arc": _nullable_text(
            parsed.get("narrativeArc"),
            max_length=MAX_NARRATIVE_ARC_CHARS,
        ),
        "representative_artwork_ids": representative_ids,
    }


def _build_input_hash(evidence: Dict[str, Any], *, model_version: str) -> str:
    hash_payload = {
        "evidence": evidence,
        "promptVersion": PROMPT_VERSION,
        "modelVersion": model_version,
    }
    serialized = json.dumps(
        hash_payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


async def generate_daily_journal(
    db: Session,
    *,
    user_id: str,
    local_date: date,
    timezone_name: str,
    configured_language: Optional[str] = None,
    force_regenerate: bool = False,
    earliest_date: Optional[date] = None,
) -> tuple[Journal, bool]:
    generation_cutoff = earliest_date or settings.journal_earliest_date
    if local_date < generation_cutoff:
        raise HTTPException(
            status_code=422,
            detail=(
                "Journal generation is not available before "
                f"{generation_cutoff.isoformat()}"
            ),
        )

    evidence = build_daily_evidence(
        db,
        user_id=user_id,
        local_date=local_date,
        timezone_name=timezone_name,
        configured_language=configured_language,
    )
    if not evidence["events"]:
        raise HTTPException(status_code=422, detail="No eligible session events for this local date")

    ai_provider = determine_ai_provider(None)
    ai_service = AIServiceFactory.get_service(ai_provider)
    model_version = get_ai_model_name(ai_service, ai_provider.value) or ai_provider.value
    input_hash = _build_input_hash(evidence, model_version=model_version)
    existing = (
        db.query(Journal)
        .filter(Journal.user_id == user_id, Journal.local_date == local_date)
        .first()
    )
    if existing and existing.input_hash == input_hash:
        return existing, False
    if existing and not force_regenerate:
        raise HTTPException(
            status_code=409,
            detail="Journal evidence changed; set force_regenerate=true to replace it",
        )

    prompt = get_journal_generation_prompt(
        json.dumps(evidence, ensure_ascii=False, separators=(",", ":"))
    )
    usage_id = start_ai_usage(
        user_id=user_id,
        job_type="journal_generation",
        model=model_version,
        subject_type="journal_date",
        subject_id=f"{user_id}:{local_date.isoformat()}",
    )
    try:
        call_kwargs = {
            "prompt": prompt,
            "max_tokens": 1_000,
            "temperature": 0.3,
            "response_schema": JOURNAL_RESPONSE_SCHEMA,
        }
        call_text_only_result = getattr(ai_service.ai_client, "call_text_only_result", None)
        if callable(call_text_only_result):
            response = await call_text_only_result(**call_kwargs)
        else:
            response = AITextResult(
                text=await ai_service.ai_client.call_text_only(**call_kwargs)
            )
        generated = validate_journal_output(response.text, evidence)
        succeed_ai_usage(
            usage_id,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )
    except HTTPException as exc:
        fail_ai_usage(usage_id, exc)
        raise
    except Exception as exc:
        fail_ai_usage(usage_id, exc)
        logger.exception("Journal generation failed")
        raise HTTPException(status_code=502, detail="Journal generation failed") from exc

    period_start_utc, period_end_utc = resolve_utc_period(local_date, timezone_name)
    generated_at = datetime.now(UTC).replace(tzinfo=None)
    journal = existing or Journal(user_id=user_id, local_date=local_date)
    journal.timezone = timezone_name
    journal.period_start_utc = period_start_utc
    journal.period_end_utc = period_end_utc
    journal.title = generated["title"]
    journal.reflection = generated["reflection"]
    journal.focuses = generated["focuses"]
    journal.narrative_arc = generated["narrative_arc"]
    journal.representative_artwork_ids = generated["representative_artwork_ids"]
    journal.evidence_snapshot = evidence
    journal.evidence_schema_version = EVIDENCE_SCHEMA_VERSION
    journal.source_event_count = len(evidence["events"])
    journal.input_hash = input_hash
    journal.prompt_version = PROMPT_VERSION
    journal.model_version = model_version
    journal.generated_at = generated_at
    if not existing:
        db.add(journal)
    db.commit()
    db.refresh(journal)
    return journal, existing is not None

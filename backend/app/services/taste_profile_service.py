from __future__ import annotations

from datetime import UTC, datetime
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database.models import SavedArtwork, TasteProfile
from app.services.ai_client_interface import AITextResult
from app.services.ai_service import AIServiceFactory
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.artwork_analysis_service import determine_ai_provider

logger = logging.getLogger(__name__)

TASTE_DIMENSIONS = [
    ("figurative_abstract", "dim_figurative_abstract", "具象", "抽象"),
    ("emotive_conceptual", "dim_emotive_conceptual", "感性", "理性"),
    ("serene_intense", "dim_serene_intense", "宁静", "张力"),
    ("classical_avantgarde", "dim_classical_avantgarde", "经典", "先锋"),
    ("playful_serious", "dim_playful_serious", "玩味", "严肃"),
]
PROFILE_MIN_SAMPLE = 5
CLASSIFICATION_VALUES = {"unsorted", "love", "respect", "not_for_me"}

_ARCHETYPES: list[dict] = []


def vector_from_rows(rows: List[SavedArtwork]) -> Dict[str, float]:
    vector: Dict[str, float] = {}
    for dim_key, dim_attr, *_ in TASTE_DIMENSIONS:
        values: List[float] = []
        for artwork in rows:
            entity = artwork.artwork_entity
            if not entity or entity.dim_status != "done":
                continue
            value = getattr(entity, dim_attr)
            if value is not None:
                values.append(float(value))
        vector[dim_key] = round(sum(values) / len(values), 3) if values else 0.0
    return vector


def derive_taste_vector(love_vector: Dict[str, float], reject_vector: Dict[str, float]) -> Dict[str, float]:
    taste_vector: Dict[str, float] = {}
    for dim_key, *_ in TASTE_DIMENSIONS:
        raw = float(love_vector.get(dim_key, 0.0)) - float(reject_vector.get(dim_key, 0.0))
        normalized = max(-1.0, min(1.0, raw / 2.0))
        taste_vector[dim_key] = round(normalized, 3)
    return taste_vector


def build_taste_examples(artworks: List[SavedArtwork], taste_vector: Dict[str, float]) -> Dict[str, Any]:
    examples: Dict[str, Any] = {}
    for dim_key, dim_attr, left_label, right_label in TASTE_DIMENSIONS:
        score = taste_vector.get(dim_key, 0.0)
        if abs(score) < 0.15:
            continue
        dominant_sign = 1 if score >= 0 else -1
        candidates: List[Dict[str, Any]] = []
        seen: set[str] = set()
        sorted_rows = sorted(
            artworks,
            key=lambda art: -((getattr(art.artwork_entity, dim_attr, 0) or 0) * dominant_sign)
            if art.artwork_entity
            else 0,
        )
        for artwork in sorted_rows:
            entity = artwork.artwork_entity
            if not entity or entity.dim_status != "done":
                continue
            dim_score = getattr(entity, dim_attr)
            if dim_score is None or dim_score * dominant_sign <= 0:
                continue
            name_key = (artwork.artwork_name or "").lower()
            if name_key in seen:
                continue
            seen.add(name_key)
            candidates.append(
                {
                    "artwork_id": artwork.id,
                    "photo_url": artwork.photo_uri,
                    "artist_name": artwork.artist_name,
                    "artwork_name": artwork.artwork_name,
                    "dim_score": dim_score,
                    "classification": artwork.classification or "unsorted",
                }
            )
            if len(candidates) >= 3:
                break
        if candidates:
            examples[dim_key] = {
                "dominant_pole": right_label if dominant_sign > 0 else left_label,
                "other_pole": left_label if dominant_sign > 0 else right_label,
                "examples": candidates,
            }
    return examples


def get_profile_counts(user_id: str, db: Session) -> Dict[str, int]:
    counts = {key: 0 for key in CLASSIFICATION_VALUES}
    rows = (
        db.query(SavedArtwork.classification, func.count(SavedArtwork.id))
        .filter(SavedArtwork.user_id == user_id, SavedArtwork.active_filter())
        .group_by(SavedArtwork.classification)
        .all()
    )
    for classification, count in rows:
        counts[classification or "unsorted"] = count
    return counts


async def generate_taste_narrative(
    taste_vector: Dict[str, float],
    loved_artworks: List[SavedArtwork],
    rejected_artworks: List[SavedArtwork],
    respected_artworks: List[SavedArtwork],
    user_id: Optional[str] = None,
) -> str:
    loved = [f"{art.artwork_name} by {art.artist_name}" for art in loved_artworks[:6]]
    rejected = [f"{art.artwork_name} by {art.artist_name}" for art in rejected_artworks[:6]]
    respected = [f"{art.artwork_name} by {art.artist_name}" for art in respected_artworks[:6]]
    vector_text = ", ".join(f"{key}: {value}" for key, value in taste_vector.items())
    prompt = f"""
You are writing a concise personal taste profile for an art exploration app.

Taste vector:
{vector_text}

Loved artworks:
{json.dumps(loved, ensure_ascii=False)}

Rejected artworks:
{json.dumps(rejected, ensure_ascii=False)}

Respected artworks (context only, not preference evidence):
{json.dumps(respected, ensure_ascii=False)}

Write 2 short paragraphs in a warm but analytical tone explaining the user's taste. Distinguish clearly between what they love and what they merely respect. Do not mention vectors or numeric scores.
""".strip()
    try:
        ai_provider = determine_ai_provider(None)
        ai_service = AIServiceFactory.get_service(ai_provider)
        usage_id = start_ai_usage(
            user_id=user_id,
            job_type="taste_profile_narrative",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="user" if user_id else None,
            subject_id=user_id,
        )
        call_text_only_result = getattr(ai_service.ai_client, "call_text_only_result", None)
        call_kwargs = {"prompt": prompt, "max_tokens": 500, "temperature": 0.7}
        if callable(call_text_only_result):
            response = await call_text_only_result(**call_kwargs)
        else:
            response = AITextResult(text=await ai_service.ai_client.call_text_only(**call_kwargs))
        succeed_ai_usage(
            usage_id,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )
        return response.text.strip()
    except Exception as exc:
        fail_ai_usage(locals().get("usage_id"), exc)
        logger.warning("Taste profile narrative generation failed: %s", exc)
        loved_phrase = "、".join(loved[:3]) if loved else "目前还没有明确喜欢的作品"
        rejected_phrase = "、".join(rejected[:3]) if rejected else "目前还没有明确排斥的作品"
        respected_phrase = "、".join(respected[:2]) if respected else "暂无"
        return (
            f"你偏爱的作品集中在：{loved_phrase}。这些选择共同勾勒出你当前的审美倾向。"
            f"\n\n你明确不太投入的作品包括：{rejected_phrase}。你也会认可某些作品的重要性，例如：{respected_phrase}，但这种尊重并不等于个人偏爱。"
        )


def mark_taste_profile_outdated(user_id: Optional[str], db: Session) -> bool:
    if not user_id:
        return False
    profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).first()
    if not profile or profile.status != "generated":
        return False
    profile.status = "outdated"
    profile.is_outdated = 1
    profile.outdated_at = datetime.now(UTC)
    return True


def get_or_create_taste_profile(user_id: str, db: Session) -> TasteProfile:
    profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).first()
    if profile:
        return profile
    profile = TasteProfile(user_id=user_id)
    db.add(profile)
    db.flush()
    return profile


def build_taste_profile_response(user_id: str, db: Session) -> Dict[str, Any]:
    counts = get_profile_counts(user_id, db)
    eligible_count = counts.get("love", 0) + counts.get("not_for_me", 0)
    unsorted_count = counts.get("unsorted", 0)
    can_generate = eligible_count >= PROFILE_MIN_SAMPLE
    profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).first()

    response: Dict[str, Any] = {
        "user_id": user_id,
        "status": "ready" if can_generate else "not_ready",
        "eligible_count": eligible_count,
        "required_count": PROFILE_MIN_SAMPLE,
        "unsorted_count": unsorted_count,
        "love_count": counts.get("love", 0),
        "reject_count": counts.get("not_for_me", 0),
        "respect_count": counts.get("respect", 0),
        "is_generated": bool(profile and profile.generated_at),
        "is_outdated": bool(profile and profile.is_outdated),
        "can_generate": can_generate,
    }

    if profile and profile.generated_at:
        persisted = profile.to_dict()
        for key in [
            "generated_at",
            "outdated_at",
            "love_vector",
            "reject_vector",
            "taste_vector",
            "source_artwork_ids",
            "narrative_summary",
            "created_at",
            "updated_at",
        ]:
            response[key] = persisted.get(key)
        response["status"] = profile.status or response["status"]

    return response


def load_archetypes() -> list[dict]:
    global _ARCHETYPES
    if not _ARCHETYPES:
        path = Path(__file__).resolve().parent.parent / "data" / "taste_archetypes.json"
        _ARCHETYPES = json.loads(path.read_text(encoding="utf-8"))
    return _ARCHETYPES


def match_archetype(scores: dict) -> dict | None:
    threshold = 0.3

    def pole(value):
        if value is None:
            return 0
        if value > threshold:
            return 1
        if value < -threshold:
            return -1
        return 0

    user_poles = {
        "figurative_abstract": pole(scores.get("figurative_abstract")),
        "emotive_conceptual": pole(scores.get("emotive_conceptual")),
        "serene_intense": pole(scores.get("serene_intense")),
        "classical_avantgarde": pole(scores.get("classical_avantgarde")),
        "playful_serious": pole(scores.get("playful_serious")),
    }

    best, best_score = None, -1
    for archetype in load_archetypes():
        dims = archetype["dims"]
        match = sum(1 for key in user_poles if user_poles[key] != 0 and dims.get(key) == user_poles[key])
        mismatch = sum(1 for key in user_poles if user_poles[key] != 0 and dims.get(key) != user_poles[key])
        score = match - 0.5 * mismatch
        if score > best_score:
            best_score = score
            best = archetype
    return best


def get_taste_profile_view(user_id: str, db: Session) -> Dict[str, Any]:
    response = build_taste_profile_response(user_id, db)
    response["total_artworks"] = sum(
        response.get(key, 0)
        for key in ("love_count", "reject_count", "respect_count", "unsorted_count")
    )

    if response.get("is_generated"):
        classified_rows = (
            db.query(SavedArtwork)
            .options(joinedload(SavedArtwork.artwork_entity))
            .filter(
                SavedArtwork.user_id == user_id,
                SavedArtwork.classification.in_(["love", "not_for_me", "respect"]),
                SavedArtwork.active_filter(),
            )
            .all()
        )
        response["dimension_examples"] = build_taste_examples(
            classified_rows,
            response.get("taste_vector") or {},
        )

    return response


async def generate_taste_profile_snapshot(user_id: str, db: Session) -> Dict[str, Any]:
    rows = db.query(SavedArtwork).filter(
        SavedArtwork.user_id == user_id,
        SavedArtwork.active_filter(),
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No artworks found for this user")

    loved_artworks = [art for art in rows if (art.classification or "unsorted") == "love"]
    rejected_artworks = [art for art in rows if (art.classification or "unsorted") == "not_for_me"]
    respected_artworks = [art for art in rows if (art.classification or "unsorted") == "respect"]

    eligible_count = len(loved_artworks) + len(rejected_artworks)
    if eligible_count < PROFILE_MIN_SAMPLE:
        raise HTTPException(
            status_code=400,
            detail=f"At least {PROFILE_MIN_SAMPLE} love or not-for-me classifications are required",
        )

    love_vector = vector_from_rows(loved_artworks)
    reject_vector = vector_from_rows(rejected_artworks)
    taste_vector = derive_taste_vector(love_vector, reject_vector)
    narrative_summary = await generate_taste_narrative(
        taste_vector,
        loved_artworks,
        rejected_artworks,
        respected_artworks,
        user_id=user_id,
    )

    profile = get_or_create_taste_profile(user_id, db)
    profile.status = "generated"
    profile.eligible_count = eligible_count
    profile.required_count = PROFILE_MIN_SAMPLE
    profile.love_count = len(loved_artworks)
    profile.reject_count = len(rejected_artworks)
    profile.respect_count = len(respected_artworks)
    profile.is_outdated = 0
    profile.generated_at = datetime.now(UTC)
    profile.outdated_at = None
    profile.love_vector = love_vector
    profile.reject_vector = reject_vector
    profile.taste_vector = taste_vector
    profile.source_artwork_ids = [art.id for art in (loved_artworks + rejected_artworks + respected_artworks)]
    profile.narrative_summary = narrative_summary
    db.commit()

    response = build_taste_profile_response(user_id, db)
    response["dimension_examples"] = build_taste_examples(
        loved_artworks + rejected_artworks + respected_artworks,
        taste_vector,
    )
    response["total_artworks"] = len(rows)
    return response

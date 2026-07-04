from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import HTTPException

from app.database.connection import SessionLocal
from app.database.models import SkillEvent, User
from app.models.artwork import AIProvider
from app.services.ai_service import AIServiceFactory
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.claude_api_client import ClaudeAPIClient
from app.services.gemini_api_client import GeminiAPIClient
from app.services.openai_api_client import OpenAIAPIClient
from app.services.photoroom_service import photoroom_service
from app.utils.conversation_storage import ConversationMessage
from app.utils.prompt_loader import get_available_identities, get_available_instructions

logger = logging.getLogger(__name__)
_AI_SERVICES_INITIALIZED = False

DEFAULT_TOPIC = "default topic"

SKILL_CATEGORY_BY_NAME: dict[str, str] = {
    "Color Tension": "PERCEPTION",
    "Compositional Pull": "PERCEPTION",
    "Materiality": "PERCEPTION",
    "Scale & Presence": "PERCEPTION",
    "Detail Hunter": "PERCEPTION",
    "Art Movement": "HISTORY",
    "Lineage": "HISTORY",
    "Historical Context": "HISTORY",
    "Collection & Market": "HISTORY",
    "Legacy": "HISTORY",
    "Life Traces": "INTENT",
    "Argument": "INTENT",
    "Obsession": "INTENT",
    "Ambition": "INTENT",
    "The Specific": "INTENT",
    "Hidden Mechanism": "STRUCTURE",
    "Contradiction": "STRUCTURE",
    "Absence & Silence": "STRUCTURE",
    "Controlled Looking": "STRUCTURE",
    "Temporality": "STRUCTURE",
    "Site": "STRUCTURE",
    "Personal Memory": "RESONANCE",
    "Gut Response": "RESONANCE",
    "Ethical Discomfort": "RESONANCE",
    "Wider Resonance": "RESONANCE",
    "Ineffable": "RESONANCE",
}


def log_skill_event_sync(
    user_id: str,
    skill_name: str,
    skill_category: str,
    event_type: str,
    artwork_id: Optional[str],
) -> None:
    xp_gain = 1 if event_type == "observation" else 3
    with SessionLocal() as db:
        db.add(
            SkillEvent(
                user_id=user_id,
                artwork_id=artwork_id,
                skill_name=skill_name,
                skill_cat=skill_category,
                event_type=event_type,
            )
        )
        user = db.query(User).filter(User.user_id == user_id).first()
        if user:
            stats = dict(user.skill_stats or {})
            entry = dict(stats.get(skill_name, {"observations": 0, "deepdives": 0, "xp": 0}))
            entry[f"{event_type}s"] = entry.get(f"{event_type}s", 0) + 1
            entry["xp"] = entry.get("xp", 0) + xp_gain
            stats[skill_name] = entry
            user.skill_stats = stats
            db.commit()


async def suggest_topics(
    *,
    artist_name: str,
    artwork_name: str,
    conversation_history: str,
    ai_provider: AIProvider,
    identity: Optional[str],
    language: Optional[str],
) -> dict:
    try:
        conv_data = json.loads(conversation_history)
        previous_insights = [
            msg.get("content", "")
            for msg in conv_data
            if msg.get("role") == "assistant" and msg.get("content")
        ]
    except json.JSONDecodeError:
        return {"suggested_topics": [DEFAULT_TOPIC], "error": "Invalid conversation history"}

    if not previous_insights:
        return {"suggested_topics": [DEFAULT_TOPIC]}

    try:
        ai_service = AIServiceFactory.get_service(ai_provider)
        usage_id = start_ai_usage(
            user_id=None,
            job_type="suggest_topics",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="artwork_metadata",
            subject_id=f"{artist_name}:{artwork_name}",
        )
        suggested_topics = await ai_service.suggest_topics(
            artist_name,
            artwork_name,
            previous_insights,
            identity=identity,
            language=language,
        )
        succeed_ai_usage(usage_id)
        return {"suggested_topics": suggested_topics, "model_used": ai_provider.value}
    except Exception as exc:
        fail_ai_usage(locals().get("usage_id"), exc)
        logger.error("Topic suggestion failed: %s", exc)
        if "API error" in str(exc):
            raise HTTPException(status_code=503, detail=str(exc))
        raise HTTPException(status_code=500, detail=f"Topic suggestion failed: {exc}")


async def generate_summary(
    *,
    image_bytes: bytes,
    artist_name: str,
    artwork_name: str,
    conversation_history: Optional[str],
    ai_provider: AIProvider,
    identity: Optional[str],
    language: Optional[str],
) -> dict:
    conv_messages: list[ConversationMessage] = []
    if conversation_history:
        try:
            conv_data = json.loads(conversation_history)
            conv_messages = [
                ConversationMessage(role=msg.get("role", "user"), content=msg.get("content", ""))
                for msg in conv_data
                if msg.get("content")
            ]
        except json.JSONDecodeError:
            pass

    try:
        ai_service = AIServiceFactory.get_service(ai_provider)
        usage_id = start_ai_usage(
            user_id=None,
            job_type="artwork_summary",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="artwork_metadata",
            subject_id=f"{artist_name}:{artwork_name}",
        )
        summary = await ai_service.generate_summary(
            image_bytes,
            artist_name,
            artwork_name,
            conv_messages,
            identity=identity,
            language=language,
        )
        succeed_ai_usage(usage_id)
        return {"summary": summary, "model_used": ai_provider.value}
    except Exception as exc:
        fail_ai_usage(locals().get("usage_id"), exc)
        if "API error" in str(exc):
            raise HTTPException(status_code=503, detail=str(exc))
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {exc}")


def get_available_providers_payload(default_provider: str) -> dict:
    providers = AIServiceFactory.get_available_providers()
    return {
        "available_providers": [provider.value for provider in providers],
        "default_provider": default_provider,
        "total": len(providers),
    }


def get_available_identities_payload() -> dict:
    return {
        "available_identities": get_available_identities(),
        "available_instructions": get_available_instructions(),
        "default_identities": {
            "artist_identification": "museum_narrator",
            "artwork_bite": "art_historian",
            "suggest_topics": "art_historian",
        },
    }


async def remove_background(image_data: bytes) -> bytes:
    try:
        result_image = await photoroom_service.remove_background(image_data)
        if not result_image:
            raise HTTPException(status_code=500, detail="Failed to remove background")
        return result_image
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Background removal failed: {exc}")


async def select_explore_skills(
    *,
    image_bytes: bytes,
    ai_provider: AIProvider,
    language: Optional[str],
    artist_name: Optional[str],
    artwork_name: Optional[str],
) -> dict:
    try:
        ai_service = AIServiceFactory.get_fast_service(ai_provider)
        usage_id = start_ai_usage(
            user_id=None,
            job_type="explore_skill_selection",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="artwork_metadata",
            subject_id=f"{artist_name or ''}:{artwork_name or ''}",
        )
        skills = await ai_service.select_explore_skills(
            image_bytes,
            language=language,
            artist_name=artist_name or None,
            artwork_name=artwork_name or None,
        )
        succeed_ai_usage(usage_id)
        return {"skills": skills}
    except Exception as exc:
        fail_ai_usage(locals().get("usage_id"), exc)
        logger.error("artwork-explore-skills error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


async def create_skill_observation(
    *,
    image_bytes: bytes,
    ai_provider: AIProvider,
    skill_name: str,
    skill_desc: str,
    prev_observations: list,
    language: Optional[str],
) -> dict:
    try:
        ai_service = AIServiceFactory.get_fast_service(ai_provider)
        usage_id = start_ai_usage(
            user_id=None,
            job_type="explore_skill_observation",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="skill",
            subject_id=skill_name,
        )
        observation = await ai_service.get_skill_observation(
            image_bytes,
            skill_name,
            skill_desc,
            prev_observations=prev_observations,
            language=language,
        )
        succeed_ai_usage(usage_id)
        return {"observation": observation}
    except Exception as exc:
        fail_ai_usage(locals().get("usage_id"), exc)
        logger.error("artwork-skill-observation error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


async def create_skill_deepdive(
    *,
    image_bytes: bytes,
    ai_provider: AIProvider,
    skill_name: str,
    skill_desc: str,
    language: Optional[str],
) -> dict:
    try:
        ai_service = AIServiceFactory.get_fast_service(ai_provider)
        usage_id = start_ai_usage(
            user_id=None,
            job_type="explore_skill_deepdive",
            model=get_ai_model_name(ai_service, ai_provider.value),
            subject_type="skill",
            subject_id=skill_name,
        )
        deepdive = await ai_service.get_skill_deepdive(
            image_bytes,
            skill_name,
            skill_desc,
            language=language,
        )
        succeed_ai_usage(usage_id)
        return deepdive
    except Exception as exc:
        fail_ai_usage(locals().get("usage_id"), exc)
        logger.error("artwork-skill-deepdive error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


async def define_aesthetic_term(*, tag: str, ai_provider: AIProvider) -> dict:
    ai_service = AIServiceFactory.get_service(ai_provider)
    usage_id = start_ai_usage(
        user_id=None,
        job_type="aesthetic_term_definition",
        model=get_ai_model_name(ai_service, ai_provider.value),
        subject_type="tag",
        subject_id=tag,
    )
    try:
        result = await ai_service.define_aesthetic_term(tag)
        succeed_ai_usage(usage_id)
        return {
            "definition": result["definition"],
            "externalResonances": result["external_resonances"],
        }
    except Exception as exc:
        fail_ai_usage(usage_id, exc)
        logger.exception("Define aesthetic term failed")
        raise HTTPException(status_code=500, detail=str(exc))


async def get_artwork_insights(
    *,
    artist_name: str,
    artwork_name: str,
    language: Optional[str],
    ai_provider: AIProvider,
) -> dict:
    if not artist_name or artist_name.lower() in ("unknown", "unknown artist", ""):
        return {"points": []}

    ai_service = AIServiceFactory.get_service(ai_provider)
    usage_id = start_ai_usage(
        user_id=None,
        job_type="artwork_insights",
        model=get_ai_model_name(ai_service, ai_provider.value),
        subject_type="artwork_metadata",
        subject_id=f"{artist_name}:{artwork_name}",
    )
    try:
        points = await ai_service.get_insights(
            artist_name=artist_name,
            artwork_name=artwork_name or "Untitled",
            language=language,
        )
        succeed_ai_usage(usage_id)
        return {"points": points}
    except Exception as exc:
        fail_ai_usage(usage_id, exc)
        logger.exception("Unlock points failed")
        raise HTTPException(status_code=500, detail=str(exc))


async def generate_speech_audio(*, text: str, ai_provider: AIProvider) -> bytes:
    ai_service = AIServiceFactory.get_service(ai_provider)
    if not isinstance(ai_service.ai_client, GeminiAPIClient):
        raise HTTPException(status_code=503, detail="Speech generation requires Gemini")
    client = ai_service.ai_client
    usage_id = start_ai_usage(
        user_id=None,
        job_type="speech_generation",
        model=get_ai_model_name(ai_service, ai_provider.value),
        subject_type=None,
        subject_id=None,
    )
    try:
        audio_bytes = await client.generate_speech(text)
        if not audio_bytes:
            raise HTTPException(status_code=502, detail="No audio generated")
        succeed_ai_usage(usage_id)
        return audio_bytes
    except HTTPException:
        fail_ai_usage(usage_id, "Speech generation failed")
        raise
    except Exception as exc:
        fail_ai_usage(usage_id, exc)
        logger.exception("Generate speech failed")
        raise HTTPException(status_code=500, detail=str(exc))


def initialize_ai_services(openai_api_key: Optional[str], claude_api_key: Optional[str], gemini_api_key: Optional[str], power_model: Optional[str], fast_model: Optional[str]) -> None:
    global _AI_SERVICES_INITIALIZED
    if _AI_SERVICES_INITIALIZED:
        return
    try:
        if openai_api_key:
            AIServiceFactory.register_client(AIProvider.OPENAI, OpenAIAPIClient(model=power_model))
            print(f"[AI] AI_MODEL_POWER = {power_model or '(unset, using default)'}")
            if fast_model:
                AIServiceFactory.register_fast_client(AIProvider.OPENAI, OpenAIAPIClient(model=fast_model))
                print(f"[AI] AI_MODEL_FAST  = {fast_model}")
            else:
                print("[AI] AI_MODEL_FAST  = (unset, falling back to power model)")
    except Exception as exc:
        logger.error("Failed to initialize OpenAI: %s", exc)

    try:
        if claude_api_key:
            AIServiceFactory.register_client(AIProvider.CLAUDE, ClaudeAPIClient())
            logger.info("Claude client initialized successfully")
    except Exception as exc:
        logger.error("Failed to initialize Claude: %s", exc)

    try:
        if gemini_api_key:
            AIServiceFactory.register_client(AIProvider.GEMINI, GeminiAPIClient())
            logger.info("Gemini client initialized successfully")
    except Exception as exc:
        logger.error("Failed to initialize Gemini: %s", exc)
    _AI_SERVICES_INITIALIZED = True

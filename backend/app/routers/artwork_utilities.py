from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Body, File, Form, Query, Response, UploadFile
from pydantic import BaseModel

from app.config.settings import settings
from app.models.artwork import AIProvider
from app.services.artwork_analysis_service import determine_ai_provider, resolve_image_bytes
from app.services.artwork_utilities_service import (
    SKILL_CATEGORY_BY_NAME,
    create_skill_deepdive,
    create_skill_observation,
    define_aesthetic_term,
    generate_speech_audio,
    generate_summary,
    get_available_identities_payload,
    get_available_providers_payload,
    initialize_ai_services,
    log_skill_event_sync,
    remove_background,
    select_explore_skills,
    suggest_topics,
)
from app.utils.image_processing import process_image

router = APIRouter()


initialize_ai_services(
    settings.openai_api_key,
    settings.claude_api_key,
    settings.gemini_api_key,
    settings.ai_model_power,
    settings.ai_model_fast,
)


class DefineTermRequest(BaseModel):
    tag: str


class GenerateSpeechRequest(BaseModel):
    text: str


@router.post("/suggest-topic")
async def suggest_topic(
    artist_name: str = Form(...),
    artwork_name: str = Form(...),
    conversation_history: str = Form(...),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
):
    ai_provider = determine_ai_provider(model)
    return await suggest_topics(
        artist_name=artist_name,
        artwork_name=artwork_name,
        conversation_history=conversation_history,
        ai_provider=ai_provider,
        identity=identity,
        language=language,
    )


@router.post("/generate-summary")
async def generate_summary_route(
    image: UploadFile = File(...),
    artist_name: str = Form(...),
    artwork_name: str = Form(...),
    conversation_history: Optional[str] = Form(None),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
):
    ai_provider = determine_ai_provider(model)
    image_bytes, _ = await process_image(image)
    return await generate_summary(
        image_bytes=image_bytes,
        artist_name=artist_name,
        artwork_name=artwork_name,
        conversation_history=conversation_history,
        ai_provider=ai_provider,
        identity=identity,
        language=language,
    )


@router.get("/providers")
async def get_available_providers():
    return get_available_providers_payload(settings.ai_provider)


@router.get("/identities")
async def get_available_identities():
    return get_available_identities_payload()


@router.post("/remove-background")
async def remove_background_route(image: UploadFile = File(...)):
    result_image = await remove_background(await image.read())
    return Response(
        content=result_image,
        media_type="image/png",
        headers={"Content-Disposition": "attachment; filename=no-background.png"},
    )


@router.post("/artwork-explore-skills")
async def artwork_explore_skills(
    photo_uri: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    model: Optional[AIProvider] = Form(None),
    language: Optional[str] = Form(None),
    artist_name: Optional[str] = Form(None),
    artwork_name: Optional[str] = Form(None),
):
    ai_provider = determine_ai_provider(model)
    image_bytes = await resolve_image_bytes(image, photo_uri)
    return await select_explore_skills(
        image_bytes=image_bytes,
        ai_provider=ai_provider,
        language=language,
        artist_name=artist_name,
        artwork_name=artwork_name,
    )


@router.post("/artwork-skill-observation")
async def artwork_skill_observation(
    skill_name: str = Form(...),
    skill_desc: str = Form(...),
    prev_observations: Optional[str] = Form(None),
    photo_uri: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    model: Optional[AIProvider] = Form(None),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    artwork_id: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = None,
):
    ai_provider = determine_ai_provider(model)
    image_bytes = await resolve_image_bytes(image, photo_uri)
    previous = json.loads(prev_observations) if prev_observations else []
    response = await create_skill_observation(
        image_bytes=image_bytes,
        ai_provider=ai_provider,
        skill_name=skill_name,
        skill_desc=skill_desc,
        prev_observations=previous,
        language=language,
    )
    if user_id and previous == [] and background_tasks:
        background_tasks.add_task(
            log_skill_event_sync,
            user_id,
            skill_name,
            SKILL_CATEGORY_BY_NAME.get(skill_name, "STRUCTURE"),
            "observation",
            artwork_id,
        )
    return response


@router.post("/artwork-skill-deepdive")
async def artwork_skill_deepdive(
    skill_name: str = Form(...),
    skill_desc: str = Form(...),
    photo_uri: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    model: Optional[AIProvider] = Form(None),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    artwork_id: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = None,
):
    ai_provider = determine_ai_provider(model)
    image_bytes = await resolve_image_bytes(image, photo_uri)
    response = await create_skill_deepdive(
        image_bytes=image_bytes,
        ai_provider=ai_provider,
        skill_name=skill_name,
        skill_desc=skill_desc,
        language=language,
    )
    if user_id and background_tasks:
        background_tasks.add_task(
            log_skill_event_sync,
            user_id,
            skill_name,
            SKILL_CATEGORY_BY_NAME.get(skill_name, "STRUCTURE"),
            "deepdive",
            artwork_id,
        )
    return response


@router.post("/define-aesthetic-term")
async def define_aesthetic_term_route(
    request: DefineTermRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    ai_provider = determine_ai_provider(model)
    return await define_aesthetic_term(tag=request.tag, ai_provider=ai_provider)


@router.post("/generate-speech")
async def generate_speech(
    request: GenerateSpeechRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    ai_provider = determine_ai_provider(model)
    audio_bytes = await generate_speech_audio(text=request.text, ai_provider=ai_provider)
    return Response(content=audio_bytes, media_type="application/octet-stream")

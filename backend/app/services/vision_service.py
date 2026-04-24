"""
Google Cloud Vision Web Detection — artwork hint extraction.

Calls Vision API, filters generic labels, and returns a formatted hint
string ready to prepend to an LLM identification prompt.
"""

import base64
import logging
from typing import Optional

import httpx

from app.config.settings import settings

logger = logging.getLogger(__name__)

_VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"

# Labels that carry no art-identification signal — suppress hint when these are all Vision returns
_GENERIC_LABELS = {
    "art", "painting", "modern art", "contemporary art", "visual arts", "fine art",
    "abstract art", "artwork", "illustration", "picture", "image", "drawing",
    "sculpture", "photograph", "photography", "ceiling fixture", "fluorescent lamp",
    "lighting", "floor", "room", "building", "architecture", "window", "facade",
    "audience", "mattress", "sheet", "bed", "anime", "manga",
}


def _is_generic(labels: list[str]) -> bool:
    return not labels or all(l.lower().strip() in _GENERIC_LABELS for l in labels)


async def _call_vision_api(image_bytes: bytes, api_key: str) -> dict:
    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "requests": [{
            "image": {"content": b64},
            "features": [{"type": "WEB_DETECTION", "maxResults": 10}]
        }]
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{_VISION_ENDPOINT}?key={api_key}", json=payload)
        resp.raise_for_status()

    web = resp.json()["responses"][0].get("webDetection", {})
    matching_pages = web.get("pagesWithMatchingImages", [])
    similar_images = web.get("visuallySimilarImages", [])
    return {
        "entities":      [e["description"] for e in web.get("webEntities", []) if e.get("description")],
        "best_guess":    [lbl["label"] for lbl in web.get("bestGuessLabels", [])],
        "page_titles":   [p["pageTitle"] for p in matching_pages if p.get("pageTitle")][:10],
        "matching_urls": [p["url"] for p in matching_pages[:5]],
        "similar_urls":  [img["url"] for img in similar_images[:5]],
    }


def _build_hint(vision: dict) -> str:
    entities   = vision.get("entities", [])
    best_guess = vision.get("best_guess", [])

    if _is_generic(best_guess + entities):
        return ""

    parts = []
    if best_guess:
        parts.append("Best guess: " + " | ".join(best_guess))

    useful_entities = [e for e in entities if e.lower().strip() not in _GENERIC_LABELS]
    if useful_entities:
        parts.append("Web entities: " + ", ".join(useful_entities[:10]))

    if vision.get("page_titles"):
        parts.append("Matching page titles: " + " | ".join(vision["page_titles"][:5]))

    urls = vision.get("matching_urls") or vision.get("similar_urls", [])
    if urls:
        url_type = "Pages containing this exact image" if vision.get("matching_urls") else "Visually similar images"
        parts.append(f"{url_type}:\n" + "\n".join(f"  {u}" for u in urls))
        parts.append(
            "(You may visit these URLs for additional context — "
            "URL paths and page content often reveal the artist or artwork name.)"
        )

    return "\n".join(parts)


async def get_vision_hint(image_bytes: bytes) -> Optional[str]:
    """
    Run Google Vision Web Detection and return a hint string for LLM injection.
    Returns None if Vision is not configured, or an empty string if no useful signal.
    Failures are logged and swallowed so the caller can proceed without a hint.
    """
    api_key = settings.google_vision_api_key
    if not api_key:
        return None

    try:
        vision = await _call_vision_api(image_bytes, api_key)
        hint = _build_hint(vision)
        if hint:
            logger.info("Vision hint generated (%d entities, %d best_guess, %d page_titles)",
                        len(vision["entities"]), len(vision["best_guess"]), len(vision["page_titles"]))
        else:
            logger.debug("Vision hint suppressed (generic or empty labels)")
        return hint
    except Exception as e:
        logger.warning("Vision API failed, proceeding without hint: %s", e)
        return None

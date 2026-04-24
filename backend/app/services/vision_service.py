"""
Google Cloud Vision Web Detection — artwork hint extraction.

Calls Vision API, filters generic labels, and returns a formatted hint
string ready to prepend to an LLM identification prompt, plus filtered
reference URLs for the artwork.
"""

import base64
import logging
from typing import Optional
from urllib.parse import urlparse

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

# Domains to skip — stock photo sites and social media add noise
_SKIP_DOMAINS = {
    "shutterstock.com", "gettyimages.com", "alamy.com", "stock.adobe.com",
    "dreamstime.com", "istockphoto.com", "depositphotos.com", "bigstockphoto.com",
    "pinterest.com", "pinterest.co.uk", "tumblr.com", "instagram.com",
    "facebook.com", "twitter.com", "x.com", "reddit.com",
    "flickr.com", "500px.com", "deviantart.com",
}

def _filter_ref_urls(vision: dict, max_urls: int = 3) -> list[dict]:
    """Return up to max_urls reference dicts {page_url, thumbnail, title} from Vision results."""
    result = []
    seen_domains = set()

    def _add(page_url: str, thumbnail: str, title: str) -> bool:
        if not page_url:
            return False
        try:
            domain = urlparse(page_url).netloc.lower().lstrip("www.")
        except Exception:
            return False
        if any(domain == d or domain.endswith("." + d) for d in _SKIP_DOMAINS):
            return False
        if domain in seen_domains:
            return False
        seen_domains.add(domain)
        result.append({"page_url": page_url, "thumbnail": thumbnail, "title": title})
        return True

    for page in vision.get("pages", []):
        if len(result) >= max_urls:
            break
        _add(page.get("url", ""), page.get("thumbnail", ""), page.get("title", ""))

    # Fallback: visually similar images (thumbnail = image itself, page_url = image url)
    if len(result) < max_urls:
        for img_url in vision.get("similar_urls", []):
            if len(result) >= max_urls:
                break
            _add(img_url, img_url, "")

    return result


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
    raw_pages = web.get("pagesWithMatchingImages", [])
    similar_images = web.get("visuallySimilarImages", [])

    # Build page entries with thumbnail from the matching image on that page
    pages = []
    for p in raw_pages[:10]:
        thumb_list = p.get("fullMatchingImages") or p.get("partialMatchingImages") or []
        thumbnail = thumb_list[0].get("url", "") if thumb_list else ""
        pages.append({
            "url":       p.get("url", ""),
            "title":     p.get("pageTitle", ""),
            "thumbnail": thumbnail,
        })

    return {
        "entities":    [e["description"] for e in web.get("webEntities", []) if e.get("description")],
        "best_guess":  [lbl["label"] for lbl in web.get("bestGuessLabels", [])],
        "page_titles": [p["title"] for p in pages if p.get("title")][:10],
        "pages":       pages,
        "similar_urls": [img["url"] for img in similar_images[:5]],
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

    page_urls = [p["url"] for p in vision.get("pages", [])] or vision.get("similar_urls", [])
    if page_urls:
        url_type = "Pages containing this exact image" if vision.get("pages") else "Visually similar images"
        parts.append(f"{url_type}:\n" + "\n".join(f"  {u}" for u in page_urls))
        parts.append(
            "(You may visit these URLs for additional context — "
            "URL paths and page content often reveal the artist or artwork name.)"
        )

    return "\n".join(parts)


async def get_vision_hint(image_bytes: bytes) -> tuple[Optional[str], list[str]]:
    """
    Run Google Vision Web Detection.
    Returns (hint_string, ref_urls) — hint for LLM injection, ref_urls for display.
    Returns (None, []) if Vision is not configured; failures are swallowed.
    """
    api_key = settings.google_vision_api_key
    if not api_key:
        return None, []

    try:
        vision = await _call_vision_api(image_bytes, api_key)
        hint = _build_hint(vision)
        ref_urls = _filter_ref_urls(vision)
        if hint:
            logger.info("Vision hint generated (%d entities, %d best_guess, %d ref_urls)",
                        len(vision["entities"]), len(vision["best_guess"]), len(ref_urls))
        else:
            logger.debug("Vision hint suppressed (generic or empty labels)")
        return hint, ref_urls
    except Exception as e:
        logger.warning("Vision API failed, proceeding without hint: %s", e)
        return None, []

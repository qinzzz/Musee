from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import html
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Iterable, Mapping, Optional

import httpx

from app.config.settings import settings
from app.database.connection import SessionLocal
from app.database.models import MuseumEntity, SavedArtwork
from app.services.museum.wikidata_validation import WikidataEntityClient, WikidataEntityProvider


logger = logging.getLogger(__name__)
COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php"
COMMONS_SOURCE = "wikimedia_commons"
THUMBNAIL_WIDTH = 900
THUMBNAIL_ENRICHMENT_WORKERS = 4
_HTML_TAG = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class MuseumThumbnail:
    file_name: str
    url: str
    source_url: Optional[str]
    attribution: Optional[str]
    license_name: Optional[str]


def _commons_file_name(entity: Mapping[str, Any]) -> Optional[str]:
    for claim in entity.get("claims", {}).get("P18", []):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _plain_metadata(value: Any) -> Optional[str]:
    if not isinstance(value, str) or not value.strip():
        return None
    return " ".join(html.unescape(_HTML_TAG.sub(" ", value)).split()) or None


async def _fetch_commons_metadata(file_name: str) -> Optional[MuseumThumbnail]:
    headers = {"User-Agent": settings.wikidata_user_agent}
    async with httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(20.0, connect=8.0)) as client:
        response = await client.get(
            COMMONS_API_URL,
            params={
                "action": "query",
                "titles": f"File:{file_name}",
                "prop": "imageinfo",
                "iiprop": "url|extmetadata",
                "iiurlwidth": THUMBNAIL_WIDTH,
                "format": "json",
            },
        )
        response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", {})
    for page in pages.values():
        image_info = (page.get("imageinfo") or [None])[0]
        if not isinstance(image_info, Mapping):
            continue
        url = image_info.get("thumburl") or image_info.get("url")
        if not isinstance(url, str) or not url:
            continue
        metadata = image_info.get("extmetadata", {})
        artist = _plain_metadata(metadata.get("Artist", {}).get("value"))
        credit = _plain_metadata(metadata.get("Credit", {}).get("value"))
        attribution = artist or credit
        license_name = _plain_metadata(metadata.get("LicenseShortName", {}).get("value"))
        source_url = image_info.get("descriptionurl")
        return MuseumThumbnail(
            file_name=file_name,
            url=url,
            source_url=source_url if isinstance(source_url, str) else None,
            attribution=attribution,
            license_name=license_name,
        )
    return None


async def fetch_museum_thumbnail(
    wikidata_qid: str,
    *,
    entity_client: Optional[WikidataEntityProvider] = None,
) -> Optional[MuseumThumbnail]:
    client = entity_client or WikidataEntityClient()
    entity = (await client.get_entities([wikidata_qid])).get(wikidata_qid)
    if not entity:
        return None
    file_name = _commons_file_name(entity)
    if not file_name:
        return None
    return await _fetch_commons_metadata(file_name)


def enrich_museum_thumbnail(museum_id: str) -> None:
    """Best-effort background enrichment; museum resolution never depends on it."""
    if settings.env.lower() == "test":
        return
    try:
        with SessionLocal() as db:
            museum = db.get(MuseumEntity, museum_id)
            if museum is None or museum.thumbnail_url or not museum.wikidata_qid:
                return
            wikidata_qid = museum.wikidata_qid

        thumbnail = asyncio.run(fetch_museum_thumbnail(wikidata_qid))
        if thumbnail is None:
            return

        with SessionLocal() as db:
            museum = db.get(MuseumEntity, museum_id)
            if museum is None or museum.thumbnail_url:
                return
            museum.thumbnail_file_name = thumbnail.file_name
            museum.thumbnail_url = thumbnail.url
            museum.thumbnail_source = COMMONS_SOURCE
            museum.thumbnail_source_url = thumbnail.source_url
            museum.thumbnail_attribution = thumbnail.attribution
            museum.thumbnail_license = thumbnail.license_name
            museum.thumbnail_updated_at = datetime.now(UTC).replace(tzinfo=None)
            db.commit()
    except Exception as exc:
        logger.info("Museum thumbnail enrichment failed museum=%s: %s", museum_id, exc)


def enrich_museum_thumbnails(
    museum_ids: Iterable[str],
    *,
    max_workers: int = THUMBNAIL_ENRICHMENT_WORKERS,
) -> None:
    """Best-effort bounded batch enrichment for committed museum entities."""
    unique_ids = list(dict.fromkeys(str(museum_id) for museum_id in museum_ids))
    if not unique_ids or settings.env.lower() == "test":
        return
    worker_count = min(max(max_workers, 1), len(unique_ids))
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        list(executor.map(enrich_museum_thumbnail, unique_ids))


def select_museum_ids_for_thumbnail_enrichment(
    db,
    *,
    passport_only: bool,
    limit: Optional[int] = None,
) -> list[str]:
    query = db.query(MuseumEntity.id).filter(
        MuseumEntity.status == "active",
        MuseumEntity.wikidata_qid.isnot(None),
        MuseumEntity.thumbnail_url.is_(None),
    )
    if passport_only:
        query = query.join(
            SavedArtwork,
            SavedArtwork.capture_museum_entity_id == MuseumEntity.id,
        ).filter(SavedArtwork.active_filter())
    query = query.distinct().order_by(MuseumEntity.id)
    if limit is not None:
        query = query.limit(limit)
    return [str(museum_id) for museum_id, in query.all()]

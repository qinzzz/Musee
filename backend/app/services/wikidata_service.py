"""
Fetch deterministic artist metadata from Wikidata REST API + Wikipedia REST API.
Uses wbgetentities (not SPARQL) to avoid SPARQL endpoint rate limits.
No LLM involved — results are stable and citable.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

_HEADERS = {"User-Agent": "Musee/1.0 (https://musee.app; art-gallery-app)"}
_MW_API = "https://www.wikidata.org/w/api.php"
_WIKI_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary"

# Wikidata property IDs
_P_BIRTH_DATE = "P569"
_P_DEATH_DATE = "P570"
_P_CITIZENSHIP = "P27"
_P_MOVEMENT = "P135"


async def _search_wikidata(name: str) -> Optional[str]:
    """Return the Wikidata QID for the first entity matching *name*, or None."""
    async with httpx.AsyncClient(timeout=8.0, headers=_HEADERS) as client:
        resp = await client.get(
            _MW_API,
            params={
                "action": "wbsearchentities",
                "search": name,
                "language": "en",
                "type": "item",
                "format": "json",
                "limit": 3,
            },
        )
        resp.raise_for_status()
    results = resp.json().get("search", [])
    return results[0]["id"] if results else None


async def _get_entity(qid: str) -> Dict[str, Any]:
    """Fetch claims + sitelinks for a single Wikidata item via wbgetentities."""
    async with httpx.AsyncClient(timeout=10.0, headers=_HEADERS) as client:
        resp = await client.get(
            _MW_API,
            params={
                "action": "wbgetentities",
                "ids": qid,
                "format": "json",
                "languages": "en",
                "props": "claims|sitelinks",
            },
        )
        resp.raise_for_status()
    entities = resp.json().get("entities", {})
    return entities.get(qid, {})


async def _get_labels(qids: List[str]) -> Dict[str, str]:
    """Batch-fetch English labels for a list of QIDs. Returns {qid: label}."""
    if not qids:
        return {}
    async with httpx.AsyncClient(timeout=10.0, headers=_HEADERS) as client:
        resp = await client.get(
            _MW_API,
            params={
                "action": "wbgetentities",
                "ids": "|".join(qids),
                "format": "json",
                "languages": "en",
                "props": "labels",
            },
        )
        resp.raise_for_status()
    entities = resp.json().get("entities", {})
    result: Dict[str, str] = {}
    for qid, data in entities.items():
        label = data.get("labels", {}).get("en", {}).get("value")
        if label:
            result[qid] = label
    return result


def _extract_year(claims: Dict, prop: str) -> Optional[int]:
    """Parse a year integer from a Wikidata time-valued claim."""
    snaks = claims.get(prop, [])
    if not snaks:
        return None
    time_str: str = snaks[0].get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("time", "")
    # Format: +1853-03-30T00:00:00Z
    if time_str and len(time_str) >= 5:
        try:
            return int(time_str[1:5])
        except ValueError:
            pass
    return None


def _extract_item_qids(claims: Dict, prop: str) -> List[str]:
    """Extract all item QIDs from a repeated item-valued claim."""
    qids: List[str] = []
    for snak in claims.get(prop, []):
        qid = snak.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        if qid:
            qids.append(qid)
    return qids


async def _fetch_wikipedia_bio(title: str) -> Optional[str]:
    """Return the first 2–3 sentences of the Wikipedia intro for *title*."""
    async with httpx.AsyncClient(timeout=8.0, headers=_HEADERS) as client:
        resp = await client.get(f"{_WIKI_SUMMARY_URL}/{title}")
        if resp.status_code != 200:
            return None
        extract: str = resp.json().get("extract", "")

    if not extract:
        return None

    sentences = extract.split(". ")
    trimmed = ". ".join(sentences[:3]).rstrip(". ")
    return trimmed + "."


async def get_artist_info_from_wiki(name: str) -> Optional[Dict[str, Any]]:
    """
    Top-level call: search Wikidata for *name*, fetch metadata and Wikipedia bio.
    Returns a dict compatible with ArtistEntity fields, or None on complete failure.
    On partial success (found entity but no Wikipedia article) returns with bio=None.
    """
    qid = await _search_wikidata(name)
    if not qid:
        logger.info("Wikidata: no entity found for '%s'", name)
        return None

    entity = await _get_entity(qid)
    claims = entity.get("claims", {})
    sitelinks = entity.get("sitelinks", {})

    birth_year = _extract_year(claims, _P_BIRTH_DATE)
    death_year = _extract_year(claims, _P_DEATH_DATE)

    citizenship_qids = _extract_item_qids(claims, _P_CITIZENSHIP)[:1]
    movement_qids = _extract_item_qids(claims, _P_MOVEMENT)[:3]
    all_qids = citizenship_qids + movement_qids

    labels = await _get_labels(all_qids) if all_qids else {}

    nationality = labels.get(citizenship_qids[0]) if citizenship_qids else None
    movements = [labels[q].capitalize() for q in movement_qids if q in labels]

    # Only fetch Wikipedia bio when the entity looks like a real artist.
    # Without birth_year or movements, the Wikidata match is probably not an artist.
    has_artist_signal = bool(birth_year or movements or nationality)
    wp_title: Optional[str] = sitelinks.get("enwiki", {}).get("title")
    bio: Optional[str] = None
    if wp_title and has_artist_signal:
        bio = await _fetch_wikipedia_bio(wp_title)

    return {
        "bio": bio,
        "nationality": nationality,
        "birth_year": birth_year,
        "death_year": death_year,
        "movements": movements,
    }

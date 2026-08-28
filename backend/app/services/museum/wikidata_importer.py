from __future__ import annotations

import asyncio
from dataclasses import dataclass
import re
from typing import Any, Iterable, Mapping, Optional

import httpx
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.services.museum.intake import (
    MuseumIntakeCandidate,
    complete_museum_intake,
    intake_museum,
)


WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
WIKIDATA_ENTITY_PREFIX = "http://www.wikidata.org/entity/"
MUSEUM_QID = "Q33506"
UNITED_STATES_COUNTRY_CODE = "US"
WIKIDATA_MAX_ATTEMPTS = 3
WIKIDATA_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

# Pilot review exclusions. These records satisfy Wikidata's broad museum
# taxonomy but are not individual physical museum venues suitable for capture
# resolution: an umbrella organization and a misclassified public square.
SAN_FRANCISCO_EXCLUDED_QIDS = {"Q1416890", "Q7660214"}

# Deliberately limited to the San Francisco city/county pilot. The importer
# also validates every returned coordinate against this rectangle.
SAN_FRANCISCO_SOUTH = 37.7070
SAN_FRANCISCO_NORTH = 37.8330
SAN_FRANCISCO_WEST = -122.5155
SAN_FRANCISCO_EAST = -122.3549

_QID_PATTERN = re.compile(r"^Q[1-9][0-9]*$")
_POINT_PATTERN = re.compile(
    r"^Point\(\s*(?P<longitude>-?[0-9]+(?:\.[0-9]+)?)\s+"
    r"(?P<latitude>-?[0-9]+(?:\.[0-9]+)?)\s*\)$"
)

SAN_FRANCISCO_MUSEUM_QUERY = f"""
SELECT DISTINCT ?museum ?museumLabel ?coord ?countryCode WHERE {{
  SERVICE wikibase:box {{
    ?museum wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerWest
      \"Point({SAN_FRANCISCO_WEST} {SAN_FRANCISCO_SOUTH})\"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerEast
      \"Point({SAN_FRANCISCO_EAST} {SAN_FRANCISCO_NORTH})\"^^geo:wktLiteral .
  }}
  ?museum wdt:P31/wdt:P279* wd:{MUSEUM_QID} .
  FILTER NOT EXISTS {{ ?museum wdt:P576 ?dissolved . }}
  OPTIONAL {{
    ?museum wdt:P17 ?country .
    ?country wdt:P297 ?countryCode .
  }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language \"en\". }}
}}
ORDER BY ?museumLabel
""".strip()


@dataclass(frozen=True)
class MuseumRegion:
    slug: str
    label: str
    south: float
    north: float
    west: float
    east: float
    country_code: str = UNITED_STATES_COUNTRY_CODE
    excluded_qids: frozenset[str] = frozenset()


MUSEUM_REGIONS = {
    "san-francisco": MuseumRegion(
        "san-francisco", "San Francisco", 37.7070, 37.8330, -122.5155, -122.3549,
        excluded_qids=frozenset(SAN_FRANCISCO_EXCLUDED_QIDS),
    ),
    "new-york": MuseumRegion(
        "new-york", "New York City", 40.4900, 40.9200, -74.2600, -73.7000,
        excluded_qids=frozenset({
            "Q105724647",  # 945 Madison Avenue address, not an independent museum
            "Q19863972",   # MoMA sculpture garden
            "Q18748945",   # Brooklyn Museum library/archive department
            "Q71875434",   # Concert Grove public space
            "Q160236",     # Met umbrella; The Met Fifth Avenue is the physical leaf
            "Q6825143",    # Met roof garden
            "Q95582953",   # AMNH study center
            "Q119823605",  # NYPL moving-image division
            "Q17145833",   # NYPL theatre archive
            "Q127518187",  # Stonewall visitor center
            "Q49571728",   # residential sculpture garden
        }),
    ),
    "los-angeles": MuseumRegion(
        "los-angeles", "Los Angeles", 33.7000, 34.3400, -118.6800, -118.1500,
        excluded_qids=frozenset({
            "Q124111596",  # Allan Hancock Foundation organization
            "Q136386955",  # Avenue of the Athletes public space
            "Q136592280",  # Getty sculpture garden
            "Q2855129",    # UCLA sculpture garden
            "Q731126",     # Getty umbrella; Center and Villa are physical leaves
            "Q134386420",  # school arts center
            "Q99979573",   # Santa Monica visitor center
            "Q140514637",  # Norton Simon sculpture garden
            "Q38806982",   # Hollywood sculpture garden
            "Q105771067",  # UCLA academic art center
            "Q108220332",  # classroom/nature center
        }),
    ),
}
SAN_FRANCISCO_REGION = MUSEUM_REGIONS["san-francisco"]


def build_museum_region_query(region: MuseumRegion) -> str:
    return (
        SAN_FRANCISCO_MUSEUM_QUERY
        .replace(
            f"Point({SAN_FRANCISCO_WEST} {SAN_FRANCISCO_SOUTH})",
            f"Point({region.west} {region.south})",
        )
        .replace(
            f"Point({SAN_FRANCISCO_EAST} {SAN_FRANCISCO_NORTH})",
            f"Point({region.east} {region.north})",
        )
    )


@dataclass(frozen=True)
class WikidataMuseumRecord:
    qid: str
    canonical_name: str
    latitude: float
    longitude: float
    country_code: str


@dataclass(frozen=True)
class MuseumImportSummary:
    fetched: int
    valid: int
    inserted: int
    updated: int
    unchanged: int
    skipped: int
    dry_run: bool


def _binding_value(binding: Mapping[str, Any], key: str) -> Optional[str]:
    value = binding.get(key)
    if not isinstance(value, Mapping):
        return None
    raw = value.get("value")
    return str(raw).strip() if raw is not None else None


def _parse_qid(entity_url: Optional[str]) -> Optional[str]:
    if not entity_url or not entity_url.startswith(WIKIDATA_ENTITY_PREFIX):
        return None
    qid = entity_url.removeprefix(WIKIDATA_ENTITY_PREFIX)
    return qid if _QID_PATTERN.fullmatch(qid) else None


def _parse_point(point: Optional[str]) -> Optional[tuple[float, float]]:
    if not point:
        return None
    match = _POINT_PATTERN.fullmatch(point)
    if not match:
        return None
    return float(match.group("latitude")), float(match.group("longitude"))


def _inside_region(latitude: float, longitude: float, region: MuseumRegion) -> bool:
    return (
        region.south <= latitude <= region.north
        and region.west <= longitude <= region.east
    )


def parse_wikidata_museum_bindings(
    bindings: Iterable[Mapping[str, Any]],
    *,
    region: MuseumRegion = SAN_FRANCISCO_REGION,
) -> tuple[list[WikidataMuseumRecord], int]:
    records_by_qid: dict[str, WikidataMuseumRecord] = {}
    skipped = 0

    for binding in bindings:
        qid = _parse_qid(_binding_value(binding, "museum"))
        name = _binding_value(binding, "museumLabel")
        point = _parse_point(_binding_value(binding, "coord"))
        country_code = (_binding_value(binding, "countryCode") or UNITED_STATES_COUNTRY_CODE).upper()
        if (
            not qid
            or qid in region.excluded_qids
            or not name
            or name == qid
            or not point
            or country_code != region.country_code
            or not _inside_region(*point, region)
        ):
            skipped += 1
            continue

        records_by_qid[qid] = WikidataMuseumRecord(
            qid=qid,
            canonical_name=name,
            latitude=point[0],
            longitude=point[1],
            country_code=country_code,
        )

    return sorted(records_by_qid.values(), key=lambda record: record.canonical_name.casefold()), skipped


async def fetch_region_museums(
    region: MuseumRegion,
) -> tuple[list[WikidataMuseumRecord], int, int]:
    headers = {
        "Accept": "application/sparql-results+json",
        "User-Agent": settings.wikidata_user_agent,
    }
    timeout = httpx.Timeout(60.0, connect=15.0)
    async with httpx.AsyncClient(headers=headers, timeout=timeout) as client:
        for attempt in range(WIKIDATA_MAX_ATTEMPTS):
            try:
                response = await client.get(
                    WIKIDATA_SPARQL_URL,
                    params={"query": build_museum_region_query(region), "format": "json"},
                )
                response.raise_for_status()
                payload = response.json()
                break
            except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                status_code = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
                retryable = status_code is None or status_code in WIKIDATA_RETRYABLE_STATUS_CODES
                if attempt == WIKIDATA_MAX_ATTEMPTS - 1 or not retryable:
                    raise
                await asyncio.sleep(2**attempt)

    bindings = payload.get("results", {}).get("bindings", [])
    if not isinstance(bindings, list):
        raise ValueError("Wikidata returned an invalid bindings payload")
    records, skipped = parse_wikidata_museum_bindings(bindings, region=region)
    return records, len(bindings), skipped


async def fetch_san_francisco_museums() -> tuple[list[WikidataMuseumRecord], int, int]:
    return await fetch_region_museums(SAN_FRANCISCO_REGION)


def import_museum_records(
    db: Session,
    records: Iterable[WikidataMuseumRecord],
    *,
    fetched: Optional[int] = None,
    parse_skipped: int = 0,
    dry_run: bool = True,
    enrich: bool = True,
) -> MuseumImportSummary:
    materialized_records = list(records)
    inserted = 0
    updated = 0
    unchanged = 0

    intake_results = []
    for record in materialized_records:
        result = intake_museum(
            db,
            MuseumIntakeCandidate(
                source="wikidata_region",
                canonical_name=record.canonical_name,
                latitude=record.latitude,
                longitude=record.longitude,
                country_code=record.country_code,
                wikidata_qid=record.qid,
            ),
        )
        intake_results.append(result)
        if result.action == "created":
            inserted += 1
        elif result.action == "updated":
            updated += 1
        else:
            unchanged += 1

    if dry_run:
        db.rollback()
    else:
        if enrich:
            complete_museum_intake(db, intake_results)
        else:
            db.commit()

    valid = len(materialized_records)
    return MuseumImportSummary(
        fetched=fetched if fetched is not None else valid + parse_skipped,
        valid=valid,
        inserted=inserted,
        updated=updated,
        unchanged=unchanged,
        skipped=parse_skipped,
        dry_run=dry_run,
    )

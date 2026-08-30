"""Offline tests for the OSM footprint backfill (no network, no real DB).

Uses a fake OSM provider and the in-memory test DB from conftest. Verifies the
conservative matching contract: attach a footprint only on QID identity (or an
opt-in exact-name match), only when the OSM candidate actually has a polygon,
and never touch rows that already have a footprint.
"""
import asyncio
from contextlib import contextmanager

from app.database.models import MuseumEntity
from app.services.museum.osm_discovery import OSMMuseumCandidate
from scripts.backfill_museum_footprints import backfill_footprints

# A small square polygon footprint_bounds can parse: [lon, lat] rings.
POLY = {
    "type": "Polygon",
    "coordinates": [[
        [-122.4010, 37.7850], [-122.4000, 37.7850],
        [-122.4000, 37.7860], [-122.4010, 37.7860], [-122.4010, 37.7850],
    ]],
}


class FakeProvider:
    """Returns pre-seeded OSM candidates keyed by the queried coordinate."""

    def __init__(self, by_coord, raise_for=None):
        self._by_coord = by_coord
        self._raise_for = raise_for or set()

    async def find_museums(self, latitude, longitude, radius_meters=150):
        key = (round(latitude, 4), round(longitude, 4))
        if key in self._raise_for:
            raise RuntimeError("overpass down")
        return self._by_coord.get(key, [])


def _factory(db):
    """A session_factory that reuses the one in-memory test session across phases."""
    @contextmanager
    def _cm():
        yield db  # shared sqlite session; do not close between phases
    return _cm


def _run(db, provider, **kw):
    kw.setdefault("apply", True)
    kw.setdefault("sleep_seconds", 0)
    return asyncio.run(backfill_footprints(_factory(db), provider, **kw))


def _entity(db, name, lat, lon, qid, **extra):
    e = MuseumEntity(
        canonical_name=name, latitude=lat, longitude=lon, wikidata_qid=qid,
        is_physical_venue=True, resolution_eligible=True, **extra,
    )
    db.add(e)
    db.commit()
    return e.id


def test_qid_match_with_polygon_writes_footprint(db):
    eid = _entity(db, "SFMOMA", 37.7857, -122.4011, "Q913672")
    provider = FakeProvider({
        (37.7857, -122.4011): [
            OSMMuseumCandidate("way", "555", "SFMOMA", 37.7857, -122.4011, 5.0,
                               "Q913672", footprint_geojson=POLY),
        ],
    })
    stats = _run(db, provider)
    assert stats["written"] == 1
    e = db.get(MuseumEntity, eid)
    assert e.footprint_geojson == POLY
    assert e.footprint_source == "osm"
    assert e.footprint_license == "odbl"
    assert e.footprint_updated_at is not None
    assert e.osm_id == "way/555"
    # bounds derived from the polygon (min_lat, max_lat, min_lon, max_lon)
    assert e.footprint_min_latitude == 37.7850
    assert e.footprint_max_latitude == 37.7860
    assert e.footprint_min_longitude == -122.4010
    assert e.footprint_max_longitude == -122.4000


def test_different_qid_polygon_is_not_attached(db):
    eid = _entity(db, "SFMOMA", 37.7857, -122.4011, "Q913672")
    provider = FakeProvider({
        (37.7857, -122.4011): [  # a neighbour's building — must NOT be borrowed
            OSMMuseumCandidate("way", "999", "Contemporary Jewish Museum",
                               37.7858, -122.4012, 15.0, "Q5164991",
                               footprint_geojson=POLY),
        ],
    })
    stats = _run(db, provider)
    assert stats["written"] == 0
    assert stats["no_polygon_match"] == 1
    assert db.get(MuseumEntity, eid).footprint_geojson is None


def test_qid_match_without_polygon_is_skipped(db):
    eid = _entity(db, "Small Museum", 37.79, -122.40, "Q1")
    provider = FakeProvider({
        (37.79, -122.40): [  # node-only OSM museum: no footprint to copy
            OSMMuseumCandidate("node", "42", "Small Museum", 37.79, -122.40, 3.0,
                               "Q1", footprint_geojson=None),
        ],
    })
    stats = _run(db, provider)
    assert stats["written"] == 0
    assert stats["no_polygon_match"] == 1
    assert db.get(MuseumEntity, eid).footprint_geojson is None


def test_rows_with_real_footprint_are_left_alone(db):
    # A genuinely-filled row has polygon bounds set; it must be skipped.
    existing = {"type": "Polygon", "coordinates": [[[0, 0], [0, 1], [1, 1], [0, 0]]]}
    eid = _entity(db, "Already Filled", 37.5, -122.0, "Q7",
                  footprint_geojson=existing,
                  footprint_min_latitude=37.49, footprint_max_latitude=37.51,
                  footprint_min_longitude=-122.01, footprint_max_longitude=-121.99)
    provider = FakeProvider({
        (37.5, -122.0): [
            OSMMuseumCandidate("way", "1", "Already Filled", 37.5, -122.0, 1.0,
                               "Q7", footprint_geojson=POLY),
        ],
    })
    stats = _run(db, provider)
    assert stats["scanned"] == 0  # filtered out before any OSM call
    assert db.get(MuseumEntity, eid).footprint_geojson == existing


def test_empty_geojson_without_bounds_is_treated_as_pending(db):
    # Prod condition: 354 rows carried a non-null-but-empty footprint_geojson with
    # NULL bounds. footprint_geojson IS NULL would skip them; the bounds predicate
    # must still backfill them with a real polygon.
    eid = _entity(db, "Empty FP", 37.7857, -122.4011, "Q913672", footprint_geojson={})
    provider = FakeProvider({
        (37.7857, -122.4011): [
            OSMMuseumCandidate("way", "555", "Empty FP", 37.7857, -122.4011, 5.0,
                               "Q913672", footprint_geojson=POLY),
        ],
    })
    stats = _run(db, provider)
    assert stats["scanned"] == 1
    assert stats["written"] == 1
    e = db.get(MuseumEntity, eid)
    assert e.footprint_geojson == POLY
    assert e.footprint_min_latitude == 37.7850


def test_dry_run_writes_nothing(db):
    eid = _entity(db, "SFMOMA", 37.7857, -122.4011, "Q913672")
    provider = FakeProvider({
        (37.7857, -122.4011): [
            OSMMuseumCandidate("way", "555", "SFMOMA", 37.7857, -122.4011, 5.0,
                               "Q913672", footprint_geojson=POLY),
        ],
    })
    stats = _run(db, provider, apply=False)
    assert stats["written"] == 1  # it *would* have written one
    assert db.get(MuseumEntity, eid).footprint_geojson is None  # but rolled back


def test_name_match_is_opt_in(db):
    # Entity whose OSM building carries no wikidata tag: only a name can match it.
    eid = _entity(db, "Cartoon Art Museum", 37.7870, -122.4010, "Q1045990")
    provider = FakeProvider({
        (37.7870, -122.4010): [
            OSMMuseumCandidate("way", "77", "Cartoon Art Museum", 37.7870,
                               -122.4010, 8.0, None, footprint_geojson=POLY),
        ],
    })
    # default: QID-only, so an untagged OSM building is not matched
    assert _run(db, provider)["written"] == 0
    assert db.get(MuseumEntity, eid).footprint_geojson is None
    # opt-in name match attaches it
    assert _run(db, provider, allow_name_match=True)["written"] == 1
    assert db.get(MuseumEntity, eid).footprint_geojson == POLY


def test_provider_error_does_not_abort_sweep(db):
    bad = _entity(db, "Bad Lookup", 37.10, -122.10, "Q10")
    good = _entity(db, "Good Lookup", 37.20, -122.20, "Q20")
    provider = FakeProvider(
        {
            (37.20, -122.20): [
                OSMMuseumCandidate("way", "2", "Good Lookup", 37.20, -122.20, 4.0,
                                   "Q20", footprint_geojson=POLY),
            ],
        },
        raise_for={(37.10, -122.10)},
    )
    stats = _run(db, provider)
    assert stats["provider_error"] == 1
    assert stats["written"] == 1  # the good one still got processed
    assert db.get(MuseumEntity, bad).footprint_geojson is None
    assert db.get(MuseumEntity, good).footprint_geojson == POLY

"""Offline tests for the re-resolution batch (catalogue-only, no network)."""
from contextlib import contextmanager

from app.database.models import ArtworkEvent, MuseumEntity, SavedArtwork
from scripts.reresolve_museum_captures import reresolve_captures

LAT, LON = 48.8606, 2.3376  # inside the footprint below


def _factory(db):
    @contextmanager
    def _cm():
        yield db  # shared sqlite session across the batch
    return _cm


def _footprint_museum(db, name, lat=LAT, lon=LON, d=0.001):
    m = MuseumEntity(canonical_name=name, latitude=lat, longitude=lon, status="active")
    m.footprint_geojson = {"type": "Polygon", "coordinates": [[
        [lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d],
        [lon - d, lat + d], [lon - d, lat - d],
    ]]}
    m.footprint_min_latitude, m.footprint_max_latitude = lat - d, lat + d
    m.footprint_min_longitude, m.footprint_max_longitude = lon - d, lon + d
    db.add(m); db.commit()
    return m


def _plain_museum(db, name, lat, lon):
    m = MuseumEntity(canonical_name=name, latitude=lat, longitude=lon, status="active")
    db.add(m); db.commit()
    return m


def _artwork(db, aid, capture_id, location):
    a = SavedArtwork(id=aid, photo_uri=f"r2://{aid}", artist_name="A", artwork_name=aid,
                     capture_museum_entity_id=capture_id, location=location)
    db.add(a); db.commit()
    return a


def _loc(lat=LAT, lon=LON):
    return {"latitude": lat, "longitude": lon, "source": "legacy_artwork_location"}


def _run(db, **kw):
    kw.setdefault("apply", True)
    return reresolve_captures(_factory(db), **kw)


def test_only_unresolved_fills_null_via_footprint(db):
    m = _footprint_museum(db, "Louvre")
    _artwork(db, "u1", None, _loc())
    stats = _run(db, scope="only-unresolved")
    assert stats["updated"] == 1
    db.expire_all()
    assert db.get(SavedArtwork, "u1").capture_museum_entity_id == m.id
    events = db.query(ArtworkEvent).filter_by(
        artwork_id="u1", event_type="museum_resolution").all()
    assert len(events) == 1
    assert events[0].payload["resolution_source"] == "reresolve"
    assert events[0].payload["bucket"] == "footprint"


def test_only_unresolved_never_touches_associated(db):
    _footprint_museum(db, "Louvre")
    wrong = _plain_museum(db, "Wrong", 40.0, -70.0)
    _artwork(db, "x1", wrong.id, _loc())  # already associated (to the wrong venue)
    _run(db, scope="only-unresolved")
    db.expire_all()
    assert db.get(SavedArtwork, "x1").capture_museum_entity_id == wrong.id  # untouched


def test_upgrade_overwrites_distance_association_with_footprint(db):
    m = _footprint_museum(db, "Louvre")
    wrong = _plain_museum(db, "Wrong", 40.0, -70.0)
    _artwork(db, "x1", wrong.id, _loc())
    _run(db, scope="upgrade")
    db.expire_all()
    assert db.get(SavedArtwork, "x1").capture_museum_entity_id == m.id  # upgraded to footprint


def test_upgrade_leaves_non_footprint_associations_alone(db):
    # nearby museum has NO footprint -> new result is a distance match, not footprint,
    # so upgrade must not overwrite the existing association.
    _plain_museum(db, "NearNoFootprint", LAT, LON)
    wrong = _plain_museum(db, "Wrong", 40.0, -70.0)
    _artwork(db, "x1", wrong.id, _loc())
    _run(db, scope="upgrade")
    db.expire_all()
    assert db.get(SavedArtwork, "x1").capture_museum_entity_id == wrong.id  # unchanged


def test_sourceless_legacy_coords_resolve_via_footprint(db):
    # The legacy backlog: coords present but NO source tag. Must still be
    # re-resolved (treated as legacy capture evidence), not skipped.
    m = _footprint_museum(db, "Louvre")
    _artwork(db, "leg1", None, {"latitude": LAT, "longitude": LON})  # no "source"
    stats = _run(db, scope="only-unresolved")
    assert stats.get("no_evidence", 0) == 0
    assert stats["updated"] == 1
    db.expire_all()
    assert db.get(SavedArtwork, "leg1").capture_museum_entity_id == m.id


def test_distance_match_footprint_only_by_default(db):
    # A bare-distance match on a legacy coord is the street-false-positive risk;
    # default writes only footprint matches, --include-distance opts in.
    near = _plain_museum(db, "NearNoFootprint", LAT, LON)  # no footprint -> distance
    _artwork(db, "d1", None, {"latitude": LAT, "longitude": LON})
    assert _run(db, scope="only-unresolved")["updated"] == 0  # skipped by default
    db.expire_all()
    assert db.get(SavedArtwork, "d1").capture_museum_entity_id is None
    assert _run(db, scope="only-unresolved", include_distance=True)["updated"] == 1
    db.expire_all()
    assert db.get(SavedArtwork, "d1").capture_museum_entity_id == near.id


def test_artwork_without_coords_is_skipped(db):
    _footprint_museum(db, "Louvre")
    _artwork(db, "n1", None, None)
    stats = _run(db, scope="only-unresolved")
    assert stats.get("no_evidence") == 1
    assert stats.get("updated", 0) == 0


def test_dry_run_writes_nothing(db):
    _footprint_museum(db, "Louvre")
    _artwork(db, "u1", None, _loc())
    stats = _run(db, scope="only-unresolved", apply=False)
    assert stats["updated"] == 1  # would update
    db.expire_all()
    assert db.get(SavedArtwork, "u1").capture_museum_entity_id is None  # but didn't
    assert db.query(ArtworkEvent).count() == 0

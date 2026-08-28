from datetime import datetime

import pytest
from fastapi import Request

from app.database.models import MuseumEntity, SavedArtwork, User
from app.main import app
from app.services.authorization_service import RequestPrincipal, get_request_principal


@pytest.fixture(autouse=True)
def authenticated_museum_principal(db):
    async def override_principal(request: Request):
        user_id = request.query_params.get("user_id") or "passport-user"
        user = db.query(User).filter(User.user_id == user_id).first()
        if user is None:
            user = User(user_id=user_id, device_id=user_id, tier="free")
            db.add(user)
            db.commit()
        return RequestPrincipal(state="authenticated", user_id=user_id, user=user)

    app.dependency_overrides[get_request_principal] = override_principal
    yield
    app.dependency_overrides.pop(get_request_principal, None)


def _artwork(artwork_id, museum_id, photo_time, *, deleted_at=None):
    return SavedArtwork(
        id=artwork_id,
        user_id="passport-user",
        photo_uri=f"r2://{artwork_id}",
        artist_name="Artist",
        artwork_name=artwork_id,
        capture_museum_entity_id=museum_id,
        photo_time=photo_time,
        deleted_at=deleted_at,
    )


def test_user_museums_aggregates_canonical_associations(client, db):
    db.add(User(user_id="passport-user", device_id="passport-user"))
    getty = MuseumEntity(
        id="getty", canonical_name="Getty Center", latitude=34.077, longitude=-118.474,
        wikidata_qid="Q29247", resolution_eligible=True, status="active",
        thumbnail_url="https://upload.wikimedia.org/getty.jpg",
        thumbnail_attribution="Example Photographer",
    )
    met = MuseumEntity(
        id="met", canonical_name="The Metropolitan Museum of Art",
        latitude=40.779, longitude=-73.963, wikidata_qid="Q160236",
        resolution_eligible=True, status="active",
    )
    umbrella = MuseumEntity(
        id="umbrella", canonical_name="Museum Group", latitude=34.078, longitude=-118.475,
        wikidata_qid="Q999", is_physical_venue=False, resolution_eligible=False,
        has_child_venues=True, status="active",
    )
    db.add_all([getty, met, umbrella])
    db.add_all([
        _artwork("getty-1", "getty", "Sep 05, 2025"),
        _artwork("getty-2", "getty", "Sep 06, 2025"),
        _artwork("met-1", "met", "2024-05-10T12:00:00Z"),
        _artwork("deleted", "met", "2026-01-01", deleted_at=datetime(2026, 1, 2)),
        _artwork("unresolved", None, "2026-02-01"),
        _artwork("umbrella-art", "umbrella", "2026-02-02"),
    ])
    db.commit()

    response = client.get("/api/museums", params={"user_id": "passport-user"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    by_id = {item["museum"]["id"]: item for item in payload["items"]}
    assert by_id["getty"]["museum"]["canonical_name"] == "Getty Center"
    assert by_id["getty"]["museum"]["thumbnail_url"] == "https://upload.wikimedia.org/getty.jpg"
    assert by_id["getty"]["artwork_count"] == 2
    assert set(by_id["getty"]["artwork_ids"]) == {"getty-1", "getty-2"}
    assert by_id["getty"]["first_recorded_on"] == "2025-09-05"
    assert by_id["getty"]["last_recorded_on"] == "2025-09-06"
    assert by_id["getty"]["cover_artwork_ids"] == ["getty-2", "getty-1"]
    assert by_id["met"]["artwork_count"] == 1
    assert "umbrella" not in by_id


def test_user_museums_rejects_cross_user_read(client, db):
    async def fixed_principal(_request: Request):
        user = db.query(User).filter(User.user_id == "passport-user").first()
        if user is None:
            user = User(user_id="passport-user", device_id="passport-user", tier="free")
            db.add(user)
            db.commit()
        return RequestPrincipal(state="authenticated", user_id="passport-user", user=user)

    app.dependency_overrides[get_request_principal] = fixed_principal

    response = client.get("/api/museums", params={"user_id": "someone-else"})

    assert response.status_code == 403

import pytest
from fastapi import Request

from app.database.models import Collection, SavedArtwork, User
from app.main import app
from app.services.authorization_service import RequestPrincipal, get_request_principal


@pytest.fixture(autouse=True)
def authenticated_collection_principal(db):
    async def override_principal(request: Request):
        user_id = request.query_params.get("user_id")
        if not user_id and request.method == "POST":
            try:
                user_id = (await request.json()).get("user_id")
            except Exception:
                user_id = None
        if not user_id:
            collection_id = request.path_params.get("collection_id")
            collection = db.query(Collection).filter(Collection.id == collection_id).first()
            user_id = collection.user_id if collection else "collection-user"
        user = db.query(User).filter(User.user_id == user_id).first()
        if user is None:
            user = User(user_id=user_id, device_id=user_id, tier="free")
            db.add(user)
            db.commit()
        return RequestPrincipal(state="authenticated", user_id=user_id, user=user)

    app.dependency_overrides[get_request_principal] = override_principal
    yield
    app.dependency_overrides.pop(get_request_principal, None)


def test_get_collections_returns_minimal_artwork_entries(client, db):
    db.add(User(user_id="collection-user", device_id="collection-user"))
    artwork = SavedArtwork(
        id="art-1",
        user_id="collection-user",
        photo_uri="r2://art-1",
        artist_name="Artist",
        artwork_name="Artwork",
        analysis="Large analysis payload",
    )
    collection = Collection(
        id="col-1",
        user_id="collection-user",
        name="Favorites",
    )
    collection.artworks = [artwork]
    db.add_all([artwork, collection])
    db.commit()

    response = client.get("/api/collections", params={"user_id": "collection-user"})

    assert response.status_code == 200
    payload = response.json()
    assert payload == [
        {
            "id": "col-1",
            "name": "Favorites",
            "description": None,
            "user_id": "collection-user",
            "artwork_count": 1,
            "artwork_ids": ["art-1"],
            "artworks": [{"id": "art-1"}],
            "created_at": payload[0]["created_at"],
            "updated_at": payload[0]["updated_at"],
        }
    ]
    assert "analysis" not in payload[0]["artworks"][0]


def test_create_collection_returns_minimal_artwork_entries(client, db):
    db.add(User(user_id="collection-create-user", device_id="collection-create-user"))
    db.add(
        SavedArtwork(
            id="art-create-1",
            user_id="collection-create-user",
            photo_uri="r2://art-create-1",
            artist_name="Artist",
            artwork_name="Artwork",
            analysis="Large analysis payload",
        )
    )
    db.commit()

    response = client.post(
        "/api/collections",
        json={
            "user_id": "collection-create-user",
            "name": "New Board",
            "artwork_ids": ["art-create-1"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["artwork_ids"] == ["art-create-1"]
    assert payload["artworks"] == [{"id": "art-create-1"}]


def test_create_collection_rejects_artworks_owned_by_another_user(client, db):
    db.add_all([
        User(user_id="collection-owner", device_id="collection-owner"),
        User(user_id="other-owner", device_id="other-owner"),
        SavedArtwork(
            id="foreign-art",
            user_id="other-owner",
            photo_uri="r2://foreign-art",
            artist_name="Artist",
            artwork_name="Artwork",
        ),
    ])
    db.commit()

    response = client.post(
        "/api/collections",
        json={
            "user_id": "collection-owner",
            "name": "Bad Board",
            "artwork_ids": ["foreign-art"],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "One or more artworks do not belong to the user"


def test_update_collection_rejects_non_owner(client, db):
    db.add_all([
        User(user_id="collection-owner-2", device_id="collection-owner-2"),
        User(user_id="other-owner-2", device_id="other-owner-2"),
        Collection(id="col-owned", user_id="collection-owner-2", name="Owned Board"),
    ])
    db.commit()

    response = client.put(
        "/api/collections/col-owned",
        params={"user_id": "other-owner-2"},
        json={"name": "Hacked"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized to access this collection"


def test_update_collection_rejects_foreign_artworks(client, db):
    db.add_all([
        User(user_id="collection-owner-3", device_id="collection-owner-3"),
        User(user_id="other-owner-3", device_id="other-owner-3"),
        Collection(id="col-foreign", user_id="collection-owner-3", name="Owned Board"),
        SavedArtwork(
            id="foreign-art-2",
            user_id="other-owner-3",
            photo_uri="r2://foreign-art-2",
            artist_name="Artist",
            artwork_name="Artwork",
        ),
    ])
    db.commit()

    response = client.put(
        "/api/collections/col-foreign",
        params={"user_id": "collection-owner-3"},
        json={"artwork_ids": ["foreign-art-2"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "One or more artworks do not belong to the user"


def test_delete_collection_rejects_non_owner(client, db):
    db.add_all([
        User(user_id="collection-owner-4", device_id="collection-owner-4"),
        User(user_id="other-owner-4", device_id="other-owner-4"),
        Collection(id="col-delete", user_id="collection-owner-4", name="Owned Board"),
    ])
    db.commit()

    response = client.delete(
        "/api/collections/col-delete",
        params={"user_id": "other-owner-4"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized to access this collection"


def seed_board(db):
    from datetime import datetime
    db.add(User(user_id="board-owner", device_id="board-owner"))
    artworks = [SavedArtwork(id=f"board-art-{i}", user_id="board-owner", photo_uri=f"photo-{i}",
                             artist_name="Artist", artwork_name=f"Work {i}") for i in range(4)]
    artworks[3].deleted_at = datetime.now()
    collection = Collection(id="board", user_id="board-owner", name="Board", artworks=artworks[:1])
    db.add_all([*artworks, collection])
    db.commit()
    return collection, artworks


def test_membership_deltas_preserve_other_changes_and_are_idempotent(client, db):
    seed_board(db)
    url = "/api/collections/board?user_id=board-owner"
    for item in ["board-art-1", "board-art-2", "board-art-1"]:
        response = client.put(url, json={"add_artwork_ids": [item, item]})
        assert response.status_code == 200
    assert set(response.json()["artwork_ids"]) == {"board-art-0", "board-art-1", "board-art-2"}
    for _ in range(2):
        response = client.put(url, json={"remove_artwork_ids": ["board-art-1"]})
        assert response.status_code == 200
    assert set(response.json()["artwork_ids"]) == {"board-art-0", "board-art-2"}
    assert db.query(SavedArtwork).filter_by(id="board-art-1").first() is not None


def test_membership_delta_rejects_deleted_foreign_and_conflicting_inputs(client, db):
    seed_board(db)
    db.add(User(user_id="other", device_id="other"))
    db.add(SavedArtwork(id="foreign", user_id="other", photo_uri="photo", artist_name="Artist", artwork_name="Work"))
    db.commit()
    url = "/api/collections/board?user_id=board-owner"
    for item in ["foreign", "board-art-3"]:
        assert client.put(url, json={"add_artwork_ids": [item]}).status_code == 400
    assert client.put(url, json={"artwork_ids": [], "add_artwork_ids": []}).status_code == 422
    assert client.put(url, json={"add_artwork_ids": ["x"], "remove_artwork_ids": ["x"]}).status_code == 422


def test_board_artworks_are_paginated_and_exclude_deleted_items(client, db):
    collection, artworks = seed_board(db)
    collection.artworks = artworks
    db.commit()
    first = client.get("/api/collections/board/artworks?limit=2").json()
    second = client.get("/api/collections/board/artworks?limit=2&offset=2").json()
    assert first["total"] == 3
    assert len(first["items"]) == 2
    assert len(second["items"]) == 1
    assert {a["id"] for a in first["items"]}.isdisjoint({a["id"] for a in second["items"]})
    assert client.get("/api/collections/board/artworks?user_id=other").status_code == 403
    assert client.get("/api/collections/missing/artworks").status_code == 404


def test_deleting_board_preserves_saved_artworks(client, db):
    seed_board(db)
    assert client.delete("/api/collections/board?user_id=board-owner").status_code == 200
    assert db.query(SavedArtwork).filter_by(id="board-art-0").first() is not None


def test_blank_names_are_rejected_and_names_are_trimmed(client, db):
    seed_board(db)
    assert client.post("/api/collections", json={"user_id": "board-owner", "name": "   "}).status_code == 422
    assert client.put("/api/collections/board?user_id=board-owner", json={"name": "   "}).status_code == 422
    response = client.put("/api/collections/board?user_id=board-owner", json={"name": "  Renamed  "})
    assert response.json()["name"] == "Renamed"

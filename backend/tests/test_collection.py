from app.database.models import Collection, SavedArtwork, User


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

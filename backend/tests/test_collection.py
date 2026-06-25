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

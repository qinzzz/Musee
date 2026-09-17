"""Location correction must agree across AI evidence and SQL retrieval."""
import pytest

from app.database.models import MuseumEntity, SavedArtwork, Session, SessionArtwork, User
from app.services.capture_place import effective_capture_place
from app.services.journal_service import _build_artwork_context, _display_location_from_evidence
from app.services.retrieval.contracts import SavedArtworkFilters
from app.services.retrieval.saved_artwork_retriever import count_saved_artworks, retrieve_saved_artwork_candidates
from app.services.session_service import DEFAULT_SESSION_TITLE, derive_session_system_title


@pytest.mark.parametrize("override,linked,expected", [
    (None, False, {"museum": "Old Museum", "city": "Old City", "country": "Old Country"}),
    (None, True, {"museum": "New Museum", "city": "Old City", "country": "Old Country"}),
    ({"status": "removed"}, True, {}),
    ({"status": "selected", "source": "manual", "name": "My Café"}, False, {"name": "My Café"}),
    ({"status": "selected", "source": "apple_maps", "place_id": "private-id"}, False, {}),
    ({"status": "selected", "source": "apple_maps", "place_id": "private-id"}, True, {"museum": "New Museum"}),
    ({"status": "selected", "source": "museum", "museum_id": "new"}, True, {"museum": "New Museum"}),
    ({"status": "selected", "source": "museum", "museum_id": "missing"}, False, {}),
])
def test_place_corrections_reach_journal_titles_and_retrieval(db, override, linked, expected):
    db.add(User(user_id="place-user", device_id="place-user"))
    museum = MuseumEntity(id="new", canonical_name="New Museum", latitude=1, longitude=2)
    artwork = SavedArtwork(id="capture", user_id="place-user", photo_uri="test.jpg",
        artist_name="Unknown Artist", artwork_name="Unknown", museum_name="Legacy Museum",
        location={"museum": "Old Museum", "city": "Old City", "country": "Old Country", "raw": "Old address"},
        capture_location_override=override, capture_museum_entity=museum if linked else None)
    session = Session(id="place-session", user_id="place-user", title="Untitled Session")
    session.artwork_links = [SessionArtwork(artwork=artwork, source="upload", sequence_number=1)]
    db.add_all([museum, artwork, session])
    db.commit()

    assert effective_capture_place(artwork) == expected
    context = _build_artwork_context(artwork, None)
    assert context["location"] == (expected or None)
    label = expected.get("museum") or expected.get("name")
    assert _display_location_from_evidence({"artworks": [context]}) == label
    assert derive_session_system_title(session)[0] == (label or DEFAULT_SESSION_TITLE)

    for search in (None, "Old Museum", "Old City", "New Museum", "My Café", "Legacy Museum", "private-id", "Old address"):
        filters = SavedArtworkFilters(location=search)
        candidates, total, truncated = retrieve_saved_artwork_candidates(
            db, user_id="place-user", filters=filters, candidate_limit=10)
        matches = search is None or any(search.casefold() in value.casefold() for value in expected.values())
        assert total == int(matches), search
        assert count_saved_artworks(db, user_id="place-user", filters=filters) == int(matches), search
        assert not truncated
        if candidates:
            candidate = candidates[0]
            assert candidate.location == (expected or None)
            assert candidate.museum_name == expected.get("museum")
            if override:
                assert "Old" not in candidate.retrieval_text
                assert "private-id" not in candidate.retrieval_text
    assert count_saved_artworks(db, user_id="another-user", filters=SavedArtworkFilters()) == 0
    assert artwork.location["museum"] == "Old Museum"

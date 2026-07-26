import asyncio
from datetime import date, datetime
import json

import pytest
from fastapi import HTTPException

from app.database.models import ArtworkAnalysis, Journal, SavedArtwork, Session as SessionModel, SessionEvent, User
from app.models.artwork import AIProvider
from app.services.ai_client_interface import AITextResult
from app.services import journal_service


class FakeJournalClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    async def call_text_only_result(self, **_kwargs):
        self.calls += 1
        return AITextResult(text=json.dumps(self.responses.pop(0)))


class FakeJournalService:
    def __init__(self, client):
        self.ai_client = client

    def get_model_name(self):
        return "journal-test-model"


def _add_user_session(db, *, user_id="journal-user", session_id="journal-session"):
    db.add(User(user_id=user_id, device_id=user_id))
    db.add(SessionModel(id=session_id, user_id=user_id, title="Museum visit"))
    db.commit()


def _add_event(
    db,
    *,
    event_id,
    created_at,
    content=None,
    artwork_ids=None,
    role="user",
    event_type="user_input",
    sequence_number=1,
    session_id="journal-session",
):
    payload = None
    if artwork_ids:
        payload = {
            "artworks": [
                {"artwork_id": artwork_id, "source": "capture"}
                for artwork_id in artwork_ids
            ]
        }
    db.add(
        SessionEvent(
            id=event_id,
            session_id=session_id,
            role=role,
            type=event_type,
            content=content,
            payload=payload,
            sequence_number=sequence_number,
            created_at=created_at,
        )
    )
    db.commit()


def _patch_ai(monkeypatch, responses):
    client = FakeJournalClient(responses)
    service = FakeJournalService(client)
    monkeypatch.setattr(journal_service, "determine_ai_provider", lambda _requested: AIProvider.OPENAI)
    monkeypatch.setattr(journal_service.AIServiceFactory, "get_service", lambda _provider: service)
    monkeypatch.setattr(journal_service, "start_ai_usage", lambda **_kwargs: "usage-1")
    monkeypatch.setattr(journal_service, "succeed_ai_usage", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(journal_service, "fail_ai_usage", lambda *_args, **_kwargs: None)
    return client


def test_daily_evidence_uses_local_day_boundary_and_user_inputs_only(db):
    _add_user_session(db)
    _add_event(
        db,
        event_id="before-day",
        created_at=datetime(2026, 7, 18, 6, 59, 59),
        content="Previous local day",
        sequence_number=1,
    )
    _add_event(
        db,
        event_id="inside-day",
        created_at=datetime(2026, 7, 18, 7, 0, 0),
        content="Why does this feel so quiet?",
        sequence_number=2,
    )
    _add_event(
        db,
        event_id="model-message",
        created_at=datetime(2026, 7, 18, 8, 0, 0),
        content="Assistant response",
        role="model",
        event_type="message",
        sequence_number=3,
    )
    _add_event(
        db,
        event_id="after-day",
        created_at=datetime(2026, 7, 19, 7, 0, 0),
        content="Next local day",
        sequence_number=4,
    )

    evidence = journal_service.build_daily_evidence(
        db,
        user_id="journal-user",
        local_date=date(2026, 7, 18),
        timezone_name="America/Los_Angeles",
    )

    assert evidence["validEventIds"] == ["inside-day"]
    assert evidence["dateContext"]["periodStartUtc"] == "2026-07-18T07:00:00"
    assert evidence["dateContext"]["periodEndUtc"] == "2026-07-19T07:00:00"


def test_daily_evidence_includes_only_user_owned_referenced_artworks(db):
    _add_user_session(db)
    db.add(
        SavedArtwork(
            id="owned-artwork",
            user_id="journal-user",
            photo_uri="https://example.com/owned.jpg",
            artist_name="Agnes Martin",
            artwork_name="Untitled",
            location={
                "latitude": 37.78,
                "longitude": -122.4,
                "city": "San Francisco",
                "country": "United States",
            },
        )
    )
    db.add(User(user_id="other-user", device_id="other-user"))
    db.add(
        SavedArtwork(
            id="other-artwork",
            user_id="other-user",
            photo_uri="https://example.com/other.jpg",
            artist_name="Other",
            artwork_name="Other",
        )
    )
    db.commit()
    db.add(
        ArtworkAnalysis(
            artwork_id="owned-artwork",
            is_current=True,
            analysis_version="test-v1",
            status="analyzed",
            visual_description="A restrained grid painting.",
        )
    )
    db.commit()
    _add_event(
        db,
        event_id="art-event",
        created_at=datetime(2026, 7, 18, 12, 0, 0),
        artwork_ids=["owned-artwork", "other-artwork"],
    )

    evidence = journal_service.build_daily_evidence(
        db,
        user_id="journal-user",
        local_date=date(2026, 7, 18),
        timezone_name="UTC",
    )

    assert evidence["validArtworkIds"] == ["owned-artwork"]
    assert evidence["events"][0]["artworkIds"] == ["owned-artwork"]
    assert evidence["events"][0]["artworks"] == [
        {"artworkId": "owned-artwork", "source": "capture"}
    ]
    assert evidence["artworks"][0]["visualDescription"] == "A restrained grid painting."
    assert evidence["artworks"][0]["location"] == {
        "city": "San Francisco",
        "country": "United States",
    }


def test_validate_journal_output_uses_required_reflection_fallback():
    evidence = {
        "events": [
            {
                "eventId": "event-1",
                "text": None,
                "artworkIds": ["artwork-1"],
            }
        ],
        "artworks": [
            {
                "artworkId": "artwork-1",
                "title": "The Red Studio",
                "artist": "Henri Matisse",
            }
        ],
        "validEventIds": ["event-1"],
        "validArtworkIds": ["artwork-1"],
    }

    result = journal_service.validate_journal_output(
        json.dumps(
            {
                "reflection": "",
                "focuses": [],
                "representativeArtworkIds": ["artwork-1"],
            }
        ),
        evidence,
    )

    assert result["reflection"] == "The Red Studio by Henri Matisse stayed in view today."
    assert result["title"] is None
    assert result["focuses"] == []


def test_validate_journal_output_rejects_unknown_evidence_ids():
    evidence = {
        "events": [{"eventId": "event-1", "text": "A thought", "artworkIds": []}],
        "artworks": [],
        "validEventIds": ["event-1"],
        "validArtworkIds": [],
    }

    with pytest.raises(HTTPException) as exc_info:
        journal_service.validate_journal_output(
            json.dumps(
                {
                    "reflection": "A reflection.",
                    "focuses": [
                        {
                            "label": "Unsupported focus",
                            "evidenceEventIds": ["invented-event"],
                        }
                    ],
                }
            ),
            evidence,
        )

    assert exc_info.value.status_code == 502


def test_artwork_only_day_uses_visual_context_in_llm_journal(db, monkeypatch):
    _add_user_session(db)
    for index, (artwork_id, title) in enumerate(
        [
            ("artwork-1", "The Two Trees"),
            ("artwork-2", "Streetlight in Snow"),
            ("artwork-3", "A Person in the Snow"),
        ],
        start=1,
    ):
        db.add(
            SavedArtwork(
                id=artwork_id,
                user_id="journal-user",
                photo_uri=f"https://example.com/{artwork_id}.jpg",
                artist_name="Artist",
                artwork_name=title,
            )
        )
        db.commit()
        _add_event(
            db,
            event_id=f"event-{index}",
            created_at=datetime(2026, 7, 18, 11 + index, 0, 0),
            artwork_ids=[artwork_id],
            sequence_number=index,
        )

    client = _patch_ai(
        monkeypatch,
        [
            {
                "reflection": "Snow and branches briefly held your attention.",
                "focuses": [],
                "representativeArtworkIds": ["artwork-1", "artwork-2", "artwork-3"],
            }
        ],
    )

    journal, regenerated = asyncio.run(
        journal_service.generate_daily_journal(
            db,
            user_id="journal-user",
            local_date=date(2026, 7, 18),
            timezone_name="UTC",
        )
    )

    assert regenerated is False
    assert journal.title is None
    assert journal.reflection == "Snow and branches briefly held your attention."
    assert journal.focuses == []
    assert journal.narrative_arc is None
    assert journal.representative_artwork_ids == ["artwork-1", "artwork-2", "artwork-3"]
    assert journal.model_version == "journal-test-model"
    assert client.calls == 1


def test_generate_journal_is_idempotent_and_requires_force_for_changed_evidence(db, monkeypatch):
    _add_user_session(db)
    _add_event(
        db,
        event_id="event-1",
        created_at=datetime(2026, 7, 18, 12, 0, 0),
        content="Why does this painting feel unfinished?",
    )
    client = _patch_ai(
        monkeypatch,
        [
            {"reflection": "You considered why a painting might feel unfinished."},
            {"reflection": "You returned to questions of finish and visible process."},
        ],
    )

    first, regenerated = asyncio.run(
        journal_service.generate_daily_journal(
            db,
            user_id="journal-user",
            local_date=date(2026, 7, 18),
            timezone_name="UTC",
        )
    )
    assert regenerated is False
    assert first.reflection == "You considered why a painting might feel unfinished."
    assert client.calls == 1

    same, regenerated = asyncio.run(
        journal_service.generate_daily_journal(
            db,
            user_id="journal-user",
            local_date=date(2026, 7, 18),
            timezone_name="UTC",
        )
    )
    assert regenerated is False
    assert same.id == first.id
    assert client.calls == 1

    _add_event(
        db,
        event_id="event-2",
        created_at=datetime(2026, 7, 18, 13, 0, 0),
        content="The exposed brushwork seems intentional.",
        sequence_number=2,
    )
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal_service.generate_daily_journal(
                db,
                user_id="journal-user",
                local_date=date(2026, 7, 18),
                timezone_name="UTC",
            )
        )
    assert exc_info.value.status_code == 409
    assert client.calls == 1

    updated, regenerated = asyncio.run(
        journal_service.generate_daily_journal(
            db,
            user_id="journal-user",
            local_date=date(2026, 7, 18),
            timezone_name="UTC",
            force_regenerate=True,
        )
    )
    assert regenerated is True
    assert updated.id == first.id
    assert updated.reflection == "You returned to questions of finish and visible process."
    assert updated.source_event_count == 2
    assert client.calls == 2
    assert db.query(Journal).count() == 1


def test_generate_journal_rejects_day_without_eligible_events(db):
    _add_user_session(db)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal_service.generate_daily_journal(
                db,
                user_id="journal-user",
                local_date=date(2026, 7, 18),
                timezone_name="UTC",
            )
        )

    assert exc_info.value.status_code == 422


def test_generate_journal_rejects_date_before_cutoff(db):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal_service.generate_daily_journal(
                db,
                user_id="journal-user",
                local_date=date(2026, 2, 28),
                timezone_name="UTC",
            )
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == (
        "Journal generation is not available before 2026-03-01"
    )


def test_manual_journal_route_requires_admin_secret(client):
    response = client.post(
        "/api/admin/journals/generate",
        json={
            "user_id": "journal-user",
            "local_date": "2026-07-18",
            "timezone": "UTC",
            "admin_secret": "wrong",
        },
    )

    assert response.status_code == 403


def test_list_journals_returns_recent_first_with_derived_location(client, db):
    db.add(User(user_id="journal-list-user", device_id="journal-list-user"))
    db.add(
        SavedArtwork(
            id="available-artwork",
            user_id="journal-list-user",
            photo_uri="https://example.com/available.jpg",
            artwork_name="Available Work",
            artist_name="Available Artist",
        )
    )
    db.add_all(
        [
            Journal(
                id="older-journal",
                user_id="journal-list-user",
                local_date=date(2026, 7, 1),
                timezone="UTC",
                period_start_utc=datetime(2026, 7, 1),
                period_end_utc=datetime(2026, 7, 2),
                reflection="An older reflection.",
                focuses=[],
                representative_artwork_ids=[],
                evidence_snapshot={
                    "artworks": [
                        {
                            "location": {
                                "museum": "Asian Art Museum",
                                "city": "San Francisco",
                            }
                        }
                    ]
                },
                evidence_schema_version="journal-evidence-v2",
                source_event_count=1,
                input_hash="a" * 64,
                prompt_version="journal-generation-v2",
                model_version="test-model",
                generated_at=datetime(2026, 7, 2),
            ),
            Journal(
                id="newer-journal",
                user_id="journal-list-user",
                local_date=date(2026, 7, 3),
                timezone="UTC",
                period_start_utc=datetime(2026, 7, 3),
                period_end_utc=datetime(2026, 7, 4),
                reflection="A newer reflection.",
                focuses=[],
                representative_artwork_ids=["available-artwork", "deleted-artwork"],
                evidence_snapshot={
                    "artworks": [],
                    "sessions": [{"title": "SFMOMA"}],
                },
                evidence_schema_version="journal-evidence-v2",
                source_event_count=1,
                input_hash="b" * 64,
                prompt_version="journal-generation-v2",
                model_version="test-model",
                generated_at=datetime(2026, 7, 4),
            ),
        ]
    )
    db.commit()

    response = client.get("/api/journals", params={"user_id": "journal-list-user"})

    assert response.status_code == 200
    assert response.json()["items"] == [
        {
            "id": "newer-journal",
            "local_date": "2026-07-03",
            "location": None,
            "reflection": "A newer reflection.",
            "representative_artworks": [
                {
                    "id": "available-artwork",
                    "photo_uri": "https://example.com/available.jpg",
                    "artwork_name": "Available Work",
                    "artist_name": "Available Artist",
                }
            ],
        },
        {
            "id": "older-journal",
            "local_date": "2026-07-01",
            "location": "Asian Art Museum",
            "reflection": "An older reflection.",
            "representative_artworks": [],
        },
    ]

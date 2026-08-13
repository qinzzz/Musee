import json
from datetime import datetime

import pytest

from app.database.models import Collection, SavedArtwork, Session as SessionModel, Tag, User
from app.models.artwork import AIProvider
from app.routers import session_chat as session_chat_router
from app.services.ai_client_interface import AIStreamChunk, AITextResult
from app.services.retrieval.contracts import RetrievalPlan, SavedArtworkCandidate, SavedArtworkFilters
from app.services.retrieval.orchestrator import execute_collection_retrieval
from app.services.retrieval.planner import plan_collection_retrieval
from app.services.retrieval.reranker import rerank_saved_artworks
from app.services.retrieval.saved_artwork_retriever import retrieve_saved_artwork_candidates
from app.utils.auth_utils import create_access_token


def _artwork(user_id: str, artwork_id: str, title: str, artist: str, classification: str, analysis: str):
    return SavedArtwork(
        id=artwork_id,
        user_id=user_id,
        photo_uri=f"https://example.com/{artwork_id}.jpg",
        artwork_name=title,
        artist_name=artist,
        classification=classification,
        analysis=analysis,
    )


def test_saved_artwork_retriever_applies_owned_exact_filters(db):
    user = User(user_id="user-1", device_id="device-1")
    other = User(user_id="user-2", device_id="device-2")
    db.add_all([user, other])
    loved_turner = _artwork("user-1", "art-1", "Snow Storm", "J. M. W. Turner", "love", "Turbulent light")
    respected_turner = _artwork("user-1", "art-2", "Rain, Steam and Speed", "J. M. W. Turner", "respect", "Steam and motion")
    other_turner = _artwork("user-2", "art-3", "The Fighting Temeraire", "J. M. W. Turner", "love", "Sunset")
    loved_turner.artwork_tags.append(Tag(id="tag-1", name="#sublime"))
    board = Collection(id="collection-1", name="Atmosphere", user_id="user-1")
    board.artworks.append(loved_turner)
    db.add_all([loved_turner, respected_turner, other_turner, board])
    db.commit()

    candidates, eligible_count, truncated = retrieve_saved_artwork_candidates(
        db,
        user_id="user-1",
        filters=SavedArtworkFilters(
            artist_name="Turner",
            classifications=["love"],
            collection_name="Atmosphere",
        ),
        candidate_limit=30,
    )

    assert eligible_count == 1
    assert truncated is False
    assert [candidate.source_id for candidate in candidates] == ["art-1"]
    assert "Turbulent light" in candidates[0].retrieval_text
    assert "sublime" in candidates[0].retrieval_text


class _RerankerClient:
    async def call_text_only_result(self, **_kwargs):
        return AITextResult(text=json.dumps({
            "ranked_results": [
                {"source_id": "invented", "relevance": 1, "reason": "Not supplied"},
                {"source_id": "art-2", "relevance": 0.9, "reason": "A turbulent atmospheric space."},
                {"source_id": "art-2", "relevance": 0.8, "reason": "Duplicate"},
            ]
        }))


class _RerankerService:
    ai_client = _RerankerClient()


@pytest.mark.asyncio
async def test_reranker_cannot_expand_or_duplicate_candidates(monkeypatch):
    monkeypatch.setattr("app.services.retrieval.reranker.start_ai_usage", lambda **_kwargs: None)
    monkeypatch.setattr("app.services.retrieval.reranker.succeed_ai_usage", lambda *_args, **_kwargs: None)
    candidates = [
        SavedArtworkCandidate(
            source_id="art-1",
            title="One",
            artist="Artist",
            classification="love",
            retrieval_text="Quiet geometry",
        ),
        SavedArtworkCandidate(
            source_id="art-2",
            title="Two",
            artist="Artist",
            classification="love",
            retrieval_text="Turbulent atmospheric space",
        ),
    ]

    ranked = await rerank_saved_artworks(
        ai_service=_RerankerService(),
        user_id="user-1",
        concept_query="overwhelming",
        candidates=candidates,
        limit=5,
    )

    assert [item.source_id for item in ranked] == ["art-2"]


class _RoutePlannerClient:
    async def call_text_only_result(self, **_kwargs):
        return AITextResult(text=json.dumps({
            "needs_retrieval": True,
            "operation": "search_saved_artworks",
            "filters": {
                "artist_name": "Turner",
                "artwork_title": None,
                "classifications": ["love"],
                "collection_name": None,
                "location": None,
                "saved_after": None,
                "saved_before": None,
            },
            "concept_query": None,
            "limit": 5,
        }))


class _RouteRetrievalService:
    ai_client = _RoutePlannerClient()

    async def stream_session_chat_result(self, **kwargs):
        assert "Snow Storm" in kwargs["retrieval_context"]
        yield AIStreamChunk(type="text", text="You saved Snow Storm.")


def test_authenticated_session_stream_emits_collection_phase_and_provenance(client, db, monkeypatch):
    user = User(user_id="user-1", device_id="device-1")
    db.add(user)
    db.add(SessionModel(id="session-1", user_id="user-1", title="Turner"))
    db.add(_artwork("user-1", "art-1", "Snow Storm", "J. M. W. Turner", "love", "Turbulent light"))
    db.commit()

    monkeypatch.setattr(session_chat_router, "determine_ai_provider", lambda _model=None: AIProvider.OPENAI)
    monkeypatch.setattr(
        session_chat_router.AIServiceFactory,
        "get_service",
        lambda _provider: _RouteRetrievalService(),
    )
    monkeypatch.setattr(
        session_chat_router.AIServiceFactory,
        "get_fast_service",
        lambda _provider: _RouteRetrievalService(),
    )
    monkeypatch.setattr("app.services.retrieval.planner.start_ai_usage", lambda **_kwargs: None)
    monkeypatch.setattr("app.services.retrieval.planner.succeed_ai_usage", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(session_chat_router, "start_ai_usage", lambda **_kwargs: None)
    monkeypatch.setattr(session_chat_router, "succeed_ai_usage", lambda *_args, **_kwargs: None)

    response = client.post(
        "/api/session/chat-stream",
        headers={"Authorization": f"Bearer {create_access_token({'sub': 'user-1'})}"},
        json={
            "items": [],
            "conversation_history": [],
            "new_message": "What Turner works did I love?",
            "user_id": "user-1",
            "session_id": "session-1",
        },
    )

    assert response.status_code == 200
    assert '"phase": "planning"' in response.text
    assert '"phase": "retrieving_collection"' in response.text
    assert '"phase": "generating_response"' in response.text
    assert '"selected_source_ids": ["art-1"]' in response.text
    assert "You saved Snow Storm." in response.text


def test_collection_retrieval_rejects_client_identity_mismatch(client, db):
    db.add_all([
        User(user_id="user-1", device_id="device-1"),
        User(user_id="user-2", device_id="device-2"),
    ])
    db.commit()

    response = client.post(
        "/api/session/chat-stream",
        headers={"Authorization": f"Bearer {create_access_token({'sub': 'user-1'})}"},
        json={
            "items": [],
            "conversation_history": [],
            "new_message": "Search my collection",
            "user_id": "user-2",
        },
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_structured_retrieval_skips_reranker(db):
    user = User(user_id="user-1", device_id="device-1")
    db.add(user)
    db.add(_artwork("user-1", "art-1", "Snow Storm", "J. M. W. Turner", "love", "Turbulent light"))
    db.commit()

    outcome = await execute_collection_retrieval(
        ai_service=object(),
        db=db,
        user_id="user-1",
        plan=RetrievalPlan(
            needs_retrieval=True,
            operation="search_saved_artworks",
            filters={"artist_name": "Turner", "classifications": ["love"]},
            limit=5,
        ),
    )

    assert outcome.trace.strategy == "structured"
    assert outcome.trace.selected_source_ids == ["art-1"]
    assert "Snow Storm" in outcome.context


@pytest.mark.asyncio
async def test_count_operation_is_exact_and_user_scoped(db):
    db.add_all([
        User(user_id="user-1", device_id="device-1"),
        User(user_id="user-2", device_id="device-2"),
        _artwork("user-1", "art-1", "Impression, Sunrise", "Claude Monet", "love", "Harbor light"),
        _artwork("user-1", "art-2", "Woman with a Parasol", "Claude Monet", "respect", "Wind and light"),
        _artwork("user-2", "art-3", "Water Lilies", "Claude Monet", "love", "Reflections"),
    ])
    db.commit()

    outcome = await execute_collection_retrieval(
        ai_service=object(),
        db=db,
        user_id="user-1",
        plan=RetrievalPlan(needs_retrieval=True, operation="count_saved_artworks", filters={}),
    )

    assert outcome.trace.total_count == 2
    assert outcome.trace.completeness == "complete"
    assert "exact authorized SQL count found 2" in outcome.context


@pytest.mark.asyncio
async def test_movement_listing_supports_safe_collection_wide_negatives(db):
    user = User(user_id="user-1", device_id="device-1")
    impressionist = _artwork("user-1", "art-1", "Impression, Sunrise", "Claude Monet", "love", "Harbor light")
    impressionist.movement = "Impressionism"
    fauvist = _artwork("user-1", "art-2", "Woman with a Hat", "Henri Matisse", "love", "Wild color")
    fauvist.movement = "Fauvism"
    db.add_all([user, impressionist, fauvist])
    db.commit()

    outcome = await execute_collection_retrieval(
        ai_service=object(),
        db=db,
        user_id="user-1",
        plan=RetrievalPlan(
            needs_retrieval=True,
            operation="list_saved_artworks",
            filters={"movement": "Impressionism"},
        ),
    )

    assert outcome.trace.completeness == "complete"
    assert outcome.trace.selected_source_ids == ["art-1"]
    assert "Art movement: Impressionism" in outcome.context


@pytest.mark.asyncio
async def test_detail_context_distinguishes_capture_time_from_save_time(db):
    user = User(user_id="user-1", device_id="device-1")
    artwork = _artwork("user-1", "art-1", "Woman with a Hat", "Henri Matisse", "love", "Wild color")
    artwork.museum_name = "National Gallery of Art"
    artwork.location = {"city": "Washington", "country": "US"}
    artwork.photo_time = "2026-08-13T14:30:00-07:00"
    artwork.created_at = datetime(2026, 8, 13, 22, 0, 0)
    db.add_all([user, artwork])
    db.commit()

    outcome = await execute_collection_retrieval(
        ai_service=object(),
        db=db,
        user_id="user-1",
        plan=RetrievalPlan(
            needs_retrieval=True,
            operation="get_saved_artwork_details",
            source_ids=["art-1"],
        ),
    )

    assert "Captured at: 2026-08-13T14:30:00-07:00" in outcome.context
    assert "Saved to Musee at: 2026-08-13T22:00:00" in outcome.context
    assert "Captured at means when the source image was taken" in outcome.context


class _PlannerHistoryClient:
    def __init__(self):
        self.prompt = ""

    async def call_text_only_result(self, **kwargs):
        self.prompt = kwargs["prompt"]
        return AITextResult(text=json.dumps({
            "needs_retrieval": True,
            "operation": "get_saved_artwork_details",
            "filters": {},
            "source_ids": ["art-1"],
            "concept_query": None,
            "clarification_question": None,
            "limit": 5,
        }))


class _PlannerHistoryService:
    def __init__(self):
        self.ai_client = _PlannerHistoryClient()


@pytest.mark.asyncio
async def test_planner_receives_prior_retrieval_source_ids(monkeypatch):
    monkeypatch.setattr("app.services.retrieval.planner.start_ai_usage", lambda **_kwargs: None)
    monkeypatch.setattr("app.services.retrieval.planner.succeed_ai_usage", lambda *_args, **_kwargs: None)
    service = _PlannerHistoryService()

    plan = await plan_collection_retrieval(
        ai_service=service,
        user_id="user-1",
        message="When and where did I find this?",
        history=[{
            "role": "assistant",
            "content": "You saved Woman with a Hat.",
            "retrieval_source_ids": ["art-1"],
        }],
    )

    assert plan.source_ids == ["art-1"]
    assert '"art-1"' in service.ai_client.prompt


@pytest.mark.asyncio
async def test_planner_does_not_guess_a_singular_reference_across_multiple_results(monkeypatch):
    monkeypatch.setattr("app.services.retrieval.planner.start_ai_usage", lambda **_kwargs: None)
    monkeypatch.setattr("app.services.retrieval.planner.succeed_ai_usage", lambda *_args, **_kwargs: None)
    service = _PlannerHistoryService()

    plan = await plan_collection_retrieval(
        ai_service=service,
        user_id="user-1",
        message="When and where did I find this?",
        history=[{
            "role": "assistant",
            "content": "You saved two Matisse works.",
            "retrieval_source_ids": ["art-1", "art-2"],
        }],
    )

    assert plan.source_ids == ["art-1", "art-2"]
    assert plan.clarification_question == "Which artwork do you mean?"


@pytest.mark.asyncio
async def test_detail_operation_without_a_grounded_reference_requests_clarification(db):
    db.add_all([
        User(user_id="user-1", device_id="device-1"),
        _artwork("user-1", "art-1", "One", "Artist", "love", "One"),
        _artwork("user-1", "art-2", "Two", "Artist", "love", "Two"),
    ])
    db.commit()

    outcome = await execute_collection_retrieval(
        ai_service=object(),
        db=db,
        user_id="user-1",
        plan=RetrievalPlan(
            needs_retrieval=True,
            operation="get_saved_artwork_details",
            source_ids=[],
        ),
    )

    assert outcome.trace.selected_source_ids == []
    assert "Which artwork do you mean?" in outcome.context


@pytest.mark.asyncio
async def test_skipped_planner_forbids_unsupported_personal_collection_claims(db):
    outcome = await execute_collection_retrieval(
        ai_service=object(),
        db=db,
        user_id="user-1",
        plan=RetrievalPlan(needs_retrieval=False),
    )

    assert outcome.trace.skip_reason == "planner_not_needed"
    assert "Do not claim knowledge of the user's collection" in outcome.context

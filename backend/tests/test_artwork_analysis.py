"""Tests for the per-artwork artwork-analysis pipeline (artwork_analyses)."""

import asyncio
import json

from tests.conftest import TestingSessionLocal

from app.database.models import ArtworkAnalysis, SavedArtwork, User
from app.services.artwork_analysis_task_service import run_artwork_analysis


def _make_artwork(artwork_id: str = "art-1", user_id: str = "taste-user") -> str:
    with TestingSessionLocal() as db:
        if not db.query(User).filter(User.user_id == user_id).first():
            db.add(User(user_id=user_id))
        db.add(
            SavedArtwork(
                id=artwork_id,
                photo_uri="r2://photo.jpg",
                artist_name="Hilma af Klint",
                artwork_name="The Swan",
                user_id=user_id,
                params={"date": "1915", "medium": "oil on canvas"},
                movement="Symbolism",
            )
        )
        db.commit()
    return artwork_id


def _ok_payload() -> dict:
    return {
        "analyzability": {"status": "ok"},
        "visual_description": "A pale figure in an empty interior.",
        "dimensions": {
            "recognizable_abstract": {"score": 2, "evidence": ["Figure is identifiable."]},
            "calm_charged": {"score": 1, "evidence": ["Still, quiet composition."]},
            "minimal_maximal": {"score": 2, "evidence": ["Few elements."]},
            "controlled_freeform": {"score": 7, "evidence": ["Out-of-range score gets clamped."]},
            "traditional_experimental": {"score": 3, "evidence": ["Familiar format, odd space."]},
            "playful_solemn": {"score": 4, "evidence": ["Heavy emotional weight."]},
        },
        "tags": {
            "subject": [{"label": "single figure", "source": "visual_observed"}],
            "mood_atmosphere": [{"label": "melancholic", "source": "made_up_source"}],
            "unknown_category": [{"label": "should be dropped", "source": "visual_observed"}],
            "attraction_mode": [{"label": "atmospheric", "source": "visual_inferred"}],
        },
        "proposed_categories": [],
    }


class _FakeClient:
    def __init__(self, payload=None, error=None):
        self._payload = payload
        self._error = error
        self.last_kwargs = None

    async def call_with_image_and_text_result(self, **kwargs):
        from app.services.ai_client_interface import AITextResult

        self.last_kwargs = kwargs
        if self._error:
            raise self._error
        return AITextResult(text=json.dumps(self._payload), input_tokens=11, output_tokens=22)


class _FakeService:
    def __init__(self, payload=None, error=None):
        self.ai_client = _FakeClient(payload=payload, error=error)

    def get_model_name(self):
        return "fake-model"


def _patch_service(monkeypatch, service):
    monkeypatch.setattr(
        "app.services.artwork_analysis_task_service.AIServiceFactory.get_service",
        lambda _provider: service,
    )


def _rows(artwork_id: str):
    with TestingSessionLocal() as db:
        return (
            db.query(ArtworkAnalysis)
            .filter(ArtworkAnalysis.artwork_id == artwork_id)
            .order_by(ArtworkAnalysis.created_at)
            .all()
        )


def test_analyzed_row_persisted_and_normalized(monkeypatch):
    artwork_id = _make_artwork()
    service = _FakeService(payload=_ok_payload())
    _patch_service(monkeypatch, service)

    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img"))

    rows = _rows(artwork_id)
    assert len(rows) == 1
    row = rows[0]
    assert row.status == "analyzed"
    assert row.is_current is True
    assert row.analysis_version == "1"
    assert row.visual_description == "A pale figure in an empty interior."
    # Out-of-range score clamped into 1..5
    assert row.dimensions["controlled_freeform"]["score"] == 5
    assert set(row.dimensions.keys()) == {
        "recognizable_abstract",
        "calm_charged",
        "minimal_maximal",
        "controlled_freeform",
        "traditional_experimental",
        "playful_solemn",
    }
    # Unknown category dropped; invalid source coerced
    assert "unknown_category" not in row.tags
    assert row.tags["mood_atmosphere"][0]["source"] == "visual_inferred"
    assert row.metadata_snapshot["artist"] == "Hilma af Klint"
    assert row.metadata_snapshot["year"] == "1915"
    # Identified metadata reached the prompt
    assert "Hilma af Klint" in service.ai_client.last_kwargs["prompt"]
    assert service.ai_client.last_kwargs["response_schema"] is not None


def test_unanalyzable_gate_writes_terminal_row_without_dimensions(monkeypatch):
    artwork_id = _make_artwork("art-2")
    _patch_service(
        monkeypatch,
        _FakeService(payload={"analyzability": {"status": "not_artwork", "note": "Photo of a wall."}}),
    )

    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img"))

    rows = _rows(artwork_id)
    assert len(rows) == 1
    assert rows[0].status == "unanalyzable"
    assert rows[0].is_current is True
    assert rows[0].analyzability_note == "Photo of a wall."
    assert rows[0].dimensions is None
    assert rows[0].tags is None


def test_failed_run_records_error_and_is_not_current(monkeypatch):
    artwork_id = _make_artwork("art-3")
    _patch_service(monkeypatch, _FakeService(error=RuntimeError("API down")))

    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img"))

    rows = _rows(artwork_id)
    assert len(rows) == 1
    assert rows[0].status == "failed"
    assert rows[0].is_current is False
    assert "API down" in rows[0].error


def test_second_run_skips_when_current_result_exists(monkeypatch):
    artwork_id = _make_artwork("art-4")
    _patch_service(monkeypatch, _FakeService(payload=_ok_payload()))

    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img"))
    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img"))

    assert len(_rows(artwork_id)) == 1


def test_force_rerun_moves_is_current_to_new_row(monkeypatch):
    artwork_id = _make_artwork("art-5")
    _patch_service(monkeypatch, _FakeService(payload=_ok_payload()))

    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img"))
    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img", force=True))

    rows = _rows(artwork_id)
    assert len(rows) == 2
    assert [row.is_current for row in rows] == [False, True]


def test_failed_rerun_does_not_shadow_good_current_row(monkeypatch):
    artwork_id = _make_artwork("art-6")
    good = _FakeService(payload=_ok_payload())
    _patch_service(monkeypatch, good)
    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img"))

    _patch_service(monkeypatch, _FakeService(error=RuntimeError("flaky")))
    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img", force=True))

    rows = _rows(artwork_id)
    assert len(rows) == 2
    assert rows[0].status == "analyzed"
    assert rows[0].is_current is True
    assert rows[1].status == "failed"
    assert rows[1].is_current is False


def test_analysis_debug_endpoint_returns_current_row(client, monkeypatch):
    artwork_id = _make_artwork("art-endpoint")
    _patch_service(monkeypatch, _FakeService(payload=_ok_payload()))
    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img"))

    response = client.get(f"/api/artworks/{artwork_id}/analysis")
    assert response.status_code == 200
    body = response.json()["analysis"]
    assert body["status"] == "analyzed"
    assert body["dimensions"]["calm_charged"]["score"] == 1

    empty = client.get("/api/artworks/no-such-artwork/analysis")
    assert empty.status_code == 200
    assert empty.json()["analysis"] is None


def test_analysis_debug_endpoint_hidden_in_prod(client, monkeypatch):
    artwork_id = _make_artwork("art-endpoint-prod")
    monkeypatch.setattr("app.routers.artwork_library.settings.env", "prod")
    response = client.get(f"/api/artworks/{artwork_id}/analysis")
    assert response.status_code == 404


def test_missing_dimension_in_ok_response_marks_run_failed(monkeypatch):
    artwork_id = _make_artwork("art-7")
    payload = _ok_payload()
    del payload["dimensions"]["calm_charged"]
    _patch_service(monkeypatch, _FakeService(payload=payload))

    asyncio.run(run_artwork_analysis(artwork_id, image_bytes=b"img"))

    rows = _rows(artwork_id)
    assert len(rows) == 1
    assert rows[0].status == "failed"
    assert "calm_charged" in rows[0].error

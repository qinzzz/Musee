from app.services.session_event_service import (
    legacy_session_transport_type,
    normalize_session_event_artwork_ids,
    normalize_session_event_payload,
    normalize_session_event_type,
    normalize_session_trigger_event_id,
    validate_and_normalize_session_event,
)


def test_normalize_session_event_type_maps_legacy_values():
    assert normalize_session_event_type("text", role="user") == "user_input"
    assert normalize_session_event_type("text", role="model") == "message"
    assert normalize_session_event_type("artwork_capture", role="user") == "user_input"
    assert normalize_session_event_type("artwork_card") == "artwork_result"
    assert normalize_session_event_type("artwork_commentary", role="model") == "model_response"
    assert normalize_session_event_type("model_response", role="model") == "model_response"


def test_legacy_session_transport_type_maps_canonical_values():
    assert legacy_session_transport_type("user_input", role="user", artwork_ids=[]) == "text"
    assert legacy_session_transport_type("user_input", role="user", artwork_ids=["art-1"]) == "artwork_capture"
    assert legacy_session_transport_type("artwork_result") == "artwork_card"
    assert legacy_session_transport_type("model_response", role="model") == "text"


def test_normalize_session_trigger_event_id_strips_empty_values():
    assert normalize_session_trigger_event_id(None) is None
    assert normalize_session_trigger_event_id("   ") is None
    assert normalize_session_trigger_event_id(" trigger-7 ") == "trigger-7"


def test_normalize_session_event_artwork_ids_dedupes_values():
    assert normalize_session_event_artwork_ids(["art-1", "art-1", " ", "art-2"]) == ["art-1", "art-2"]


def test_normalize_session_event_payload_for_user_input():
    payload = normalize_session_event_payload(
        "user_input",
        {"source": "capture", "has_label": 1},
        artwork_ids=["art-1"],
    )

    assert payload == {
        "artworks": [
            {"artwork_id": "art-1", "source": "capture", "reference": {"has_label": True}},
        ]
    }


def test_normalize_session_event_payload_drops_invalid_artwork_result_fields():
    payload = normalize_session_event_payload(
        "artwork_result",
        {
            "outcome": "bad-state",
            "result_kind": "   ",
            "error_message": {"not": "a string"},
            "preserved": True,
        },
    )

    assert payload == {"preserved": True}


def test_validate_and_normalize_session_event_for_user_input():
    event = validate_and_normalize_session_event({
        "role": "user",
        "type": "text",
        "content": " Compare these ",
        "artwork_ids": ["art-1"],
        "payload": {"source": "upload"},
    })

    assert event["event_type"] == "user_input"
    assert event["content"] == "Compare these"
    assert event["artwork_ids"] == ["art-1"]
    assert event["payload"] == {
        "artworks": [{"artwork_id": "art-1", "source": "upload"}]
    }
    assert event["trigger_event_id"] is None


def test_validate_and_normalize_session_event_promotes_result_artwork_ids_into_payload():
    event = validate_and_normalize_session_event({
        "role": "model",
        "event_type": "artwork_result",
        "artwork_ids": ["art-1", "art-2"],
        "payload": {"result_kind": "identification"},
    })

    assert event["artwork_ids"] == ["art-1", "art-2"]
    assert event["payload"] == {
        "result_kind": "identification",
        "artwork_ids": ["art-1", "art-2"],
    }


def test_validate_and_normalize_session_event_rejects_trigger_on_user_input():
    try:
        validate_and_normalize_session_event({
            "role": "user",
            "event_type": "user_input",
            "content": "hello",
            "trigger_event_id": "evt-parent-1",
        })
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 400
        assert "cannot set trigger_event_id" in str(exc.detail)
    else:
        raise AssertionError("Expected validation failure")


def test_validate_and_normalize_session_event_requires_model_response_status():
    try:
        validate_and_normalize_session_event({
            "role": "model",
            "event_type": "model_response",
            "content": "Hello",
            "artwork_ids": ["art-1"],
            "payload": {},
        })
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 400
        assert "payload.status" in str(exc.detail)
    else:
        raise AssertionError("Expected validation failure")


def test_validate_and_normalize_general_model_response_without_artworks():
    event = validate_and_normalize_session_event({
        "role": "model",
        "event_type": "model_response",
        "content": "Here is the answer.",
        "payload": {"status": "completed"},
    })

    assert event["event_type"] == "model_response"
    assert event["artwork_ids"] == []
    assert event["payload"] == {"status": "completed"}


def test_legacy_artwork_commentary_normalizes_to_model_response():
    event = validate_and_normalize_session_event({
        "role": "model",
        "event_type": "artwork_commentary",
        "content": "Notice the contrast.",
        "artwork_ids": ["art-1"],
        "payload": {"status": "completed"},
    })

    assert event["event_type"] == "model_response"
    assert event["payload"] == {
        "status": "completed",
        "artwork_ids": ["art-1"],
    }

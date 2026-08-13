from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from fastapi import HTTPException


LEGACY_TO_CANONICAL_EVENT_TYPE = {
    "text": "message",
    "message": "message",
    "user_input": "user_input",
    "artwork_capture": "user_input",
    "artwork_input": "user_input",
    "artwork_card": "artwork_result",
    "artwork_result": "artwork_result",
    "artwork_commentary": "model_response",
    "model_response": "model_response",
}

CANONICAL_TO_LEGACY_EVENT_TYPE = {
    "user_input": "text",
    "message": "text",
    "artwork_result": "artwork_card",
    "model_response": "text",
}

VALID_ARTWORK_INPUT_SOURCES = {"upload", "capture", "library"}
VALID_ARTWORK_RESULT_OUTCOMES = {"succeeded", "failed"}
VALID_MODEL_RESPONSE_STATUSES = {"pending", "completed", "failed", "auth_required"}
VALID_SESSION_EVENT_ROLES = {"user", "model", "system"}
VALID_SESSION_EVENT_TYPES = {"user_input", "message", "artwork_result", "model_response"}


def normalize_session_event_type(raw_type: Optional[str], *, role: Optional[str] = None) -> str:
    normalized = (raw_type or "").strip()
    if not normalized:
        return "user_input" if role == "user" else "message"
    mapped = LEGACY_TO_CANONICAL_EVENT_TYPE.get(normalized, normalized)
    if mapped == "message" and role == "user":
        return "user_input"
    return mapped


def legacy_session_transport_type(
    raw_type: Optional[str],
    *,
    role: Optional[str] = None,
    artwork_ids: Optional[Iterable[str]] = None,
) -> str:
    canonical_type = normalize_session_event_type(raw_type, role=role)
    normalized_artwork_ids = normalize_session_event_artwork_ids(artwork_ids)
    if canonical_type == "user_input":
        return "artwork_capture" if normalized_artwork_ids else "text"
    return CANONICAL_TO_LEGACY_EVENT_TYPE.get(canonical_type, canonical_type or "text")


def normalize_session_trigger_event_id(trigger_event_id: Optional[str]) -> Optional[str]:
    if trigger_event_id is None:
        return None
    normalized = trigger_event_id.strip()
    return normalized or None


def normalize_session_event_artwork_ids(artwork_ids: Optional[Iterable[str]]) -> List[str]:
    normalized: List[str] = []
    seen: set[str] = set()
    if not artwork_ids:
        return normalized
    for artwork_id in artwork_ids:
        candidate = (artwork_id or "").strip()
        if not candidate or candidate in seen:
            continue
        normalized.append(candidate)
        seen.add(candidate)
    return normalized


def derive_session_event_artwork_ids(
    raw_type: Optional[str],
    payload: Optional[Dict[str, Any]],
    *,
    fallback_artwork_ids: Optional[Iterable[str]] = None,
) -> List[str]:
    canonical_type = normalize_session_event_type(raw_type)
    normalized_fallback_artwork_ids = normalize_session_event_artwork_ids(fallback_artwork_ids)
    if not isinstance(payload, dict):
        return normalized_fallback_artwork_ids

    if canonical_type == "user_input":
        artwork_entries = payload.get("artworks")
        if isinstance(artwork_entries, list):
            return normalize_session_event_artwork_ids(
                [
                    entry.get("artwork_id")
                    for entry in artwork_entries
                    if isinstance(entry, dict)
                ]
            )
        return normalized_fallback_artwork_ids

    payload_artwork_ids = payload.get("artwork_ids")
    if isinstance(payload_artwork_ids, list):
        normalized_payload_artwork_ids = normalize_session_event_artwork_ids(payload_artwork_ids)
        if normalized_payload_artwork_ids:
            return normalized_payload_artwork_ids

    artwork_entries = payload.get("artworks")
    if isinstance(artwork_entries, list):
        normalized_entry_artwork_ids = normalize_session_event_artwork_ids(
            [
                entry.get("artwork_id")
                for entry in artwork_entries
                if isinstance(entry, dict)
            ]
        )
        if normalized_entry_artwork_ids:
            return normalized_entry_artwork_ids

    return normalized_fallback_artwork_ids


def normalize_session_event_payload(
    raw_type: Optional[str],
    payload: Optional[Dict[str, Any]],
    *,
    artwork_ids: Optional[List[str]] = None,
    content: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    canonical_type = normalize_session_event_type(raw_type)
    normalized_artwork_ids = normalize_session_event_artwork_ids(artwork_ids)
    normalized: Dict[str, Any] = dict(payload or {})

    if canonical_type == "user_input":
        artwork_entries = normalized.get("artworks")
        source = normalized.get("source")
        has_label = bool(normalized.get("has_label")) if "has_label" in normalized else None
        if not isinstance(artwork_entries, list):
            artwork_entries = []
        normalized_entries: List[Dict[str, Any]] = []
        seen_artwork_ids: set[str] = set()
        for entry in artwork_entries:
            if not isinstance(entry, dict):
                continue
            artwork_id = (entry.get("artwork_id") or "").strip()
            if not artwork_id or artwork_id in seen_artwork_ids:
                continue
            seen_artwork_ids.add(artwork_id)
            item_source = entry.get("source")
            if item_source not in VALID_ARTWORK_INPUT_SOURCES:
                item_source = source if source in VALID_ARTWORK_INPUT_SOURCES else None
            reference = entry.get("reference")
            normalized_entry: Dict[str, Any] = {"artwork_id": artwork_id}
            if item_source:
                normalized_entry["source"] = item_source
            if isinstance(reference, dict) and reference:
                normalized_entry["reference"] = reference
            elif has_label and item_source == "capture":
                normalized_entry["reference"] = {"has_label": True}
            normalized_entries.append(normalized_entry)
        if not normalized_entries and normalized_artwork_ids:
            fallback_source = source if source in VALID_ARTWORK_INPUT_SOURCES else None
            for artwork_id in normalized_artwork_ids:
                fallback_entry: Dict[str, Any] = {"artwork_id": artwork_id}
                if fallback_source:
                    fallback_entry["source"] = fallback_source
                if has_label and fallback_source == "capture":
                    fallback_entry["reference"] = {"has_label": True}
                normalized_entries.append(fallback_entry)
        normalized.pop("source", None)
        normalized.pop("has_label", None)
        if normalized_entries:
            normalized["artworks"] = normalized_entries
        else:
            normalized.pop("artworks", None)
    elif canonical_type == "artwork_result":
        if normalized_artwork_ids:
            normalized["artwork_ids"] = normalized_artwork_ids
        else:
            normalized.pop("artwork_ids", None)
        outcome = normalized.get("outcome")
        if outcome not in VALID_ARTWORK_RESULT_OUTCOMES:
            normalized.pop("outcome", None)
        result_kind = normalized.get("result_kind")
        if not isinstance(result_kind, str) or not result_kind.strip():
            normalized.pop("result_kind", None)
        error_message = normalized.get("error_message")
        if error_message is not None and not isinstance(error_message, str):
            normalized.pop("error_message", None)
    elif canonical_type == "model_response":
        if normalized_artwork_ids:
            normalized["artwork_ids"] = normalized_artwork_ids
        else:
            normalized.pop("artwork_ids", None)
        status = normalized.get("status")
        if status not in VALID_MODEL_RESPONSE_STATUSES:
            normalized.pop("status", None)
        normalized.pop("response_kind", None)
        source_event_id = normalized.get("source_event_id")
        if source_event_id is not None and (not isinstance(source_event_id, str) or not source_event_id.strip()):
            normalized.pop("source_event_id", None)
        error_message = normalized.get("error_message")
        if error_message is not None and not isinstance(error_message, str):
            normalized.pop("error_message", None)
    elif canonical_type == "message":
        message_kind = normalized.get("message_kind")
        if message_kind is not None and not isinstance(message_kind, str):
            normalized.pop("message_kind", None)

    return normalized or None


def validate_and_normalize_session_event(
    event: Dict[str, Any],
) -> Dict[str, Any]:
    role = (event.get("role") or "").strip()
    if role not in VALID_SESSION_EVENT_ROLES:
        raise HTTPException(status_code=400, detail="Invalid session event role")

    normalized_trigger_event_id = normalize_session_trigger_event_id(event.get("trigger_event_id"))
    normalized_content = event.get("content")
    if isinstance(normalized_content, str):
        normalized_content = normalized_content.strip() or None
    elif normalized_content is not None:
        raise HTTPException(status_code=400, detail="Session event content must be text")

    normalized_artwork_ids = normalize_session_event_artwork_ids(event.get("artwork_ids") or [])
    canonical_type = normalize_session_event_type(
        event.get("event_type") or event.get("type"),
        role=role,
    )
    if canonical_type not in VALID_SESSION_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid session event type")

    normalized_payload = normalize_session_event_payload(
        canonical_type,
        event.get("payload"),
        artwork_ids=normalized_artwork_ids,
        content=normalized_content,
    )
    normalized_artwork_ids = derive_session_event_artwork_ids(
        canonical_type,
        normalized_payload,
        fallback_artwork_ids=normalized_artwork_ids,
    )

    if canonical_type == "user_input":
        if role != "user":
            raise HTTPException(status_code=400, detail="user_input events must use role='user'")
        if normalized_trigger_event_id is not None:
            raise HTTPException(status_code=400, detail="user_input events cannot set trigger_event_id")
        if not normalized_content and not normalized_artwork_ids:
            raise HTTPException(status_code=400, detail="user_input event requires content or artworks")
        if normalized_artwork_ids:
            artworks_payload = (normalized_payload or {}).get("artworks") if normalized_payload else None
            if not isinstance(artworks_payload, list) or not artworks_payload:
                raise HTTPException(status_code=400, detail="user_input artwork entries require source metadata")
            if any((entry.get("source") not in VALID_ARTWORK_INPUT_SOURCES) for entry in artworks_payload):
                raise HTTPException(status_code=400, detail="user_input artwork entries require valid source")
    elif canonical_type == "message":
        if not normalized_content:
            raise HTTPException(status_code=400, detail="message event requires content")
    elif canonical_type == "artwork_result":
        if role not in {"model", "system"}:
            raise HTTPException(status_code=400, detail="artwork_result events must use role='model' or role='system'")
        if not normalized_artwork_ids:
            raise HTTPException(status_code=400, detail="artwork_result event requires artworks")
        if not normalized_payload or not normalized_payload.get("result_kind"):
            raise HTTPException(status_code=400, detail="artwork_result event requires payload.result_kind")
    elif canonical_type == "model_response":
        if role not in {"model", "system"}:
            raise HTTPException(status_code=400, detail="model_response events must use role='model' or role='system'")
        if not normalized_payload or normalized_payload.get("status") not in VALID_MODEL_RESPONSE_STATUSES:
            raise HTTPException(status_code=400, detail="model_response event requires payload.status")
        if normalized_payload["status"] == "completed" and not normalized_content:
            raise HTTPException(status_code=400, detail="completed model_response event requires content")

    return {
        **event,
        "role": role,
        "type": canonical_type,
        "event_type": canonical_type,
        "content": normalized_content,
        "artwork_ids": normalized_artwork_ids,
        "trigger_event_id": normalized_trigger_event_id,
        "payload": normalized_payload,
    }

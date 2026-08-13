from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.services.ai_client_interface import AITextResult
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.retrieval.contracts import RetrievalPlan, parse_structured_json

logger = logging.getLogger(__name__)


def _previous_retrieval_source_ids(history: list[dict[str, object]]) -> list[str]:
    raw_ids = next((
        entry.get("retrieval_source_ids", [])
        for entry in reversed(history)
        if entry.get("role") == "assistant" and entry.get("retrieval_source_ids")
    ), [])
    return [source_id for source_id in raw_ids if isinstance(source_id, str)] if isinstance(raw_ids, list) else []

PLANNER_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "needs_retrieval": {"type": "BOOLEAN"},
        "operation": {"type": "STRING", "nullable": True},
        "filters": {
            "type": "OBJECT",
            "properties": {
                "artist_name": {"type": "STRING", "nullable": True},
                "artwork_title": {"type": "STRING", "nullable": True},
                "movement": {"type": "STRING", "nullable": True},
                "classifications": {"type": "ARRAY", "items": {"type": "STRING"}},
                "collection_name": {"type": "STRING", "nullable": True},
                "location": {"type": "STRING", "nullable": True},
                "saved_after": {"type": "STRING", "nullable": True},
                "saved_before": {"type": "STRING", "nullable": True},
            },
        },
        "source_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
        "concept_query": {"type": "STRING", "nullable": True},
        "clarification_question": {"type": "STRING", "nullable": True},
        "limit": {"type": "INTEGER"},
    },
    "required": ["needs_retrieval", "operation", "filters", "source_ids", "concept_query", "clarification_question", "limit"],
}


def _planner_prompt(message: str, history: list[dict[str, object]]) -> str:
    recent = history[-4:]
    previous_source_ids = _previous_retrieval_source_ids(history)
    return f"""You are the retrieval planner for Musee, a personal art-collection app.

Decide whether answering the CURRENT MESSAGE requires searching the current authenticated user's saved artwork collection.

Available operations:
- count_saved_artworks: exact SQL count for "how many" questions.
- list_saved_artworks: exact SQL listing/filtering by artist, title, movement, classification, collection, location, or date.
- get_saved_artwork_details: exact provenance/details for known source_ids.
- search_saved_artworks: conceptual or hybrid search with optional exact filters.

Use retrieval for questions about what the user saved, collected, loved, respected, rejected, saw at a location, or for comparisons/patterns that explicitly depend on their broader collection. Use it for follow-ups whose collection intent is clear from recent history.

Do not use retrieval for general art knowledge, questions answerable only from the current session artworks, rewriting requests, or ordinary follow-up explanation.

Exact filters available:
- artist_name
- artwork_title
- movement (art-historical movement such as Impressionism or Fauvism)
- classifications: love, respect, not_for_me, unsorted
- collection_name
- location
- saved_after / saved_before as ISO datetimes

Set concept_query only when conceptual similarity or interpretation is required, such as overwhelming, quiet, unstable, atmospheric, or similar to a current work. Do not invent exact filters. Maximum limit is 5.

Previously retrieved saved-artwork source IDs:
{json.dumps(previous_source_ids)}

For a provenance/detail follow-up such as "when and where did I find this", use get_saved_artwork_details and copy only IDs from that list. If a singular reference like "this" could refer to multiple previous IDs, set clarification_question to a short question asking which artwork; do not guess. Use list_saved_artworks for exact movement or artist questions. Use count_saved_artworks for totals. Use search_saved_artworks only for fuzzy concepts.

Recent conversation:
{json.dumps(recent, ensure_ascii=False)}

Current message:
{message}

Return only the structured plan.
Return exactly one JSON object with this shape:
{{
  "needs_retrieval": true,
  "operation": "search_saved_artworks",
  "filters": {{
    "artist_name": null,
    "artwork_title": null,
    "movement": null,
    "classifications": [],
    "collection_name": null,
    "location": null,
    "saved_after": null,
    "saved_before": null
  }},
  "source_ids": [],
  "concept_query": null,
  "clarification_question": null,
  "limit": 5
}}
When retrieval is unnecessary, set needs_retrieval false and operation null."""


async def plan_collection_retrieval(
    *,
    ai_service,
    user_id: str,
    message: str,
    history: list[dict[str, object]],
) -> RetrievalPlan:
    usage_id = start_ai_usage(
        user_id=user_id,
        job_type="retrieval_planner",
        model=get_ai_model_name(ai_service, "retrieval"),
        subject_type="user",
        subject_id=user_id,
    )
    try:
        call_result = getattr(ai_service.ai_client, "call_text_only_result", None)
        kwargs = {
            "prompt": _planner_prompt(message, history),
            "max_tokens": 500,
            "temperature": 0,
            "response_schema": PLANNER_RESPONSE_SCHEMA,
        }
        response = await call_result(**kwargs) if callable(call_result) else AITextResult(
            text=await ai_service.ai_client.call_text_only(**kwargs)
        )
        plan = RetrievalPlan.model_validate(parse_structured_json(response.text))
        if plan.operation == "get_saved_artwork_details":
            previous_source_ids = _previous_retrieval_source_ids(history)
            allowed = set(previous_source_ids)
            plan.source_ids = [source_id for source_id in plan.source_ids if source_id in allowed]
            singular_reference = bool(re.search(r"\b(this|that|it)\b", message, re.IGNORECASE))
            if singular_reference and len(previous_source_ids) > 1:
                plan.source_ids = previous_source_ids[:5]
                plan.clarification_question = "Which artwork do you mean?"
            elif not plan.source_ids:
                plan.clarification_question = "Which artwork do you mean?"
        succeed_ai_usage(usage_id, input_tokens=response.input_tokens, output_tokens=response.output_tokens)
        return plan
    except Exception as exc:
        fail_ai_usage(usage_id, exc)
        logger.warning("Collection retrieval planning failed: %s", exc)
        raise

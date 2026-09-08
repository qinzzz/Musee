from __future__ import annotations

import asyncio
import json
import logging

from sqlalchemy.orm import Session

from app.config.settings import settings
from app.services.retrieval.context_composer import compose_collection_context, compose_no_collection_claims_context
from app.services.retrieval.contracts import (
    RetrievalOutcome,
    RetrievalPlan,
    RetrievalTrace,
    RetrievedSavedArtwork,
)
from app.services.retrieval.planner import plan_collection_retrieval
from app.services.retrieval.reranker import rerank_saved_artworks
from app.services.retrieval.saved_artwork_retriever import count_saved_artworks, retrieve_saved_artwork_candidates

logger = logging.getLogger(__name__)


def _skipped_plan() -> RetrievalPlan:
    return RetrievalPlan(needs_retrieval=False, filters={})


async def retrieve_collection_context(
    *,
    ai_service,
    db: Session,
    user_id: str,
    message: str,
    history: list[dict[str, object]],
    trigger_event_id: str | None = None,
) -> RetrievalOutcome:
    plan = await plan_collection_context(
        ai_service=ai_service,
        message=message,
        history=history,
        user_id=user_id,
    )
    if not plan.needs_retrieval:
        return RetrievalOutcome(
            plan=plan,
            trace=RetrievalTrace(status="skipped", skip_reason="planner_not_needed"),
            context=compose_no_collection_claims_context(),
        )

    return await execute_collection_retrieval(
        ai_service=ai_service,
        db=db,
        user_id=user_id,
        plan=plan,
        trigger_event_id=trigger_event_id,
    )


async def plan_collection_context(
    *,
    ai_service,
    user_id: str,
    message: str,
    history: list[dict[str, object]],
) -> RetrievalPlan:
    if not settings.collection_retrieval_enabled:
        return _skipped_plan()
    return await plan_collection_retrieval(
        ai_service=ai_service,
        user_id=user_id,
        message=message,
        history=history,
    )


async def execute_collection_retrieval(
    *,
    ai_service,
    db: Session,
    user_id: str,
    plan: RetrievalPlan,
    trigger_event_id: str | None = None,
) -> RetrievalOutcome:
    # One result record per requested search; no prompts or candidate descriptions.
    record = {
        "trigger_event_id": trigger_event_id,
        "operation": plan.operation,
        "query": plan.concept_query,
        "filters": plan.filters.model_dump(mode="json", exclude_none=True, exclude_defaults=True),
        "source_ids": plan.source_ids,
        "limit": plan.limit,
    }
    try:
        outcome = await _execute_collection_retrieval(
            ai_service=ai_service, db=db, user_id=user_id, plan=plan,
        )
    except asyncio.CancelledError:
        logger.warning("COLLECTION_SEARCH %s", json.dumps({**record, "status": "cancelled"}))
        raise
    except Exception as exc:
        logger.warning("COLLECTION_SEARCH %s", json.dumps({
            **record, "status": "timeout" if isinstance(exc, TimeoutError) else "failed",
            "error_type": type(exc).__name__, "error": str(exc)[:500],
        }))
        raise
    if plan.needs_retrieval:
        logger.info("COLLECTION_SEARCH %s", json.dumps({
            **record,
            "status": "clarification_required" if plan.clarification_question else outcome.trace.status,
            "count": outcome.trace.total_count if outcome.trace.total_count is not None else len(outcome.results),
            "matches": [{"id": item.source_id, "title": item.title} for item in outcome.results],
        }))
    return outcome


async def _execute_collection_retrieval(
    *,
    ai_service,
    db: Session,
    user_id: str,
    plan: RetrievalPlan,
) -> RetrievalOutcome:
    if not plan.needs_retrieval:
        return RetrievalOutcome(
            plan=plan,
            trace=RetrievalTrace(status="skipped", skip_reason="planner_not_needed"),
            context=compose_no_collection_claims_context(),
        )

    if plan.operation == "get_saved_artwork_details" and not plan.source_ids:
        plan.clarification_question = plan.clarification_question or "Which artwork do you mean?"

    if plan.clarification_question:
        trace = RetrievalTrace(status="completed", strategy="structured", completeness="unknown")
        return RetrievalOutcome(
            plan=plan,
            trace=trace,
            context=compose_collection_context(
                [],
                operation=plan.operation,
                completeness="unknown",
                clarification_question=plan.clarification_question,
            ),
        )

    if plan.operation == "count_saved_artworks":
        total_count = count_saved_artworks(
            db,
            user_id=user_id,
            filters=plan.filters,
        )
        trace = RetrievalTrace(
            status="completed",
            strategy="structured",
            eligible_count=total_count,
            total_count=total_count,
            completeness="complete",
        )
        return RetrievalOutcome(
            plan=plan,
            trace=trace,
            context=compose_collection_context(
                [],
                operation=plan.operation,
                completeness="complete",
                total_count=total_count,
            ),
        )

    candidates, eligible_count, truncated = retrieve_saved_artwork_candidates(
        db,
        user_id=user_id,
        filters=plan.filters,
        candidate_limit=max(1, min(settings.collection_retrieval_candidate_limit, 30)),
        source_ids=plan.source_ids,
    )
    strategy = "structured" if plan.operation != "search_saved_artworks" or not plan.concept_query else (
        "hybrid" if plan.filters.model_dump(exclude_none=True, exclude_defaults=True) else "conceptual_rerank"
    )
    limit = min(plan.limit, settings.collection_retrieval_result_limit, 5)
    completeness = (
        "bounded"
        if plan.concept_query or truncated or eligible_count > limit
        else "complete"
    )
    if not candidates:
        trace = RetrievalTrace(
            status="empty",
            strategy=strategy,
            eligible_count=eligible_count,
            candidates_truncated=truncated,
            completeness="complete",
        )
        return RetrievalOutcome(
            plan=plan,
            trace=trace,
            context=compose_collection_context(
                [],
                operation=plan.operation,
                completeness="complete",
            ),
        )

    candidate_by_id = {candidate.source_id: candidate for candidate in candidates}
    if plan.concept_query:
        ranked = await rerank_saved_artworks(
            ai_service=ai_service,
            user_id=user_id,
            concept_query=plan.concept_query,
            candidates=candidates,
            limit=limit,
        )
        results = [
            RetrievedSavedArtwork(
                **candidate_by_id[rank.source_id].model_dump(exclude={"rerank_text"}),
                match_reason=rank.reason,
                relevance=rank.relevance,
            )
            for rank in ranked
        ]
    else:
        results = [
            RetrievedSavedArtwork(**candidate.model_dump(exclude={"rerank_text"}))
            for candidate in candidates[:limit]
        ]

    trace = RetrievalTrace(
        status="completed" if results else "empty",
        strategy=strategy,
        eligible_count=eligible_count,
        candidate_count=len(candidates),
        selected_count=len(results),
        candidates_truncated=truncated,
        completeness=completeness,
        selected_source_ids=[result.source_id for result in results],
    )
    return RetrievalOutcome(
        plan=plan,
        results=results,
        trace=trace,
        context=compose_collection_context(
            results,
            operation=plan.operation,
            completeness=completeness,
        ),
    )

from __future__ import annotations

from datetime import datetime
import json
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


ArtworkClassification = Literal["love", "respect", "not_for_me", "unsorted"]
RetrievalStatus = Literal["skipped", "completed", "empty", "failed"]
RetrievalSkipReason = Literal["planner_not_needed", "unauthenticated", "feature_disabled"]
RetrievalStrategy = Literal["structured", "conceptual_rerank", "hybrid"]
RetrievalCompleteness = Literal["complete", "bounded", "unknown"]
RetrievalOperation = Literal[
    "count_saved_artworks",
    "list_saved_artworks",
    "get_saved_artwork_details",
    "search_saved_artworks",
]


def parse_structured_json(text: str) -> dict:
    normalized = text.strip()
    if normalized.startswith("```"):
        normalized = normalized.split("```", 2)[1].strip()
        if normalized.startswith("json"):
            normalized = normalized[4:].strip()
    parsed = json.loads(normalized)
    if not isinstance(parsed, dict):
        raise ValueError("Structured AI response must be an object")
    return parsed


class SavedArtworkFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    artist_name: Optional[str] = None
    artwork_title: Optional[str] = None
    movement: Optional[str] = None
    classifications: list[ArtworkClassification] = Field(default_factory=list, max_length=4)
    collection_name: Optional[str] = None
    location: Optional[str] = None
    saved_after: Optional[datetime] = None
    saved_before: Optional[datetime] = None


class RetrievalPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    needs_retrieval: bool
    operation: Optional[RetrievalOperation] = None
    filters: SavedArtworkFilters = Field(default_factory=SavedArtworkFilters)
    source_ids: list[str] = Field(default_factory=list, max_length=5)
    concept_query: Optional[str] = Field(default=None, max_length=500)
    clarification_question: Optional[str] = Field(default=None, max_length=300)
    limit: int = Field(default=5, ge=1, le=5)

    @model_validator(mode="after")
    def validate_operation(self):
        if self.needs_retrieval and self.operation is None:
            raise ValueError("Retrieval plans require an operation")
        if not self.needs_retrieval:
            self.operation = None
            self.concept_query = None
            self.source_ids = []
            self.clarification_question = None
        return self


class SavedArtworkCandidate(BaseModel):
    source_id: str
    artwork_id: Optional[str] = None
    artist_id: Optional[str] = None
    title: str
    artist: str
    classification: ArtworkClassification
    movement: Optional[str] = None
    museum_name: Optional[str] = None
    location: Optional[dict] = None
    captured_at: Optional[str] = None
    saved_at: Optional[datetime] = None
    rerank_text: str
    retrieval_text: str
    matched_fields: list[str] = Field(default_factory=list)


class RankedArtwork(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: str
    relevance: float = Field(ge=0, le=1)
    reason: str = Field(max_length=300)


class RerankResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ranked_results: list[RankedArtwork] = Field(default_factory=list, max_length=5)


class RetrievedSavedArtwork(BaseModel):
    source_id: str
    artwork_id: Optional[str] = None
    artist_id: Optional[str] = None
    title: str
    artist: str
    classification: ArtworkClassification
    movement: Optional[str] = None
    museum_name: Optional[str] = None
    location: Optional[dict] = None
    captured_at: Optional[str] = None
    saved_at: Optional[datetime] = None
    retrieval_text: str
    matched_fields: list[str] = Field(default_factory=list)
    match_reason: Optional[str] = None
    relevance: Optional[float] = None


class RetrievalTrace(BaseModel):
    status: RetrievalStatus
    strategy: Optional[RetrievalStrategy] = None
    eligible_count: int = 0
    candidate_count: int = 0
    selected_count: int = 0
    candidates_truncated: bool = False
    completeness: RetrievalCompleteness = "unknown"
    total_count: Optional[int] = None
    skip_reason: Optional[RetrievalSkipReason] = None
    selected_source_ids: list[str] = Field(default_factory=list)
    failure_stage: Optional[str] = None


class RetrievalOutcome(BaseModel):
    plan: RetrievalPlan
    results: list[RetrievedSavedArtwork] = Field(default_factory=list)
    trace: RetrievalTrace
    context: str = ""

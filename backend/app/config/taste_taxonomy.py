"""Taste taxonomy: the stable keys shared by the artwork-analysis prompt,
the response schema, the artwork_analyses payload, and (later) the taste
aggregation engine.

Prose definitions (what each dimension pole means, tag category guidance)
live in app/prompts/instructions/artwork_analysis.txt so they can be edited
without code changes. This module only owns the machine-readable keys —
change a key here and you are changing the data contract, so bump
ARTWORK_ANALYSIS_VERSION.
"""

from __future__ import annotations

from typing import Any, Dict

# Bump when the prompt or schema changes meaningfully enough that old rows
# should not be compared with new ones. Backfill re-analyzes artworks whose
# current row is at an older version.
ARTWORK_ANALYSIS_VERSION = "1"

# Six dimensions, scored 1..5. Score 1 = first pole in the key name,
# score 5 = second pole (e.g. recognizable_abstract: 1=recognizable, 5=abstract).
TASTE_DIMENSION_KEYS = [
    "recognizable_abstract",
    "calm_charged",
    "minimal_maximal",
    "controlled_freeform",
    "traditional_experimental",
    "playful_solemn",
]

TASTE_DIMENSION_SCORE_MIN = 1
TASTE_DIMENSION_SCORE_MAX = 5

# Open-vocabulary tag labels, organized under fixed categories.
TASTE_TAG_CATEGORIES = [
    "medium",
    "subject",
    "formal_visual",
    "mood_atmosphere",
    "theme_context",
    "artistic_strategy",
    "attraction_mode",
]

TASTE_TAG_SOURCES = [
    "visual_observed",
    "visual_inferred",
    "metadata_provided",
    "context_inferred",
]

ANALYZABILITY_OK = "ok"
ANALYZABILITY_NOT_ARTWORK = "not_artwork"
ANALYZABILITY_IMAGE_UNUSABLE = "image_unusable"
ANALYZABILITY_STATUSES = [
    ANALYZABILITY_OK,
    ANALYZABILITY_NOT_ARTWORK,
    ANALYZABILITY_IMAGE_UNUSABLE,
]

# artwork_analyses.status values.
ARTWORK_ANALYSIS_STATUS_PROCESSING = "processing"
ARTWORK_ANALYSIS_STATUS_ANALYZED = "analyzed"
ARTWORK_ANALYSIS_STATUS_UNANALYZABLE = "unanalyzable"
ARTWORK_ANALYSIS_STATUS_FAILED = "failed"
# Terminal statuses: a current row in one of these states means the artwork
# does not need re-analysis at the same version. `failed` is retryable.
ARTWORK_ANALYSIS_TERMINAL_STATUSES = [
    ARTWORK_ANALYSIS_STATUS_ANALYZED,
    ARTWORK_ANALYSIS_STATUS_UNANALYZABLE,
]


def _tag_entry_schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "label": {"type": "string"},
            "source": {"type": "string", "enum": list(TASTE_TAG_SOURCES)},
        },
        "required": ["label", "source"],
    }


def build_artwork_analysis_response_schema() -> Dict[str, Any]:
    """Structured-output schema enforced at the API level (Gemini), so the
    prompt file does not need to police JSON formatting."""
    dimension_schema = {
        "type": "object",
        "properties": {
            "score": {
                "type": "integer",
                "minimum": TASTE_DIMENSION_SCORE_MIN,
                "maximum": TASTE_DIMENSION_SCORE_MAX,
            },
            "evidence": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["score", "evidence"],
    }
    return {
        "type": "object",
        "properties": {
            "analyzability": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": list(ANALYZABILITY_STATUSES)},
                    "note": {"type": "string"},
                },
                "required": ["status"],
            },
            "visual_description": {"type": "string"},
            "dimensions": {
                "type": "object",
                "properties": {key: dimension_schema for key in TASTE_DIMENSION_KEYS},
            },
            "tags": {
                "type": "object",
                "properties": {
                    category: {"type": "array", "items": _tag_entry_schema()}
                    for category in TASTE_TAG_CATEGORIES
                },
            },
            "proposed_categories": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {"type": "string"},
                        "rationale": {"type": "string"},
                        "tags": {"type": "array", "items": _tag_entry_schema()},
                    },
                    "required": ["category", "rationale"],
                },
            },
        },
        "required": ["analyzability"],
    }


ARTWORK_ANALYSIS_RESPONSE_SCHEMA = build_artwork_analysis_response_schema()

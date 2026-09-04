from enum import Enum


class AIJobType(str, Enum):
    """Canonical names for AI work, shared by prompt routing and usage telemetry."""

    AESTHETIC_TERM_DEFINITION = "aesthetic_term_definition"
    ARTWORK_ANALYSIS = "artwork_analysis"
    ARTWORK_FUN_FACTS = "artwork_fun_facts"
    ARTWORK_IDENTIFICATION = "artwork_identification"
    ARTWORK_METADATA_ENRICHMENT = "artwork_metadata_enrichment"
    ARTWORK_REIDENTIFICATION = "artwork_reidentification"
    ARTWORK_SUMMARY = "artwork_summary"
    EXPLORE_SKILL_DEEPDIVE = "explore_skill_deepdive"
    EXPLORE_SKILL_OBSERVATION = "explore_skill_observation"
    EXPLORE_SKILL_SELECTION = "explore_skill_selection"
    JOURNAL_GENERATION = "journal_generation"
    RETRIEVAL_PLANNER = "retrieval_planner"
    SAVED_ARTWORK_RERANKER = "saved_artwork_reranker"
    SESSION_CHAT = "session_chat"
    SESSION_NARRATIVE_SUMMARY = "session_narrative_summary"
    SPEECH_GENERATION = "speech_generation"
    SUGGEST_TOPICS = "suggest_topics"
    TAG_EXPLANATION = "tag_explanation"
    TASTE_PROFILE_NARRATIVE = "taste_profile_narrative"

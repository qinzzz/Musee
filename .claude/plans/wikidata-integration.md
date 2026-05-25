# Plan: Wikidata Integration for Artist Identification & Learning

## Goal

Use Wikidata's structured knowledge graph to (1) verify and correct LLM artist identification, (2) enrich artwork analysis with grounded facts, and (3) help users discover and learn more.

---

## Background

Currently the pipeline is:
1. User uploads image → LLM identifies artist + artwork name
2. Artist name / artwork name used as context in analysis prompts
3. No external validation — LLM can hallucinate names, dates, movements

Wikidata provides a free, queryable knowledge graph with canonical artist entities: names, nationalities, movements, birth/death dates, influenced-by relationships, notable works, and museum collection data.

---

## Approach A: Canonical Name Verification (Lowest effort, highest impact)

**What:** After LLM returns `artist` + `title`, fire a Wikidata SPARQL query to find the matching entity. If found, replace the LLM's strings with canonical Wikidata labels and fetch a structured bio block.

**Why:** Eliminates hallucinated name spellings, wrong birth years, and fabricated movement attributions. The rest of the pipeline (analysis prompts) becomes grounded in real data.

**How:**

```
POST /artwork-identify (existing)
  → LLM returns { artist, title, year, medium }
  → NEW: wikidata_lookup(artist, title, year)
      SPARQL: find artist entity by name + optional birth decade
      return { wikidata_id, canonical_name, birth, death,
               nationality, movement[], influenced_by[], notable_works[] }
  → Inject structured bio into analysis prompts
```

**SPARQL query skeleton:**
```sparql
SELECT ?artist ?artistLabel ?birthDate ?movement ?movementLabel WHERE {
  ?artist wdt:P31 wd:Q5 ;          # is a human
          wdt:P106 wd:Q1028181 ;   # occupation: painter (or sculptor, etc.)
          rdfs:label "{name}"@en .
  OPTIONAL { ?artist wdt:P569 ?birthDate }
  OPTIONAL { ?artist wdt:P135 ?movement }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
LIMIT 5
```

**Files to change:**
| File | Change |
|------|--------|
| `backend/app/services/wikidata_service.py` | New — SPARQL client, entity lookup, bio formatter |
| `backend/app/routers/artwork.py` | Call wikidata_service after identification step |
| `backend/app/utils/prompt_loader.py` | New placeholder `{wikidata_context}` in analysis prompts |
| `backend/app/prompts/artwork_analysis.txt` | Inject wikidata bio block when available |

---

## Approach B: Timeline Placement for History Skills (Medium effort)

**What:** When the confirmed artwork has a `P571` (inception date) in Wikidata, compute what else was happening in that year — contemporary works by peers, world events via era lookup — and surface this in the *Historical Context* and *Lineage* skill observations.

**Why:** Makes history skills concrete and verifiable rather than LLM-fabricated context.

**How:**
- After Approach A lookup, fetch `P571` (creation date) and `P135` (movement)
- Query movement entity for founding year and key figures
- Build a short "era context" string: "Made in {year}, {N} years into {movement}, contemporaries include {names}"
- Inject into `explore_observation.txt` prompt when skill is HISTORY category

**Files to change:**
| File | Change |
|------|--------|
| `backend/app/services/wikidata_service.py` | Add `get_era_context(artist_id, year)` |
| `backend/app/routers/artwork.py` | Pass era context to explore observation endpoint |
| `backend/app/prompts/instructions/explore_observation.txt` | Add `{era_context}` placeholder |

---

## Approach C: Related Artists Discovery (Medium effort)

**What:** After identification, traverse Wikidata's `P737` (influenced by) and inverse influence edges to surface 3–5 connected artists the user hasn't encountered yet.

**Why:** Turns passive consumption into active discovery — "you've seen X, you might find Y interesting."

**How:**
- From artist Wikidata ID, fetch `P737` (influenced by) + `P influence` (influenced)
- Filter out artists already in user's gallery (cross-reference with SavedArtwork table)
- Return as a `related_artists` field in the artwork analysis response
- Display in InterpretationModal as a "You might also explore…" row

**Files to change:**
| File | Change |
|------|--------|
| `backend/app/services/wikidata_service.py` | Add `get_related_artists(artist_id, exclude_ids)` |
| `backend/app/routers/artwork.py` | Return `related_artists` in analysis response |
| `frontend-web/components/InterpretationModal.tsx` | Render related artists row |
| `frontend-web/types.ts` | Add `relatedArtists` field to analysis response type |

---

## Approach D: Skill-Linked Fact Cards (Low–Medium effort)

**What:** When a user selects a HISTORY-category skill (Art Movement, Lineage, Historical Context), attach a small Wikidata-sourced fact card: movement founding year, key figures, canonical movement description.

**Why:** The skill system currently relies entirely on LLM prose. Fact cards add a grounded reference layer that users can trust.

**How:**
- Wikidata lookup for art movement entity (from artist's `P135`)
- Fetch: founding year, founder, description, key artists list
- Return alongside skill observation as a `fact_card` object
- Display as a collapsible reference block in InteractiveExplorationView

---

## Implementation Order (Recommended)

1. **Approach A** — Canonical verification + bio injection. Pure backend, no frontend changes. Immediate quality improvement across all prompts. ~1–2 days.
2. **Approach B** — Timeline/era context for History skills. Builds on A's lookup. ~1 day.
3. **Approach D** — Fact cards for History skills. Reuses A+B data. ~1 day.
4. **Approach C** — Related artists. Requires frontend work. ~2 days.

---

## Technical Notes

- Wikidata SPARQL endpoint: `https://query.wikidata.org/sparql`
- Use `requests` with `Accept: application/sparql-results+json`
- Rate limit: ~5 req/s, no auth needed for read queries
- Cache results by `(artist_name, title)` tuple — same artwork won't re-query
- Graceful degradation: if Wikidata lookup fails or returns no match, fall back silently to LLM-only context (never break the main flow)
- For multilingual support: query with `wikibase:language "{lang},en"` to respect user's language setting

---

## Open Questions

1. Should Wikidata lookup happen synchronously (blocking the response) or async (fire-and-forget, results cached for next request)?
   - Recommendation: async with ~2s timeout; cache result; second view of same artwork gets enriched analysis.
2. Should the Wikidata entity ID be stored in the `SavedArtwork` DB table for future use?
   - Recommendation: yes, add `wikidata_id VARCHAR` column.
3. For the related artists feature, how many should we surface and where in the UI?

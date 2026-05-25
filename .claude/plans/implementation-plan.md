---
title: Smart Collections & Taste Profile — Implementation Plan
created: 2026-04-23T08:00:00-07:00
source: interactive
tags: [implementation-plan, collections, taste-profile]
---

# Implementation Plan

Companion to `smart-collections-taste-profile.md`. This doc covers **how** to build each task — specific files, schemas, code patterns, and dependencies.

---

## Phase 1: Shared Foundation (tonight)

### P1-1: movements.json

**File**: `backend/app/data/movements.json`

```json
[
  {
    "id": "impressionism",
    "name": "Impressionism",
    "period_start": 1860,
    "period_end": 1890,
    "origin": "France",
    "bucket": "Historical",
    "description": "Loose brushwork and natural light capturing fleeting moments over academic precision.",
    "related": ["Post-Impressionism", "Pointillism"],
    "rarity": "common"
  },
  ...
]
```

Target: ~55–65 movements spanning all buckets and rarities. Breakdown:
- Historical (pre-1900): ~10 movements
- Modern (1900–1970): ~20 movements  
- Contemporary (1970–2010): ~15 movements
- Now (2010–present): ~10 movements

Include across rarity tiers — roughly 20% common, 30% uncommon, 30% rare, 20% legendary.

Load in `prompt_loader.py` alongside other data. Expose as a utility: `get_movement_names()` returning a sorted list of canonical names for prompt injection.

---

### P1-2: Prompt update

**File**: `backend/app/prompts/instructions/artist_identification_with_analysis.txt`

Add to Step 2 (Artist Identification) and output schema:

```
## Step 2: Artist Identification + Movement Classification
...
- For movement: pick the single closest match from this canonical list. Use "Unknown" only if no match fits:
  [Impressionism, Post-Impressionism, Fauvism, Cubism, Futurism, Dada, Surrealism, Abstract Expressionism, 
   Color Field, Minimalism, Pop Art, Conceptual Art, Land Art, Arte Povera, Fluxus, Institutional Critique,
   Neo-Expressionism, Street Art, Installation Art, New Media, Post-Internet, Social Practice, Afrofuturism,
   Superflat, Mono-ha, Fiber Art, Sound Art, Bioart, Zombie Formalism, Metamodernism, ...]
- For period_bucket: one of "Historical", "Modern", "Contemporary", "Now"
```

**Output schema addition**:
```json
{
  "artist": "...",
  "title": "...",
  "date": "...",
  "medium": "...",
  "movement": "Arte Povera",
  "period_bucket": "Modern",
  "description": "...",
  "tags": [...]
}
```

**File**: `backend/app/services/ai_service.py`

Update `ARTWORK_ANALYSIS_SCHEMA`:
```python
ARTWORK_ANALYSIS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        ...
        "movement": {"type": "STRING"},
        "period_bucket": {"type": "STRING"},
    },
    "required": [..., "movement", "period_bucket"]
}
```

---

### P1-3: DB migration

**File**: `backend/app/database/models.py`

```python
class SavedArtwork(Base):
    ...
    movement = Column(String, nullable=True)
    period_bucket = Column(String, nullable=True)
```

**Migration**: Neon PostgreSQL doesn't use Alembic in this project — use direct SQL via the existing migration pattern:

```python
# backend/migrate_add_movement_fields.py
ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS movement VARCHAR;
ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS period_bucket VARCHAR;
```

Run once against the Neon DB URL from settings.

---

### P1-4: Store movement + period_bucket on save

**File**: `backend/app/routers/artwork.py`

In `analyze_artist` (non-streaming) and the save path after streaming completes:

```python
# After parsing AI response
movement = parsed_response.get("movement")
period_bucket = parsed_response.get("period_bucket")

# When creating/updating SavedArtwork
saved_artwork.movement = movement
saved_artwork.period_bucket = period_bucket
```

**File**: `backend/app/models/artwork.py` (or wherever `ArtworkResponse` is defined)

Add `movement: Optional[str]` and `period_bucket: Optional[str]` to the response schema.

---

### P1-5: Batch enrichment endpoint

**File**: `backend/app/routers/artwork.py` (new endpoint)

```python
@router.post("/artworks/enrich-metadata")
async def enrich_artwork_metadata(
    user_id: str = Form(...),
    db: Session = Depends(get_db)
):
    """Fill movement + period_bucket for artworks where these are null."""
    artworks = db.query(SavedArtwork).filter(
        SavedArtwork.user_id == user_id,
        SavedArtwork.movement == None
    ).limit(50).all()  # batch size limit
    
    for artwork in artworks:
        if not artwork.analysis:
            continue
        # AI call with just text — no image needed
        movement, period_bucket = await infer_movement_from_analysis(
            artwork.analysis, artwork.artist_name
        )
        artwork.movement = movement
        artwork.period_bucket = period_bucket
    
    db.commit()
    return {"enriched": len(artworks)}
```

`infer_movement_from_analysis` is a simple text-only AI call with the canonical movement list. No image, cheap.

---

## Phase 2: Smart Collections

### P2-1: /api/smart-collections endpoint

**File**: `backend/app/routers/artwork.py` (new endpoint)

Logic:
1. Fetch all user's SavedArtworks with non-null movement/artist
2. Group by: movement, artist_name, period_bucket, medium
3. Filter: minimum 2 artworks per group
4. Sort: by count DESC, then by rarity of movement (rare/legendary first)
5. Generate hook text for top 8 collections (cached in a new `SmartCollectionCache` table or JSON column on User)

```python
@router.get("/smart-collections")
async def get_smart_collections(user_id: str, db: Session = Depends(get_db)):
    artworks = db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id).all()
    
    groups = defaultdict(list)
    for aw in artworks:
        if aw.movement:
            groups[("movement", aw.movement)].append(aw)
        groups[("artist", aw.artist_name)].append(aw)
        if aw.period_bucket:
            groups[("period", aw.period_bucket)].append(aw)
    
    collections = [
        build_collection(key, artworks_in_group)
        for key, artworks_in_group in groups.items()
        if len(artworks_in_group) >= 2
    ]
    return sorted(collections, key=lambda c: (-c["rarity_score"], -c["count"]))
```

Response shape:
```json
{
  "collections": [
    {
      "type": "movement",
      "key": "Arte Povera",
      "label": "Arte Povera",
      "rarity": "uncommon",
      "count": 4,
      "artwork_ids": ["id1", "id2", "id3", "id4"],
      "hook": "Four works where the material is the argument — soil, rope, and found objects as philosophy.",
      "thumbnail_ids": ["id1", "id2", "id3", "id4"]
    }
  ]
}
```

### P2-2: Frontend — SmartCollectionsView.tsx

New component. Collection card design:
- Top: rarity badge pill (color-coded: gold=legendary, purple=rare, blue=uncommon, gray=common)
- Middle: 2×2 thumbnail grid of first 4 artworks
- Bottom: movement/artist name (bold), count, hook text (italic, 1–2 lines)
- Actions: "Pin as Album" (→ creates Album), "Explore →" (→ filtered grid view)

Wire into `OrganizeView.tsx` as third tab "Smart" after "Saved" and "Boards".

---

## Phase 3: Taste Profile

### P3-1: SkillEvent table

```python
class SkillEvent(Base):
    __tablename__ = "skill_events"
    id = Column(Integer, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    skill_category = Column(String, nullable=False)  # PERCEPTION, HISTORY, etc.
    artwork_id = Column(Integer, ForeignKey("saved_artworks.id"), nullable=True)
    event_type = Column(String, default="observation")  # observation | deepdive
    created_at = Column(DateTime, default=datetime.utcnow)
```

Add `skill_stats` JSON column to `User`:
```python
skill_stats = Column(JSON, nullable=True)  # {"PERCEPTION": 78, "HISTORY": 41, ...}
```

### P3-2: Skill event logging

In `/artwork-skill-observation` and `/artwork-skill-deepdive` endpoints, after returning the response, write a SkillEvent row. skill_category comes from the request body (already present in these endpoints).

Compute skill_stats as normalized 0–100 scores across the 5 categories. Recompute lazily when taste profile is fetched (not on every event — too expensive).

### P3-3: /api/taste-profile

```python
@router.get("/taste-profile")
async def get_taste_profile(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    
    # Return cached if fresh (< 10 new artworks since last generation)
    if user.taste_profile and is_fresh(user):
        return user.taste_profile
    
    # Build structured data payload (no images)
    artworks = db.query(SavedArtwork).filter(...).all()
    skill_events = db.query(SkillEvent).filter(...).all()
    
    payload = build_taste_payload(artworks, skill_events)
    
    # Single AI call
    profile = await ai_service.generate_taste_profile(payload)
    
    # Cache
    user.taste_profile = profile
    db.commit()
    
    return profile
```

AI prompt for taste profile: structured data in → JSON out with fields:
- `identity_label`: "Material Witness"
- `identity_summary`: 2-sentence description
- `connections`: list of 4–6 observation strings
- `skill_stats`: dict of normalized scores (computed from events, not AI)

### P3-4 + P3-5: TasteProfileView.tsx

Three sections stacked vertically:

**Section 1 — Identity card**
- Large label ("Material Witness") in display font
- 2-sentence summary below
- Subtle background tint matching dominant movement color

**Section 2 — Character sheet**
```
PERCEPTION  ████████░░  78
HISTORY     ████░░░░░░  41
INTENT      ██████░░░░  62
STRUCTURE   ███░░░░░░░  32
RESONANCE   █████████░  89
```
CSS-only bars (no chart library needed). Each bar is a div with width% animated on mount.

**Section 3 — Connections**
List of 4–6 bullet observations. Each starts with a bold hook phrase.

Footer: "→ Explore Connections Map" links to Topography View.

---

## Phase 4: Discovery Moments

### P4-1: Post-save detection

After artwork is saved in `analyze_artist` endpoint:

```python
discovery = detect_discovery_moment(saved_artwork, user_id, db)
# Returns None or {"type": "rare_movement", "message": "..."} 
#                  {"type": "repeat_artist", "message": "..."}
```

Check 1 — rare movement:
```python
movement_data = get_movement_by_name(artwork.movement)
if movement_data and movement_data["rarity"] in ("rare", "legendary"):
    return {"type": "rare_movement", "movement": artwork.movement, "rarity": movement_data["rarity"]}
```

Check 2 — repeat artist across sessions:
```python
prior_count = db.query(SavedArtwork).filter(
    SavedArtwork.user_id == user_id,
    SavedArtwork.artist_name == artwork.artist_name
).count()
if prior_count >= 2:
    return {"type": "repeat_artist", "artist": artwork.artist_name, "count": prior_count + 1}
```

Add `discovery_moment` to the artwork save response.

**Frontend**: In `GalleryCard.tsx` or wherever artwork is added to the gallery, check for `discovery_moment` and show a dismissible one-line banner below the new card.

---

## Dependencies Graph

```
movements.json (P1-1)
    ├── P1-2: prompt update (needs movement name list)
    └── P4-1: rarity lookup (needs movements.json)

P1-3: DB migration
    ├── P1-4: store movement on save (needs columns)
    ├── P1-5: batch enrichment (needs columns)
    └── P2-1: smart collections API (needs populated data)

P1-4: store on save
    └── P2-1: smart collections (needs data in DB)

P3-1: SkillEvent table
    ├── P3-2: log events (needs table)
    └── P3-3: taste profile (needs event data)

P3-3: taste profile API
    └── P3-4: TasteProfileView (needs API)
```

**Critical path**: P1-1 → P1-2 → P1-3 → P1-4. Everything else branches from here.

---

## Estimated Time

| Phase | Tasks | Est. time |
|---|---|---|
| Phase 1 | P1-1 through P1-5 | 4–5 hours |
| Phase 2 | P2-1, P2-2 | 3–4 hours |
| Phase 3 | P3-1 through P3-5 | 6–8 hours |
| Phase 4 | P4-1 | 2 hours |
| **Total** | | **~15–19 hours** |

Phase 1 is self-contained and achievable in one evening.

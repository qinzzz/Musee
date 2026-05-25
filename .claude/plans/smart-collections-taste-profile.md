---
title: Smart Collections & Taste Profile — Design & Planning
created: 2026-04-23T07:00:00-07:00
source: interactive
tags: [feature-design, collections, taste-profile]
---

# Smart Collections & Taste Profile

Two related features that transform Musee from a scrapbook into a reflective art companion.

**Design north star**: Not an art education site (boring, generic, "here's Van Gogh"). A personal discovery engine — playful, specific, niche. References: Animal Crossing collection system, Duolingo skill progression, Disco Elysium character stats, Spotify/Douban personalized taste identity.

---

## Current State Gaps

| Area | What Exists | What's Missing |
|---|---|---|
| Organization | Manual albums, Collections, Topography View (2D tag map) | Auto-categorization, smart grouping, movement/period normalization |
| Taste analysis | Tags per artwork, session narrative_summary, conversations | User taste profile, evolution tracking, cross-session connections |
| Data richness | artist, title, date, medium, tags, analysis text | Normalized `movement`, `period`, engagement signals |
| Playfulness | ArtSkillsView (5 skill categories, not yet tied to user data) | Skill progression, collection milestones, taste identity |

**Core problem with Topography View at scale**: flat canvas, no hierarchy, no time dimension, no summary. Users see a cloud of tags and can't derive meaning from it.

---

## Foundation: Global Art Movement Taxonomy

### Why a Source of Truth Matters
Without a canonical vocabulary, `movement` data will be inconsistent ("Abstract Expressionism" vs "Abstract expressionism" vs "AbEx"), breaking grouping. More importantly, the vocabulary itself shapes the experience — a list of 15 textbook movements is boring; a curated list of 50–60 movements including niche/contemporary ones creates discovery.

### Design Principles for the Taxonomy

**Not this (textbook):**
> Impressionism, Cubism, Surrealism, Abstract Expressionism, Pop Art, Minimalism

**This (specific, discoverable, opinionated):**
> Gutai, Arte Povera, Social Practice, Institutional Critique, Post-Internet, New Leipzig School, Zombie Formalism, Afrofuturism, Net Art, Bioart, Fiber Art, Sound Art, Fluxus, Mono-ha, Superflat

The taxonomy should include movements most people haven't heard of — that's where discovery happens. Major movements are included but treated equally, not as the default.

### Structure

A `movements.json` in the backend that maps each movement to:
```json
{
  "id": "arte-povera",
  "name": "Arte Povera",
  "period_start": 1967,
  "period_end": 1985,
  "origin": "Italy",
  "bucket": "Modern",
  "description": "Italian movement using raw, humble materials — soil, rags, twigs — to challenge the commodification of art.",
  "related": ["Fluxus", "Land Art", "Process Art"],
  "rarity": "uncommon"   ← for collection mechanics
}
```

**Rarity tiers** (Animal Crossing logic):
- `common` — major movements (Impressionism, Minimalism, Abstract Expressionism)
- `uncommon` — well-known but niche (Fluxus, Arte Povera, Brutalism)
- `rare` — specialist knowledge (Mono-ha, Supports/Surfaces, Lettrism)
- `legendary` — hyper-specific or recent (Zombieformalism, Metamodernism, Post-Internet)

The rarity system makes discovering a "rare" movement feel like a real find — not because it's better, but because it's unexpected.

**Period buckets** (4, for simplicity):
- `Historical` — pre-1900
- `Modern` — 1900–1970
- `Contemporary` — 1970–2010
- `Now` — 2010–present

### Prompt Integration

The artwork analysis prompt gets the movement list injected, with instruction to pick the closest match from the canonical vocabulary (or "Unknown" if genuinely ambiguous). This ensures consistency.

---

## Feature 1: Smart Collections

### Goal
Automatically surface collections the user would create themselves — grouped by movement, artist, period, or medium — without requiring manual curation.

### Collection Types

| Type | Example | Source |
|---|---|---|
| By movement | "Arte Povera (4)" | movement field |
| By artist | "Chiharu Shiota (3)" | artist_name |
| By period | "Now — 2010s onward (12)" | period bucket |
| By medium | "Installation (8)" | medium field |
| By skill angle | "Works you explored with Resonance" | skill usage log |

### Collection Cards (not boring)
Each collection card shouldn't feel like a Wikipedia category. The card includes:
- A **one-sentence hook** (AI-generated): "Three works that treat absence as material — what's not there is the point."
- Thumbnail grid (first 4 artworks)
- Movement name + rarity badge (uncommon / rare / legendary)
- "Pin as Album" or "Explore" action

The hook makes browsing feel like curation, not filing.

### API

```
GET  /api/smart-collections          → suggested collections with counts, artwork IDs, hooks
POST /api/smart-collections/pin      → save as named Album
```

Smart collections = DB aggregation only (no AI per request). Hook text generated once when collection first appears, cached.

### Frontend Changes

- `OrganizeView.tsx`: Add "Smart" tab
- New `SmartCollectionsView.tsx`: Scrollable grid of collection cards
- Tap → filtered artwork grid with collection context shown at top
- Rarity badge visible on card and in collection header

### Complexity: Medium (~3–4 days)

---

## Feature 2: Taste Profile & Skill Character Sheet

### The Core Reframe

**Don't build**: "You like Impressionism (32%), Contemporary (28%), Modern (20%)..."
**Build**: A taste *identity* that's specific enough to be surprising and personal enough to feel true.

Reference: Spotify Wrapped doesn't say "you listened to pop music." It says "you're a Daydream Devotee — your top genre was ethereal indie folk and you replayed the same 3 songs 47 times."

Musee's equivalent: **"You're a Material Witness"** — drawn to work where the physical stuff matters: rust, thread, soil, decay. 7 of your 12 most-engaged works involved unconventional materials. Your STRUCTURE score is low, RESONANCE is high — you feel before you analyze.

### The 5 Skills as Character Stats (Disco Elysium direction)

ArtSkillsView already has 5 categories: **PERCEPTION, HISTORY, INTENT, STRUCTURE, RESONANCE**. These aren't just educational tabs — they're dimensions of how you engage with art. Make them into a character sheet.

How stats accumulate:
- Using a skill in `/artwork-skill-observation` → +XP to that skill
- Depth of engagement (how many skill deepdives) → stat weight
- Which skill categories your collected works naturally score high on → passive stat gain

**Character sheet display:**
```
PERCEPTION  ████████░░  78   "You notice what others walk past"
HISTORY     ████░░░░░░  41   "Context isn't your first move"
INTENT      ██████░░░░  62   "You wonder about the person behind it"
STRUCTURE   ███░░░░░░░  32   "You feel before you dissect"
RESONANCE   █████████░  89   "Art hits you somewhere specific"
```

This replaces the Topography View's role as the "who are you as an art viewer" answer — but it's embodied in behavior, not just tags.

### Taste Identity Label

One evocative, specific label generated from the character sheet + collection data:
- "Material Witness" — RESONANCE high, drawn to texture and physical presence
- "Quiet Formalist" — STRUCTURE high, HISTORY medium, tends toward abstraction
- "Archaeologist of Now" — HISTORY high, collects contemporary work, seeks context
- "Instinctive Wanderer" — PERCEPTION high, low on everything else, pure gut response
- "Conceptual Completist" — INTENT high, likes to understand what the artist was arguing

One label, regenerated quarterly or on demand. Not a quiz — derived from actual behavior.

### Evolution & Connections (the interesting part)

Not "you like impressionism." Instead, surfaced observations that feel like discoveries:

- **Cross-exhibition artist**: "You've encountered Chiharu Shiota in 3 separate exhibitions across 4 years. That's not coincidence — you keep finding her."
- **Taste drift**: "In 2021 your collection was dominated by painting. In the past 6 months, 70% of what you've saved is installation or sculpture."
- **Unexpected link**: "Kara Walker and Xu Bing both use text and shadow — you collected both without connecting them. Here's what they share."
- **Blind spot**: "You've never saved anything from before 1950. Might be worth exploring."
- **Rare streak**: "You've collected works from 4 'rare' movements — most users have zero. You're building an unusual collection."

These are generated by AI over structured data (no images) — cheap, fast, surprising.

### Topography View: Keep as Power Mode

Don't delete. Rename to "Connections Map." Accessible from Taste Profile via "Explore your map →".
- Add movement nodes as large anchor points (hierarchy: movement → individual tags)
- Default view remains Taste Profile (summary + character sheet)
- Topography is for users who want to navigate the full graph

### API

```
GET  /api/taste-profile             → cached profile (identity label, stats, connections, evolution)
POST /api/taste-profile/regenerate  → force refresh
```

### Frontend Changes

- New `TasteProfileView.tsx`: identity label, character sheet bars, connections list
- Replace Topography as default tab in the current Topography slot
- Add "→ Connections Map" link to Topography at bottom of Taste Profile
- `ArtSkillsView.tsx`: show skill XP/level alongside each skill category (passive display, no gameplay interruption)

### Complexity: Medium-High (~4–5 days)

---

## Gamification Layer (Duolingo / Animal Crossing direction)

Keep subtle — not Duolingo's aggressive streaks, more Animal Crossing's quiet satisfaction of completion.

**Collection milestones** (shown in Taste Profile, not as pop-ups):
- "First rare movement collected" — badge
- "Explored the same artist in 3 different exhibitions"
- "Activated all 5 skill types at least once"
- "Collection spans 4 decades"

**Discovery moments** (shown once, on artwork save):
- "This is a rare movement — only a few in your collection" (for 'uncommon' or above)
- "You've now seen Chiharu Shiota's work in 3 different contexts" (cross-session repeat artist)

**No streaks, no daily push notifications.** The pleasure is retrospective ("look what I've built") not compulsive ("don't break the chain").

---

## Implementation Order

```
Phase 1 — Shared Foundation (~2 days)
  ├── movements.json: curated ~50-movement taxonomy with rarity, period, related fields
  ├── Update artwork analysis prompt: output movement (from vocabulary) + period bucket
  ├── DB: add movement + period_bucket columns to SavedArtwork
  └── Batch enrichment endpoint: fill existing artworks from analysis text

Phase 2 — Smart Collections (~2 days)
  ├── /api/smart-collections aggregation endpoint
  ├── AI hook generation for collection cards (one-time, cached)
  └── SmartCollectionsView.tsx + OrganizeView "Smart" tab

Phase 3 — Taste Profile & Character Sheet (~4 days)
  ├── Skill XP tracking: log skill usage events to DB
  ├── /api/taste-profile generation + caching
  ├── TasteProfileView.tsx: identity label + character sheet bars + connections
  └── ArtSkillsView: show skill levels passively

Phase 4 — Discovery Moments (~1 day)
  └── Post-save detection: rare movement alert, repeat-artist detection
```

**Phase 1 is the unlock.** Both features depend on normalized movement data. Start there.

---

## Open Questions

1. **Taxonomy size**: 50 movements or 80? More = richer discovery but harder to maintain and prompt with. Suggest 55–65 as a target range.
2. **Skill XP source**: Only from explicit skill exploration, or also inferred from artwork content (e.g. a conceptual work passively adds INTENT XP)? Start with explicit only, add passive later.
3. **Taste Identity label**: How often to regenerate? On demand only to start. Quarterly cadence later.
4. **Topography View**: Deprecate eventually once Taste Profile is proven, or permanent power mode? Leave open.
5. **Rarity display**: Show rarity badge on artwork card itself, or only in collection context? Suggest collection context only — avoid making individual artworks feel hierarchical by quality.

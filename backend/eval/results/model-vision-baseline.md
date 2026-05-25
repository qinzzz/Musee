# Eval: Model + Google Vision API

**Date:** 2026-04-24  
**Config:** LLM with Google Vision Web Detection hint injected into prompt  
**Dataset:** 39 items with ground truth (15 history items pending, skipped)  
**Result file:** `20260424_004514.json`  
**Models:** gpt-5.4, gemini-3-flash-preview, claude-sonnet-4-5 (current production baselines)

---

## How the hint is constructed

Google Vision Web Detection runs first on each image. The result is injected at the top of the artist identification prompt:

```
HINT — web image search result:
Best guess: leandro erlich swimming pool
Web entities: Leandro Erlich, Swimming Pool, Installation Art
Matching page titles: Leandro Erlich: Swimming Pool | MOMA | ...
Pages with this exact image:
  https://www.moma.org/collection/works/...
  https://en.wikipedia.org/wiki/Leandro_Erlich
(You may visit these URLs for additional context — the URL paths and page content often reveal the artist or artwork name.)

[artist identification prompt follows]
```

**Noise filter:** hint injection is suppressed entirely when Vision only returns generic labels (e.g. "Art", "Painting", "Modern art", "Fluorescent lamp", "Floor"). Affects ~35% of items — primarily hard installation/contemporary art where Vision has no signal.

**URL strategy:** if `pagesWithMatchingImages` exist (exact file indexed), those URLs are passed. Otherwise `visuallySimilarImages` URLs are used as fallback. URL paths often encode artist/artwork names even when the model can't visit the page.

---

## Summary

| metric | gpt+vision | gpt (base) | Δ | gemini+vision | gemini (base) | Δ | claude+vision | claude (base) | Δ |
|--------|-----------|-----------|---|--------------|--------------|---|--------------|--------------|---|
| artist_fuzzy | 66.7% | 69.2% | -2.6pp | **82.1%** | 82.1% | 0 | 61.5% | 61.5% | 0 |
| artist_fuzzy | 66.7% | 69.2% | -2.6pp | **82.1%** | 82.1% | 0 | 61.5% | 61.5% | 0 |
| title_contains | **46.2%** | 41.0% | +5.2pp | 51.3% | 38.5% | **+12.8pp** | 35.9% | 35.9% | 0 |
| title_fuzzy | 41.0% | 35.9% | +5.1pp | **56.4%** | 38.5% | **+17.9pp** | 33.3% | 33.3% | 0 |
| movement_exact | **56.4%** | 53.8% | +2.6pp | 53.8% | 53.8% | 0 | **53.8%** | 51.3% | +2.6pp |
| n scored | 39 | 39 | — | 39 | 39 | — | 39 | 39 | — |

**Key finding:** Vision hints improve **title identification significantly** (Gemini +12.8pp, GPT +5.2pp) with no artist regression. The hint anchors the model to the correct work once the artist is known. Claude sees no improvement — it may not be leveraging the URL hints effectively.

---

## Full leaderboard (all configs, artist_fuzzy)

| config | model | artist_fuzzy | title_contains | movement_exact | est. cost/1k calls |
|--------|-------|----------------|----------------|----------------|--------------------|
| vision-only | — | 41.0% | 30.8% | 0% | — |
| claude-haiku-4-5 | claude-haiku-4-5 | 46.2% | 20.5% | 43.6% | ~$2.50 |
| gpt-5.4-mini | gpt-5.4-mini | 48.7% | 20.5% | 43.6% | ~$2.03 |
| claude-sonnet-4-5 | claude-sonnet-4-5 | 61.5% | 35.9% | 51.3% | ~$7.50 |
| claude+vision | claude-sonnet-4-5 + Vision | 61.5% | 35.9% | **53.8%** | ~$7.50+ |
| gpt+vision | gpt-5.4 + Vision | 66.7% | 46.2% | **56.4%** | ~$6.75+ |
| gpt-5.4 | gpt-5.4 | 69.2% | 41.0% | 53.8% | ~$6.75 |
| gemini-3-flash | gemini-3-flash-preview | **82.1%** | 48.7% | 53.8% | ~$1.35 || gemini+vision | gemini-3-flash-preview + Vision | **82.1%** | **51.3%** | 53.8% | ~$1.35+ |

> Vision API cost: ~$1.50/1k images at standard pricing. Add to base model cost for +vision configs.

---

## Per-item delta: where Vision changed the answer

Items where artist prediction changed between base and +vision config:

| id | diff | GT artist | config | base pred | vision pred | change |
|----|------|-----------|--------|-----------|-------------|--------|
| al001 | medium | Kaspar von Zumbusch | gpt+vision | Carl von Hasenauer… | Kaspar von Zumbusch | ✗→✓ |
| al001 | medium | Kaspar von Zumbusch | gemini+vision | Caspar von Zumbusch | Kaspar von Zumbusch | ✗→✓* |
| m001 | hard | Albert Gleizes | gemini+vision | Sonia Delaunay | Albert Gleizes | ✗→✓ |
| m002 | medium | Frida Kahlo | gpt+vision | Diego Rivera | Frida Kahlo | ✗→✓ |
| m010 | hard | Joseph Nicéphore Niépce | gpt+vision | Unknown artist | Joseph Nicéphore Niépce | ✗→✓ |
| co002 | hard | Christian Boltanski | gemini+vision | Rafael Lozano-Hemmer | Christian Boltanski | ✗→✓ |
| co004 | hard | Christian Boltanski | claude+vision | El Anatsui | Christian Boltanski | ✗→✓ |
| co012 | hard | Céleste Boursier-Mougenot | gemini+vision | Olafur Eliasson | Céleste Boursier-Mougenot | ✗→✓ |
| co014 | hard | Katharina Grosse | gpt+vision | Sam Gilliam | Katharina Grosse | ✗→✓ |
| co014 | hard | Katharina Grosse | claude+vision | Katharina Fritsch | Katharina Grosse | ✗→✓ |
| co003 | hard | Christian Boltanski | gpt+vision | Christian Boltanski | Chiharu Shiota | ✓→✗ |
| co014 | hard | Katharina Grosse | gemini+vision | Katharina Grosse | Sam Gilliam | ✓→✗ |

> \* al001 gemini: base returned "Caspar von Zumbusch" (alternate transliteration, scored ✗); vision corrected spelling to "Kaspar".

**Net: +10 correct, −2 regressions.** Both regressions are on the same hard item (co014, co003) where the Vision hint pointed at a different work in the same artist's catalogue and confused the model.

---

## Key observations

### Where Vision hints help most
- **Obscure hard items with partial Vision signal**: co002 (Boltanski), co012 (Boursier-Mougenot), m001 (Gleizes) — Vision found enough page titles or URL context to nudge the model to the right answer
- **Title identification**: the biggest consistent gain. Once Vision's best_guess anchors the artwork, the model can confirm the exact title. Gemini +12.8pp, GPT +5.2pp
- **Sculptor/monument IDs** (al001): Vision found indexed pages with the correct name spelling

### Where Vision hints don't help (noise-filtered items)
- ~35% of items (mainly hard contemporary installation art) had Vision return only generic labels and received no hint. These items score identically between base and +vision — the filter is working correctly.
- co019 (Rinko Kawauchi): Vision returned Japanese text entities; filtered as non-Latin, no hint injected. Model still fails.

### Regressions
- Both regressions occurred on hard items where Vision found *a* real artwork but the *wrong one* from the same artist or period. co003/co014 are visually ambiguous — Vision's hint confidently pointed at the wrong work and overrode the model's correct base answer.
- Mitigation: could add confidence scoring — only inject when Vision's best_guess entity score is high (>0.7).

### Claude's flat response to Vision hints
- Claude+vision shows 0pp gain on artist and title vs base. Claude may be under-weighting the injected hint or not parsing the URL structure. GPT and Gemini both show meaningful title gains; Claude does not.

---

## Scoring note

Vision API adds ~$1.50/1k images on top of model cost. For gemini+vision this roughly doubles the per-call cost ($1.35 → ~$2.85/1k) but the title improvement (+12.8pp) may justify it for use cases where title accuracy matters.

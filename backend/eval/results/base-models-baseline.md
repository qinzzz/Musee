# Eval Baseline: Base Models

**Date:** 2026-04-23  
**Config:** image only (no web search, no Google Vision hint)  
**Dataset:** 39 items with ground truth (15 history items pending, skipped)  
**Result files:** `20260423_231642.json`, `20260423_233224.json`, `20260423_234235.json`, `20260423_234615.json`, `20260423_235151.json`

| config id | model ID | notes |
|-----------|----------|-------|
| `gpt-4o` | `gpt-4o` | historical |
| `gpt-5.4` / `gpt` | `gpt-5.4` | **current production baseline** |
| `gemini-2.5-flash` | `gemini-2.5-flash` | historical |
| `gemini-3-flash` / `gemini` | `gemini-3-flash-preview` | **current production baseline** |
| `claude-sonnet-4` | `claude-sonnet-4-20250514` | historical |
| `claude-sonnet-4-5` / `claude` | `claude-sonnet-4-5` | **current production baseline** |

---

## Summary

| metric | gpt-4o | gpt-5.4 | gpt-5.4-mini | gemini-2.5-flash | gemini-3-flash | gemini-3.1-pro | claude-sonnet-4 | claude-sonnet-4-5 | claude-haiku-4-5 | vision-only (ref) |
|--------|--------|---------|-------------|------------------|----------------|----------------|-----------------|-------------------|-----------------|-------------------|
| artist_fuzzy | 61.5% | 69.2% | 48.7% | 76.9% | **82.1%** | **84.6%** | 56.4% | 61.5% | 46.2% | — |
| title_contains | 35.9% | 41.0% | 20.5% | 38.5% | 48.7% | **56.4%** | 33.3% | 35.9% | 20.5% | 30.8% |
| title_fuzzy | 30.8% | 35.9% | 15.4% | 38.5% | 56.4% | **48.7%** | 28.2% | 33.3% | 17.9% | — |
| movement_exact | **53.8%** | **53.8%** | 43.6% | 48.7% | **53.8%** | **56.4%** | 41.0% | 51.3% | 43.6% | 0% |
| n scored | 39 | 39 | 39 | 39 | 39 | 39 | 39 | 39 | 39 | 39 |

Key takeaways:
- **Gemini 3.1 Pro** leads artist_fuzzy (84.6%) with Gemini 3 Flash close behind (82.1%); Pro also edges title (56.4% vs 48.7%) and movement (56.4% vs 53.8%) at 4× the cost
- **Mini/Haiku tier** barely clears Vision-only (~46–49% vs 41%) — not viable for production identification
- **GPT-5.4** improves on GPT-4o (+7.7pp artist) but can't close the gap with Gemini on contemporary art
- **Claude** family lags Gemini at every tier; Haiku-4-5 is the weakest model overall
- Movement classification: 0% (Vision-only) → 41–56% with LLMs; Gemini 3.1 Pro leads at 56.4%
- Production baseline: `gemini-3-flash-preview` (best value), with `gemini-3.1-pro-preview` as high-accuracy option

---

## Pricing

| model | input $/MTok | output $/MTok | est. cost/1k calls* | artist_fuzzy |
|-------|-------------|--------------|---------------------|-----------------|
| gemini-3-flash-preview | $0.50 | $3.00 | ~$1.35 | **82.1%** |
| gpt-5.4-mini | $0.75 | $4.50 | ~$2.03 | 48.7% |
| claude-haiku-4-5 | $1.00 | $5.00 | ~$2.50 | 46.2% |
| gemini-3.1-pro-preview | $2.00 | $12.00 | ~$5.40 | **84.6%** |
| gpt-5.4 | $2.50 | $15.00 | ~$6.75 | 69.2% |
| claude-sonnet-4-5 | $3.00 | $15.00 | ~$7.50 | 61.5% |

> \* Estimated at ~1,500 input tokens (image + prompt) + ~200 output tokens per identification call. Actual token counts vary by image size and response length.

### Price vs. performance

| model | artist_fuzzy | est. cost/1k calls | value |
|-------|----------------|--------------------|-------|
| gemini-3-flash-preview | **82.1%** | ~$1.35 | ★★★★★ best accuracy, cheapest by far |
| gemini-3.1-pro-preview | **84.6%** | ~$5.40 | ★★★ +2.5pp over flash, 4× cost — title/movement edge too |
| gpt-5.4 | 69.2% | ~$6.75 | ★★ 5× more expensive than flash, 13pp lower accuracy |
| claude-sonnet-4-5 | 61.5% | ~$7.50 | ★★ most expensive, lowest accuracy among full models |
| gpt-5.4-mini | 48.7% | ~$2.03 | ★ cheap but only marginally beats Vision-only (41%) |
| claude-haiku-4-5 | 46.2% | ~$2.50 | ★ barely above Vision-only, worse than gpt-5.4-mini |

---

## Breakdown by difficulty (artist_fuzzy)

| model | easy (n=5) | medium (n=14) | hard (n=20) |
|-------|-----------|--------------|------------|
| gpt-4o | 100% | 86% | 35% |
| gpt-5.4 | 100% | 100% | 40% |
| gpt-5.4-mini | 80% | 64% | 30% |
| gemini-2.5-flash | 100% | 93% | 55% |
| gemini-3-flash | 100% | 100% | 65% |
| gemini-3.1-pro | 100% | 93% | **70%** |
| claude-sonnet-4 | 100% | 71% | 35% |
| claude-sonnet-4-5 | 100% | 71% | 45% |
| claude-haiku-4-5 | 60% | 64% | 30% |

Key observations:
- **Easy items**: nearly all models hit 100% — only haiku-4-5 stumbles (60%)
- **Medium items**: Gemini 3 Flash and GPT-5.4 both reach 100%; Claude models plateau at 71%
- **Hard items**: the biggest differentiator — Gemini 3.1 Pro leads at 70%, followed by Gemini 3 Flash (65%); mini/haiku tier bottoms out at 30%
- Hard items are the main reason to prefer Gemini over GPT/Claude at any tier

---

## Breakdown by category (artist_fuzzy)

| model | classics (n=7) | modern (n=11) | contemporary (n=19) |
|-------|---------------|--------------|---------------------|
| gpt-4o | 86% | 73% | 53% |
| gpt-5.4 | 86% | 91% | 53% |
| gpt-5.4-mini | 57% | 73% | 37% |
| gemini-2.5-flash | 86% | 91% | 68% |
| gemini-3-flash | 86% | **100%** | 74% |
| gemini-3.1-pro | 86% | **100%** | **79%** |
| claude-sonnet-4 | 57% | 73% | 53% |
| claude-sonnet-4-5 | 57% | 73% | 63% |
| claude-haiku-4-5 | 57% | 55% | 42% |

Key observations:
- **Classics**: all full models hit 86%; Claude models lag at 57% (misidentify sculptors, confuse similar works)
- **Modern**: Gemini 3 Flash and Pro both reach 100%; GPT-5.4 close at 91%; Claude plateaus at 73%
- **Contemporary**: the hardest category — widest spread between models (37%–79%). Gemini 3.1 Pro leads at 79%, followed closely by Gemini 3 Flash (74%). GPT-5.4 and GPT-4o both stall at 53% — they struggle specifically with installation and conceptual art
- **Claude on classics**: consistently weak — confuses Canova with Bernini, misidentifies Picasso's style-period works
- **GPT ceiling on contemporary**: GPT-5.4 matches GPT-4o exactly at 53% contemporary, suggesting the ceiling here is a training/knowledge issue not model scale

---

## Per-item results

| id | diff | GT artist | GT title | GT movement | GPT-4o ✓ | Gemini ✓ | Claude ✓ |
|----|------|-----------|----------|-------------|----------|----------|----------|
| c001 | medium | Antonio Canova | Theseus Defeats the Centaur | Neoclassicism | ✓ | ✓ | ✗ |
| c002 | hard | — | Cabinet of curiosities | — | — | — | — |
| c003 | easy | Caravaggio | David with the Head of Goliath | Baroque | ✓ | ✓ | ✓* |
| c004 | hard | Pablo Picasso | The Fourteenth of July | Post-Impressionism | ✓ | ✓ | ✗ |
| c005 | easy | Pieter Bruegel the Elder | The Tower of Babel | Northern Renaissance | ✓ | ✓ | ✓ |
| c006 | easy | Paul Cézanne | Mont Sainte-Victoire | Post-Impressionism | ✓ | ✓ | ✓ |
| c007 | medium | James Ensor | Christ's Entry Into Brussels in 1889 | Expressionism | ✓ | ✓ | ✓ |
| m001 | hard | Albert Gleizes | Painting for Contemplation… | Cubism | ✗ | ✗ | ✗ |
| m002 | medium | Frida Kahlo | Marxism Will Give Health to the Sick | Surrealism | ✗ | ✓ | ✗ |
| m003 | easy | Frida Kahlo | The Two Fridas | Surrealism | ✓ | ✓ | ✓ |
| m004 | medium | Frida Kahlo | Viva la Vida, Watermelons | Surrealism | ✓ | ✓ | ✓ |
| m005 | medium | Mark Rothko | No. 10 | Color Field | ✓ | ✓ | ✓ |
| m006 | medium | Robert Delaunay | Red Eiffel Tower | Cubism | ✓ | ✓ | ✗ |
| m007 | medium | Wassily Kandinsky | Improvisation 28 (second version) | Expressionism | ✓ | ✓ | ✓ |
| m008 | medium | David Hockney | Garden | Pop Art | ✓ | ✓ | ✓ |
| m009 | medium | Egon Schiele | Wally in a Red Blouse | Expressionism | ✓ | ✓ | ✓ |
| m010 | hard | Joseph Nicéphore Niépce | View from the Window at Le Gras | — | ✗ | ✓ | ✓ |
| m011 | medium | Wayne Thiebaud | Cakes | Pop Art | ✓ | ✓ | ✓ |
| co001 | hard | Anselm Kiefer | Die Welle (The Wave) | Neo-Expressionism | ✗ | ✓ | ✓ |
| co002 | hard | Christian Boltanski | Faire son temps… | Conceptual Art | ✗ | ✗ | ✗ |
| co003 | hard | Christian Boltanski | Storage Memory | Conceptual Art | ✓ | ✓ | ✓ |
| co004 | hard | Christian Boltanski | Storage Memory | Conceptual Art | ✓ | ✓ | ✗ |
| co005 | hard | Dorothy Napangardi | Yuparli | Fiber Art | ✗ | ✓ | ✗ |
| co006 | hard | Liao Fei | A Straight Line Extended | Conceptual Art | ✗ | ✗ | ✗ |
| co007 | hard | Mike Kelley | Riddle of the Sphinx | Conceptual Art | ✗ | ✗ | ✗ |
| co008 | hard | Piet Mondrian | Summer, Dune in Zeeland | Post-Impressionism | ✗ | ✗ | ✗ |
| co009 | medium | Ron Mueck | In Bed | Installation Art | ✓ | ✓ | ✓ |
| co010 | hard | James Turrell | Danae | Installation Art | ✓ | ✓ | ✓ |
| co011 | medium | Ai Weiwei | Grapes | Conceptual Art | ✓ | ✓ | ✓ |
| co012 | hard | Céleste Boursier-Mougenot | Clinamen | Installation Art | ✗ | ✗ | ✗ |
| co013 | hard | Chiharu Shiota | Diary | Installation Art | ✓ | ✓ | ✓ |
| co014 | hard | Katharina Grosse | Is It You? | Installation Art | ✗ | ✓ | ✗ |
| co015 | medium | Leandro Erlich | Swimming Pool | Installation Art | ✓ | ✓ | ✓ |
| co016 | easy | Marcel Duchamp | Fountain | Dada | ✓ | ✓ | ✓ |
| co017 | hard | Olafur Eliasson | Mediated Motion | Installation Art | ✓ | ✓ | ✓ |
| co018 | hard | Ruth Asawa | — | Fiber Art | ✓ | ✓ | ✓ |
| co019 | hard | Rinko Kawauchi | Ametsuchi | New Media Art | ✗ | ✗ | ✗ |
| al001 | medium | Kaspar von Zumbusch | Maria Theresa Monument | — | ✗ | ✗† | ✗ |
| e002 | hard | — | — | Street Art | — | — | — |

> \* c003 Claude: identified Caravaggio correctly but guessed wrong title (Madonna and Child with St. Anne).  
> † al001 Gemini: returned "Caspar von Zumbusch" — correct person, alternate transliteration. Fuzzy score passes (ratio=0.94); contains-match fails on "caspar" ≠ "kaspar".

---

## Artist predictions detail

| id | GT artist | GPT-4o | Gemini 2.5 Flash | Claude Sonnet 4 |
|----|-----------|--------|------------------|-----------------|
| c001 | Antonio Canova | Antonio Canova ✓ | Antonio Canova ✓ | Gian Lorenzo Bernini ✗ |
| c003 | Caravaggio | Caravaggio ✓ | Caravaggio ✓ | Caravaggio ✓ |
| c004 | Pablo Picasso | Pablo Picasso ✓ | Pablo Picasso ✓ | Frank Auerbach ✗ |
| c005 | Pieter Bruegel the Elder | Pieter Bruegel the Elder ✓ | Pieter Bruegel the Elder ✓ | Pieter Bruegel the Elder ✓ |
| m001 | Albert Gleizes | Maqbool Fida Husain ✗ | Sonia Delaunay ✗ | Wassily Kandinsky ✗ |
| m002 | Frida Kahlo | Diego Rivera ✗ | Frida Kahlo ✓ | Diego Rivera ✗ |
| m006 | Robert Delaunay | Robert Delaunay ✓ | Robert Delaunay ✓ | C.R.W. Nevinson ✗ |
| m010 | Joseph Nicéphore Niépce | Unknown artist ✗ | Nicéphore Niépce ✓ | Nicéphore Niépce ✓ |
| co001 | Anselm Kiefer | Alberto Burri ✗ | Anselm Kiefer ✓ | Anselm Kiefer ✓ |
| co002 | Christian Boltanski | Shilpa Gupta ✗ | Rafael Lozano-Hemmer ✗ | Jesús Rafael Soto ✗ |
| co004 | Christian Boltanski | Christian Boltanski ✓ | Christian Boltanski ✓ | El Anatsui ✗ |
| co005 | Dorothy Napangardi | Yayoi Kusama ✗ | Dorothy Napangardi ✓ | Joyce Hinterding ✗ |
| co007 | Mike Kelley | Sheila Hicks ✗ | Paola Pivi ✗ | Olga de Amaral ✗ |
| co008 | Piet Mondrian | Richard Diebenkorn ✗ | Richard Diebenkorn ✗ | Helen Frankenthaler ✗ |
| co012 | Céleste Boursier-Mougenot | Ryoji Ikeda ✗ | Olafur Eliasson ✗ | teamLab ✗ |
| co014 | Katharina Grosse | Sam Gilliam ✗ | Katharina Grosse ✓ | Katharina Fritsch ✗ |
| co019 | Rinko Kawauchi | Richard Misrach ✗ | Unknown Artist ✗ | Chris McCaw ✗ |
| al001 | Kaspar von Zumbusch | Carl von Hasenauer ✗ | Caspar von Zumbusch ✗† | Charles Garnier ✗ |

---

## Key observations

### Where all LLMs beat Vision-only
- **Installation art**: Vision returns 0%; LLMs correctly identify Turrell, Mueck, Shiota, Boltanski, Erlich, Eliasson.
- **Abstract / non-representational**: Rothko, Delaunay, Kandinsky — Vision returns generics; LLMs identify confidently.
- **Movement classification**: 0% → 41–54%. LLMs have art-historical knowledge Vision entirely lacks.

### Where all three LLMs fail
- **Early Mondrian** (co008): All three guess American abstract painters (Diebenkorn, Frankenthaler) — pre-grid Mondrian looks like color field abstraction.
- **Niche conceptual/installation** (co002, co006, co007, co012, co019): No distinctive visual signature; all models hallucinate plausible alternatives.
- **Fire/burn photography** (co019, Rinko Kawauchi): All see a controlled burn, guess landscape/land-art photographers.
- **Albert Gleizes** (m001): Hard cubist abstraction; all models guess different artists.
- **Christian Boltanski co004**: GPT and Gemini correctly identify; Claude guesses El Anatsui.

### Gemini vs GPT vs Claude
- **Gemini 2.5 Flash** leads artist ID (74.4%) and title (38.5%) — best overall
- **GPT-4o** leads movement classification (53.8%) — edge on less-common movement names
- **Claude Sonnet 4** trails on all metrics — particularly weak on hard contemporary items; confuses similar sculptors (Bernini for Canova), misses Frida Kahlo on the harder portrait
- Gemini-only wins: Napangardi, Anselm Kiefer co001, Niépce, Katharina Grosse
- Claude-only wins (shared with Gemini): Niépce, Anselm Kiefer co001 — but Claude misses co004 Boltanski where GPT/Gemini hit

---

## Scoring note

`artist_fuzzy` / `title_contains`: ground truth string appears anywhere in the predicted string (or vice versa), case-insensitive.  
`artist_fuzzy` / `title_fuzzy`: SequenceMatcher ratio ≥ 0.8.  
`movement_exact`: normalized exact match.  
Items with no ground truth field (c002 artist, e002 artist+title, al001 movement, m010 movement) are skipped for that field.  
Claude images were normalized to JPEG and downscaled below 3.7 MB raw (Claude API enforces 5 MB base64 limit ≈ 3.75 MB raw).

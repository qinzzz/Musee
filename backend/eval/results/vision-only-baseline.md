# Eval Baseline: vision-only (Google Vision Web Detection)

**Date:** 2026-04-23  
**Config:** `vision-only` — Google Cloud Vision Web Detection, no LLM  
**Dataset:** 39 items with ground truth (15 history items pending, skipped)  
**Result file:** `20260423_225727.json`  
**Scoring:** entities + best_guess labels + matching page titles

---

## Summary

| metric | score | n scored |
|--------|-------|----------|
| artist_contains | **41.0%** | 39 |
| title_contains | **30.8%** | 38 (co018 has no title) |
| artist_fuzzy | 0% | — |
| title_fuzzy | 0% | — |
| movement_exact | 0% | — |

> **Note:** an earlier run (entities + best_guess only, no page titles) scored artist_contains=33.3%. Adding page titles to the scoring surface raised artist by +7.7pp. Title was unaffected — titles tend to appear in webEntities when found at all, not only in page titles.

`fuzzy` and `movement_exact` are both 0% by design: Vision returns raw web entities, not structured artist/title strings or movement labels. `contains` is the meaningful metric here — it measures whether the correct answer appears anywhere in the entity list or best_guess label.

Movement classification is **not possible** with Vision alone. Vision has no art-historical concept of movements.

---

## Per-item results

| id | difficulty | GT artist | Vision entities / best_guess | artist ✓ | GT title | title ✓ | notes |
|----|-----------|-----------|------------------------------|----------|----------|---------|-------|
| c001 | medium | Antonio Canova | "classical sculpture" | ✗ | Theseus Defeats the Centaur | ✗ | Generic style description only |
| c002 | hard | — | "artificial flower" | — | Cabinet of curiosities | ✗ | Zoomed into a flower detail |
| c003 | easy | Caravaggio | entities: **Caravaggio**, "David with the Head of Goliath"; best_guess: "pray for paris vinyl" | **✓** | David with the Head of Goliath | **✓** | Best_guess hijacked by Westside Gunn album art — but entities still correct |
| c004 | hard | Pablo Picasso | "picture frame", Guggenheim | ✗ | The Fourteenth of July | ✗ | Zoomed into frame, no painting content visible |
| c005 | easy | Pieter Bruegel the Elder | entities: "The Tower of Babel"; best_guess: "bruegel tower of babel" | ✗ | The Tower of Babel | **✓** | Artist not in entities; title and best_guess very clear |
| c006 | easy | Paul Cézanne | entities: "Mont Sainte-Victoire", "Post-Impressionism"; best_guess: "paul cézanne paintings" | **✓** | Mont Sainte-Victoire | **✓** | Correctly identifies both in best_guess |
| c007 | medium | James Ensor | entities: "Christ's Entry Into Brussels in 1889"; best_guess: "james ensor the entry of christ into brussels in 1889" | **✓** | Christ's Entry Into Brussels in 1889 | **✓** | Best_guess is near-perfect — very well indexed work |
| m001 | hard | Albert Gleizes | "The Museum of Modern Art", "Giant Soft Fan", "Woman I" | ✗ | Painting for Contemplation… | ✗ | Confused with other MoMA works |
| m002 | medium | Frida Kahlo | entities: **"Marxism Will Give Health to the Sick"**; best_guess: "Frida Kahlo" | **✓** | Marxism Will Give Health to the Sick | **✓** | Title in entities, artist in best_guess |
| m003 | easy | Frida Kahlo | entities: "The Two Fridas", "Frida Kahlo"; best_guess: "two fridas" | **✓** | The Two Fridas | **✓** | Clean hit on both |
| m004 | medium | Frida Kahlo | entities: "Viva la Vida, Watermelons"; best_guess: "viva la vida frida kahlo" | **✓** | Viva la Vida, Watermelons | **✓** | Clean hit on both |
| m005 | medium | Mark Rothko | "Art", "Painting" only | ✗ | No. 10 | ✗ | Abstract color field — no web matches |
| m006 | medium | Robert Delaunay | entities: "Orphism", "Cubism", "Eiffel Tower"; best_guess: "Robert Delaunay" | **✓** | Red Eiffel Tower | ✗ | Artist in best_guess; title "Red Eiffel Tower" not surfaced |
| m007 | medium | Wassily Kandinsky | entities: "Improvisation 28 (second version)"; best_guess: "improvisación 28 1912 wassily kandinsky" | **✓** | Improvisation 28 (second version) | **✓** | Best_guess in Spanish but contains both artist and title |
| m008 | medium | David Hockney | best_guess: "david hockney garden 2015" | **✓** | Garden | **✓** | Best_guess is essentially the answer |
| m009 | medium | Egon Schiele | entities: "Portrait of Wally", "Expressionism"; best_guess: "egon schiele paintings" | **✓** | Wally in a Red Blouse | ✗ | Artist in best_guess; wrong title ("Portrait of Wally" not "Wally in a Red Blouse") |
| m010 | hard | Joseph Nicéphore Niépce | entities: "View from the Window at Le Gras", "Heliography"; best_guess: "world's first photograph" | ✗ | View from the Window at Le Gras | **✓** | Title in entities; artist not surfaced at all |
| m011 | medium | Wayne Thiebaud | entities: "Cakes", "Pop art"; best_guess: "wayne thiebaud cakes 1963" | **✓** | Cakes | **✓** | Best_guess is near-perfect; even includes year |
| co001 | hard | Anselm Kiefer | "Art", "Painting" only | ✗ | Die Welle (The Wave) | ✗ | No web matches for this specific work |
| co002 | hard | Christian Boltanski | "Lighting" only | ✗ | Faire son temps… | ✗ | Light installation — Vision sees only the light fixture |
| co003 | hard | Christian Boltanski | "Lighting" only | ✗ | Storage Memory | ✗ | Same as co002 |
| co004 | hard | Christian Boltanski | "Architecture" | ✗ | Storage Memory | ✗ | Different angle, saw architectural framing |
| co005 | hard | Dorothy Napangardi | "Painting", "Modern art" | ✗ | Yuparli | ✗ | Indigenous dot painting — no indexing |
| co006 | hard | Liao Fei | "Floor" | ✗ | A Straight Line Extended | ✗ | Floor installation seen as just a floor |
| co007 | hard | Mike Kelley | "Room", "Bedroom", "Hotel" | ✗ | Riddle of the Sphinx | ✗ | Room-based installation, no art context |
| co008 | hard | Piet Mondrian | "Art", "Painting", "Modern art" | ✗ | Summer, Dune in Zeeland | ✗ | Early Mondrian — no indexing without grid style |
| co009 | medium | Ron Mueck | "Mattress", "Sheet", "Bed" | ✗ | In Bed | ✗ | Correctly describes the visual but no art context |
| co010 | hard | James Turrell | "Ceiling Fixture", "Fluorescent lamp" | ✗ | Danae | ✗ | Light room seen as a ceiling lamp |
| co011 | medium | Ai Weiwei | best_guess: "ai weiwei art"; entities: "Dropping a Han Dynasty Urn", "Sunflower Seeds" | **✓** | Grapes | ✗ | Artist found; but Vision matched wrong Ai Weiwei works |
| co012 | hard | Céleste Boursier-Mougenot | "Audience" | ✗ | Clinamen | ✗ | Saw the gallery audience, not the installation |
| co013 | hard | Chiharu Shiota | "Painting", "Acrylic Paint" | ✗ | Diary | ✗ | Diary notebooks read as generic painting |
| co014 | hard | Katharina Grosse | "Anime", "Manga", "Illustration" | ✗ | Is It You? | ✗ | Bold spray colors misread as anime art |
| co015 | medium | Leandro Erlich | entities: **"Leandro Erlich"**, "Leandro Erlich: Swimming Pool"; best_guess: "leandro erlich swimming pool" | **✓** | Swimming Pool | **✓** | Viral installation — excellent hit, artist+title both clean |
| co016 | easy | Marcel Duchamp | "Window" | ✗ | Fountain | ✗ | Photo angle makes urinal look like a window — bad shot |
| co017 | hard | Olafur Eliasson | entities: "Kunsthaus Bregenz"; best_guess: "gunther vogt landscape architecture" | ✗ | Mediated Motion | ✗ | Attributed to the venue's landscape architect, not Eliasson |
| co018 | hard | Ruth Asawa | (empty entities); best_guess: "motif" | ✗ | — | — | Zero entities returned — Vision couldn't process the image |
| co019 | hard | Rinko Kawauchi | entities: "照度 あめつち 影を見る" (Japanese), "Tokyo Photographic Art Museum"; best_guess: "hill" | ✗ | Ametsuchi | ✗ | Japanese text entity contains "あめつち" (Ametsuchi) — missed by scoring because scoring is Latin-script only |
| al001 | medium | Kaspar von Zumbusch | "Façade", "Window", "Building" | ✗ | Maria Theresa Monument | ✗ | Photo likely shows the building backdrop not the statue |
| e002 | hard | — | entities: "Street art"; best_guess: "street art" | — | — | — | Correctly categorized as Street Art |

---

## Key observations

### What Vision is good at
- **Highly indexed famous works**: Frida Kahlo (3/3), Kandinsky, Wayne Thiebaud, Leandro Erlich — best_guess is often essentially the correct answer
- **`best_guess_labels` > `webEntities`**: For famous works, best_guess tends to be a rich descriptive search phrase (e.g. "wayne thiebaud cakes 1963") while webEntities lists components. Best_guess should be weighted higher when injecting hints into LLM prompts.
- **Non-art detection**: Correctly identified the street poster as "Street Art"

### Systematic failures
- **Installation art (0%)**: Light, floor, fabric, room-based installations are described by their visual components ("fluorescent lamp", "floor", "mattress") with no art context. Vision cannot distinguish art from object.
- **Abstract/non-representational works**: Rothko, Mondrian early, Kiefer — returns "Art, Painting" generics when there are no web-matched images.
- **Under-indexed contemporary works**: Boltanski, Liao Fei, Grosse, Napangardi — either too few online occurrences or images differ enough from what's indexed.
- **Movement classification**: 0% — not possible with Vision alone. Vision has no knowledge of art movements.

### Interesting anomalies
- **Caravaggio / Westside Gunn**: `best_guess` returned "pray for paris vinyl" (the hip-hop album that uses this painting as cover art), but `webEntities` still surfaced "Caravaggio" and "David with the Head of Goliath". Demonstrates why entities must be checked beyond best_guess alone.
- **Kandinsky in Spanish**: best_guess returned "improvisación 28 1912 wassily kandinsky" — correct answer in Spanish from a Spanish-language page. The scoring handles this because it uses contains-matching on the normalized entity text.
- **Rinko Kawauchi / Japanese entities**: Entity "照度 あめつち 影を見る" contains "あめつち" (= Ametsuchi) in Japanese. Scoring missed this — Latin-script matching doesn't cover CJK characters. A future improvement would be to check romanized transliterations.
- **Duchamp Fountain**: Rated "easy" but Vision returned "Window" — the photo angle is likely to blame. Worth re-photographing.
- **co018 Ruth Asawa**: Zero entities returned. Vision API may have failed to process the wire sculpture image or the image is too abstract/low-contrast.

### Implication for `vision + model` configs
Vision's main value as a hint is in `best_guess_labels` for well-known works. For the `gpt+vision`, `gemini+vision`, `claude+vision` configs, the hint injection should:
1. Prioritize `best_guess_labels` over raw entities
2. Include the top 3–5 entities as supporting context
3. Not inject anything for items where Vision returned only generic labels ("Art", "Painting", "Modern art") — this adds noise without signal

---

## Scoring note on `movement_exact = 0%`

This is expected and not a flaw. Google Vision Web Detection returns web entities and page matches — it has no concept of art historical movements. Movement classification requires an LLM. The `vision-only` config is useful as an artist/title identification tool, not a movement classifier.

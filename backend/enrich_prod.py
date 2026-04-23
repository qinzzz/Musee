"""One-shot script to backfill movement + period_bucket for prod artworks."""
import os, sys, json, re, asyncio
sys.path.insert(0, '.')

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork
from app.utils.prompt_loader import get_movement_names
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=os.environ['OPENAI_API_KEY'])
movement_names = get_movement_names()

PROMPT = """Given this artwork analysis, return ONLY valid JSON with two fields:
- "movement": pick the single closest match from: {movements}. Use "Unknown" if nothing fits.
- "period_bucket": one of "Historical" (pre-1900), "Modern" (1900-1970), "Contemporary" (1970-2010), "Now" (2010-present)

Artist: {artist}
Analysis: {analysis}

JSON only, no other text."""

async def infer(artist, analysis):
    prompt = PROMPT.format(
        movements=movement_names,
        artist=artist or "",
        analysis=(analysis or "")[:800]
    )
    resp = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=60,
        temperature=0.1,
    )
    text = resp.choices[0].message.content.strip()
    m = re.search(r'\{[^}]+\}', text, re.DOTALL)
    if m:
        return json.loads(m.group())
    return None

async def main():
    db = SessionLocal()
    artworks = db.query(SavedArtwork).filter(
        SavedArtwork.movement == None,
        SavedArtwork.analysis != None
    ).all()
    print(f"Enriching {len(artworks)} artworks...")

    done = 0
    for i, aw in enumerate(artworks):
        try:
            result = await infer(aw.artist_name, aw.analysis)
            if result:
                aw.movement = result.get("movement")
                aw.period_bucket = result.get("period_bucket")
                done += 1
                print(f"  [{i+1}] {aw.artist_name} → {aw.movement} / {aw.period_bucket}")
            if (i + 1) % 10 == 0:
                db.commit()
        except Exception as e:
            print(f"  Failed {aw.id}: {e}")

    db.commit()
    db.close()
    print(f"\nDone. {done}/{len(artworks)} enriched.")

asyncio.run(main())

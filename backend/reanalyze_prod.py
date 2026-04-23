"""
Re-analyze existing prod artworks using the updated identification prompt.
Downloads each image from storage, runs it through the current AI pipeline,
and updates artist_name, artwork_name, analysis, movement, period_bucket, date, medium.

Usage:
  set -a && source ../.env.local && set +a
  ENV=prod venv/bin/python reanalyze_prod.py [--limit N] [--only-unknown]
"""
import os, sys, json, re, asyncio, argparse, httpx
sys.path.insert(0, '.')

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork
from app.services.ai_service import AIService, ARTWORK_ANALYSIS_SCHEMA
from app.services.openai_api_client import OpenAIAPIClient
from app.config.settings import settings

PERIOD_LABELS = {"Unknown", "Historical", "Modern", "Contemporary", "Now"}


async def fetch_image(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content


def parse_response(text: str) -> dict:
    json_str = text
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if m:
        json_str = m.group(1).strip()
    try:
        return json.loads(json_str)
    except Exception:
        return {}


async def reanalyze(aw: SavedArtwork, service: AIService) -> dict | None:
    uri = aw.photo_uri
    if not uri:
        return None
    # Resolve relative URIs to full URLs
    if not uri.startswith('http'):
        base = settings.base_url.rstrip('/') if hasattr(settings, 'base_url') else ''
        uri = f"{base}/{uri.lstrip('/')}"

    try:
        image_bytes = await fetch_image(uri)
    except Exception as e:
        print(f"  [SKIP] {aw.id} — image fetch failed: {e}")
        return None

    try:
        response = await service.identify_artist(image_bytes)
        return parse_response(response)
    except Exception as e:
        print(f"  [FAIL] {aw.id} — AI call failed: {e}")
        return None


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0, help='Max artworks to process (0 = all)')
    parser.add_argument('--only-unknown', action='store_true',
                        help='Only re-process artworks with Unknown or missing movement')
    args = parser.parse_args()

    # Use power model — re-analysis should be at least as good as original identification
    model = settings.ai_model_power or "gpt-4o"
    service = AIService(OpenAIAPIClient(model=model))

    db = SessionLocal()
    # Only artworks with server-accessible HTTP URIs (R2 / Vercel Blob)
    query = db.query(SavedArtwork).filter(
        SavedArtwork.is_recognized == 1,
        SavedArtwork.photo_uri.like('http%'),
    )

    if args.only_unknown:
        query = query.filter(
            (SavedArtwork.movement == None) |
            (SavedArtwork.movement == 'Unknown') |
            (SavedArtwork.movement.in_(list(PERIOD_LABELS)))
        )

    if args.limit:
        query = query.limit(args.limit)

    artworks = query.all()
    print(f"Re-analyzing {len(artworks)} artworks (model={model})...")

    done = 0
    for i, aw in enumerate(artworks):
        parsed = await reanalyze(aw, service)
        if not parsed:
            continue

        old_mv = aw.movement
        UNKNOWN_ARTIST = {'unknown artist', 'unknown', 'unknown artist (anonymous)', ''}

        # Only update artist_name if the new value is a real identification (not a generic "Unknown")
        new_artist = (parsed.get('artist') or '').strip()
        if new_artist and new_artist.lower() not in UNKNOWN_ARTIST:
            aw.artist_name = new_artist

        aw.artwork_name = parsed.get('title') or aw.artwork_name
        if parsed.get('description'):
            aw.analysis = parsed['description']
        if parsed.get('date'):
            aw.params = {**(aw.params or {}), 'date': parsed['date']}
        if parsed.get('medium'):
            aw.params = {**(aw.params or {}), 'medium': parsed['medium']}

        # Only update movement if it's a real movement name, not a period label
        new_mv = (parsed.get('movement') or '').strip()
        if new_mv and new_mv not in PERIOD_LABELS:
            aw.movement = new_mv
        new_pb = (parsed.get('period_bucket') or '').strip()
        if new_pb:
            aw.period_bucket = new_pb

        done += 1
        print(f"  [{i+1}/{len(artworks)}] {aw.artist_name} | {old_mv} → {aw.movement} / {aw.period_bucket}")

        if done % 5 == 0:
            db.commit()
            print(f"  -- committed {done} so far --")

    db.commit()
    db.close()
    print(f"\nDone. {done}/{len(artworks)} updated.")


asyncio.run(main())

"""
Re-identify all web-uploaded artworks with gpt-5.4 (power model).
Updates: artist_name, artwork_name, movement, period_bucket.
Does NOT overwrite: analysis text, tags, date, medium.

Usage:
  set -a && source ../.env.local && set +a
  ENV=prod venv/bin/python update_identifications.py [--limit N] [--dry-run]
"""
import os, sys, json, re, asyncio, argparse, httpx
sys.path.insert(0, '.')

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork
from app.services.ai_service import AIService, ARTWORK_ANALYSIS_SCHEMA
from app.services.openai_api_client import OpenAIAPIClient
from app.config.settings import settings

PERIOD_LABELS = {"Unknown", "Historical", "Modern", "Contemporary", "Now"}
UNKNOWN_NAMES = {"unknown", "unknown artist", "unknown artist (anonymous)", "n/a", ""}


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


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--dry-run', action='store_true', help='Print changes without writing to DB')
    args = parser.parse_args()

    model = settings.ai_model_power or "gpt-4o"
    print(f"Using model: {model}")
    service = AIService(OpenAIAPIClient(model=model))

    db = SessionLocal()
    query = db.query(SavedArtwork).filter(
        SavedArtwork.is_recognized == 1,
        SavedArtwork.photo_uri.like('http%'),
    )
    if args.limit:
        query = query.limit(args.limit)

    artworks = query.order_by(SavedArtwork.session_id, SavedArtwork.created_at).all()
    total = len(artworks)
    print(f"Processing {total} artworks (grouped by session)...\n")

    # Build session groups so we can pass prior identifications as context
    from collections import defaultdict
    session_groups: dict = defaultdict(list)
    for aw in artworks:
        session_groups[aw.session_id or aw.id].append(aw)

    done = 0
    idx = 0
    for session_key, group in session_groups.items():
        if len(group) > 1:
            print(f"\n  [session {session_key[:8]}] {len(group)} artworks")
        session_identified: list = []

        for aw in group:
            idx += 1
            try:
                image_bytes = await fetch_image(aw.photo_uri)
            except Exception as e:
                print(f"  [{idx}/{total}] SKIP {aw.id[:8]} — fetch failed: {e}")
                continue

            session_context = {"previous_artworks": session_identified} if session_identified else None

            try:
                response = await service.identify_artist(image_bytes, session_context=session_context)
                parsed = parse_response(response)
            except Exception as e:
                print(f"  [{idx}/{total}] FAIL {aw.id[:8]} — AI error: {e}")
                continue

            if not parsed:
                print(f"  [{idx}/{total}] SKIP {aw.id[:8]} — empty response")
                continue

            new_artist = (parsed.get('artist') or '').strip()
            new_title  = (parsed.get('title')  or '').strip()
            new_mv     = (parsed.get('movement') or '').strip()
            new_pb     = (parsed.get('period_bucket') or '').strip()

            changes = []
            if new_artist and new_artist.lower() not in UNKNOWN_NAMES and new_artist != aw.artist_name:
                changes.append(f"artist: '{aw.artist_name}' → '{new_artist}'")
            if new_title and new_title != aw.artwork_name:
                changes.append(f"title: '{aw.artwork_name}' → '{new_title}'")
            if new_mv and new_mv not in PERIOD_LABELS and new_mv != aw.movement:
                changes.append(f"movement: '{aw.movement}' → '{new_mv}'")
            if new_pb and new_pb != aw.period_bucket:
                changes.append(f"period: '{aw.period_bucket}' → '{new_pb}'")

            if changes:
                print(f"  [{idx}/{total}] {aw.id[:8]}")
                for c in changes:
                    print(f"    {c}")
            else:
                print(f"  [{idx}/{total}] {aw.artist_name} — no changes")

            if not args.dry_run:
                if new_artist and new_artist.lower() not in UNKNOWN_NAMES:
                    aw.artist_name = new_artist
                if new_title:
                    aw.artwork_name = new_title
                if new_mv and new_mv not in PERIOD_LABELS:
                    aw.movement = new_mv
                if new_pb:
                    aw.period_bucket = new_pb

            # Add to session context for next artwork in this session
            session_identified.append({
                "artist": aw.artist_name,
                "title":  aw.artwork_name,
                "analysis": (aw.analysis or '')[:300],
                "tags": [],
            })

            done += 1
            if not args.dry_run and done % 5 == 0:
                db.commit()
                print(f"  -- committed {done} --")

    if not args.dry_run:
        db.commit()
    db.close()
    print(f"\nDone. {done}/{total} processed.")


asyncio.run(main())

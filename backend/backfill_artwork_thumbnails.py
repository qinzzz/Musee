"""Generate missing thumbnail derivatives for existing active artworks.

The job is idempotent and commits one artwork at a time so it can be resumed.
Use --limit for a small production canary before running the full backfill.
"""

from __future__ import annotations

import argparse
import asyncio

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork
from app.services.artwork_analysis_service import load_stored_image_bytes
from app.services.artwork_image_service import save_artwork_thumbnail


async def backfill(
    *,
    limit: int | None = None,
    batch_size: int = 50,
) -> tuple[int, int]:
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1")

    completed = 0
    failed = 0
    last_artwork_id: str | None = None

    while limit is None or completed + failed < limit:
        remaining = None if limit is None else limit - completed - failed
        current_batch_size = batch_size if remaining is None else min(batch_size, remaining)
        with SessionLocal() as db:
            query = db.query(SavedArtwork.id).filter(
                SavedArtwork.thumbnail_uri.is_(None),
                SavedArtwork.active_filter(),
            )
            if last_artwork_id is not None:
                query = query.filter(SavedArtwork.id > last_artwork_id)
            artwork_ids = [
                artwork_id
                for (artwork_id,) in query.order_by(SavedArtwork.id.asc()).limit(current_batch_size).all()
            ]

        if not artwork_ids:
            break

        for artwork_id in artwork_ids:
            with SessionLocal() as db:
                artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
                if artwork is None or artwork.thumbnail_uri is not None or artwork.deleted_at is not None:
                    continue
                try:
                    image_bytes = await load_stored_image_bytes(
                        artwork.photo_uri,
                        failure_detail="Could not load stored artwork for thumbnail backfill",
                    )
                    thumbnail_uri = await save_artwork_thumbnail(
                        image_bytes,
                        artwork.user_id or artwork.device_id or "anonymous",
                    )
                    if not thumbnail_uri:
                        raise RuntimeError("thumbnail storage failed")
                    artwork.thumbnail_uri = thumbnail_uri
                    db.commit()
                    completed += 1
                    print(f"thumbnail ready: {artwork_id}")
                except Exception as exc:
                    db.rollback()
                    failed += 1
                    print(f"thumbnail failed: {artwork_id}: {exc}")

        last_artwork_id = artwork_ids[-1]

    return completed, failed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most this many missing thumbnails.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Number of artwork IDs fetched per database batch.",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    completed, failed = await backfill(limit=args.limit, batch_size=args.batch_size)
    print(f"backfill complete: {completed} generated, {failed} failed")


if __name__ == "__main__":
    asyncio.run(main())

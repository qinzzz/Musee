"""Read-only: museum-resolution bucket distribution from artwork_events.

The resolver leaves one `museum_resolution` ArtworkEvent per attempt. This reads
them back and prints the outcome distribution, so you can see resolution quality
in prod over time and prioritize enhancements by evidence (e.g. is
`distance`+`legacy_artwork_location` common → accuracy-gating worth it?).

Read-only. Aggregates in Python (portable across sqlite/postgres).

Usage (from backend/):
    ENV=prod ... python scripts/museum_resolution_stats.py            # all time
    ENV=prod ... python scripts/museum_resolution_stats.py --days 7   # last 7 days
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timedelta

sys.path.insert(0, ".")

from app.database.connection import SessionLocal
from app.database.models import ArtworkEvent
from app.services.artwork_event_service import ARTWORK_EVENT_MUSEUM_RESOLUTION


def resolution_stats(session_factory, *, days: int | None = None) -> dict:
    with session_factory() as db:
        query = db.query(ArtworkEvent).filter(
            ArtworkEvent.event_type == ARTWORK_EVENT_MUSEUM_RESOLUTION
        )
        if days:
            # created_at is naive UTC (server_default now()), matching utcnow().
            query = query.filter(ArtworkEvent.created_at >= datetime.utcnow() - timedelta(days=days))
        rows = query.all()

    by_bucket: Counter = Counter()
    by_bucket_source: Counter = Counter()
    associated = 0
    for row in rows:
        payload = row.payload or {}
        bucket = payload.get("bucket") or "unknown"
        source = payload.get("evidence_source") or "unknown"
        by_bucket[bucket] += 1
        by_bucket_source[(bucket, source)] += 1
        if payload.get("associated"):
            associated += 1

    total = len(rows)
    return {
        "total": total,
        "associated": associated,
        "association_rate": round(associated / total, 3) if total else None,
        "by_bucket": dict(by_bucket.most_common()),
        "by_bucket_source": {f"{b}|{s}": n for (b, s), n in by_bucket_source.most_common()},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Museum-resolution bucket distribution (read-only).")
    parser.add_argument("--days", type=int, default=0, help="0 = all time")
    args = parser.parse_args()
    print(json.dumps(resolution_stats(SessionLocal, days=args.days or None), indent=2))


if __name__ == "__main__":
    main()

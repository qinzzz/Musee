"""
Production backfill: copy legacy saved_artworks.session_id links into session_artworks

Run against PROD:
    ENV=prod python migrations/20260610_backfill_session_artworks.py

Run against DEV:
    python migrations/20260610_backfill_session_artworks.py
"""

import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from app.config.settings import settings
from app.database.models import SavedArtwork, SessionArtwork


def run() -> None:
    url = settings.effective_database_url
    print(f"Target DB: {url[:60]}...")
    engine = create_engine(url)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        legacy_session_ids = [
            session_id
            for (session_id,) in (
                db.query(SavedArtwork.session_id)
                .filter(SavedArtwork.session_id.isnot(None))
                .distinct()
                .all()
            )
            if session_id
        ]

        inserted = 0
        skipped_existing = 0

        for session_id in legacy_session_ids:
            current_max = (
                db.query(func.max(SessionArtwork.sequence_number))
                .filter(SessionArtwork.session_id == session_id)
                .scalar()
                or 0
            )

            legacy_artworks = (
                db.query(SavedArtwork)
                .filter(SavedArtwork.session_id == session_id)
                .order_by(SavedArtwork.created_at.asc(), SavedArtwork.id.asc())
                .all()
            )

            next_sequence = current_max + 1
            for artwork in legacy_artworks:
                existing = (
                    db.query(SessionArtwork)
                    .filter(
                        SessionArtwork.session_id == session_id,
                        SessionArtwork.artwork_id == artwork.id,
                    )
                    .first()
                )
                if existing:
                    skipped_existing += 1
                    continue

                db.add(
                    SessionArtwork(
                        id=str(uuid.uuid4()),
                        session_id=session_id,
                        artwork_id=artwork.id,
                        sequence_number=next_sequence,
                        source="camera",
                    )
                )
                next_sequence += 1
                inserted += 1

        db.commit()

    print(f"✓ Backfill complete — inserted {inserted} links, skipped {skipped_existing} existing links")


if __name__ == "__main__":
    run()

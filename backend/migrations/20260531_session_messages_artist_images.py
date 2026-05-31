"""
Production migration: session_messages table + artist profile images

Changes:
1. CREATE TABLE session_messages  — unified session conversation store
2. ALTER TABLE artist_entities ADD COLUMN profile_image_url
3. Backfill profile_image_url for all artists with bio_status='done'

Run against PROD:
    ENV=prod python migrations/20260531_session_messages_artist_images.py

Run against DEV:
    python migrations/20260531_session_messages_artist_images.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.config.settings import settings
from app.database.models import ArtistEntity
from app.services.wikidata_service import get_artist_info_from_wiki


def run_schema(engine):
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS session_messages (
                id              VARCHAR PRIMARY KEY,
                session_id      VARCHAR NOT NULL
                                    REFERENCES sessions(id) ON DELETE CASCADE,
                role            VARCHAR(10) NOT NULL,
                type            VARCHAR(20) NOT NULL DEFAULT 'text',
                content         TEXT,
                artwork_id      VARCHAR
                                    REFERENCES saved_artworks(id) ON DELETE SET NULL,
                sequence_number INTEGER NOT NULL,
                created_at      TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_session_messages_session_id
                ON session_messages(session_id)
        """))
        print("  ✓ session_messages table ready")

        conn.execute(text("""
            ALTER TABLE artist_entities
                ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR
        """))
        print("  ✓ artist_entities.profile_image_url column ready")

        conn.commit()


async def run_backfill(engine):
    Session = sessionmaker(bind=engine)
    with Session() as db:
        artists = (
            db.query(ArtistEntity)
            .filter(
                ArtistEntity.bio_status == "done",
                ArtistEntity.profile_image_url.is_(None),
            )
            .all()
        )
        print(f"  Backfilling {len(artists)} artists...")
        updated = 0
        for artist in artists:
            try:
                data = await get_artist_info_from_wiki(artist.display_name)
                if data and data.get("profile_image_url"):
                    artist.profile_image_url = data["profile_image_url"]
                    updated += 1
                    print(f"    ✓ {artist.display_name}")
                else:
                    print(f"    – {artist.display_name} (no image found)")
            except Exception as e:
                print(f"    ✗ {artist.display_name}: {e}")
        db.commit()
        print(f"  ✓ Backfill complete — {updated}/{len(artists)} artists updated")


def run():
    url = settings.effective_database_url
    print(f"Target DB: {url[:60]}...")
    engine = create_engine(url)

    print("\n── Schema migrations ──")
    run_schema(engine)

    print("\n── Artist image backfill ──")
    asyncio.run(run_backfill(engine))

    print("\nAll done.")


if __name__ == "__main__":
    run()

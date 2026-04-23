"""
Migration: add movement and period_bucket columns to saved_artworks.
Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS).
"""
import os
import sys
sys.path.append(os.getcwd())

from app.database.connection import SessionLocal
from sqlalchemy import text


def migrate():
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS movement VARCHAR"
        ))
        db.execute(text(
            "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS period_bucket VARCHAR"
        ))
        db.commit()
        print("Migration complete: movement and period_bucket columns added to saved_artworks.")
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate()

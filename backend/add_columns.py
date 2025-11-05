#!/usr/bin/env python3
"""Add location and museum_name columns to saved_artworks table"""

from app.database.connection import engine
from sqlalchemy import text

def add_columns():
    """Add new columns to saved_artworks table"""
    print("Adding new columns to saved_artworks table...")
    print("=" * 60)

    with engine.connect() as conn:
        try:
            # Add location column
            conn.execute(text("""
                ALTER TABLE saved_artworks
                ADD COLUMN IF NOT EXISTS location VARCHAR
            """))
            print("✓ Added column: location")

            # Add museum_name column
            conn.execute(text("""
                ALTER TABLE saved_artworks
                ADD COLUMN IF NOT EXISTS museum_name VARCHAR
            """))
            print("✓ Added column: museum_name")

            conn.commit()
            print("\n✓ Schema migration completed successfully!")

        except Exception as e:
            print(f"✗ Error: {e}")
            conn.rollback()

    print("=" * 60)

if __name__ == "__main__":
    add_columns()

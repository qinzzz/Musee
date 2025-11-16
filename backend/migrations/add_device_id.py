"""
Database migration script to add device_id column to saved_artworks table

This script adds the device_id column to existing database.
Run this script once to migrate existing databases.

Usage:
    cd backend
    python migrations/add_device_id.py
"""

import sqlite3
import os
from pathlib import Path

# Get the backend directory (parent of migrations)
backend_dir = Path(__file__).parent.parent
db_path = backend_dir / "musee.db"

def migrate():
    """Add device_id column to saved_artworks table"""

    if not db_path.exists():
        print(f"Database not found at {db_path}")
        print("No migration needed - database will be created with device_id column")
        return

    print(f"Migrating database at {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if table exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='saved_artworks'
        """)
        if not cursor.fetchone():
            print("✓ saved_artworks table doesn't exist yet")
            print("  Table will be created with device_id column on first backend run")
            return

        # Check if device_id column already exists
        cursor.execute("PRAGMA table_info(saved_artworks)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'device_id' in columns:
            print("✓ device_id column already exists, no migration needed")
            return

        # Add device_id column
        print("Adding device_id column to saved_artworks table...")
        cursor.execute("""
            ALTER TABLE saved_artworks
            ADD COLUMN device_id TEXT
        """)

        conn.commit()
        print("✓ Successfully added device_id column")

        # Show statistics
        cursor.execute("SELECT COUNT(*) FROM saved_artworks")
        count = cursor.fetchone()[0]
        print(f"  Total artworks in database: {count}")

        cursor.execute("SELECT COUNT(*) FROM saved_artworks WHERE device_id IS NOT NULL")
        with_device_id = cursor.fetchone()[0]
        print(f"  Artworks with device_id: {with_device_id}")

    except Exception as e:
        print(f"✗ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Database Migration: Add device_id column")
    print("=" * 60)
    migrate()
    print("=" * 60)
    print("Migration complete!")
    print("=" * 60)

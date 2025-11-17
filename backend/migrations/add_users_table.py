"""
Database migration script to create users table and update saved_artworks

This script:
1. Creates the users table
2. Updates saved_artworks.user_id to be a foreign key to users.user_id
3. Migrates existing device_id data to users table

Usage:
    cd backend
    python migrations/add_users_table.py
"""

import sqlite3
import os
from pathlib import Path
import uuid
from datetime import datetime

# Get the backend directory (parent of migrations)
backend_dir = Path(__file__).parent.parent
db_path = backend_dir / "musee.db"

def migrate():
    """Create users table and migrate existing data"""

    if not db_path.exists():
        print(f"Database not found at {db_path}")
        print("No migration needed - database will be created with users table on first backend run")
        return

    print(f"Migrating database at {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if users table already exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='users'
        """)
        if cursor.fetchone():
            print("✓ users table already exists, no migration needed")
            return

        # Create users table
        print("Creating users table...")
        cursor.execute("""
            CREATE TABLE users (
                user_id TEXT PRIMARY KEY,
                username TEXT UNIQUE,
                email TEXT UNIQUE,
                device_id TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                settings TEXT
            )
        """)
        print("✓ Created users table")

        # Check if saved_artworks table exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='saved_artworks'
        """)
        if not cursor.fetchone():
            print("\n✓ saved_artworks table doesn't exist yet")
            print("  No data to migrate")
            conn.commit()
            return

        # Get all unique device_ids from saved_artworks
        cursor.execute("""
            SELECT DISTINCT device_id
            FROM saved_artworks
            WHERE device_id IS NOT NULL
        """)
        device_ids = [row[0] for row in cursor.fetchall()]

        if device_ids:
            print(f"\nMigrating {len(device_ids)} unique device(s) to users table...")

            for device_id in device_ids:
                user_id = str(uuid.uuid4())
                cursor.execute("""
                    INSERT INTO users (user_id, device_id, created_at, last_active)
                    VALUES (?, ?, ?, ?)
                """, (user_id, device_id, datetime.now(), datetime.now()))

                # Update saved_artworks to link to the new user
                cursor.execute("""
                    UPDATE saved_artworks
                    SET user_id = ?
                    WHERE device_id = ?
                """, (user_id, device_id))

                print(f"  ✓ Created user for device_id: {device_id[:8]}...")

        # SQLite doesn't support ALTER TABLE to add foreign key constraints
        # to existing tables, but the new schema will have the constraint
        print("\nNote: Foreign key constraint will be enforced in new database schema")

        conn.commit()
        print("\n✓ Successfully migrated to users table")

        # Show statistics
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        print(f"  Total users: {user_count}")

        cursor.execute("SELECT COUNT(*) FROM saved_artworks")
        artwork_count = cursor.fetchone()[0]
        print(f"  Total artworks: {artwork_count}")

        cursor.execute("""
            SELECT COUNT(*)
            FROM saved_artworks
            WHERE user_id IS NOT NULL
        """)
        linked_artworks = cursor.fetchone()[0]
        print(f"  Artworks linked to users: {linked_artworks}")

    except Exception as e:
        print(f"✗ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Database Migration: Create users table")
    print("=" * 60)
    migrate()
    print("=" * 60)
    print("Migration complete!")
    print("=" * 60)

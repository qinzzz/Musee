"""
Database migration script for Neon PostgreSQL

This script runs migrations on the Neon PostgreSQL database:
1. Creates the users table if it doesn't exist
2. Adds device_id column to saved_artworks if needed
3. Migrates existing device_id data to users table

Usage:
    cd backend
    python migrations/migrate_neon.py
"""

import os
import sys
from pathlib import Path

# Add parent directory to path to import app modules
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text, inspect
from app.config.settings import settings
import uuid
from datetime import datetime

def migrate():
    """Run migrations on Neon PostgreSQL database"""

    database_url = settings.neon_database_url

    if not database_url:
        print("✗ NEON_DATABASE_URL not set in environment")
        print("  Please set NEON_DATABASE_URL in your .env file")
        return False

    print(f"Connecting to Neon PostgreSQL database...")
    print(f"  URL: {database_url[:20]}...{database_url[-20:]}")

    try:
        # Create SQLAlchemy engine
        engine = create_engine(database_url)

        with engine.connect() as conn:
            # Start a transaction
            trans = conn.begin()

            try:
                # Check if users table exists
                inspector = inspect(engine)
                tables = inspector.get_table_names()

                print(f"\nFound {len(tables)} existing tables: {', '.join(tables)}")

                # Create users table if it doesn't exist
                if 'users' not in tables:
                    print("\nCreating users table...")
                    conn.execute(text("""
                        CREATE TABLE users (
                            user_id TEXT PRIMARY KEY,
                            username TEXT UNIQUE,
                            email TEXT UNIQUE,
                            device_id TEXT UNIQUE,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            settings JSONB
                        )
                    """))
                    print("✓ Created users table")
                else:
                    print("\n✓ users table already exists")

                # Check if saved_artworks table exists
                if 'saved_artworks' not in tables:
                    print("✓ saved_artworks table doesn't exist yet")
                    print("  Tables will be created by SQLAlchemy on first backend run")
                    trans.commit()
                    return True

                # Check if device_id column exists in saved_artworks
                columns = [col['name'] for col in inspector.get_columns('saved_artworks')]

                if 'device_id' not in columns:
                    print("\nAdding device_id column to saved_artworks...")
                    conn.execute(text("""
                        ALTER TABLE saved_artworks
                        ADD COLUMN device_id TEXT
                    """))
                    print("✓ Added device_id column")
                else:
                    print("\n✓ device_id column already exists in saved_artworks")

                # Check if user_id column exists and is a foreign key
                if 'user_id' not in columns:
                    print("\nAdding user_id foreign key column to saved_artworks...")
                    conn.execute(text("""
                        ALTER TABLE saved_artworks
                        ADD COLUMN user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL
                    """))
                    print("✓ Added user_id foreign key column")
                else:
                    print("✓ user_id column already exists in saved_artworks")

                # Migrate existing device_ids to users table
                if 'users' in tables and 'saved_artworks' in tables:
                    result = conn.execute(text("""
                        SELECT DISTINCT device_id
                        FROM saved_artworks
                        WHERE device_id IS NOT NULL
                    """))
                    device_ids = [row[0] for row in result]

                    if device_ids:
                        print(f"\nMigrating {len(device_ids)} unique device(s) to users table...")

                        for device_id in device_ids:
                            # Check if user already exists with this device_id
                            existing = conn.execute(text("""
                                SELECT user_id FROM users WHERE device_id = :device_id
                            """), {"device_id": device_id}).fetchone()

                            if existing:
                                user_id = existing[0]
                                print(f"  ✓ User already exists for device_id: {device_id[:8]}...")
                            else:
                                user_id = str(uuid.uuid4())
                                conn.execute(text("""
                                    INSERT INTO users (user_id, device_id, created_at, last_active)
                                    VALUES (:user_id, :device_id, :created_at, :last_active)
                                """), {
                                    "user_id": user_id,
                                    "device_id": device_id,
                                    "created_at": datetime.now(),
                                    "last_active": datetime.now()
                                })
                                print(f"  ✓ Created user for device_id: {device_id[:8]}...")

                            # Update saved_artworks to link to the user
                            conn.execute(text("""
                                UPDATE saved_artworks
                                SET user_id = :user_id
                                WHERE device_id = :device_id AND user_id IS NULL
                            """), {"user_id": user_id, "device_id": device_id})
                    else:
                        print("\n✓ No device_id data to migrate")

                # Commit transaction
                trans.commit()
                print("\n✓ Successfully completed all migrations")

                # Show statistics
                result = conn.execute(text("SELECT COUNT(*) FROM users"))
                user_count = result.scalar()
                print(f"\n  Total users: {user_count}")

                result = conn.execute(text("SELECT COUNT(*) FROM saved_artworks"))
                artwork_count = result.scalar()
                print(f"  Total artworks: {artwork_count}")

                result = conn.execute(text("""
                    SELECT COUNT(*)
                    FROM saved_artworks
                    WHERE user_id IS NOT NULL
                """))
                linked_artworks = result.scalar()
                print(f"  Artworks linked to users: {linked_artworks}")

                return True

            except Exception as e:
                print(f"\n✗ Migration failed: {e}")
                trans.rollback()
                raise

    except Exception as e:
        print(f"\n✗ Failed to connect to database: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Neon PostgreSQL Database Migration")
    print("=" * 60)
    success = migrate()
    print("=" * 60)
    if success:
        print("Migration complete!")
    else:
        print("Migration failed!")
    print("=" * 60)
    sys.exit(0 if success else 1)

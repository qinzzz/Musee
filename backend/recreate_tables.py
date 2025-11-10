"""
Script to drop and recreate database tables with new schema

WARNING: This will delete all existing data!
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.database.connection import engine, Base
from app.database.models import SavedArtwork, Conversation

def recreate_tables():
    """Drop all tables and recreate with new schema"""

    print("=" * 60)
    print("Database Table Recreation Script")
    print("=" * 60)

    response = input("\nWARNING: This will DELETE ALL DATA in the database.\nContinue? (y/n): ")

    if response.lower() != 'y':
        print("Operation cancelled.")
        return

    try:
        # Drop all tables
        print("\nDropping all tables...")
        Base.metadata.drop_all(bind=engine)
        print("✓ Tables dropped")

        # Create all tables with new schema
        print("\nCreating tables with new schema...")
        Base.metadata.create_all(bind=engine)
        print("✓ Tables created")

        # Verify
        from sqlalchemy import inspect
        inspector = inspect(engine)

        print("\n" + "=" * 60)
        print("Verification:")
        print("=" * 60)

        print("\nSavedArtwork columns:")
        for col in inspector.get_columns('saved_artworks'):
            print(f"  - {col['name']}: {col['type']}")

        print("\nConversation columns:")
        for col in inspector.get_columns('conversations'):
            print(f"  - {col['name']}: {col['type']}")

        print("\n✓ Database recreation successful!")

    except Exception as e:
        print(f"\n✗ Error: {e}")
        raise

if __name__ == "__main__":
    recreate_tables()

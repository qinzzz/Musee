"""
Migration script to convert conversation_history JSON to normalized Conversation table

Run this script once to migrate existing data:
    python migrate_conversations.py
"""

import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.database.connection import Base, engine
from app.database.models import SavedArtwork, Conversation
from app.config.settings import settings
import uuid


def migrate_conversations():
    """Migrate conversation_history JSON to Conversation table"""

    # Create session
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        print("Starting conversation migration...")

        # Create new Conversation table if it doesn't exist
        Base.metadata.create_all(engine)
        print("✓ Conversation table created/verified")

        # Get all saved artworks with conversation_history
        artworks = db.query(SavedArtwork).all()
        print(f"Found {len(artworks)} saved artworks to migrate")

        migrated_count = 0
        conversation_count = 0

        for artwork in artworks:
            # Check if artwork has conversation_history
            if not hasattr(artwork, 'conversation_history') or not artwork.conversation_history:
                print(f"  Skipping artwork {artwork.id} (no conversation_history)")
                continue

            conversation_history = artwork.conversation_history
            if not isinstance(conversation_history, list):
                print(f"  Warning: artwork {artwork.id} has invalid conversation_history format")
                continue

            # Check if already migrated (has conversations in new table)
            existing_conversations = db.query(Conversation).filter(
                Conversation.saved_artwork_id == artwork.id
            ).count()

            if existing_conversations > 0:
                print(f"  Skipping artwork {artwork.id} (already migrated, {existing_conversations} conversations)")
                continue

            # Migrate each message to Conversation table
            print(f"  Migrating artwork {artwork.id} ({len(conversation_history)} messages)")

            for idx, message in enumerate(conversation_history):
                role = message.get('role', 'assistant')  # Default to assistant for old data
                content = message.get('content', '')

                if not content:
                    print(f"    Warning: empty content for message {idx}, skipping")
                    continue

                # Extract optional metadata
                metadata = {}
                if 'topic' in message:
                    metadata['topic'] = message['topic']

                # Create conversation record
                conversation = Conversation(
                    id=str(uuid.uuid4()),
                    saved_artwork_id=artwork.id,
                    sequence_number=idx,
                    role=role,
                    content=content,
                    message_metadata=metadata if metadata else None
                )
                db.add(conversation)
                conversation_count += 1

            migrated_count += 1

        # Commit all changes
        db.commit()
        print(f"\n✓ Migration complete!")
        print(f"  Migrated {migrated_count} artworks")
        print(f"  Created {conversation_count} conversation records")

        # Optional: Drop conversation_history and conversation_id columns
        print("\nTo complete migration, you can drop the old columns:")
        print("  ALTER TABLE saved_artworks DROP COLUMN conversation_history;")
        print("  ALTER TABLE saved_artworks DROP COLUMN conversation_id;")
        print("\nNote: SQLite doesn't support DROP COLUMN, so you may need to:")
        print("  1. Create a new table without those columns")
        print("  2. Copy data from old table")
        print("  3. Drop old table and rename new table")

    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def verify_migration():
    """Verify migration was successful"""

    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        print("\nVerifying migration...")

        # Count artworks and conversations
        artwork_count = db.query(SavedArtwork).count()
        conversation_count = db.query(Conversation).count()

        print(f"  Total artworks: {artwork_count}")
        print(f"  Total conversations: {conversation_count}")

        # Sample some artworks with conversations
        artworks_with_convos = db.query(SavedArtwork).limit(3).all()

        for artwork in artworks_with_convos:
            conv_count = len(artwork.conversations)
            print(f"  Artwork {artwork.id}: {conv_count} conversations")

            # Test to_dict method
            artwork_dict = artwork.to_dict(include_conversations=True)
            history_count = len(artwork_dict.get('conversation_history', []))
            print(f"    to_dict returned {history_count} messages in conversation_history")

        print("\n✓ Verification complete!")

    except Exception as e:
        print(f"\n✗ Verification failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("Conversation Migration Script")
    print("=" * 60)

    response = input("\nThis will migrate conversation_history to the Conversation table.\nContinue? (y/n): ")

    if response.lower() == 'y':
        migrate_conversations()
        verify_migration()
        print("\nMigration successful! You can now update your API endpoints.")
    else:
        print("Migration cancelled.")

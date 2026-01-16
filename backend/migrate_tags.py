"""
Migration script for tags.
Updates tags to be global (not user-specific) with optional explanation field.
"""
import os
import sys

sys.path.append(os.getcwd())

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork, Tag, ArtworkTag


def normalize_tag_name(tag: str) -> str:
    """Normalize tag name to lowercase with # prefix"""
    normalized = tag.strip().lower()
    if not normalized.startswith('#'):
        normalized = f'#{normalized}'
    return normalized


def migrate_tags():
    db = SessionLocal()
    try:
        artworks = db.query(SavedArtwork).all()
        print(f"Found {len(artworks)} artworks to process.")

        count = 0
        tag_count = 0
        association_count = 0

        for artwork in artworks:
            # Check if artwork has a legacy 'tags' string field
            if not hasattr(artwork, 'tags') or not artwork.tags:
                continue

            # Legacy tags are comma-separated strings
            tag_names = [normalize_tag_name(t) for t in artwork.tags.split(',') if t.strip()]

            if not tag_names:
                continue

            for name in tag_names:
                # Find or create global tag
                tag = db.query(Tag).filter(Tag.name == name).first()
                if not tag:
                    tag = Tag(name=name)
                    db.add(tag)
                    db.flush()
                    tag_count += 1

                # Check if association exists
                existing_assoc = db.query(ArtworkTag).filter(
                    ArtworkTag.artwork_id == artwork.id,
                    ArtworkTag.tag_id == tag.id
                ).first()

                if not existing_assoc:
                    assoc = ArtworkTag(artwork_id=artwork.id, tag_id=tag.id)
                    db.add(assoc)
                    association_count += 1

            count += 1

        db.commit()
        print(f"Migration complete!")
        print(f"Processed {count} artworks.")
        print(f"Created {tag_count} new global tags.")
        print(f"Created {association_count} tag-artwork associations.")

    except Exception as e:
        db.rollback()
        print(f"Error during migration: {str(e)}")
    finally:
        db.close()


if __name__ == "__main__":
    migrate_tags()

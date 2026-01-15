import os
import sys

# Add the parent directory to sys.path so we can import app
sys.path.append(os.path.join(os.getcwd(), 'app'))
# Actually, we are in /backend, usually app is the package.
# Let's adjust sys.path to include /backend
sys.path.append(os.getcwd())

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork, Tag, ArtworkTag, User

def migrate_tags():
    db = SessionLocal()
    try:
        artworks = db.query(SavedArtwork).all()
        print(f"Found {len(artworks)} artworks to process.")
        
        count = 0
        tag_count = 0
        association_count = 0
        
        for artwork in artworks:
            if not artwork.tags:
                continue
            
            # Legacy tags are comma-separated strings
            tag_names = [t.strip() for t in artwork.tags.split(',') if t.strip()]
            
            if not tag_names:
                continue
                
            # If artwork doesn't have a user_id, we can't create a (valid) tag for it 
            # as per the new model (which requires user_id and has a unique constraint on name, user_id).
            # However, if user_id is missing, we might need a fallback or just skip.
            # Let's check for user_id.
            user_id = artwork.user_id
            if not user_id:
                # Try to find user by device_id if available as fallback? 
                # Or just use a default user if one exists.
                # For this migration, if user_id is null, we'll skip or log it.
                print(f"Skipping artwork {artwork.id} because it has no user_id.")
                continue

            for name in tag_names:
                # Find or create tag
                tag = db.query(Tag).filter(Tag.name == name, Tag.user_id == user_id).first()
                if not tag:
                    tag = Tag(name=name, user_id=user_id)
                    db.add(tag)
                    db.flush() # Get the ID
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
        print(f"Created {tag_count} new tags.")
        print(f"Created {association_count} tag-artwork associations.")
        
    except Exception as e:
        db.rollback()
        print(f"Error during migration: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    migrate_tags()

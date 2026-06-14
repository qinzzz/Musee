import sys
import os
from datetime import datetime
from collections import defaultdict

# Add backend directory to sys.path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork, Session as SessionModel, SessionArtwork, User

def migrate():
    db = SessionLocal()
    try:
        # 1. Fetch all artworks without any session links
        artworks = (
            db.query(SavedArtwork)
            .outerjoin(SessionArtwork, SessionArtwork.artwork_id == SavedArtwork.id)
            .filter(SessionArtwork.id == None)
            .all()
        )
        
        if not artworks:
            print("No artworks found without a session ID. Migration complete.")
            return

        print(f"Found {len(artworks)} artworks without a session. Grouping...")

        # 2. Group artworks by (user_id, date, museum_name)
        groups = defaultdict(list)
        for art in artworks:
            date_str = art.created_at.strftime('%Y-%m-%d') if art.created_at else 'unknown-date'
            location_key = art.museum_name if art.museum_name else 'standalone-exploration'
            key = (art.user_id, date_str, location_key)
            groups[key].append(art)

        # 3. Create sessions and migrate
        for (user_id, date_str, location_key), group_artworks in groups.items():
            print(f"Creating visit for User {user_id} on {date_str} at {location_key} ({len(group_artworks)} items)")
            
            # Ensure user exists (safety check)
            if user_id:
                user = db.query(User).filter(User.user_id == user_id).first()
                if not user:
                    print(f"User {user_id} not found. Using 'anonymous' owner for compatibility.")
                    user_id = "anonymous"
            else:
                user_id = "anonymous"

            # Create the Session
            session_name = f"{location_key}" if location_key != 'standalone-exploration' else f"{date_str} Exploration"
            
            new_session = SessionModel(
                user_id=user_id,
                narrative_summary=f"Automated grouping of {len(group_artworks)} standalone artworks.",
                metadata_json={"migration": "visit-only-refactor", "source": "standalone", "location_context": location_key}
            )
            db.add(new_session)
            db.flush() # Get the generated UUID

            # Link artworks to the new session
            for index, art in enumerate(group_artworks):
                db.add(
                    SessionArtwork(
                        session_id=new_session.id,
                        artwork_id=art.id,
                        sequence_number=index,
                        source="library",
                    )
                )
            
        db.commit()
        print("Migration finished successfully.")

    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    migrate()

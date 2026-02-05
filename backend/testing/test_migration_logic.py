import sys
import os
from sqlalchemy.orm import Session
import uuid

# Add parent directory to path to import app
sys.path.append(os.path.join(os.getcwd(), ".."))

from app.database.connection import SessionLocal, engine, Base
from app.database.models import User, SavedArtwork, Session as UserSession

def test_migration():
    db = SessionLocal()
    try:
        # 1. Create an anonymous user and some data
        anon_id = f"anon-{uuid.uuid4()}"
        anon_user = User(user_id=anon_id, username="anon_test")
        db.add(anon_user)
        db.flush()
        
        artwork = SavedArtwork(
            user_id=anon_id,
            artist_name="Test Artist",
            artwork_name="Test Artwork",
            photo_uri="test.jpg"
        )
        db.add(artwork)
        
        session = UserSession(user_id=anon_id, narrative_summary="Test Session")
        db.add(session)
        
        db.commit()
        print(f"Created anonymous user {anon_id} with artwork and session.")
        
        # 2. Create a Google user
        google_id = f"google-{uuid.uuid4()}"
        google_user = User(
            user_id=f"user-{uuid.uuid4()}",
            google_id=google_id,
            email="test@example.com",
            full_name="Test User"
        )
        db.add(google_user)
        db.flush()
        print(f"Created Google user {google_user.user_id}.")
        
        # 3. Perform Migration (logic copied from auth.py)
        # Update Related Data
        db.query(SavedArtwork).filter(SavedArtwork.user_id == anon_user.user_id).update({SavedArtwork.user_id: google_user.user_id})
        db.query(UserSession).filter(UserSession.user_id == anon_user.user_id).update({UserSession.user_id: google_user.user_id})
        
        # Delete anonymous user
        db.delete(anon_user)
        db.commit()
        print("Migration logic executed.")
        
        # 4. Verify
        # Check if artwork now belongs to google_user
        migrated_artwork = db.query(SavedArtwork).filter(SavedArtwork.user_id == google_user.user_id).first()
        assert migrated_artwork is not None, "Artwork not migrated!"
        assert migrated_artwork.artist_name == "Test Artist"
        
        migrated_session = db.query(UserSession).filter(UserSession.user_id == google_user.user_id).first()
        assert migrated_session is not None, "Session not migrated!"
        
        # Check if anon user is gone
        deleted_user = db.query(User).filter(User.user_id == anon_id).first()
        assert deleted_user is None, "Anonymous user not deleted!"
        
        print("Verification SUCCESS: Data migrated correctly and anonymous user cleaned up.")
        
    except Exception as e:
        print(f"Verification FAILED: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    test_migration()

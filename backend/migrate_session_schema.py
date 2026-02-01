"""
Migration script to add session_id column to saved_artworks table.
"""
import os
import sys
from sqlalchemy import text

# Ensure we can import from app
sys.path.append(os.getcwd())

from app.database.connection import engine, Base
from app.database.models import Session as SessionModel  # Import models to ensure they are registered

def migrate():
    print("Checking database schema...")
    
    with engine.connect() as connection:
        # 1. Ensure 'sessions' table exists (Base.metadata.create_all handles this)
        print("Creating missing tables (including 'sessions')...")
        Base.metadata.create_all(bind=engine)
        
        # 2. Add session_id column to saved_artworks if missing
        print("Checking for session_id column in saved_artworks...")
        try:
            # PostgreSQL specific check for column existence
            result = connection.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='saved_artworks' AND column_name='session_id';"
            )).fetchone()
            
            if not result:
                print("Adding session_id column to saved_artworks table...")
                connection.execute(text(
                    "ALTER TABLE saved_artworks ADD COLUMN session_id VARCHAR;"
                ))
                connection.execute(text(
                    "CREATE INDEX ix_saved_artworks_session_id ON saved_artworks (session_id);"
                ))
                connection.commit()
                print("Column session_id and index created successfully.")
            else:
                print("Column session_id already exists.")
                
        except Exception as e:
            print(f"Error checking column: {e}")
            # Fallback for SQLite or other DBs if needed
            print("Attempting to add column anyway (ignoring errors)...")
            try:
                connection.execute(text(
                    "ALTER TABLE saved_artworks ADD COLUMN session_id VARCHAR;"
                ))
                connection.commit()
                print("Column added.")
            except Exception as inner_e:
                print(f"Could not add column: {inner_e}")

    print("Migration complete!")

if __name__ == "__main__":
    migrate()

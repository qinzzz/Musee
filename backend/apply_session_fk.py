"""
Migration script to add foreign key constraint between saved_artworks and sessions.
"""
import os
import sys
from sqlalchemy import text

# Ensure we can import from app
sys.path.append(os.getcwd())

from app.database.connection import engine

def apply_fk():
    print("Applying foreign key constraint...")
    
    with engine.connect() as connection:
        try:
            # PostgreSQL specific script to add foreign key
            print("Checking if foreign key already exists...")
            result = connection.execute(text(
                "SELECT constraint_name FROM information_schema.key_column_usage "
                "WHERE table_name='saved_artworks' AND column_name='session_id' "
                "AND constraint_name LIKE 'fk_%';"
            )).fetchone()
            
            if not result:
                print("Adding foreign key constraint 'fk_saved_artworks_session_id'...")
                # First clean up any orphaned session_ids if they exist (though unlikely)
                # Setting them to NULL if they don't exist in sessions table
                connection.execute(text(
                    "UPDATE saved_artworks SET session_id = NULL "
                    "WHERE session_id NOT IN (SELECT id FROM sessions) AND session_id IS NOT NULL;"
                ))
                
                # Add the constraint
                connection.execute(text(
                    "ALTER TABLE saved_artworks "
                    "ADD CONSTRAINT fk_saved_artworks_session_id "
                    "FOREIGN KEY (session_id) REFERENCES sessions(id) "
                    "ON DELETE SET NULL;"
                ))
                connection.commit()
                print("Foreign key constraint applied successfully.")
            else:
                print(f"Foreign key constraint already exists: {result[0]}")
                
        except Exception as e:
            print(f"Error applying FK: {e}")
            connection.rollback()
            
            # Simple fallback for SQLite
            if "sqlite" in str(engine.url).lower():
                print("SQLite detected. SQLite doesn't support ALTER TABLE ADD CONSTRAINT for FKs directly.")
                print("The schema in models.py will handle this during create_all for new databases.")
                print("For existing SQLite databases, you typically need to recreate the table.")
            else:
                print("PostgreSQL error details above.")

    print("Task complete!")

if __name__ == "__main__":
    apply_fk()

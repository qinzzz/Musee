import sys
import os
from sqlalchemy import text, create_engine
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add parent directory to path to import app if needed
sys.path.append(os.path.join(os.getcwd(), ".."))

def get_engine():
    """Get database engine from environment or local config"""
    # Prefer DATABASE_URL for Railway/Production
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        # PostgreSQL URL fix for SQLAlchemy if needed
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        return create_engine(db_url)
    
    # Fallback to app config
    try:
        from app.database.connection import engine
        return engine
    except ImportError:
        logger.error("Could not find DATABASE_URL or app database configuration.")
        sys.exit(1)

def apply_migrations():
    engine = get_engine()
    with engine.begin() as connection:
        logger.info("Connected to database. Checking for missing columns in 'users' table...")
        
        # Add google_id column
        try:
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR"))
            logger.info("Ensured google_id column exists.")
        except Exception as e:
            logger.warning(f"Error adding google_id: {e}")
            
        # Add profile_picture_url column
        try:
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_url VARCHAR"))
            logger.info("Ensured profile_picture_url column exists.")
        except Exception as e:
            logger.warning(f"Error adding profile_picture_url: {e}")
            
        # Add full_name column
        try:
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR"))
            logger.info("Ensured full_name column exists.")
        except Exception as e:
            logger.warning(f"Error adding full_name: {e}")
            
        # Create unique index for google_id
        try:
            # PostgreSQL syntax for conditional index is tricky, so we use a try-except
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id)"))
            logger.info("Ensured unique index on google_id exists.")
        except Exception as e:
            logger.info(f"Unique index ix_users_google_id might already exist or failed: {e}")
            
    logger.info("Migrations check completed.")

if __name__ == "__main__":
    apply_migrations()

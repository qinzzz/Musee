#!/usr/bin/env python3
"""
Simple database migration script for Musee
Run this script to create/update database tables
"""

from app.database.connection import engine, Base
from app.database.models import ArtworkAnalysis, ArtworkHistory

def migrate():
    """Create all database tables"""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Database migration completed successfully!")
    print("\nTables created:")
    print("  - artwork_analyses")
    print("  - artwork_history")

if __name__ == "__main__":
    migrate()

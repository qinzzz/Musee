"""
Migration script to add color_palette field to saved_artworks table

This script adds a JSON column to store color palette information extracted from images:
- background: Background color
- detail: Detail color
- primary: Primary color
- secondary: Secondary color

Run this script to update your database schema.
"""

import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from app.database.connection import engine, get_db
from app.database.models import Base


def run_migration():
    """Run the migration to add color_palette column"""
    print("Starting migration: Adding color_palette column to saved_artworks table...")

    with engine.connect() as connection:
        # Check if column already exists
        check_query = text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='saved_artworks' AND column_name='color_palette'
        """)

        result = connection.execute(check_query)
        column_exists = result.fetchone() is not None

        if column_exists:
            print("✓ color_palette column already exists. No migration needed.")
            return

        # Add the color_palette column
        print("Adding color_palette column...")
        add_column_query = text("""
            ALTER TABLE saved_artworks
            ADD COLUMN color_palette JSON NULL
        """)

        connection.execute(add_column_query)
        connection.commit()

        print("✓ Successfully added color_palette column to saved_artworks table")
        print("\nMigration completed successfully!")


if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        sys.exit(1)

#!/usr/bin/env python3
"""Verify SavedArtwork schema includes location and museum_name"""

from app.database.connection import engine
from sqlalchemy import inspect

def verify_schema():
    """Verify database schema"""
    print("Verifying SavedArtwork table schema...")
    print("=" * 60)

    inspector = inspect(engine)

    # Get columns for saved_artworks table
    columns = inspector.get_columns('saved_artworks')

    print("\nColumns in saved_artworks table:")
    for col in columns:
        nullable = "NULL" if col['nullable'] else "NOT NULL"
        print(f"  - {col['name']:<25} {str(col['type']):<20} {nullable}")

    # Check for new columns
    column_names = [col['name'] for col in columns]

    print("\n" + "=" * 60)
    if 'location' in column_names and 'museum_name' in column_names:
        print("✓ Schema updated successfully!")
        print("  - location column: FOUND")
        print("  - museum_name column: FOUND")
    else:
        print("✗ Schema update incomplete")
        if 'location' not in column_names:
            print("  - location column: MISSING")
        if 'museum_name' not in column_names:
            print("  - museum_name column: MISSING")
    print("=" * 60)

if __name__ == "__main__":
    verify_schema()

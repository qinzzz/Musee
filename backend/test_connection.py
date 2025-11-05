#!/usr/bin/env python3
"""Test Neon PostgreSQL connection"""

from app.database.connection import engine
from sqlalchemy import text, inspect

def test_connection():
    """Test database connection and list tables"""
    try:
        with engine.connect() as conn:
            # Test connection
            result = conn.execute(text('SELECT version()'))
            version = result.fetchone()[0]
            print('✓ PostgreSQL connection successful!')
            print(f'Version: {version[:50]}...\n')

            # List tables
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            print('Tables in database:')
            for table in tables:
                print(f'  - {table}')
                columns = inspector.get_columns(table)
                print(f'    Columns: {len(columns)}')

            print('\n✓ Database ready for use!')

    except Exception as e:
        print(f'✗ Connection failed: {e}')
        return False

    return True

if __name__ == "__main__":
    test_connection()

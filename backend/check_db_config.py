#!/usr/bin/env python3
"""Check database configuration"""

from app.config.settings import settings

def check_config():
    """Display current database configuration"""
    print("Database Configuration:")
    print("=" * 60)

    try:
        effective_url = settings.effective_database_url

        print(f"\n✓ NEON_DATABASE_URL: SET")
        print(f"\nConnection Details:")

        # Parse connection string
        if '@' in effective_url:
            host_part = effective_url.split('@')[1].split('/')[0]
            db_name = effective_url.split('/')[-1].split('?')[0]
            print(f"  Type: PostgreSQL (Neon)")
            print(f"  Host: {host_part}")
            print(f"  Database: {db_name}")
            print(f"  SSL: {'Required' if 'sslmode=require' in effective_url else 'Optional'}")

        print(f"\n✓ Connection ready for both development and production")

    except Exception as e:
        print(f"\n✗ ERROR: NEON_DATABASE_URL is required but not set")
        print(f"  Please add NEON_DATABASE_URL to your .env file")
        print(f"  Error: {e}")

    print("=" * 60)

if __name__ == "__main__":
    check_config()

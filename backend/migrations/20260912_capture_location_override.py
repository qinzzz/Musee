"""Inspect or add the nullable capture-location override column.

    venv/bin/python migrations/20260912_capture_location_override.py --env prod
    venv/bin/python migrations/20260912_capture_location_override.py --env prod --apply

Uses the explicitly configured environment-specific URL, never a fallback. This
migration adds one column only; it does not run the full startup bootstrap.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.config.settings import settings

COLUMN_QUERY = text("""
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'saved_artworks'
      AND column_name = 'capture_location_override'
""")
DDL = "ALTER TABLE public.saved_artworks ADD COLUMN IF NOT EXISTS capture_location_override JSONB"


def check_column(connection):
    row = connection.execute(COLUMN_QUERY).mappings().first()
    if row and (row['data_type'] != 'jsonb' or row['is_nullable'] != 'YES' or row['column_default'] is not None):
        raise RuntimeError('Existing column does not match nullable JSONB with no default; no change applied.')
    return dict(row) if row else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env', choices=('dev', 'prod'), default='dev')
    parser.add_argument('--apply', action='store_true', help='Apply the additive migration; default is read-only.')
    args = parser.parse_args()
    url = settings.neon_database_url_prod if args.env == 'prod' else settings.neon_database_url_dev
    if not url:
        raise RuntimeError(f'Explicit {args.env} database URL is not configured.')
    if args.env == 'prod' and url == settings.neon_database_url_dev:
        raise RuntimeError('Production and development database URLs are identical; refusing ambiguous target.')
    engine = create_engine(url, connect_args={'connect_timeout': 10}, hide_parameters=True)
    try:
        with engine.begin() as connection:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '30s'"))
            if connection.execute(text("SELECT to_regclass('public.saved_artworks')")).scalar_one() is None:
                raise RuntimeError('Expected public.saved_artworks table is missing; no change applied.')
            before = check_column(connection)
            if args.apply and before is None:
                connection.execute(text(DDL))
                if check_column(connection) is None:
                    raise RuntimeError('Column verification failed; transaction rolled back.')
        # Verify after commit, not just inside the DDL transaction.
        with engine.connect() as connection:
            after = check_column(connection)
        if args.apply and after is None:
            raise RuntimeError('Post-commit verification failed.')
        print(json.dumps({'environment': args.env, 'mode': 'apply' if args.apply else 'read-only',
                          'applied_now': args.apply and before is None, 'column': after,
                          'ddl': DDL}, sort_keys=True))
    finally:
        engine.dispose()


if __name__ == '__main__':
    try:
        main()
    except SQLAlchemyError as error:
        # Connection exceptions can embed credentials; expose only diagnostic codes.
        code = getattr(getattr(error, 'orig', None), 'pgcode', None)
        print(f'Database operation failed: {type(error).__name__}, SQLSTATE={code}', file=sys.stderr)
        sys.exit(1)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

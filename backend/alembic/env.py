"""Alembic environment — resolves the database URL from app settings.

Run as a deploy step (`alembic upgrade head`), never at app startup. The
legacy create_all/bootstrap path still runs at startup for pre-existing
tables; new schema changes land here so every database records exactly
which changes it has applied. Adopt gradually: as bootstrap statements
retire, this becomes the only migration path.
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.config.settings import settings
from app.database.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    return settings.effective_database_url.replace("postgresql+asyncpg://", "postgresql://")


def run_migrations_offline() -> None:
    context.configure(url=_database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_database_url())
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

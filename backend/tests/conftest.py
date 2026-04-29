"""Shared pytest fixtures — SQLite in-memory DB, FastAPI TestClient.

We must patch the DB engine BEFORE any app module is imported so the
module-level `create_engine()` call in connection.py uses SQLite instead
of trying to connect to Postgres.
"""

import os
import sys

# Override every possible DB-URL env var so settings always sees SQLite
os.environ["NEON_DATABASE_URL"]      = "sqlite://"
os.environ["NEON_DATABASE_URL_DEV"]  = "sqlite://"
os.environ["NEON_DATABASE_URL_PROD"] = "sqlite://"
os.environ["ENV"]          = "test"
os.environ["USE_DATABASE"] = "true"
os.environ["OPENAI_API_KEY"] = "sk-test"
os.environ["ADMIN_SECRET"]   = "test-secret"
# Prevent settings from reading a .env file (which has real postgres URLs)
os.environ["PYDANTIC_SETTINGS_DOTENV_PATH"] = ""

# Ensure app package is importable (tests run from backend/)
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Build a shared SQLite engine with WAL disabled (single-connection safe)
_TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Patch connection.py before the app imports it
import app.database.connection as _conn_mod  # type: ignore
_conn_mod.engine = _TEST_ENGINE
_conn_mod.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_TEST_ENGINE)

from app.database.connection import Base, get_db, SessionLocal  # noqa: E402
from app.main import app  # noqa: E402

# Create tables once (StaticPool keeps schema across sessions)
Base.metadata.create_all(bind=_TEST_ENGINE)


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_TEST_ENGINE)


@pytest.fixture(autouse=True)
def reset_db():
    """Wipe and recreate all tables between tests."""
    Base.metadata.drop_all(bind=_TEST_ENGINE)
    Base.metadata.create_all(bind=_TEST_ENGINE)
    yield


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

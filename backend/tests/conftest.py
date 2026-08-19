"""Shared pytest fixtures — selectable test DB and FastAPI TestClient.

We must patch the DB engine BEFORE any app module is imported so the
module-level `create_engine()` call in connection.py uses the isolated
test database instead of a configured development or production database.
"""

import os
import sys

_TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite://")

# Override every possible DB-URL env var so settings always sees the test DB.
os.environ["NEON_DATABASE_URL"]      = _TEST_DATABASE_URL
os.environ["NEON_DATABASE_URL_DEV"]  = _TEST_DATABASE_URL
os.environ["NEON_DATABASE_URL_PROD"] = _TEST_DATABASE_URL
os.environ["ENV"]          = "test"
os.environ["USE_DATABASE"] = "true"
os.environ["OPENAI_API_KEY"] = "sk-test"
os.environ["ADMIN_SECRET"]   = "test-secret"
# Neutralize email delivery so tests never hit a real SMTP server or ESP
# when a populated .env is present (env vars take precedence over dotenv).
os.environ["SMTP_HOST"]      = ""
os.environ["SMTP_USERNAME"]  = ""
os.environ["SMTP_PASSWORD"]  = ""
os.environ["RESEND_API_KEY"] = ""
# Prevent settings from reading a .env file (which has real postgres URLs)
os.environ["PYDANTIC_SETTINGS_DOTENV_PATH"] = ""

# Ensure app package is importable (tests run from backend/)
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

if _TEST_DATABASE_URL == "sqlite://":
    # StaticPool keeps the in-memory schema available across test sessions.
    _TEST_ENGINE = create_engine(
        _TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    # Do not retain connections across PostgreSQL test resets.
    _TEST_ENGINE = create_engine(_TEST_DATABASE_URL, poolclass=NullPool)

# Patch connection.py before the app imports it
import app.database.connection as _conn_mod  # type: ignore
_conn_mod.configure_session_factory(_TEST_ENGINE)

from app.database.connection import Base, get_db, SessionLocal  # noqa: E402
from app.main import app  # noqa: E402

# Create tables once; the reset fixture recreates them between tests.
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

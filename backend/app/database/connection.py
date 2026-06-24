from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config.settings import settings

Base = declarative_base()


def build_engine(database_url: str | None = None):
    effective_url = database_url or settings.effective_database_url
    is_sqlite = "sqlite" in effective_url
    engine_kwargs: dict = {
        "connect_args": {"check_same_thread": False} if is_sqlite else {},
        "pool_pre_ping": not is_sqlite,
        "pool_recycle": 300 if not is_sqlite else -1,
    }
    if not is_sqlite:
        engine_kwargs["pool_size"] = 20
        engine_kwargs["max_overflow"] = 10
    return create_engine(effective_url, **engine_kwargs)


def build_session_local(bind_engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=bind_engine)


engine = build_engine()
SessionLocal = build_session_local(engine)


def configure_session_factory(bind_engine) -> None:
    global engine, SessionLocal
    engine = bind_engine
    SessionLocal = build_session_local(bind_engine)


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.config.settings import Settings
from app.database.models import Journal, Session as SessionModel, SessionEvent, User
from app.jobs.generate_daily_journals import (
    RunnerConfig,
    config_from_arguments,
    build_argument_parser,
    discover_candidates,
    finalized_local_dates,
    journal_runner_lock,
    run_journal_batch,
)


def _add_user_event(
    db,
    *,
    user_id: str,
    event_id: str,
    created_at: datetime,
    content: str | None = "A thought about the work",
    payload: dict | None = None,
    role: str = "user",
    event_type: str = "user_input",
) -> None:
    session_id = f"session-{user_id}"
    if db.query(User).filter(User.user_id == user_id).first() is None:
        db.add(User(user_id=user_id, device_id=user_id))
    if db.query(SessionModel).filter(SessionModel.id == session_id).first() is None:
        db.add(SessionModel(id=session_id, user_id=user_id, title=f"{user_id} session"))
    db.flush()
    sequence_number = (
        db.query(SessionEvent)
        .filter(SessionEvent.session_id == session_id)
        .count()
        + 1
    )
    db.add(
        SessionEvent(
            id=event_id,
            session_id=session_id,
            role=role,
            type=event_type,
            content=content,
            payload=payload,
            sequence_number=sequence_number,
            created_at=created_at,
        )
    )
    db.commit()


def _add_existing_journal(db, *, user_id: str, local_date: date) -> None:
    db.add(
        Journal(
            user_id=user_id,
            local_date=local_date,
            timezone="America/Los_Angeles",
            period_start_utc=datetime(2026, 7, 25, 7),
            period_end_utc=datetime(2026, 7, 26, 7),
            reflection="Already generated.",
            focuses=[],
            representative_artwork_ids=[],
            evidence_snapshot={},
            evidence_schema_version="journal-evidence-v2",
            source_event_count=1,
            input_hash=f"existing-{user_id}-{local_date.isoformat()}",
            prompt_version="journal-generation-v6",
            model_version="test-model",
            generated_at=datetime(2026, 7, 26, 9),
        )
    )
    db.commit()


def _config(**overrides) -> RunnerConfig:
    values = {
        "timezone_name": "America/Los_Angeles",
        "lookback_days": 7,
        "grace_hours": 2,
        "max_journals": 50,
        "language": "en",
        "earliest_date": date(2026, 3, 1),
        "execute": False,
        "user_allowlist": frozenset(),
    }
    values.update(overrides)
    return RunnerConfig(**values)


def test_finalized_dates_respect_spring_dst_and_grace_period():
    before_grace = finalized_local_dates(
        now_utc=datetime(2026, 3, 8, 9, 59, tzinfo=UTC),
        timezone_name="America/Los_Angeles",
        lookback_days=1,
        grace_hours=2,
    )
    at_grace = finalized_local_dates(
        now_utc=datetime(2026, 3, 8, 10, 0, tzinfo=UTC),
        timezone_name="America/Los_Angeles",
        lookback_days=1,
        grace_hours=2,
    )

    assert before_grace == ()
    assert at_grace == (date(2026, 3, 7),)


def test_finalized_dates_respect_fall_dst_and_grace_period():
    before_grace = finalized_local_dates(
        now_utc=datetime(2026, 11, 1, 9, 59, tzinfo=UTC),
        timezone_name="America/Los_Angeles",
        lookback_days=1,
        grace_hours=2,
    )
    at_grace = finalized_local_dates(
        now_utc=datetime(2026, 11, 1, 10, 0, tzinfo=UTC),
        timezone_name="America/Los_Angeles",
        lookback_days=1,
        grace_hours=2,
    )

    assert before_grace == ()
    assert at_grace == (date(2026, 10, 31),)


def test_finalized_dates_never_include_dates_before_cutoff():
    dates = finalized_local_dates(
        now_utc=datetime(2026, 3, 3, 10, 0, tzinfo=UTC),
        timezone_name="America/Los_Angeles",
        lookback_days=7,
        grace_hours=2,
        earliest_date=date(2026, 3, 1),
    )

    assert dates == (date(2026, 3, 1), date(2026, 3, 2))


def test_settings_parse_journal_earliest_date_from_environment(monkeypatch):
    monkeypatch.setenv("JOURNAL_EARLIEST_DATE", "2026-04-15")

    configured_settings = Settings(_env_file=None)

    assert configured_settings.journal_earliest_date == date(2026, 4, 15)


def test_discovery_ignores_events_before_cutoff(db):
    _add_user_event(
        db,
        user_id="cutoff-user",
        event_id="before-cutoff",
        created_at=datetime(2026, 2, 28, 12),
    )
    _add_user_event(
        db,
        user_id="cutoff-user",
        event_id="at-cutoff",
        created_at=datetime(2026, 3, 1, 12),
    )

    discovery = discover_candidates(
        db,
        config=_config(timezone_name="UTC", lookback_days=7),
        now_utc=datetime(2026, 3, 3, 10, tzinfo=UTC),
    )

    assert discovery.eligible_user_dates == 1
    assert [(item.user_id, item.local_date) for item in discovery.candidates] == [
        ("cutoff-user", date(2026, 3, 1))
    ]


def test_discovery_matches_evidence_eligibility_and_skips_existing(db):
    _add_user_event(
        db,
        user_id="eligible-user",
        event_id="eligible-event",
        created_at=datetime(2026, 7, 25, 18),
    )
    _add_user_event(
        db,
        user_id="artwork-user",
        event_id="artwork-event",
        created_at=datetime(2026, 7, 25, 19),
        content=None,
        payload={"artworks": [{"artwork_id": "artwork-1", "source": "capture"}]},
    )
    _add_user_event(
        db,
        user_id="empty-user",
        event_id="empty-event",
        created_at=datetime(2026, 7, 25, 20),
        content="   ",
    )
    _add_user_event(
        db,
        user_id="model-user",
        event_id="model-event",
        created_at=datetime(2026, 7, 25, 21),
        role="model",
        event_type="message",
    )
    _add_existing_journal(db, user_id="eligible-user", local_date=date(2026, 7, 25))

    discovery = discover_candidates(
        db,
        config=_config(),
        now_utc=datetime(2026, 7, 26, 10, tzinfo=UTC),
    )

    assert discovery.eligible_user_dates == 2
    assert discovery.skipped_existing == 1
    assert len(discovery.candidates) == 1
    assert discovery.candidates[0].user_id == "artwork-user"
    assert discovery.candidates[0].local_date == date(2026, 7, 25)
    assert discovery.candidates[0].eligible_event_count == 1


def test_discovery_applies_user_allowlist(db):
    for user_id in ("allowed-user", "other-user"):
        _add_user_event(
            db,
            user_id=user_id,
            event_id=f"{user_id}-event",
            created_at=datetime(2026, 7, 25, 18),
        )

    discovery = discover_candidates(
        db,
        config=_config(user_allowlist=frozenset({"allowed-user"})),
        now_utc=datetime(2026, 7, 26, 10, tzinfo=UTC),
    )

    assert [candidate.user_id for candidate in discovery.candidates] == ["allowed-user"]


@pytest.mark.asyncio
async def test_audit_mode_never_calls_generator_or_writes(db):
    _add_user_event(
        db,
        user_id="audit-user",
        event_id="audit-event",
        created_at=datetime(2026, 7, 25, 18),
    )
    calls = 0

    async def fake_generate(*_args, **_kwargs):
        nonlocal calls
        calls += 1

    result = await run_journal_batch(
        db,
        config=_config(execute=False),
        now_utc=datetime(2026, 7, 26, 10, tzinfo=UTC),
        generate_journal=fake_generate,
    )

    assert result.mode == "audit"
    assert calls == 0
    assert result.generated == 0
    assert db.query(Journal).count() == 0


@pytest.mark.asyncio
async def test_execute_caps_work_and_isolates_failures(db):
    for user_id in ("a-failing-user", "b-working-user", "c-deferred-user"):
        _add_user_event(
            db,
            user_id=user_id,
            event_id=f"{user_id}-event",
            created_at=datetime(2026, 7, 25, 18),
        )
    attempted: list[str] = []

    async def fake_generate(_db, **kwargs):
        user_id = kwargs["user_id"]
        attempted.append(user_id)
        if user_id == "a-failing-user":
            raise RuntimeError("provider unavailable")
        return object()

    result = await run_journal_batch(
        db,
        config=_config(execute=True, max_journals=2),
        now_utc=datetime(2026, 7, 26, 10, tzinfo=UTC),
        generate_journal=fake_generate,
    )

    assert attempted == ["a-failing-user", "b-working-user"]
    assert result.generated == 1
    assert result.deferred == 1
    assert len(result.failures) == 1
    assert result.failures[0].user_id == "a-failing-user"
    assert result.exit_code == 1


@pytest.mark.asyncio
async def test_unavailable_lock_skips_all_work(db):
    _add_user_event(
        db,
        user_id="locked-user",
        event_id="locked-event",
        created_at=datetime(2026, 7, 25, 18),
    )
    calls = 0

    async def fake_generate(*_args, **_kwargs):
        nonlocal calls
        calls += 1

    result = await run_journal_batch(
        db,
        config=_config(execute=True),
        now_utc=datetime(2026, 7, 26, 10, tzinfo=UTC),
        generate_journal=fake_generate,
        lock_acquired=False,
    )

    assert result.lock_acquired is False
    assert result.selected == ()
    assert calls == 0


def test_cli_defaults_to_audit_and_command_allowlist_overrides_environment(monkeypatch):
    monkeypatch.setenv("JOURNAL_USER_ALLOWLIST", "environment-user")
    parser = build_argument_parser()

    audit_config = config_from_arguments(parser.parse_args([]))
    execute_config = config_from_arguments(
        parser.parse_args(["--execute", "--user-id", "command-user"])
    )

    assert audit_config.execute is False
    assert audit_config.user_allowlist == frozenset({"environment-user"})
    assert execute_config.execute is True
    assert execute_config.user_allowlist == frozenset({"command-user"})


def test_cli_normalizes_command_allowlist():
    parser = build_argument_parser()
    config = config_from_arguments(
        parser.parse_args(["--user-id", "  approved-user  ", "--user-id", " "])
    )

    assert config.user_allowlist == frozenset({"approved-user"})


def test_sqlite_lock_is_available(db):
    with journal_runner_lock(db.get_bind()) as acquired:
        assert acquired is True

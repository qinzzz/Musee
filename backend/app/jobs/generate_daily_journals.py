from __future__ import annotations

import argparse
import asyncio
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
import os
import sys
from typing import Awaitable, Callable, Iterable, Iterator, Optional, Sequence
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.connection import SessionLocal, engine
from app.database.models import Journal, Session as SessionModel, SessionEvent
from app.services.journal_service import generate_daily_journal
from app.services.session_event_service import (
    derive_session_event_artwork_ids,
    normalize_session_event_type,
)

DEFAULT_TIMEZONE = "America/Los_Angeles"
DEFAULT_LOOKBACK_DAYS = 7
DEFAULT_GRACE_HOURS = 2
DEFAULT_MAX_JOURNALS = 50
DEFAULT_LANGUAGE = "en"
MAX_FAILURE_LOG_CHARS = 300
JOURNAL_RUNNER_LOCK_ID = 4_746_596_828_710_411_413

ENV_TIMEZONE = "JOURNAL_TIMEZONE"
ENV_LOOKBACK_DAYS = "JOURNAL_LOOKBACK_DAYS"
ENV_GRACE_HOURS = "JOURNAL_GRACE_HOURS"
ENV_MAX_PER_RUN = "JOURNAL_MAX_PER_RUN"
ENV_LANGUAGE = "JOURNAL_LANGUAGE"
ENV_USER_ALLOWLIST = "JOURNAL_USER_ALLOWLIST"

GenerateJournal = Callable[..., Awaitable[object]]


@dataclass(frozen=True, order=True)
class JournalCandidate:
    local_date: date
    user_id: str
    eligible_event_count: int = field(compare=False)


@dataclass(frozen=True)
class CandidateDiscovery:
    finalized_dates: tuple[date, ...]
    candidates: tuple[JournalCandidate, ...]
    eligible_user_dates: int
    skipped_existing: int


@dataclass(frozen=True)
class RunnerConfig:
    timezone_name: str = DEFAULT_TIMEZONE
    lookback_days: int = DEFAULT_LOOKBACK_DAYS
    grace_hours: int = DEFAULT_GRACE_HOURS
    max_journals: int = DEFAULT_MAX_JOURNALS
    language: str = DEFAULT_LANGUAGE
    execute: bool = False
    user_allowlist: frozenset[str] = frozenset()

    def validate(self) -> None:
        try:
            ZoneInfo(self.timezone_name)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"Invalid IANA timezone: {self.timezone_name}") from exc
        if self.lookback_days < 1:
            raise ValueError("lookback_days must be at least 1")
        if self.grace_hours < 0:
            raise ValueError("grace_hours cannot be negative")
        if self.max_journals < 1:
            raise ValueError("max_journals must be at least 1")
        if not self.language.strip():
            raise ValueError("language cannot be empty")


@dataclass(frozen=True)
class JournalFailure:
    user_id: str
    local_date: date
    error: str


@dataclass(frozen=True)
class RunnerResult:
    mode: str
    lock_acquired: bool
    discovery: CandidateDiscovery
    selected: tuple[JournalCandidate, ...]
    deferred: int
    generated: int
    failures: tuple[JournalFailure, ...]

    @property
    def exit_code(self) -> int:
        return 1 if self.failures else 0


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def finalized_local_dates(
    *,
    now_utc: datetime,
    timezone_name: str,
    lookback_days: int,
    grace_hours: int,
) -> tuple[date, ...]:
    timezone = ZoneInfo(timezone_name)
    normalized_now = _aware_utc(now_utc)
    local_today = normalized_now.astimezone(timezone).date()
    dates: list[date] = []
    for days_ago in range(lookback_days, 0, -1):
        candidate_date = local_today - timedelta(days=days_ago)
        finalized_at = datetime.combine(
            candidate_date + timedelta(days=1),
            time.min,
            tzinfo=timezone,
        ) + timedelta(hours=grace_hours)
        if normalized_now >= finalized_at.astimezone(UTC):
            dates.append(candidate_date)
    return tuple(dates)


def _eligible_event(event: SessionEvent) -> bool:
    event_type = normalize_session_event_type(event.type, role=event.role)
    if event_type != "user_input":
        return False
    artwork_ids = derive_session_event_artwork_ids(event_type, event.payload)
    return bool((event.content or "").strip() or artwork_ids)


def discover_candidates(
    db: Session,
    *,
    config: RunnerConfig,
    now_utc: datetime,
) -> CandidateDiscovery:
    config.validate()
    dates = finalized_local_dates(
        now_utc=now_utc,
        timezone_name=config.timezone_name,
        lookback_days=config.lookback_days,
        grace_hours=config.grace_hours,
    )
    if not dates:
        return CandidateDiscovery((), (), 0, 0)

    timezone = ZoneInfo(config.timezone_name)
    earliest_local = datetime.combine(dates[0], time.min, tzinfo=timezone)
    latest_local = datetime.combine(dates[-1] + timedelta(days=1), time.min, tzinfo=timezone)
    earliest_utc = earliest_local.astimezone(UTC).replace(tzinfo=None)
    latest_utc = latest_local.astimezone(UTC).replace(tzinfo=None)

    query = (
        db.query(SessionModel.user_id, SessionEvent)
        .join(SessionEvent, SessionEvent.session_id == SessionModel.id)
        .filter(
            SessionEvent.role == "user",
            SessionEvent.created_at >= earliest_utc,
            SessionEvent.created_at < latest_utc,
        )
    )
    if config.user_allowlist:
        query = query.filter(SessionModel.user_id.in_(config.user_allowlist))

    finalized_date_set = set(dates)
    counts: dict[tuple[str, date], int] = {}
    for user_id, event in query.yield_per(500):
        if not user_id or not _eligible_event(event):
            continue
        occurred_at = _aware_utc(event.created_at).astimezone(timezone)
        local_date = occurred_at.date()
        if local_date not in finalized_date_set:
            continue
        key = (user_id, local_date)
        counts[key] = counts.get(key, 0) + 1

    if not counts:
        return CandidateDiscovery(dates, (), 0, 0)

    user_ids = {user_id for user_id, _ in counts}
    existing_pairs = {
        (user_id, local_date)
        for user_id, local_date in (
            db.query(Journal.user_id, Journal.local_date)
            .filter(
                Journal.user_id.in_(user_ids),
                Journal.local_date.in_(dates),
            )
            .all()
        )
    }
    candidates = tuple(
        sorted(
            JournalCandidate(
                user_id=user_id,
                local_date=local_date,
                eligible_event_count=event_count,
            )
            for (user_id, local_date), event_count in counts.items()
            if (user_id, local_date) not in existing_pairs
        )
    )
    return CandidateDiscovery(
        finalized_dates=dates,
        candidates=candidates,
        eligible_user_dates=len(counts),
        skipped_existing=len(existing_pairs.intersection(counts.keys())),
    )


@contextmanager
def journal_runner_lock(bind: Engine) -> Iterator[bool]:
    if bind.dialect.name != "postgresql":
        yield True
        return

    with bind.connect() as connection:
        acquired = bool(
            connection.execute(
                text("SELECT pg_try_advisory_lock(:lock_id)"),
                {"lock_id": JOURNAL_RUNNER_LOCK_ID},
            ).scalar()
        )
        try:
            yield acquired
        finally:
            if acquired:
                connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": JOURNAL_RUNNER_LOCK_ID},
                )


async def run_journal_batch(
    db: Session,
    *,
    config: RunnerConfig,
    now_utc: datetime,
    generate_journal: GenerateJournal = generate_daily_journal,
    lock_acquired: bool = True,
    discovery: Optional[CandidateDiscovery] = None,
) -> RunnerResult:
    if not lock_acquired:
        discovery = discovery or CandidateDiscovery((), (), 0, 0)
        return RunnerResult(
            mode="execute" if config.execute else "audit",
            lock_acquired=False,
            discovery=discovery,
            selected=(),
            deferred=len(discovery.candidates),
            generated=0,
            failures=(),
        )
    discovery = discovery or discover_candidates(db, config=config, now_utc=now_utc)
    selected = discovery.candidates[: config.max_journals]
    deferred = max(0, len(discovery.candidates) - len(selected))
    if not config.execute:
        return RunnerResult(
            mode="audit",
            lock_acquired=True,
            discovery=discovery,
            selected=selected,
            deferred=deferred,
            generated=0,
            failures=(),
        )

    generated = 0
    failures: list[JournalFailure] = []
    for candidate in selected:
        try:
            await generate_journal(
                db,
                user_id=candidate.user_id,
                local_date=candidate.local_date,
                timezone_name=config.timezone_name,
                configured_language=config.language,
                force_regenerate=False,
            )
            generated += 1
        except Exception as exc:
            db.rollback()
            error_text = f"{type(exc).__name__}: {exc}"
            failures.append(
                JournalFailure(
                    user_id=candidate.user_id,
                    local_date=candidate.local_date,
                    error=error_text[:MAX_FAILURE_LOG_CHARS],
                )
            )

    return RunnerResult(
        mode="execute",
        lock_acquired=True,
        discovery=discovery,
        selected=selected,
        deferred=deferred,
        generated=generated,
        failures=tuple(failures),
    )


def _int_environment(name: str, default: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    try:
        return int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


def _environment_allowlist() -> tuple[str, ...]:
    return tuple(
        user_id.strip()
        for user_id in os.environ.get(ENV_USER_ALLOWLIST, "").split(",")
        if user_id.strip()
    )


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Audit or generate missing daily journals for finalized local dates.",
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--execute",
        action="store_true",
        help="Generate and persist journals. Without this flag the runner is read-only.",
    )
    mode_group.add_argument(
        "--dry-run",
        action="store_true",
        help="Explicitly select read-only audit mode (the default).",
    )
    parser.add_argument(
        "--timezone",
        default=os.environ.get(ENV_TIMEZONE, DEFAULT_TIMEZONE),
        help="IANA timezone used to group events into local days.",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=_int_environment(ENV_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS),
    )
    parser.add_argument(
        "--grace-hours",
        type=int,
        default=_int_environment(ENV_GRACE_HOURS, DEFAULT_GRACE_HOURS),
    )
    parser.add_argument(
        "--max-journals",
        type=int,
        default=_int_environment(ENV_MAX_PER_RUN, DEFAULT_MAX_JOURNALS),
    )
    parser.add_argument(
        "--language",
        default=os.environ.get(ENV_LANGUAGE, DEFAULT_LANGUAGE),
    )
    parser.add_argument(
        "--user-id",
        action="append",
        default=None,
        help="Restrict the run to an approved user ID. Repeat for multiple users.",
    )
    return parser


def config_from_arguments(arguments: argparse.Namespace) -> RunnerConfig:
    command_allowlist: Sequence[str] = arguments.user_id or ()
    allowlist = command_allowlist or _environment_allowlist()
    config = RunnerConfig(
        timezone_name=arguments.timezone,
        lookback_days=arguments.lookback_days,
        grace_hours=arguments.grace_hours,
        max_journals=arguments.max_journals,
        language=arguments.language,
        execute=bool(arguments.execute),
        user_allowlist=frozenset(
            user_id.strip()
            for user_id in allowlist
            if user_id.strip()
        ),
    )
    config.validate()
    return config


def initialize_ai_clients() -> None:
    from app.services.artwork_utilities_service import initialize_ai_services

    initialize_ai_services(
        settings.openai_api_key,
        settings.claude_api_key,
        settings.gemini_api_key,
        settings.ai_model_power or settings.ai_model_override,
        settings.ai_model_fast,
    )


def print_result(result: RunnerResult, *, config: RunnerConfig) -> None:
    print(
        "journal-runner"
        f" mode={result.mode}"
        f" timezone={config.timezone_name}"
        f" lookback_days={config.lookback_days}"
        f" grace_hours={config.grace_hours}"
    )
    if not result.lock_acquired:
        print("status=skipped reason=another_runner_holds_lock")
        return

    finalized = ",".join(value.isoformat() for value in result.discovery.finalized_dates) or "none"
    print(
        f"finalized_dates={finalized}"
        f" eligible_user_dates={result.discovery.eligible_user_dates}"
        f" skipped_existing={result.discovery.skipped_existing}"
        f" candidates={len(result.discovery.candidates)}"
        f" selected={len(result.selected)}"
        f" deferred={result.deferred}"
    )
    for candidate in result.selected:
        print(
            f"candidate user_id={candidate.user_id}"
            f" local_date={candidate.local_date.isoformat()}"
            f" eligible_events={candidate.eligible_event_count}"
        )
    for failure in result.failures:
        print(
            f"failure user_id={failure.user_id}"
            f" local_date={failure.local_date.isoformat()}"
            f" error={failure.error}"
        )
    print(f"generated={result.generated} failed={len(result.failures)}")


async def async_main(argv: Optional[Iterable[str]] = None) -> int:
    try:
        parser = build_argument_parser()
        config = config_from_arguments(parser.parse_args(list(argv) if argv is not None else None))
    except ValueError as exc:
        print(f"journal-runner configuration_error={exc}", file=sys.stderr)
        return 2

    with journal_runner_lock(engine) as lock_acquired:
        with SessionLocal() as db:
            now_utc = datetime.now(UTC)
            discovery = (
                discover_candidates(db, config=config, now_utc=now_utc)
                if lock_acquired
                else CandidateDiscovery((), (), 0, 0)
            )
            if config.execute and discovery.candidates:
                initialize_ai_clients()
            result = await run_journal_batch(
                db,
                config=config,
                now_utc=now_utc,
                lock_acquired=lock_acquired,
                discovery=discovery,
            )
    print_result(result, config=config)
    return result.exit_code


def main(argv: Optional[Iterable[str]] = None) -> int:
    return asyncio.run(async_main(argv))


if __name__ == "__main__":
    sys.exit(main())

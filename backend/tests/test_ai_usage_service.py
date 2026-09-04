from app.database.models import AIUsage
from app.models.ai_job import AIJobType
from app.services import ai_usage_service
from app.services.ai_usage_service import fail_ai_usage, start_ai_usage, succeed_ai_usage


def test_ai_usage_success_lifecycle(db):
    usage_id = start_ai_usage(
        user_id="user-1",
        job_type=AIJobType.SESSION_CHAT,
        model="gemini-test",
        subject_type="session_event",
        subject_id="evt-1",
    )

    assert usage_id
    usage = db.query(AIUsage).filter(AIUsage.id == usage_id).one()
    assert usage.status == "running"
    assert usage.user_id == "user-1"
    assert usage.job_type == "session_chat"
    assert usage.model == "gemini-test"
    assert usage.subject_type == "session_event"
    assert usage.subject_id == "evt-1"

    succeed_ai_usage(usage_id, input_tokens=12, output_tokens=34)

    db.expire_all()
    usage = db.query(AIUsage).filter(AIUsage.id == usage_id).one()
    assert usage.status == "succeeded"
    assert usage.input_tokens == 12
    assert usage.output_tokens == 34
    assert usage.completed_at is not None
    assert usage.error_message is None


def test_ai_usage_failure_lifecycle(db):
    usage_id = start_ai_usage(
        user_id="user-1",
        job_type=AIJobType.ARTWORK_IDENTIFICATION,
        model="gemini-test",
        subject_type="artwork",
        subject_id="art-1",
    )

    fail_ai_usage(usage_id, RuntimeError("provider failed"), input_tokens=5)

    usage = db.query(AIUsage).filter(AIUsage.id == usage_id).one()
    assert usage.status == "failed"
    assert usage.input_tokens == 5
    assert usage.output_tokens is None
    assert usage.error_message == "provider failed"
    assert usage.completed_at is not None


def test_ai_usage_is_best_effort_when_session_factory_fails(monkeypatch):
    def broken_session_factory():
        raise RuntimeError("db unavailable")

    monkeypatch.setattr(ai_usage_service, "SessionLocal", broken_session_factory)

    assert (
        start_ai_usage(
            user_id="user-1",
            job_type=AIJobType.SESSION_CHAT,
            model="gemini-test",
        )
        is None
    )
    finish_result = ai_usage_service.finish_ai_usage("aiu-missing", status="succeeded")
    assert finish_result is None

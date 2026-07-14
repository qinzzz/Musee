"""Unit tests for the fixed-window rate limiter (endpoints run it disabled
under ENV=test; the class itself is exercised directly here)."""
from app.utils.rate_limit import FixedWindowLimiter


def test_allows_up_to_limit_then_blocks():
    limiter = FixedWindowLimiter(limit=3, window_seconds=60)
    assert [limiter.allow("ip-1", now=t) for t in (0, 1, 2)] == [True, True, True]
    assert limiter.allow("ip-1", now=3) is False


def test_window_slides():
    limiter = FixedWindowLimiter(limit=2, window_seconds=10)
    assert limiter.allow("ip-1", now=0)
    assert limiter.allow("ip-1", now=1)
    assert limiter.allow("ip-1", now=2) is False
    # First hit ages out of the window.
    assert limiter.allow("ip-1", now=10.5) is True


def test_keys_are_independent():
    limiter = FixedWindowLimiter(limit=1, window_seconds=60)
    assert limiter.allow("ip-1", now=0)
    assert limiter.allow("ip-2", now=0)
    assert limiter.allow("ip-1", now=1) is False

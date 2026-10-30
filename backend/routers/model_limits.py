"""In-memory limits for paid model calls.

Demo analyst chat is unauthenticated, so a new session cookie is not a cost
control. Each connecting client gets a short window, and the process also
stops after a small number of paid demo calls per UTC day. Window entries are
removed once they expire so the maps do not grow for the life of the process.

Authenticated analyst chat keeps its own per-session window in the same store.
It does not consume the demo daily cap.
"""

from __future__ import annotations

import os
import time
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request

DEFAULT_CLIENT_LIMIT = 5
DEFAULT_WINDOW_SECONDS = 30 * 60
DEFAULT_DAILY_CAP = 20

_windows: dict[str, _Window] = {}
_daily_calls: dict[str, int] = {}


@dataclass
class _Window:
    hits: deque[float]
    window_seconds: int


def _now() -> float:
    return time.time()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def reset_model_limits() -> None:
    """Drop all counters. Tests use this so cases do not share a budget."""
    _windows.clear()
    _daily_calls.clear()


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if value < 1:
        return default
    return value


def client_rate_limit() -> int:
    return _positive_int("DEMO_CLIENT_RATE_LIMIT", DEFAULT_CLIENT_LIMIT)


def client_window_seconds() -> int:
    return _positive_int("DEMO_CLIENT_RATE_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS)


def daily_model_cap() -> int:
    return _positive_int("DEMO_DAILY_MODEL_CAP", DEFAULT_DAILY_CAP)


def client_host(request: Request) -> str:
    """Identity for the per-client demo cap. Cookie rotation does not change it."""
    client = request.client
    if client is None or not client.host:
        return "unknown"
    return client.host


def _prune(now: float) -> None:
    expired: list[str] = []
    for key, window in _windows.items():
        cutoff = now - window.window_seconds
        while window.hits and window.hits[0] < cutoff:
            window.hits.popleft()
        if not window.hits:
            expired.append(key)
    for key in expired:
        del _windows[key]


def _prune_daily(today: str) -> None:
    stale = [day for day in _daily_calls if day < today]
    for day in stale:
        del _daily_calls[day]


def _seconds_until_utc_midnight(now: datetime) -> int:
    tomorrow = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
    return max(1, int((tomorrow - now).total_seconds()))


def _reject(detail: str, retry_after: int) -> None:
    raise HTTPException(
        status_code=429,
        detail=detail,
        headers={"Retry-After": str(retry_after)},
    )


def consume_rate_limit(
    key: str,
    *,
    max_hits: int,
    window_seconds: int,
    detail: str,
) -> None:
    """Record one hit or raise 429. Expired keys are deleted first."""
    now = _now()
    _prune(now)
    window = _windows.get(key)
    if window is None:
        window = _Window(hits=deque(), window_seconds=window_seconds)
    else:
        window.window_seconds = window_seconds
    if len(window.hits) >= max_hits:
        retry_after = max(1, int(window.hits[0] + window_seconds - now))
        _reject(detail, retry_after)
    window.hits.append(now)
    _windows[key] = window


def consume_demo_model_call(client_id: str) -> None:
    """Charge one paid demo call against the client window and the daily cap."""
    now = _now()
    today = _utc_now().date().isoformat()
    _prune(now)
    _prune_daily(today)

    max_hits = client_rate_limit()
    window_seconds = client_window_seconds()
    cap = daily_model_cap()
    key = f"demo-client:{client_id}"

    window = _windows.get(key)
    if window is None:
        window = _Window(hits=deque(), window_seconds=window_seconds)
    else:
        window.window_seconds = window_seconds

    if len(window.hits) >= max_hits:
        retry_after = max(1, int(window.hits[0] + window_seconds - now))
        minutes = max(1, window_seconds // 60)
        _reject(
            (
                f"Rate limit reached ({max_hits} demo questions per {minutes} minutes "
                "for this client)."
            ),
            retry_after,
        )

    used = _daily_calls.get(today, 0)
    if used >= cap:
        _reject(
            f"Daily limit reached ({cap} paid demo model calls per day).",
            _seconds_until_utc_midnight(_utc_now()),
        )

    window.hits.append(now)
    _windows[key] = window
    _daily_calls[today] = used + 1

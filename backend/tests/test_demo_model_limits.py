"""Caps for unauthenticated demo model calls."""

import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from main import app
from routers import model_limits
from routers.analyst import RATE_LIMIT_WINDOW_SECONDS, _check_rate_limit
from routers.model_limits import reset_model_limits
from schemas import AnalystChatResponse

PAID_BODY = {
    "messages": [{"role": "user", "content": "How much did I spend on coffee?"}],
    "demo_ledger_csv": "date,description,amount\n2025-01-01,Coffee,-4.00\n",
}


def _allow_model(monkeypatch) -> dict[str, int]:
    calls = {"n": 0}

    def fake_response(_req, _ledger):
        calls["n"] += 1
        return AnalystChatResponse(content="ok")

    monkeypatch.setattr("routers.demo.build_analyst_response", fake_response)
    return calls


def _configure(monkeypatch, *, client_limit: str, daily_cap: str, window: str = "1800") -> None:
    monkeypatch.setenv("DEMO_CLIENT_RATE_LIMIT", client_limit)
    monkeypatch.setenv("DEMO_DAILY_MODEL_CAP", daily_cap)
    monkeypatch.setenv("DEMO_CLIENT_RATE_WINDOW_SECONDS", window)
    reset_model_limits()


def test_demo_client_rate_limit_returns_429_and_does_not_call_model(monkeypatch):
    _configure(monkeypatch, client_limit="2", daily_cap="100")
    calls = _allow_model(monkeypatch)
    client = TestClient(app, client=("203.0.113.10", 50000))

    assert client.post("/api/demo/analyst/chat", json=PAID_BODY).status_code == 200
    assert client.post("/api/demo/analyst/chat", json=PAID_BODY).status_code == 200
    blocked = client.post("/api/demo/analyst/chat", json=PAID_BODY)

    assert blocked.status_code == 429
    assert "Rate limit reached" in blocked.json()["detail"]
    assert int(blocked.headers["retry-after"]) >= 1
    assert calls["n"] == 2


def test_new_session_does_not_bypass_client_limit(monkeypatch):
    _configure(monkeypatch, client_limit="1", daily_cap="100")
    _allow_model(monkeypatch)
    first = TestClient(app, client=("203.0.113.11", 50000))
    second = TestClient(app, client=("203.0.113.11", 50001))

    assert first.post("/api/demo/analyst/chat", json=PAID_BODY).status_code == 200
    blocked = second.post("/api/demo/analyst/chat", json=PAID_BODY)

    assert blocked.status_code == 429
    assert "this client" in blocked.json()["detail"]


def test_daily_cap_is_shared_across_clients(monkeypatch):
    _configure(monkeypatch, client_limit="10", daily_cap="2")
    calls = _allow_model(monkeypatch)
    first = TestClient(app, client=("203.0.113.21", 50000))
    second = TestClient(app, client=("203.0.113.22", 50000))
    third = TestClient(app, client=("203.0.113.23", 50000))

    assert first.post("/api/demo/analyst/chat", json=PAID_BODY).status_code == 200
    assert second.post("/api/demo/analyst/chat", json=PAID_BODY).status_code == 200
    blocked = third.post("/api/demo/analyst/chat", json=PAID_BODY)

    assert blocked.status_code == 429
    assert "Daily limit reached" in blocked.json()["detail"]
    assert int(blocked.headers["retry-after"]) >= 1
    assert calls["n"] == 2


def test_prompt_without_a_ledger_does_not_consume_the_daily_cap(monkeypatch):
    _configure(monkeypatch, client_limit="5", daily_cap="1")
    calls = _allow_model(monkeypatch)
    client = TestClient(app, client=("203.0.113.30", 50000))

    preview = client.post(
        "/api/demo/analyst/chat",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )
    paid = client.post("/api/demo/analyst/chat", json=PAID_BODY)

    assert preview.status_code == 200
    assert preview.json()["content"] == "Load the demo data first, then ask a question."
    assert paid.status_code == 200
    assert calls["n"] == 1


def test_expired_client_windows_are_removed(monkeypatch):
    clock = {"t": 1_700_000_000.0}
    monkeypatch.setattr(model_limits, "_now", lambda: clock["t"])
    monkeypatch.setattr(
        model_limits,
        "_utc_now",
        lambda: datetime(2026, 10, 30, 12, 0, tzinfo=UTC),
    )
    _configure(monkeypatch, client_limit="1", daily_cap="1000", window="30")

    for index in range(40):
        model_limits.consume_demo_model_call(f"198.51.100.{index}")
    assert len(model_limits._windows) == 40

    clock["t"] += 31
    model_limits.consume_demo_model_call("198.51.100.200")

    assert set(model_limits._windows) == {"demo-client:198.51.100.200"}


def test_previous_utc_day_does_not_count_against_today(monkeypatch):
    current = {"when": datetime(2026, 10, 30, 23, 0, tzinfo=UTC)}
    monkeypatch.setattr(model_limits, "_utc_now", lambda: current["when"])
    _configure(monkeypatch, client_limit="10", daily_cap="1")

    model_limits.consume_demo_model_call("203.0.113.40")
    current["when"] = datetime(2026, 10, 31, 0, 5, tzinfo=UTC)
    model_limits.consume_demo_model_call("203.0.113.41")

    assert model_limits._daily_calls == {"2026-10-31": 1}


def test_invalid_cap_env_falls_back_to_defaults(monkeypatch):
    monkeypatch.setenv("DEMO_CLIENT_RATE_LIMIT", "0")
    monkeypatch.setenv("DEMO_DAILY_MODEL_CAP", "many")
    monkeypatch.setenv("DEMO_CLIENT_RATE_WINDOW_SECONDS", "")

    assert model_limits.client_rate_limit() == model_limits.DEFAULT_CLIENT_LIMIT
    assert model_limits.daily_model_cap() == model_limits.DEFAULT_DAILY_CAP
    assert model_limits.client_window_seconds() == model_limits.DEFAULT_WINDOW_SECONDS


def test_analyst_session_buckets_expire(monkeypatch):
    clock = {"t": 1_800_000_000.0}
    monkeypatch.setattr(model_limits, "_now", lambda: clock["t"])
    reset_model_limits()

    _check_rate_limit("session-a")
    assert "session:session-a" in model_limits._windows

    clock["t"] += RATE_LIMIT_WINDOW_SECONDS + 1
    _check_rate_limit("session-b")

    assert set(model_limits._windows) == {"session:session-b"}

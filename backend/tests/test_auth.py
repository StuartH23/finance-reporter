"""Tests for the API auth boundary."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from auth import get_current_user
from main import app
from routers.upload import _session_last_seen, _session_owners, _sessions


AUTH_ENV_VARS = (
    "APP_ENV",
    "AUTH_MODE",
    "DEV_USER_ID",
    "COGNITO_REGION",
    "COGNITO_USER_POOL_ID",
    "COGNITO_APP_CLIENT_ID",
    "COGNITO_REQUIRED_SCOPES",
)


def _clear_auth_env(monkeypatch):
    for var in AUTH_ENV_VARS:
        monkeypatch.delenv(var, raising=False)


def test_local_auth_mode_allows_existing_dev_flow(monkeypatch):
    _clear_auth_env(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/ledger")

    assert response.status_code == 200
    assert response.json() == {"transactions": [], "count": 0}


def test_current_user_uses_configured_dev_user(monkeypatch):
    _clear_auth_env(monkeypatch)
    monkeypatch.setenv("DEV_USER_ID", "dev-user-123")

    request = SimpleNamespace(state=SimpleNamespace())
    current_user = get_current_user(request)  # type: ignore[arg-type]

    assert current_user.user_id == "dev-user-123"
    assert current_user.auth_mode == "disabled"


def test_cognito_mode_requires_bearer_token(monkeypatch):
    _clear_auth_env(monkeypatch)
    monkeypatch.setenv("AUTH_MODE", "cognito")
    monkeypatch.setenv("COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "us-east-1_example")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "example-client")
    client = TestClient(app)

    response = client.get("/api/ledger")

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token."


def test_health_and_reference_categories_stay_public_in_cognito_mode(monkeypatch):
    _clear_auth_env(monkeypatch)
    monkeypatch.setenv("AUTH_MODE", "cognito")
    monkeypatch.setenv("COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "us-east-1_example")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "example-client")
    client = TestClient(app)

    health = client.get("/api/health")
    categories = client.get("/api/categories")

    assert health.status_code == 200
    assert categories.status_code == 200


def test_public_write_routes_require_auth_in_cognito_mode(monkeypatch):
    _clear_auth_env(monkeypatch)
    monkeypatch.setenv("AUTH_MODE", "cognito")
    monkeypatch.setenv("COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "us-east-1_example")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "example-client")
    client = TestClient(app)

    response = client.post(
        "/api/feature-interest",
        json={"email": "user@example.com", "features": ["Goal Buckets"]},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token."


def test_analyst_chat_requires_auth_in_cognito_mode(monkeypatch):
    _clear_auth_env(monkeypatch)
    monkeypatch.setenv("AUTH_MODE", "cognito")
    monkeypatch.setenv("COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "us-east-1_example")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "example-client")
    client = TestClient(app)

    response = client.post(
        "/api/analyst/chat",
        json={"messages": [{"role": "user", "content": "How am I doing?"}]},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token."


def test_demo_analyst_chat_stays_public_in_cognito_mode(monkeypatch):
    _clear_auth_env(monkeypatch)
    monkeypatch.setenv("AUTH_MODE", "cognito")
    monkeypatch.setenv("COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "us-east-1_example")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "example-client")
    client = TestClient(app)

    response = client.post(
        "/api/demo/analyst/chat",
        json={"messages": [{"role": "user", "content": "How am I doing?"}]},
    )

    assert response.status_code == 200
    assert response.json() == {"content": "Load the demo data first, then ask a question."}


def test_session_cookie_cannot_cross_local_auth_users(monkeypatch):
    _clear_auth_env(monkeypatch)
    monkeypatch.setenv("AUTH_MODE", "local")
    monkeypatch.setenv("DEV_USER_ID", "user-a")
    client_a = TestClient(app)
    upload = client_a.post(
        "/api/upload",
        files=[("files", ("a.csv", b"Date,Description,Amount\n2025-01-01,A,100\n", "text/csv"))],
    )
    assert upload.status_code == 200
    stolen_session = upload.cookies["session_id"]

    monkeypatch.setenv("DEV_USER_ID", "user-b")
    client_b = TestClient(app)
    client_b.cookies.set("session_id", stolen_session)
    ledger = client_b.get("/api/ledger")

    assert ledger.status_code == 200
    assert ledger.json() == {"transactions": [], "count": 0}
    assert _session_owners[stolen_session] == "user-a"

    _sessions.pop(stolen_session, None)
    _session_last_seen.pop(stolen_session, None)
    _session_owners.pop(stolen_session, None)


def test_auth_disabled_fails_closed_in_production(monkeypatch):
    _clear_auth_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_MODE", "disabled")
    client = TestClient(app)

    response = client.get("/api/ledger")

    assert response.status_code == 500
    assert response.json()["detail"] == "AUTH_MODE cannot be disabled when APP_ENV=production."

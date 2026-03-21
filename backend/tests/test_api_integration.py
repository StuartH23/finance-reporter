"""Integration tests for session-based API — confirms cookie-based session isolation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from main import app


def test_upload_sets_session_cookie():
    """Upload should set a session_id cookie."""
    client = TestClient(app)
    csv = b"Date,Description,Amount\n2025-01-01,Test,100.00\n"
    response = client.post(
        "/api/upload",
        files=[("files", ("test.csv", csv, "text/csv"))],
    )
    assert response.status_code == 200
    assert "session_id" in response.cookies


def test_ledger_returns_data_with_session():
    """After upload, ledger should return the uploaded data when same session is used."""
    client = TestClient(app)
    csv = b"Date,Description,Amount\n2025-03-01,Coffee,-4.50\n"
    upload_resp = client.post(
        "/api/upload",
        files=[("files", ("test.csv", csv, "text/csv"))],
    )
    assert upload_resp.status_code == 200

    # Same client preserves cookies
    ledger_resp = client.get("/api/ledger")
    assert ledger_resp.status_code == 200
    data = ledger_resp.json()
    assert data["count"] == 1
    assert data["transactions"][0]["description"] == "Coffee"


def test_different_sessions_isolated():
    """Two different clients should not see each other's data."""
    client_a = TestClient(app)
    client_b = TestClient(app)

    csv_a = b"Date,Description,Amount\n2025-01-01,User A Payment,100.00\n"
    csv_b = b"Date,Description,Amount\n2025-01-01,User B Payment,200.00\n"

    client_a.post("/api/upload", files=[("files", ("a.csv", csv_a, "text/csv"))])
    client_b.post("/api/upload", files=[("files", ("b.csv", csv_b, "text/csv"))])

    ledger_a = client_a.get("/api/ledger").json()
    ledger_b = client_b.get("/api/ledger").json()

    assert ledger_a["count"] == 1
    assert ledger_b["count"] == 1
    assert ledger_a["transactions"][0]["description"] == "User A Payment"
    assert ledger_b["transactions"][0]["description"] == "User B Payment"


def test_no_session_returns_empty():
    """Without uploading first, endpoints should return empty data."""
    client = TestClient(app)
    resp = client.get("/api/ledger")
    assert resp.status_code == 200
    assert resp.json() == {"transactions": [], "count": 0}


def test_health():
    """Health check should always work."""
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}

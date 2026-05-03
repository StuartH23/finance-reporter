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


def test_budget_quick_check_respects_month_query():
    """Quick check should use the requested month when month=YYYY-MM is provided."""
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2025-01-01,Rent,-500.00\n"
        b"2025-01-31,Rent,-500.00\n"
        b"2025-02-01,Rent,-600.00\n"
        b"2025-02-28,Rent,-600.00\n"
    )
    upload_resp = client.post("/api/upload", files=[("files", ("budget.csv", csv, "text/csv"))])
    assert upload_resp.status_code == 200

    jan_resp = client.get("/api/budget/quick-check?month=2025-01")
    assert jan_resp.status_code == 200
    jan_data = jan_resp.json()
    assert jan_data["month"] == "January 2025"
    assert jan_data["status"] is None
    assert jan_data["total_spent"] == 1000.0

    feb_resp = client.get("/api/budget/quick-check?month=2025-02")
    assert feb_resp.status_code == 200
    feb_data = feb_resp.json()
    assert feb_data["month"] == "February 2025"
    assert feb_data["status"] is None
    assert feb_data["total_spent"] == 1200.0


def test_pnl_categories_respects_year_query():
    """Category breakdown should filter to the requested calendar year."""
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2024-01-05,Salary,1000.00\n"
        b"2024-01-10,Rent,-400.00\n"
        b"2025-01-05,Salary,2000.00\n"
        b"2025-01-10,Rent,-700.00\n"
    )
    upload_resp = client.post("/api/upload", files=[("files", ("pnl.csv", csv, "text/csv"))])
    assert upload_resp.status_code == 200

    all_years = client.get("/api/pnl/categories")
    assert all_years.status_code == 200
    all_data = all_years.json()
    assert sum(item["total"] for item in all_data["spending_chart"]) == 1100.0

    only_2025 = client.get("/api/pnl/categories?year=2025")
    assert only_2025.status_code == 200
    data_2025 = only_2025.json()
    assert sum(item["total"] for item in data_2025["spending_chart"]) == 700.0
    categories_2025 = {item["category"] for item in data_2025["spending_chart"]}
    assert categories_2025 == {"Housing"}

    only_2024 = client.get("/api/pnl/categories?year=2024")
    assert only_2024.status_code == 200
    data_2024 = only_2024.json()
    assert sum(item["total"] for item in data_2024["spending_chart"]) == 400.0
    categories_2024 = {item["category"] for item in data_2024["spending_chart"]}
    assert categories_2024 == {"Housing"}


def test_budget_quick_check_rejects_partial_month():
    """Quick check should not apply budget when selected month is only partially parsed."""
    client = TestClient(app)
    csv = b"Date,Description,Amount\n2025-01-15,Rent,-1000.00\n2025-02-15,Rent,-1200.00\n"
    upload_resp = client.post("/api/upload", files=[("files", ("budget.csv", csv, "text/csv"))])
    assert upload_resp.status_code == 200

    jan_resp = client.get("/api/budget/quick-check?month=2025-01")
    assert jan_resp.status_code == 200
    jan_data = jan_resp.json()
    assert jan_data["month"] == "January 2025"
    assert jan_data["status"] == "no_data"


def test_budget_vs_actual_ignores_partial_months():
    """Budget vs actual should return no comparison when no complete month is parsed."""
    client = TestClient(app)
    csv = b"Date,Description,Amount\n2025-01-15,Rent,-1000.00\n2025-02-15,Groceries,-300.00\n"
    upload_resp = client.post("/api/upload", files=[("files", ("budget.csv", csv, "text/csv"))])
    assert upload_resp.status_code == 200

    resp = client.get("/api/budget/vs-actual")
    assert resp.status_code == 200
    data = resp.json()
    assert data["comparison"] == []
    assert data["summary"] == {}


def test_next_best_action_feed_and_feedback_flow():
    """Feed should return up to 3 actions with rationale/impact and respect dismissal cooldown."""
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-01,Payroll Deposit,3500.00\n"
        b"2026-01-05,Rent Payment,-1400.00\n"
        b"2026-01-10,Groceries,-450.00\n"
        b"2026-01-18,Dining,-220.00\n"
        b"2026-02-01,Payroll Deposit,3550.00\n"
        b"2026-02-05,Rent Payment,-1400.00\n"
        b"2026-02-10,Groceries,-500.00\n"
        b"2026-02-18,Dining,-300.00\n"
    )
    upload_resp = client.post("/api/upload", files=[("files", ("actions.csv", csv, "text/csv"))])
    assert upload_resp.status_code == 200

    feed_resp = client.get("/api/actions/feed")
    assert feed_resp.status_code == 200
    feed = feed_resp.json()
    assert feed["actionable_data_exists"] is True
    assert 1 <= feed["count"] <= 3
    assert len(feed["actions"]) == feed["count"]
    for action in feed["actions"]:
        assert action["rationale"]
        assert action["impact_estimate"]

    first_id = feed["actions"][0]["action_id"]
    feedback_resp = client.post(f"/api/actions/{first_id}/feedback", json={"outcome": "dismissed"})
    assert feedback_resp.status_code == 200
    feedback = feedback_resp.json()
    assert feedback["status"] == "ok"
    assert feedback["outcome"] == "dismissed"
    assert feedback["cooldown_until"] is not None

    refreshed = client.get("/api/actions/feed")
    assert refreshed.status_code == 200
    refreshed_ids = {a["action_id"] for a in refreshed.json()["actions"]}
    assert first_id not in refreshed_ids

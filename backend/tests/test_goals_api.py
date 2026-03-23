"""API tests for goal CRUD, paycheck planning, and progress updates."""

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app


def test_goal_progress_updates_after_upload_sync():
    client = TestClient(app)

    create = client.post(
        "/api/goals",
        json={
            "name": "Emergency Fund",
            "target_amount": 1000,
            "target_date": "2026-12-31",
            "priority": 1,
            "category": "emergency",
            "status": "active",
        },
    )
    assert create.status_code == 200

    before = client.get("/api/goals").json()
    assert before["count"] == 1
    assert before["goals"][0]["contributed_amount"] == 0

    csv = (
        b"Date,Description,Amount\n"
        b"2026-03-05,Emergency fund transfer,-200.00\n"
        b"2026-03-19,Emergency fund transfer,-150.00\n"
    )
    upload = client.post("/api/upload", files=[("files", ("sync.csv", csv, "text/csv"))])
    assert upload.status_code == 200

    after = client.get("/api/goals").json()
    assert after["count"] == 1
    assert after["goals"][0]["contributed_amount"] == 350.0
    assert after["goals"][0]["remaining_amount"] == 650.0


def test_recommendation_and_custom_override_save_flow():
    client = TestClient(app)

    create = client.post(
        "/api/goals",
        json={
            "name": "Vacation",
            "target_amount": 1200,
            "target_date": "2026-09-01",
            "priority": 2,
            "category": "vacation",
            "status": "active",
        },
    )
    assert create.status_code == 200
    goal = create.json()["goal"]

    recommendation = client.post(
        "/api/goals/paycheck-plan",
        json={
            "paycheck_amount": 1800,
            "fixed_obligations": [
                {"name": "Rent", "amount": 1000},
                {"name": "Utilities", "amount": 120},
            ],
            "safety_buffer": 150,
            "minimum_emergency_buffer": 0,
            "mode": "balanced",
            "paychecks_per_month": 2,
            "goal_ids": [goal["id"]],
        },
    )
    assert recommendation.status_code == 200
    rec = recommendation.json()
    assert rec["needs"] >= 1120
    assert rec["goals"] > 0
    assert rec["what_changed"]

    save = client.post(
        "/api/goals/paycheck-plan/save",
        json={
            "paycheck_amount": rec["paycheck_amount"],
            "fixed_obligations": [
                {"name": "Rent", "amount": 1000},
                {"name": "Utilities", "amount": 120},
            ],
            "safety_buffer_reserved": rec["safety_buffer_reserved"],
            "minimum_emergency_buffer": 0,
            "mode": rec["allocation_mode"],
            "needs": rec["needs"],
            "goals": rec["goals"],
            "discretionary": rec["discretionary"],
            "goal_allocations": rec["goal_allocations"],
        },
    )
    assert save.status_code == 200
    assert save.json()["status"] == "saved"

    saved = client.get("/api/goals/paycheck-plan/saved")
    assert saved.status_code == 200
    payload = saved.json()
    assert payload["status"] == "ok"
    assert payload["plan"]["paycheck_amount"] == rec["paycheck_amount"]


def test_recommendation_warns_when_goal_is_infeasible():
    client = TestClient(app)
    create = client.post(
        "/api/goals",
        json={
            "name": "Debt Extra",
            "target_amount": 5000,
            "target_date": "2026-04-01",
            "priority": 1,
            "category": "debt_extra_payment",
            "status": "active",
        },
    )
    assert create.status_code == 200

    recommendation = client.post(
        "/api/goals/paycheck-plan",
        json={
            "paycheck_amount": 1200,
            "fixed_obligations": [{"name": "Rent", "amount": 1000}],
            "safety_buffer": 100,
            "minimum_emergency_buffer": 0,
            "mode": "balanced",
            "paychecks_per_month": 2,
        },
    )
    assert recommendation.status_code == 200
    warnings = recommendation.json()["warnings"]
    assert any("needs about" in warning for warning in warnings)

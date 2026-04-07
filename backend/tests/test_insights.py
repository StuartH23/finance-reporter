"""Tests for coach-style insight generation and API response shape."""

import sys
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app
from sdk.insights import build_insights


def _ledger(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "date": pd.to_datetime(date_str),
                "description": category,
                "amount": amount,
                "category": category,
                "source_file": "test.csv",
            }
            for date_str, category, amount in rows
        ]
    )


def test_build_insights_contains_required_sections_and_consistent_metrics(monkeypatch):
    monkeypatch.setattr("sdk.insights.load_budget", lambda: {})

    ledger = _ledger(
        [
            ("2025-01-01", "Income", 4000.0),
            ("2025-01-31", "Rent", -1200.0),
            ("2025-01-15", "Food", -400.0),
            ("2025-02-01", "Income", 4000.0),
            ("2025-02-28", "Rent", -1200.0),
            ("2025-02-15", "Food", -600.0),
            ("2025-03-01", "Income", 4000.0),
            ("2025-03-31", "Rent", -1200.0),
            ("2025-03-15", "Food", -900.0),
        ]
    )

    payload = build_insights(ledger)
    assert payload["insights"], "Expected at least one insight for three complete months"

    for insight in payload["insights"]:
        assert insight["observation"]
        assert insight["significance"]
        assert insight["action"]
        assert insight["why_this_matters"]
        assert insight["do_this_now"]

    trend = next((i for i in payload["insights"] if i["kind"] == "spending_trend"), None)
    assert trend is not None
    assert trend["template_vars"]["category"] == "Food"
    assert trend["template_vars"]["change_amount"] == 300.0
    assert trend["template_vars"]["prior_amount"] == 600.0
    assert trend["template_vars"]["current_amount"] == 900.0


def test_build_insights_low_data_returns_no_insights(monkeypatch):
    monkeypatch.setattr("sdk.insights.load_budget", lambda: {})

    ledger = _ledger(
        [
            ("2025-03-01", "Income", 3000.0),
            ("2025-03-31", "Rent", -1200.0),
        ]
    )

    payload = build_insights(ledger)
    assert payload["insights"] == []


def test_build_insights_confidence_threshold_suppresses_noisy_signals(monkeypatch):
    monkeypatch.setattr("sdk.insights.load_budget", lambda: {})

    ledger = _ledger(
        [
            ("2025-01-01", "Income", 2500.0),
            ("2025-01-31", "Income", 2500.0),
            ("2025-01-15", "Travel", -100.0),
            ("2025-02-01", "Income", 2500.0),
            ("2025-02-28", "Income", 2500.0),
            ("2025-02-15", "Travel", -900.0),
        ]
    )

    payload = build_insights(ledger, confidence_threshold=0.95)
    assert payload["insights"] == []
    assert payload["suppressed"] >= 1


def test_build_insights_avoids_conflicting_positive_with_off_track_goal(monkeypatch):
    monkeypatch.setattr("sdk.insights.load_budget", lambda: {"Food": 100.0})

    ledger = _ledger(
        [
            ("2025-01-01", "Income", 1500.0),
            ("2025-01-31", "Food", -400.0),
            ("2025-02-01", "Income", 1500.0),
            ("2025-02-28", "Food", -450.0),
        ]
    )

    payload = build_insights(ledger)
    kinds = {item["kind"] for item in payload["insights"]}
    assert "goal_trajectory" in kinds
    assert "positive_reinforcement" not in kinds


def test_insights_api_returns_contract():
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2025-01-01,Income,4000.00\n"
        b"2025-01-31,Rent,-1200.00\n"
        b"2025-02-01,Income,4000.00\n"
        b"2025-02-28,Rent,-1200.00\n"
    )
    upload_resp = client.post("/api/upload", files=[("files", ("test.csv", csv, "text/csv"))])
    assert upload_resp.status_code == 200

    resp = client.get("/api/insights")
    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) == {
        "generated_at",
        "locale",
        "currency",
        "period_label",
        "insights",
        "digest",
        "suppressed",
    }

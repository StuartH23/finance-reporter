"""Tests for recurring/subscription detection and subscription APIs."""

import sys
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app
from sdk.subscriptions import (
    build_subscription_payload,
    detect_recurring_streams,
    normalize_merchant,
)


def _fixture_ledger() -> pd.DataFrame:
    rows = [
        # True recurring merchants
        ("2025-12-01", "NETFLIX.COM", -15.99),
        ("2026-01-01", "NETFLIX.COM", -15.99),
        ("2026-02-01", "NETFLIX.COM", -17.99),
        ("2025-12-03", "SPOTIFY USA", -10.99),
        ("2026-01-03", "SPOTIFY USA", -10.99),
        ("2026-02-03", "SPOTIFY USA", -10.99),
        ("2026-02-08", "MEALBOX WEEKLY", -49.00),
        ("2026-02-15", "MEALBOX WEEKLY", -49.00),
        ("2026-02-22", "MEALBOX WEEKLY", -49.00),
        ("2026-03-01", "MEALBOX WEEKLY", -49.00),
        ("2024-03-05", "AMAZON PRIME MEMBERSHIP", -139.00),
        ("2025-03-05", "AMAZON PRIME MEMBERSHIP", -139.00),
        ("2026-03-05", "AMAZON PRIME MEMBERSHIP", -139.00),
        # Non recurring merchants
        ("2026-01-12", "COFFEE SHOP 13", -4.20),
        ("2026-02-02", "TARGET #1283", -71.48),
        ("2026-02-24", "AMAZON MKTPLACE PMTS", -52.10),
        ("2026-03-11", "UBER TRIP HELP", -18.50),
        ("2026-03-12", "PAYROLL DEPOSIT", 1250.00),
    ]
    frame = pd.DataFrame(rows, columns=["date", "description", "amount"])
    frame["date"] = pd.to_datetime(frame["date"])
    frame["category"] = "Other"
    frame["source_file"] = "fixture.csv"
    return frame


def test_recurring_detection_precision_on_sample_fixture():
    ledger = _fixture_ledger()
    streams = detect_recurring_streams(ledger)
    predicted = {s.merchant for s in streams}
    expected_positive = {
        normalize_merchant("NETFLIX.COM"),
        normalize_merchant("SPOTIFY USA"),
        normalize_merchant("MEALBOX WEEKLY"),
        normalize_merchant("AMAZON PRIME MEMBERSHIP"),
    }

    true_positive = len(predicted & expected_positive)
    false_positive = len(predicted - expected_positive)
    precision = true_positive / (true_positive + false_positive) if predicted else 0.0
    assert precision >= 0.90


def test_subscription_alerts_and_ignore_flow():
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-05,NETFLIX.COM,-15.00\n"
        b"2026-02-05,NETFLIX.COM,-15.00\n"
        b"2026-03-05,NETFLIX.COM,-18.00\n"
        b"2026-02-10,NEW APP SERVICE,-5.00\n"
        b"2026-03-10,NEW APP SERVICE,-5.00\n"
        b"2026-03-14,One-off Purchase,-75.00\n"
    )
    upload_resp = client.post(
        "/api/upload", files=[("files", ("subscriptions.csv", csv, "text/csv"))]
    )
    assert upload_resp.status_code == 200

    sub_resp = client.get("/api/subscriptions")
    assert sub_resp.status_code == 200
    data = sub_resp.json()
    assert data["count"] >= 2
    netflix = next((s for s in data["subscriptions"] if "NETFLIX" in s["merchant"]), None)
    assert netflix is not None
    assert netflix["price_increase"] is True

    alerts_resp = client.get("/api/subscriptions/alerts?threshold=0.10")
    assert alerts_resp.status_code == 200
    alerts = alerts_resp.json()["alerts"]
    alert_types = {a["alert_type"] for a in alerts}
    assert "price_increased" in alert_types
    assert "new_recurring_charge_detected" in alert_types

    pref_resp = client.post(
        f"/api/subscriptions/{netflix['stream_id']}/preferences",
        json={"ignored": True},
    )
    assert pref_resp.status_code == 200
    assert pref_resp.json()["ignored"] is True

    after_ignore = client.get("/api/subscriptions").json()
    assert all(s["stream_id"] != netflix["stream_id"] for s in after_ignore["subscriptions"])


def test_recurring_v2_classifies_paid_variance_upcoming_and_inactive_states():
    paid_variance = pd.DataFrame(
        [
            ("2026-01-15", "UTILITY SUB", -20.0),
            ("2026-02-14", "UTILITY SUB", -20.0),
            ("2026-03-16", "UTILITY SUB", -30.0),
        ],
        columns=["date", "description", "amount"],
    )
    paid_variance["date"] = pd.to_datetime(paid_variance["date"])
    paid_variance["category"] = "Subscriptions"
    paid_variance["source_file"] = "fixture.csv"
    variance_payload = build_subscription_payload(paid_variance)
    assert variance_payload[0]["payment_state"] == "paid_variance"
    assert variance_payload[0]["status_group"] == "active"
    assert variance_payload[0]["last_paid_amount"] == 30.0

    upcoming = pd.DataFrame(
        [
            ("2026-01-10", "STREAMING SERVICE", -12.0),
            ("2026-02-09", "STREAMING SERVICE", -12.0),
            ("2026-03-11", "STREAMING SERVICE", -12.0),
        ],
        columns=["date", "description", "amount"],
    )
    upcoming["date"] = pd.to_datetime(upcoming["date"])
    upcoming["category"] = "Subscriptions"
    upcoming["source_file"] = "fixture.csv"
    upcoming_payload = build_subscription_payload(upcoming)
    assert upcoming_payload[0]["payment_state"] == "paid_ok"
    assert upcoming_payload[0]["next_due_date"] == "2026-03-11"

    inactive = pd.DataFrame(
        [
            ("2025-12-01", "OLD BOX", -9.0),
            ("2025-12-31", "OLD BOX", -9.0),
            ("2026-01-30", "OLD BOX", -9.0),
            ("2026-03-30", "REFERENCE", -5.0),
            ("2026-04-29", "REFERENCE", -5.0),
        ],
        columns=["date", "description", "amount"],
    )
    inactive["date"] = pd.to_datetime(inactive["date"])
    inactive["category"] = "Subscriptions"
    inactive["source_file"] = "fixture.csv"
    inactive_payload = [
        item for item in build_subscription_payload(inactive) if item["merchant"] == "OLD BOX"
    ]
    assert inactive_payload[0]["payment_state"] == "inactive"
    assert inactive_payload[0]["status_group"] == "inactive"


def test_subscriptions_filters_count_before_pagination():
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-10,STREAMING SERVICE,-12.00\n"
        b"2026-02-09,STREAMING SERVICE,-12.00\n"
        b"2026-03-11,STREAMING SERVICE,-12.00\n"
        b"2026-01-15,UTILITY SUB,-20.00\n"
        b"2026-02-14,UTILITY SUB,-20.00\n"
        b"2026-03-16,UTILITY SUB,-30.00\n"
    )
    upload_resp = client.post(
        "/api/upload", files=[("files", ("subscriptions.csv", csv, "text/csv"))]
    )
    assert upload_resp.status_code == 200

    response = client.get(
        "/api/subscriptions?view=upcoming&month=2026-03&sort=due_asc&page=1&page_size=1"
    )
    assert response.status_code == 200
    data = response.json()

    assert data["count"] == 2
    assert len(data["subscriptions"]) == 1
    assert data["subscriptions"][0]["next_due_date"] == "2026-03-11"

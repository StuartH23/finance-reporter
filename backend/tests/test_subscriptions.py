"""Tests for recurring/subscription detection and subscription APIs."""

import sys
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app
from routers import subscriptions as subscription_router
from sdk.merchant_directory import lookup_cancel_info
from sdk.subscriptions import (
    build_subscription_payload,
    build_subscription_summary,
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


def test_subscription_payload_includes_dominant_category_from_transactions():
    ledger = pd.DataFrame(
        [
            ("2026-01-05", "NETFLIX.COM", -15.99, "Subscriptions"),
            ("2026-02-05", "NETFLIX.COM", -15.99, "Entertainment"),
            ("2026-03-05", "NETFLIX.COM", -15.99, "Entertainment"),
        ],
        columns=["date", "description", "amount", "category"],
    )
    ledger["date"] = pd.to_datetime(ledger["date"])
    ledger["source_file"] = "fixture.csv"

    payload = build_subscription_payload(ledger)
    netflix = next(item for item in payload if "NETFLIX" in item["merchant"])

    assert netflix["dominant_category"] == "Entertainment"


def _summary_fixture(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    frame = pd.DataFrame(rows, columns=["date", "description", "amount"])
    frame["date"] = pd.to_datetime(frame["date"])
    frame["category"] = "Subscriptions"
    frame["source_file"] = "fixture.csv"
    return frame


def test_summary_latest_month_total_uses_reference_date_month_to_date():
    ledger = _summary_fixture(
        [
            ("2026-01-10", "STREAMING SERVICE", -12.00),
            ("2026-02-09", "STREAMING SERVICE", -12.00),
            ("2026-03-11", "STREAMING SERVICE", -12.00),
            ("2026-04-12", "STREAMING SERVICE", -12.00),
            ("2026-01-15", "UTILITY SUB", -20.00),
            ("2026-02-14", "UTILITY SUB", -20.00),
            ("2026-03-16", "UTILITY SUB", -20.00),
            ("2026-04-15", "UTILITY SUB", -20.00),
        ]
    )
    payload = build_subscription_payload(ledger)
    summary = build_subscription_summary(payload, ledger)

    # Reference date is 2026-04-15 — mid-month, so total reflects April-to-date
    assert summary["latest_month_label"] == "2026-04"
    assert summary["latest_month_is_complete"] is False
    assert summary["latest_month_total"] == 32.00
    assert summary["active_count"] == 2
    # Two monthly subs at $12 and $20 → $32/mo run rate
    assert summary["monthly_run_rate"] == 32.00
    assert summary["annual_run_rate"] == 384.00


def test_summary_marks_month_complete_on_last_calendar_day():
    ledger = _summary_fixture(
        [
            ("2026-02-28", "STREAMING SERVICE", -12.00),
            ("2026-03-30", "STREAMING SERVICE", -12.00),
            ("2026-04-30", "STREAMING SERVICE", -12.00),
        ]
    )
    payload = build_subscription_payload(ledger)
    summary = build_subscription_summary(payload, ledger)

    assert summary["latest_month_label"] == "2026-04"
    assert summary["latest_month_is_complete"] is True
    assert summary["latest_month_total"] == 12.00


def test_summary_excludes_ignored_streams_from_aggregates():
    ledger = _summary_fixture(
        [
            ("2026-01-10", "STREAMING SERVICE", -12.00),
            ("2026-02-09", "STREAMING SERVICE", -12.00),
            ("2026-03-11", "STREAMING SERVICE", -12.00),
            ("2026-01-15", "UTILITY SUB", -20.00),
            ("2026-02-14", "UTILITY SUB", -20.00),
            ("2026-03-16", "UTILITY SUB", -20.00),
        ]
    )
    payload = build_subscription_payload(ledger)
    streaming_stream_id = next(p["stream_id"] for p in payload if "STREAMING" in p["merchant"])
    payload_with_ignore = [
        {**p, "ignored": True} if p["stream_id"] == streaming_stream_id else p for p in payload
    ]

    summary = build_subscription_summary(payload_with_ignore, ledger)
    assert summary["active_count"] == 1
    assert summary["monthly_run_rate"] == 20.00
    # March total only includes non-ignored Utility charge
    assert summary["latest_month_total"] == 20.00


def test_subscriptions_endpoint_returns_summary_unaffected_by_filters_and_pagination():
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
        "/api/upload", files=[("files", ("summary.csv", csv, "text/csv"))]
    )
    assert upload_resp.status_code == 200

    full = client.get("/api/subscriptions").json()
    assert "summary" in full
    full_summary = full["summary"]
    assert full_summary["active_count"] == 2
    assert full_summary["latest_month_label"] == "2026-03"

    # Apply a filter that shrinks the visible list and paginate to 1 item.
    filtered = client.get(
        "/api/subscriptions?filter_increased=true&page=1&page_size=1"
    ).json()
    assert len(filtered["subscriptions"]) <= 1
    # Summary still reflects the full unfiltered set
    assert filtered["summary"] == full_summary


def test_cancel_directory_matches_single_token_canonical_key():
    entry = lookup_cancel_info("NETFLIX")
    assert entry is not None
    assert entry["display_name"] == "Netflix"


def test_cancel_directory_matches_when_brand_token_appears_among_others():
    # Bank statements may pad the merchant with location/billing tokens.
    entry = lookup_cancel_info("NETFLIX BILL CA")
    assert entry is not None
    assert entry["canonical_key"] == "NETFLIX"


def test_cancel_directory_multi_token_key_requires_all_tokens():
    # AMAZON PRIME requires both tokens — generic AMAZON purchases shouldn't match.
    matched = lookup_cancel_info("AMAZON PRIME MEMBERSHIP")
    assert matched is not None
    assert matched["canonical_key"] == "AMAZON PRIME"

    not_matched = lookup_cancel_info("AMAZON MKTP US")
    assert not_matched is None


def test_cancel_directory_alias_match():
    entry = lookup_cancel_info("HBO MAX")
    assert entry is not None
    assert entry["canonical_key"] == "HBOMAX"


def test_cancel_directory_returns_none_for_unknown_merchant():
    assert lookup_cancel_info("OBSCURE LOCAL GYM") is None
    assert lookup_cancel_info("") is None


def test_cancel_info_endpoint_returns_metadata_for_known_merchant():
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-05,NETFLIX.COM,-15.99\n"
        b"2026-02-05,NETFLIX.COM,-15.99\n"
        b"2026-03-05,NETFLIX.COM,-15.99\n"
    )
    upload = client.post("/api/upload", files=[("files", ("subs.csv", csv, "text/csv"))])
    assert upload.status_code == 200

    listing = client.get("/api/subscriptions").json()
    netflix = next(s for s in listing["subscriptions"] if "NETFLIX" in s["merchant"])

    info = client.get(f"/api/subscriptions/{netflix['stream_id']}/cancel-info")
    assert info.status_code == 200
    body = info.json()
    assert body["found"] is True
    assert body["display_name"] == "Netflix"
    assert body["cancel_url"].startswith("https://www.netflix.com/")
    assert body["merchant"] == netflix["merchant"]


def test_cancel_info_endpoint_returns_found_false_for_unknown_merchant():
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-05,OBSCURE LOCAL GYM,-29.00\n"
        b"2026-02-05,OBSCURE LOCAL GYM,-29.00\n"
        b"2026-03-05,OBSCURE LOCAL GYM,-29.00\n"
    )
    upload = client.post("/api/upload", files=[("files", ("subs.csv", csv, "text/csv"))])
    assert upload.status_code == 200

    listing = client.get("/api/subscriptions").json()
    gym = next(s for s in listing["subscriptions"] if "GYM" in s["merchant"])

    info = client.get(f"/api/subscriptions/{gym['stream_id']}/cancel-info")
    assert info.status_code == 200
    body = info.json()
    assert body["found"] is False
    assert body["cancel_url"] is None
    assert body["display_name"] is None
    assert body["merchant"] == gym["merchant"]


def test_cancel_info_endpoint_404_for_unknown_stream_id():
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-05,NETFLIX.COM,-15.99\n"
        b"2026-02-05,NETFLIX.COM,-15.99\n"
        b"2026-03-05,NETFLIX.COM,-15.99\n"
    )
    upload = client.post("/api/upload", files=[("files", ("subs.csv", csv, "text/csv"))])
    assert upload.status_code == 200

    info = client.get("/api/subscriptions/not-a-real-stream/cancel-info")
    assert info.status_code == 404


def test_review_endpoint_returns_model_verdict_and_uses_cache(monkeypatch):
    subscription_router._review_cache.clear()
    calls = {"count": 0}

    def fake_review(prompt: str) -> dict:
        calls["count"] += 1
        assert "NETFLIX" in prompt
        return {
            "verdict": "price_concern",
            "reason": "Netflix increased from the prior baseline.",
            "evidence": ["2026-03-05: $18.00"],
        }

    monkeypatch.setattr(subscription_router, "_call_review_model", fake_review)
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-05,NETFLIX.COM,-15.00\n"
        b"2026-02-05,NETFLIX.COM,-15.00\n"
        b"2026-03-05,NETFLIX.COM,-18.00\n"
    )
    upload = client.post("/api/upload", files=[("files", ("subs.csv", csv, "text/csv"))])
    assert upload.status_code == 200

    listing = client.get("/api/subscriptions").json()
    netflix = next(s for s in listing["subscriptions"] if "NETFLIX" in s["merchant"])

    first = client.post(f"/api/subscriptions/{netflix['stream_id']}/review")
    second = client.post(f"/api/subscriptions/{netflix['stream_id']}/review")

    assert first.status_code == 200
    assert first.json() == {
        "stream_id": netflix["stream_id"],
        "verdict": "price_concern",
        "reason": "Netflix increased from the prior baseline.",
        "evidence": ["2026-03-05: $18.00"],
        "cached": False,
    }
    assert second.status_code == 200
    assert second.json()["cached"] is True
    assert calls["count"] == 1


def test_review_endpoint_coerces_invalid_model_verdict(monkeypatch):
    subscription_router._review_cache.clear()
    monkeypatch.setattr(
        subscription_router,
        "_call_review_model",
        lambda prompt: {"verdict": "maybe", "reason": "bad", "evidence": ["ignored"]},
    )
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-02-05,NEW APP SERVICE,-5.00\n"
        b"2026-03-05,NEW APP SERVICE,-5.00\n"
    )
    upload = client.post("/api/upload", files=[("files", ("subs.csv", csv, "text/csv"))])
    assert upload.status_code == 200

    listing = client.get("/api/subscriptions").json()
    new_app = next(s for s in listing["subscriptions"] if "NEW APP" in s["merchant"])

    response = client.post(f"/api/subscriptions/{new_app['stream_id']}/review")
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] == "review_needed"
    assert body["reason"].startswith("Couldn't parse the model verdict")
    assert body["evidence"] == []


def test_review_endpoint_409_for_ineligible_stable_subscription(monkeypatch):
    subscription_router._review_cache.clear()
    monkeypatch.setattr(subscription_router, "_call_review_model", lambda prompt: {})
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2025-11-05,STABLE SERVICE,-20.00\n"
        b"2025-12-05,STABLE SERVICE,-20.00\n"
        b"2026-01-05,STABLE SERVICE,-20.00\n"
        b"2026-02-05,STABLE SERVICE,-20.00\n"
        b"2026-03-05,STABLE SERVICE,-20.00\n"
    )
    upload = client.post("/api/upload", files=[("files", ("subs.csv", csv, "text/csv"))])
    assert upload.status_code == 200

    listing = client.get("/api/subscriptions").json()
    stable = next(s for s in listing["subscriptions"] if "STABLE" in s["merchant"])

    response = client.post(f"/api/subscriptions/{stable['stream_id']}/review")
    assert response.status_code == 409


def test_review_endpoint_404_for_unknown_stream_id():
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-05,NETFLIX.COM,-15.99\n"
        b"2026-02-05,NETFLIX.COM,-15.99\n"
        b"2026-03-05,NETFLIX.COM,-17.99\n"
    )
    upload = client.post("/api/upload", files=[("files", ("subs.csv", csv, "text/csv"))])
    assert upload.status_code == 200

    response = client.post("/api/subscriptions/not-a-real-stream/review")
    assert response.status_code == 404


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

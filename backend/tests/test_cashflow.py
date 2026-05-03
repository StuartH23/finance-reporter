"""Tests for cashflow endpoint and payload behavior."""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from main import app
from sdk import budget_vs_actual, build_cashflow_payload
from sdk.cashflow import _collapse_expense_groups


def _upload_sample_ledger(client: TestClient) -> None:
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-01,Payroll,4000.00\n"
        b"2026-01-03,Rent,-1500.00\n"
        b"2026-01-08,Whole Foods,-220.00\n"
        b"2026-01-11,Whole Foods,-140.00\n"
        b"2026-01-15,Savings Transfer,-300.00\n"
        b"2026-02-01,Payroll,4200.00\n"
        b"2026-02-04,Rent,-1500.00\n"
        b"2026-02-08,Trader Joe's,-180.00\n"
        b"2026-02-12,Trader Joe's,-120.00\n"
        b"2026-02-16,Car Insurance,-190.00\n"
        b"2026-02-24,Electric Utility,-110.00\n"
    )
    upload = client.post("/api/upload", files=[("files", ("cashflow.csv", csv, "text/csv"))])
    assert upload.status_code == 200


def test_cashflow_monthly_category_default_period():
    client = TestClient(app)
    _upload_sample_ledger(client)

    response = client.get("/api/cashflow")
    assert response.status_code == 200
    data = response.json()

    assert data["granularity"] == "month"
    assert data["group_by"] == "category"
    assert data["period_key"] == "2026-02"
    assert data["period_label"] == "February 2026"
    assert len(data["available_periods"]) == 2
    assert data["available_periods"][0]["key"] == "2026-02"
    assert data["totals"]["income"] == 4200.0
    assert data["totals"]["expenses"] > 0
    assert data["transaction_count"] == 6
    assert any(node["type"] == "expense" for node in data["nodes"])
    assert any(node["type"] == "savings" for node in data["nodes"])
    assert len(data["links"]) > 0


def test_cashflow_quarter_merchant_with_explicit_period():
    client = TestClient(app)
    _upload_sample_ledger(client)

    response = client.get("/api/cashflow?granularity=quarter&group_by=merchant&period=2026-Q1")
    assert response.status_code == 200
    data = response.json()

    assert data["granularity"] == "quarter"
    assert data["group_by"] == "merchant"
    assert data["period_key"] == "2026-Q1"
    assert data["period_label"] == "Q1 2026"
    assert data["available_periods"][0]["key"] == "2026-Q1"

    labels = {group["label"] for group in data["groups"]}
    assert "Whole Foods" in labels
    assert "Trader Joe's" in labels
    assert data["totals"]["income"] == 8200.0
    assert data["transaction_count"] == 11


def test_cashflow_rejects_invalid_period_format():
    client = TestClient(app)
    _upload_sample_ledger(client)

    response = client.get("/api/cashflow?granularity=quarter&period=2026-02")
    assert response.status_code == 422
    assert "Invalid period" in response.json()["detail"]


def test_cashflow_returns_empty_for_missing_period():
    client = TestClient(app)
    _upload_sample_ledger(client)

    response = client.get("/api/cashflow?granularity=month&period=2025-01")
    assert response.status_code == 200
    data = response.json()

    assert data["period_key"] == "2025-01"
    assert data["nodes"] == []
    assert data["links"] == []
    assert data["groups"] == []
    assert data["transaction_count"] == 0


def test_collapse_expense_groups_appends_other_without_overwriting_top_index():
    # Categories are alphabetical A-I, so grouped index 7 is category H before sorting.
    # H has the highest spend and must remain visible in top groups.
    expenses = pd.DataFrame(
        {
            "category": list("ABCDEFGHI"),
            "description": [f"{char} merchant" for char in list("ABCDEFGHI")],
            "amount": [-10.0, -20.0, -30.0, -40.0, -50.0, -60.0, -70.0, -1000.0, -80.0],
        }
    )

    collapsed = _collapse_expense_groups(expenses, group_by="category", max_groups=7)

    labels = set(collapsed["group_key"].tolist())
    assert len(collapsed) == 8
    assert "H" in labels
    assert "Other" in labels


def test_cashflow_transfer_totals_are_scoped_to_requested_period():
    client = TestClient(app)
    csv = (
        b"Date,Description,Amount\n"
        b"2026-01-01,Payroll,4000.00\n"
        b"2026-01-03,Rent,-1500.00\n"
        b"2026-01-15,Transfer From Savings,-300.00\n"
        b"2026-02-01,Payroll,4200.00\n"
        b"2026-02-04,Rent,-1500.00\n"
        b"2026-02-16,Transfer From Savings,-125.00\n"
    )
    upload = client.post("/api/upload", files=[("files", ("cashflow.csv", csv, "text/csv"))])
    assert upload.status_code == 200

    response = client.get("/api/cashflow?granularity=month&period=2026-02")
    assert response.status_code == 200
    assert response.json()["totals"]["transfers"] == 125.0


def test_budget_and_cashflow_semantics_respect_transaction_override_precedence():
    ledger = pd.DataFrame(
        [
            {
                "date": pd.Timestamp("2026-02-01"),
                "description": "Payroll",
                "amount": 4000.0,
                "category": "Income",
                "source_file": "fixture.csv",
            },
            {
                "date": pd.Timestamp("2026-02-05"),
                "description": "Reimbursed meal",
                "amount": -85.0,
                "category": "Meals & Dining",
                "semantic_type": "reimbursement",
                "source_file": "fixture.csv",
            },
            {
                "date": pd.Timestamp("2026-02-07"),
                "description": "Groceries",
                "amount": -120.0,
                "category": "Groceries",
                "source_file": "fixture.csv",
            },
            {
                "date": pd.Timestamp("2026-02-10"),
                "description": "Owner draw excluded from spend",
                "amount": -300.0,
                "category": "Groceries",
                "semantic_type_override": "ignored",
                "source_file": "fixture.csv",
            },
        ]
    )

    comparison = budget_vs_actual(
        ledger, {"Income": 1000.0, "Groceries": 500.0, "Meals & Dining": 100.0}
    )
    comparison_by_category = {row["category"]: row for row in comparison.to_dict(orient="records")}
    assert "Income" not in comparison_by_category
    assert comparison_by_category["Groceries"]["total_actual"] == 120.0
    assert comparison_by_category["Meals & Dining"]["total_actual"] == 0.0

    cashflow = build_cashflow_payload(
        ledger, granularity="month", group_by="category", period="2026-02"
    )
    assert cashflow["totals"]["expenses"] == 120.0

"""Tests for sdk.chat_tools aggregation helpers (no network)."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sdk.chat_tools import (
    ledger_date_bounds,
    month_over_month_delta,
    spending_by_category,
    top_merchants,
    unusual_charges,
)


def _ledger(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    if "category" not in df.columns:
        df["category"] = "Uncategorized"
    if "source_file" not in df.columns:
        df["source_file"] = "test.csv"
    return df


def test_top_merchants_ranks_by_absolute_spend():
    ledger = _ledger(
        [
            {"date": "2026-01-05", "description": "NETFLIX", "amount": -15.99},
            {"date": "2026-01-18", "description": "NETFLIX", "amount": -15.99},
            {"date": "2026-01-10", "description": "STARBUCKS", "amount": -6.00},
            {"date": "2026-01-11", "description": "STARBUCKS", "amount": -6.00},
            {"date": "2026-01-12", "description": "STARBUCKS", "amount": -6.00},
            {"date": "2026-01-20", "description": "PAYCHECK", "amount": 2000.0},
        ]
    )
    result = top_merchants(ledger, start_date="2026-01-01", end_date="2026-01-31", limit=5)
    merchants = result["merchants"]
    assert merchants[0]["merchant"] == "NETFLIX"
    assert merchants[0]["total"] == pytest.approx(31.98)
    assert merchants[1]["merchant"] == "STARBUCKS"
    assert merchants[1]["total"] == pytest.approx(18.0)
    # Income excluded
    assert all(m["merchant"] != "PAYCHECK" for m in merchants)


def test_spending_by_category_groups_correctly():
    ledger = _ledger(
        [
            {"date": "2026-02-01", "description": "X", "amount": -10, "category": "Food"},
            {"date": "2026-02-02", "description": "Y", "amount": -20, "category": "Food"},
            {"date": "2026-02-03", "description": "Z", "amount": -50, "category": "Travel"},
        ]
    )
    result = spending_by_category(ledger)
    cats = {c["category"]: c for c in result["categories"]}
    assert cats["Food"]["total"] == pytest.approx(30.0)
    assert cats["Travel"]["total"] == pytest.approx(50.0)
    assert result["total_spend"] == pytest.approx(80.0)


def test_month_over_month_delta_compares_prior_month():
    ledger = _ledger(
        [
            {"date": "2026-01-05", "description": "A", "amount": -100, "category": "Food"},
            {"date": "2026-02-05", "description": "A", "amount": -150, "category": "Food"},
            {"date": "2026-02-10", "description": "B", "amount": -40, "category": "Travel"},
        ]
    )
    result = month_over_month_delta(ledger, "2026-02")
    assert result["month"] == "2026-02"
    assert result["prior_month"] == "2026-01"
    food = next(c for c in result["changes"] if c["category"] == "Food")
    assert food["current"] == pytest.approx(150.0)
    assert food["previous"] == pytest.approx(100.0)
    assert food["delta"] == pytest.approx(50.0)
    assert food["percent_change"] == pytest.approx(50.0)


def test_unusual_charges_flags_outlier():
    rows = [
        {"date": f"2099-12-{d:02d}", "description": "COFFEE", "amount": -5.0} for d in range(1, 11)
    ]
    rows.append({"date": "2099-12-15", "description": "COFFEE", "amount": -50.0})
    ledger = _ledger(rows)
    # unusual_charges uses today as the anchor — feed a wide lookback so the
    # synthetic 2099 dates all fall inside the window.
    result = unusual_charges(ledger, lookback_days=365 * 200)
    assert any(c["merchant"] == "COFFEE" and c["amount"] == 50.0 for c in result["charges"])


def test_ledger_date_bounds_handles_empty():
    assert ledger_date_bounds(pd.DataFrame()) == {
        "earliest": None,
        "latest": None,
        "transaction_count": 0,
    }


def test_month_over_month_delta_invalid_month():
    with pytest.raises(ValueError):
        month_over_month_delta(pd.DataFrame(), "not-a-month")

"""Tests for analyst ledger CSV downsampling."""

from __future__ import annotations

import sys
import types
from io import StringIO
from pathlib import Path

import pandas as pd  # type: ignore[import-untyped]

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.modules.setdefault("anthropic", types.ModuleType("anthropic"))

from routers.analyst import MAX_LEDGER_ROWS, _ledger_to_csv, _sample_ledger_across_years


def _ledger(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    if "category" not in df.columns:
        df["category"] = "Uncategorized"
    if "source_file" not in df.columns:
        df["source_file"] = "test.csv"
    return df


def test_sample_ledger_keeps_all_rows_when_under_cap():
    ledger = _ledger(
        [
            {"date": "2024-01-01", "description": "A", "amount": -10.0},
            {"date": "2025-01-01", "description": "B", "amount": -20.0},
        ]
    )

    sampled = _sample_ledger_across_years(ledger, cap=10, random_state=0)

    assert len(sampled) == len(ledger)
    assert set(sampled["description"]) == {"A", "B"}


def test_sample_ledger_preserves_sparse_years_under_heavy_recent_density():
    rows: list[dict] = []
    for year in range(1925, 2025):
        rows.append(
            {
                "date": f"{year}-01-01",
                "description": f"sparse-{year}",
                "amount": -1.0,
            }
        )
    for day in range(1, 10001):
        rows.append(
            {
                "date": f"2025-01-{(day % 28) + 1:02d}",
                "description": f"dense-{day}",
                "amount": -2.0,
            }
        )

    ledger = _ledger(rows)
    sampled = _sample_ledger_across_years(ledger, cap=MAX_LEDGER_ROWS, random_state=0)

    assert len(sampled) == MAX_LEDGER_ROWS
    sampled_years = set(sampled["date"].dt.year)
    assert set(range(1925, 2025)).issubset(sampled_years)


def test_ledger_to_csv_caps_rows_and_sorts_by_date():
    rows = [
        {
            "date": f"2026-12-{(day % 28) + 1:02d}",
            "description": f"recent-{day}",
            "amount": -1.0,
        }
        for day in range(7000)
    ]
    rows.extend(
        [
            {"date": "2021-01-03", "description": "older-c", "amount": -3.0},
            {"date": "2021-01-01", "description": "older-a", "amount": -1.0},
            {"date": "2021-01-02", "description": "older-b", "amount": -2.0},
        ]
    )

    csv_text = _ledger_to_csv(_ledger(rows))
    parsed = pd.read_csv(StringIO(csv_text), parse_dates=["date"])

    assert len(parsed) == MAX_LEDGER_ROWS
    assert parsed["date"].is_monotonic_increasing
    assert 2021 in set(parsed["date"].dt.year)

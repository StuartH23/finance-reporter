"""Shipped example data and the gitignored local override."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

import sdk.data_paths as data_paths
from sdk.budget import load_budget, save_budget
from sdk.categories import categorize, load_categories
from sdk.data_paths import resolve_data_csv

SHIPPED_CATEGORIES = Path(__file__).resolve().parent.parent / "data" / "categories.csv"


def test_shipped_categories_use_generic_merchants():
    rules = load_categories(str(SHIPPED_CATEGORIES))
    assert categorize("Rent payment", rules) == "Housing"
    assert categorize("WALMART STORE", rules) == "Groceries"
    assert categorize("NETFLIX.COM", rules) == "Subscriptions"
    assert categorize("SHELL OIL", rules) == "Gas & Auto"


def test_shipped_budget_uses_round_example_amounts():
    text = (Path(__file__).resolve().parent.parent / "data" / "budget.csv").read_text(
        encoding="utf-8"
    )
    assert "Housing,1500" in text
    assert "Groceries,400" in text
    assert "1401" not in text
    assert "515" not in text


def test_local_files_override_shipped_examples_and_budget_writes_stay_local(tmp_path, monkeypatch):
    data = tmp_path / "data"
    local = data / "local"
    data.mkdir()
    local.mkdir()
    (data / "budget.csv").write_text(
        "category,monthly_budget\nGroceries,10\n",
        encoding="utf-8",
    )
    (data / "categories.csv").write_text(
        "category,keywords\nGroceries,walmart\n",
        encoding="utf-8",
    )
    (local / "budget.csv").write_text(
        "category,monthly_budget\nGroceries,80\n",
        encoding="utf-8",
    )
    (local / "categories.csv").write_text(
        "category,keywords\nGroceries,corner-market\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(data_paths, "DATA_DIR", data)
    monkeypatch.setattr(data_paths, "LOCAL_DIR", local)

    loaded = load_budget()
    assert loaded["Groceries"] == pytest.approx(80)
    rules = load_categories(str(resolve_data_csv("categories.csv")))
    assert categorize("corner-market", rules) == "Groceries"
    assert categorize("walmart", rules) == "Uncategorized"

    save_budget({"Groceries": 90})

    assert "Groceries,10" in (data / "budget.csv").read_text(encoding="utf-8")
    assert "90" in (local / "budget.csv").read_text(encoding="utf-8")

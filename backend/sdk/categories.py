"""Category loading and transaction categorization."""

import re
from pathlib import Path

import pandas as pd

from .data_paths import local_data_csv, resolve_data_csv

TRANSFER_CATEGORIES: set[str] = {
    "Credit Card Payments",
    "Venmo Transfers",
    "Personal Transfers",
    "Investments",
}


def _read_category_frame(path: str | Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def load_categories(path: str) -> list[tuple[str, re.Pattern | None]]:
    categories = []
    df = _read_category_frame(path)
    for _, row in df.iterrows():
        category = str(row["category"]).strip()
        keywords = str(row["keywords"]).strip()
        if keywords and keywords.lower() != "nan":
            pattern = re.compile(keywords, re.IGNORECASE)
        else:
            pattern = None
        categories.append((category, pattern))
    return categories


def load_category_rules() -> list[dict[str, str]]:
    """Return category keyword rules, preferring the local override."""
    path = resolve_data_csv("categories.csv")
    if not path.exists():
        return []
    try:
        frame = _read_category_frame(path)
    except pd.errors.EmptyDataError:
        return []
    if "category" not in frame.columns or "keywords" not in frame.columns:
        return []
    return [
        {"category": str(row["category"]), "keywords": str(row["keywords"])}
        for _, row in frame.iterrows()
    ]


def save_category_rules(rules: list[dict[str, str]]) -> None:
    """Replace category keyword rules in the gitignored local override."""
    path = local_data_csv("categories.csv")
    frame = pd.DataFrame(rules, columns=["category", "keywords"])
    frame.to_csv(path, index=False)


def categorize(description: str, rules: list[tuple[str, re.Pattern | None]]) -> str:
    for category, pattern in rules:
        if pattern and pattern.search(description or ""):
            return category
    return "Uncategorized"

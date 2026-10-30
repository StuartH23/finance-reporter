"""Category loading and transaction categorization."""

import re
from pathlib import Path

import pandas as pd

TRANSFER_CATEGORIES: set[str] = {
    "Credit Card Payments",
    "Venmo Transfers",
    "Personal Transfers",
    "Investments",
}

CATEGORIES_PATH = Path(__file__).resolve().parent.parent / "data" / "categories.csv"


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
    """Return saved category keyword rules in file order."""
    if not CATEGORIES_PATH.exists():
        return []
    try:
        frame = _read_category_frame(CATEGORIES_PATH)
    except pd.errors.EmptyDataError:
        return []
    if "category" not in frame.columns or "keywords" not in frame.columns:
        return []
    return [
        {"category": str(row["category"]), "keywords": str(row["keywords"])}
        for _, row in frame.iterrows()
    ]


def save_category_rules(rules: list[dict[str, str]]) -> None:
    """Replace the saved category keyword rules."""
    frame = pd.DataFrame(rules, columns=["category", "keywords"])
    CATEGORIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(CATEGORIES_PATH, index=False)


def categorize(description: str, rules: list[tuple[str, re.Pattern | None]]) -> str:
    for category, pattern in rules:
        if pattern and pattern.search(description or ""):
            return category
    return "Uncategorized"

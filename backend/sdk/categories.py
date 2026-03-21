"""Category loading and transaction categorization."""

import re

import pandas as pd

TRANSFER_CATEGORIES: set[str] = {
    "Credit Card Payments",
    "Venmo Transfers",
    "Personal Transfers",
    "Investments",
}


def load_categories(path: str) -> list[tuple[str, re.Pattern | None]]:
    categories = []
    df = pd.read_csv(path)
    for _, row in df.iterrows():
        category = str(row["category"]).strip()
        keywords = str(row["keywords"]).strip()
        if keywords and keywords.lower() != "nan":
            pattern = re.compile(keywords, re.IGNORECASE)
        else:
            pattern = None
        categories.append((category, pattern))
    return categories


def categorize(description: str, rules: list[tuple[str, re.Pattern | None]]) -> str:
    for category, pattern in rules:
        if pattern and pattern.search(description or ""):
            return category
    return "Uncategorized"

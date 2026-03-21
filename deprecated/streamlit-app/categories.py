"""Category loading and transaction categorization."""

import re
from typing import List, Optional, Set, Tuple

import pandas as pd

TRANSFER_CATEGORIES: Set[str] = {
    "Credit Card Payments",
    "Venmo Transfers",
    "Personal Transfers",
    "Investments",
}


def load_categories(path: str) -> List[Tuple[str, Optional[re.Pattern]]]:
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


def categorize(description: str, rules: List[Tuple[str, Optional[re.Pattern]]]) -> str:
    for category, pattern in rules:
        if pattern and pattern.search(description or ""):
            return category
    return "Uncategorized"

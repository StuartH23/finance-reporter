"""CSV column detection and guessing."""

import re
from dataclasses import dataclass


@dataclass
class ColumnGuess:
    date: str | None
    description: str | None
    amount: str | None
    debit: str | None
    credit: str | None


DATE_CANDIDATES = ["date", "posting date", "transaction date", "posted date"]
DESCRIPTION_CANDIDATES = ["description", "merchant", "payee", "details", "memo"]
AMOUNT_CANDIDATES = ["amount", "transaction amount", "amt"]
DEBIT_CANDIDATES = ["debit", "withdrawal", "charge"]
CREDIT_CANDIDATES = ["credit", "deposit", "payment"]


def _normalize_col(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def guess_columns(columns: list[str]) -> ColumnGuess:
    normalized = {_normalize_col(c): c for c in columns}

    def find(candidates: list[str]) -> str | None:
        for candidate in candidates:
            if candidate in normalized:
                return normalized[candidate]
        return None

    return ColumnGuess(
        date=find(DATE_CANDIDATES),
        description=find(DESCRIPTION_CANDIDATES),
        amount=find(AMOUNT_CANDIDATES),
        debit=find(DEBIT_CANDIDATES),
        credit=find(CREDIT_CANDIDATES),
    )

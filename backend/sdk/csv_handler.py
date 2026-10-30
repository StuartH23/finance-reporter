"""CSV column detection and statement sign normalization."""

import re
from dataclasses import dataclass

import pandas as pd

from .ledger import clean_amount


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
DEBIT_CANDIDATES = ["debit", "debit amount", "withdrawal", "charge", "charges", "purchase"]
CREDIT_CANDIDATES = ["credit", "credit amount", "deposit", "payment", "payments"]
TYPE_CANDIDATES = ["type", "transaction type", "trans type", "amount type"]
_CHARGE_TYPES = frozenset({"sale", "purchase", "debit", "charge", "fee", "withdrawal"})
_CREDIT_TYPES = frozenset({"payment", "credit", "return", "refund", "deposit"})
_CARD_FILE_RE = re.compile(
    r"credit[\s_-]*card|(?<![a-z])card(?![a-z])|discover|amex|"
    r"american[\s_-]*express|(?<![a-z])visa(?![a-z])|mastercard",
    re.IGNORECASE,
)
_CARD_COLUMN_RE = re.compile(
    r"card\s*member|card\s*number|card\s*no\.?|credit\s*card|last\s*4|rewards",
    re.IGNORECASE,
)
_PAYMENT_RE = re.compile(
    r"\b(?:payments?|autopay|thank\s*you|refunds?|reimburs\w*|statement\s+credits?)\b",
    re.IGNORECASE,
)
_INCOME_RE = re.compile(
    r"\b(?:payroll|salary|direct\s*deposit|paycheck|interest\s+paid)\b",
    re.IGNORECASE,
)


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


def _type_column(columns: list[str]) -> str | None:
    normalized = {_normalize_col(column): column for column in columns}
    for candidate in TYPE_CANDIDATES:
        found = normalized.get(candidate)
        if found is not None:
            return found
    return None


def _looks_like_card_statement(filename: str, columns: list[str]) -> bool:
    if _CARD_FILE_RE.search(filename):
        return True
    return any(_CARD_COLUMN_RE.search(column) for column in columns)


def _amount_column_is_placeholder(df: pd.DataFrame, guess: ColumnGuess) -> bool:
    """True when Charge/Payment columns hold the amounts and Amount is blank."""
    if guess.amount is None or not (guess.debit or guess.credit):
        return False
    raw = df[guess.amount]
    amounts = raw.map(clean_amount)
    blank = raw.isna() | raw.astype(str).str.strip().isin({"", "nan"})
    return bool((blank | amounts.isna() | amounts.eq(0)).all())


def _signed_by_type(amount_value: object, type_value: object) -> float | None:
    amount = clean_amount(amount_value)
    if amount is None:
        return None
    label = str(type_value).strip().lower()
    if label in _CHARGE_TYPES:
        return -abs(amount)
    if label in _CREDIT_TYPES:
        return abs(amount)
    return amount


def _type_sign_mode(df: pd.DataFrame, amount_col: str, type_col: str) -> str | None:
    labels = df[type_col].map(lambda value: str(value).strip().lower())
    amounts = df[amount_col].map(clean_amount)
    charges = labels.isin(_CHARGE_TYPES) & amounts.notna()
    if not bool(charges.any()):
        return None
    if bool((amounts[charges] < 0).any()):
        return "keep"
    return "by_type"


def _charges_are_positive(
    df: pd.DataFrame,
    amount_col: str,
    description_col: str,
    filename: str,
) -> bool:
    """True when purchases are positive and payments/refunds are negative."""
    amounts = df[amount_col].map(clean_amount)
    descriptions = df[description_col].astype(str)
    valid = amounts.notna() & amounts.ne(0)
    if not bool(valid.any()):
        return False

    payment = descriptions.str.contains(_PAYMENT_RE, na=False)
    income = descriptions.str.contains(_INCOME_RE, na=False)
    purchases = valid & ~payment & ~income
    payments = valid & payment
    if not bool(purchases.any()):
        return False

    purchase_amounts = amounts[purchases]
    if bool((purchase_amounts <= 0).any()):
        return False
    if bool(payments.any()):
        payment_amounts = amounts[payments]
        negative_payments = int((payment_amounts < 0).sum())
        return negative_payments > 0 and negative_payments / len(payment_amounts) >= 0.6
    return _looks_like_card_statement(filename, list(df.columns))


def _negate_amount(value: object) -> float | None:
    amount = clean_amount(value)
    if amount is None:
        return None
    return -amount


def normalize_statement_amounts(
    df: pd.DataFrame,
    guess: ColumnGuess,
    filename: str = "",
) -> pd.DataFrame:
    """Make card purchases negative and payments/refunds positive.

    Bank files that already use ledger signs (spending negative, income positive)
    are left alone. Split Charge/Payment columns are also left alone because
    ledger building already treats charges as debits.
    """
    if guess.amount is None or guess.description is None:
        return df
    if _amount_column_is_placeholder(df, guess):
        return df

    type_col = _type_column(list(df.columns))
    if type_col is not None:
        mode = _type_sign_mode(df, guess.amount, type_col)
        if mode == "keep":
            return df
        if mode == "by_type":
            updated = df.copy()
            updated[guess.amount] = [
                _signed_by_type(amount, label)
                for amount, label in zip(updated[guess.amount], updated[type_col], strict=True)
            ]
            return updated

    if _charges_are_positive(df, guess.amount, guess.description, filename):
        updated = df.copy()
        updated[guess.amount] = updated[guess.amount].map(_negate_amount)
        return updated
    return df

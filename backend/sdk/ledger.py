"""Ledger building and summarization."""

import pandas as pd


def clean_amount(value) -> float | None:
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if text == "":
        return None

    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]

    text = text.replace("$", "").replace(",", "")
    try:
        amount = float(text)
    except ValueError:
        return None

    return -amount if negative else amount


def build_ledger(
    df: pd.DataFrame,
    date_col: str,
    desc_col: str,
    amount_col: str | None,
    debit_col: str | None,
    credit_col: str | None,
    flip_sign: bool,
    prefer_split_when_amount_zero: bool = False,
) -> pd.DataFrame:
    if amount_col:
        raw_amount = df[amount_col]
        amount = raw_amount.apply(clean_amount)
        if prefer_split_when_amount_zero and (debit_col or credit_col):
            amount_is_blank = raw_amount.isna() | raw_amount.astype(str).str.strip().eq("")
            amount_is_zero = amount.eq(0) | amount_is_blank
            if amount_is_zero.any():
                debit_values = _clean_amount_column(df, debit_col)
                credit_values = _clean_amount_column(df, credit_col)
                split_amount = credit_values - debit_values
                split_is_invalid = split_amount.isna()
                split_has_value = split_amount.fillna(0) != 0
                amount = amount.mask(amount_is_zero & split_has_value, split_amount)
                amount = amount.mask(amount_is_zero & split_is_invalid)
    elif debit_col or credit_col:
        debit_values = _clean_amount_column(df, debit_col)
        credit_values = _clean_amount_column(df, credit_col)
        amount = credit_values - debit_values
    else:
        raise ValueError("No amount, debit, or credit column provided")

    if flip_sign:
        amount = -amount

    ledger = pd.DataFrame(
        {
            "date": pd.to_datetime(df[date_col], errors="coerce"),
            "description": df[desc_col].astype(str).fillna(""),
            "amount": amount,
        }
    )
    ledger = ledger.dropna(subset=["date", "amount"])
    return ledger


def _clean_amount_column(df: pd.DataFrame, column: str | None) -> pd.Series:
    if column is None:
        return pd.Series(0, index=df.index)
    raw = df[column]
    parsed = raw.apply(clean_amount)
    blank = raw.isna() | raw.astype(str).str.strip().eq("")
    return parsed.mask(blank, 0)


def summarize(ledger: pd.DataFrame) -> pd.DataFrame:
    """Aggregate ledger to monthly P&L (income, expenses, net) per month."""
    ledger = ledger.copy()
    ledger["month"] = ledger["date"].dt.to_period("M").dt.to_timestamp()
    ledger["income"] = ledger["amount"].where(ledger["amount"] > 0, 0)
    ledger["expense"] = ledger["amount"].where(ledger["amount"] < 0, 0)

    monthly = (
        ledger.groupby("month", as_index=False)
        .agg(
            income=("income", "sum"),
            expenses=("expense", "sum"),
            net=("amount", "sum"),
        )
        .sort_values("month")
    )
    monthly["expenses"] = -monthly["expenses"]
    monthly["profitable"] = monthly["net"] > 0
    monthly["month_str"] = monthly["month"].dt.strftime("%Y-%m")
    return monthly

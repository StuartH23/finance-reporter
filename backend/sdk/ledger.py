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
) -> pd.DataFrame:
    if amount_col:
        amount = df[amount_col].apply(clean_amount)
    elif debit_col or credit_col:
        debit = df[debit_col].apply(clean_amount) if debit_col else pd.Series(0, index=df.index)
        credit = df[credit_col].apply(clean_amount) if credit_col else pd.Series(0, index=df.index)
        amount = credit.fillna(0) - debit.fillna(0)
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

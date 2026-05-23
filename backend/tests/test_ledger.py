"""Tests for ledger.build_ledger — confirms the zero-amounts bug is fixed."""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sdk.ledger import build_ledger


def test_build_ledger_raises_when_no_amount_columns():
    """build_ledger used to silently produce all-zero amounts when no
    amount/debit/credit columns were provided. Now it should raise ValueError.
    """
    df = pd.DataFrame(
        {
            "date": ["2025-01-01", "2025-01-15"],
            "description": ["Payment A", "Payment B"],
        }
    )
    with pytest.raises(ValueError, match="No amount"):
        build_ledger(
            df=df,
            date_col="date",
            desc_col="description",
            amount_col=None,
            debit_col=None,
            credit_col=None,
            flip_sign=False,
        )


def test_build_ledger_with_amount_col():
    """Normal case: amount column provided works correctly."""
    df = pd.DataFrame(
        {
            "date": ["2025-01-01", "2025-01-15"],
            "description": ["Income", "Expense"],
            "amount": [1000.00, -250.50],
        }
    )
    result = build_ledger(
        df=df,
        date_col="date",
        desc_col="description",
        amount_col="amount",
        debit_col=None,
        credit_col=None,
        flip_sign=False,
    )
    assert len(result) == 2
    assert result["amount"].iloc[0] == 1000.00
    assert result["amount"].iloc[1] == -250.50


def test_build_ledger_with_debit_credit():
    """Debit/credit columns should compute amount = credit - debit."""
    df = pd.DataFrame(
        {
            "date": ["2025-01-01", "2025-01-15"],
            "description": ["Deposit", "Withdrawal"],
            "debit": [0, 100.00],
            "credit": [500.00, 0],
        }
    )
    result = build_ledger(
        df=df,
        date_col="date",
        desc_col="description",
        amount_col=None,
        debit_col="debit",
        credit_col="credit",
        flip_sign=False,
    )
    assert result["amount"].iloc[0] == 500.00
    assert result["amount"].iloc[1] == -100.00


def test_build_ledger_prefers_split_columns_when_amount_is_zero_placeholder():
    """CSV statements can include a placeholder Amount plus real split columns."""
    df = pd.DataFrame(
        {
            "date": ["2025-01-01", "2025-01-02"],
            "description": ["Coffee Shop", "Autopay Thank You"],
            "amount": ["0.00", "0.00"],
            "charge": ["12.34", ""],
            "payment": ["", "100.00"],
        }
    )
    result = build_ledger(
        df=df,
        date_col="date",
        desc_col="description",
        amount_col="amount",
        debit_col="charge",
        credit_col="payment",
        flip_sign=False,
        prefer_split_when_amount_zero=True,
    )
    assert result["amount"].tolist() == [-12.34, 100.00]


def test_build_ledger_keeps_nonzero_amount_when_split_columns_exist():
    df = pd.DataFrame(
        {
            "date": ["2025-01-01"],
            "description": ["Posted Transaction"],
            "amount": ["25.00"],
            "charge": ["12.34"],
            "payment": [""],
        }
    )
    result = build_ledger(
        df=df,
        date_col="date",
        desc_col="description",
        amount_col="amount",
        debit_col="charge",
        credit_col="payment",
        flip_sign=False,
        prefer_split_when_amount_zero=True,
    )
    assert result["amount"].tolist() == [25.00]


def test_build_ledger_uses_split_columns_row_wise_for_zero_amounts():
    df = pd.DataFrame(
        {
            "date": ["2025-01-01", "2025-01-02"],
            "description": ["Posted Transaction", "Placeholder Purchase"],
            "amount": ["25.00", "0.00"],
            "charge": ["", "12.34"],
            "payment": ["", ""],
        }
    )
    result = build_ledger(
        df=df,
        date_col="date",
        desc_col="description",
        amount_col="amount",
        debit_col="charge",
        credit_col="payment",
        flip_sign=False,
        prefer_split_when_amount_zero=True,
    )
    assert result["amount"].tolist() == [25.00, -12.34]


def test_build_ledger_drops_invalid_nonblank_split_amounts():
    df = pd.DataFrame(
        {
            "date": ["2025-01-01", "2025-01-02"],
            "description": ["Good Purchase", "Bad Purchase"],
            "amount": ["0.00", "0.00"],
            "charge": ["12.34", "not-an-amount"],
            "payment": ["", ""],
        }
    )
    result = build_ledger(
        df=df,
        date_col="date",
        desc_col="description",
        amount_col="amount",
        debit_col="charge",
        credit_col="payment",
        flip_sign=False,
        prefer_split_when_amount_zero=True,
    )
    assert result["description"].tolist() == ["Good Purchase"]
    assert result["amount"].tolist() == [-12.34]


def test_build_ledger_drops_invalid_nonblank_amount_instead_of_using_split():
    df = pd.DataFrame(
        {
            "date": ["2025-01-01", "2025-01-02"],
            "description": ["Blank Amount", "Bad Amount"],
            "amount": ["", "not-an-amount"],
            "charge": ["12.34", "45.67"],
            "payment": ["", ""],
        }
    )
    result = build_ledger(
        df=df,
        date_col="date",
        desc_col="description",
        amount_col="amount",
        debit_col="charge",
        credit_col="payment",
        flip_sign=False,
        prefer_split_when_amount_zero=True,
    )
    assert result["description"].tolist() == ["Blank Amount"]
    assert result["amount"].tolist() == [-12.34]


def test_build_ledger_debit_only():
    """Only debit column provided (no credit) should work."""
    df = pd.DataFrame(
        {
            "date": ["2025-01-01"],
            "description": ["Withdrawal"],
            "debit": [100.00],
        }
    )
    result = build_ledger(
        df=df,
        date_col="date",
        desc_col="description",
        amount_col=None,
        debit_col="debit",
        credit_col=None,
        flip_sign=False,
    )
    assert result["amount"].iloc[0] == -100.00

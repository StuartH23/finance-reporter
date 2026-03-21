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

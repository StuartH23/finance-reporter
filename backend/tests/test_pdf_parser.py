"""Tests for pdf_parser cross-year detection — confirms single decrement."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sdk.pdf_parser import _detect_cross_year


def test_detect_cross_year_dec_jan():
    """Transactions spanning Dec→Jan should decrement year by 1."""
    rows = [
        {"Date": "12/28", "Description": "Payment", "Amount": "100.00"},
        {"Date": "12/30", "Description": "Payment", "Amount": "50.00"},
        {"Date": "1/02", "Description": "Deposit", "Amount": "200.00"},
        {"Date": "1/05", "Description": "Deposit", "Amount": "75.00"},
    ]
    # Base year 2026 (from header "January 2026") → should become 2025
    assert _detect_cross_year(rows, 2026) == 2025


def test_detect_cross_year_no_adjustment_needed():
    """Transactions within a single year should not decrement."""
    rows = [
        {"Date": "3/01", "Description": "Payment", "Amount": "100.00"},
        {"Date": "3/15", "Description": "Payment", "Amount": "50.00"},
    ]
    assert _detect_cross_year(rows, 2026) == 2026


def test_detect_cross_year_nov_jan():
    """Nov+Jan also triggers cross-year."""
    rows = [
        {"Date": "11/28", "Description": "Payment", "Amount": "100.00"},
        {"Date": "1/05", "Description": "Deposit", "Amount": "200.00"},
    ]
    assert _detect_cross_year(rows, 2026) == 2025


def test_no_double_decrement_end_to_end():
    """The full pipeline (infer_year → _detect_cross_year) should only
    decrement once total, not twice.

    Previously infer_year decremented AND _detect_cross_year decremented,
    resulting in year - 2 instead of year - 1.
    """
    from sdk.year_detection import infer_year

    # Simulate a Jan 2026 statement with Dec dates
    text = "January 15, 2026 through February 14, 2026\n12/28 Payment\n1/02 Deposit\n"
    # infer_year should return 2026 (no decrement)
    year = infer_year(text, "statement.pdf")
    assert year == 2026

    rows = [
        {"Date": "12/28", "Description": "Payment", "Amount": "100.00"},
        {"Date": "1/02", "Description": "Deposit", "Amount": "200.00"},
    ]
    # _detect_cross_year should decrement to 2025
    adjusted = _detect_cross_year(rows, year)
    assert adjusted == 2025  # NOT 2024 (which was the old double-decrement bug)

"""Tests for year_detection — confirms the double-decrement bug is fixed."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sdk.year_detection import infer_year


def test_range_header_no_longer_decrements_for_cross_year():
    """_from_range_header used to subtract 1 for Jan/Feb cross-year statements.
    That caused a double-decrement when _detect_cross_year also subtracted 1.
    Now infer_year should return the literal year from the header.
    """
    text = (
        "January 15, 2026 through February 14, 2026\n"
        "12/28 Payment to vendor\n"
        "1/05 Deposit received\n"
    )
    # Should return 2026 (the year in the header), NOT 2025
    assert infer_year(text, "statement.pdf") == 2026


def test_range_header_plain_same_year():
    """Non-cross-year range header returns the year as-is."""
    text = "March 1, 2025 through March 31, 2025\n3/5 Some transaction\n"
    assert infer_year(text, "") == 2025


def test_four_digit_years_no_cross_year_decrement():
    """Previously, a single 4-digit year + cross-year dates would decrement.
    Now it should return the year directly; _detect_cross_year handles adjustment.
    """
    text = "Statement 2026\n12/28 Payment\n1/05 Deposit\n"
    assert infer_year(text, "") == 2026


def test_four_digit_two_consecutive_years():
    """Two consecutive years should return the earlier one."""
    text = "Period 2025 - 2026\n"
    assert infer_year(text, "") == 2025


def test_two_digit_years():
    """MM/DD/YY patterns should extract year correctly."""
    text = "12/15/25 Payment\n12/20/25 Another\n"
    assert infer_year(text, "") == 2025


def test_filename_fallback():
    """Year extracted from filename when no text patterns match."""
    assert infer_year("no dates here", "20260217-statements.pdf") == 2026

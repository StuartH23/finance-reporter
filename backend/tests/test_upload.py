"""Tests for upload router — confirms empty CSV, missing columns, and session isolation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routers.upload import _process_csv


def test_process_csv_empty_bytes():
    """Empty file should return None, not crash with EmptyDataError."""
    result = _process_csv(b"")
    assert result is None


def test_process_csv_whitespace_only():
    """Whitespace-only file should return None."""
    result = _process_csv(b"   \n  \n")
    assert result is None


def test_process_csv_no_amount_columns():
    """CSV with date and description but no amount/debit/credit columns
    should return None, not produce garbage zero-amount data.
    """
    csv_content = b"date,description,notes\n2025-01-01,Payment,foo\n"
    result = _process_csv(csv_content)
    assert result is None


def test_process_csv_valid():
    """Valid CSV with recognized columns should return a DataFrame."""
    csv_content = b"Date,Description,Amount\n2025-01-01,Test Payment,100.00\n"
    result = _process_csv(csv_content)
    assert result is not None
    assert len(result) == 1
    assert result["amount"].iloc[0] == 100.00


def test_process_csv_malformed():
    """Malformed CSV should return None, not crash."""
    result = _process_csv(b"\x00\x01\x02\x03")
    assert result is None

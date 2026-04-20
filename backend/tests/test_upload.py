"""Tests for upload router — confirms empty CSV, missing columns, and session isolation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routers.upload import _process_csv, _session_cookie_options


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


def test_session_cookie_defaults_secure_in_production(monkeypatch):
    """Production sessions should default to secure HTTP-only cookies."""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("SESSION_COOKIE_SECURE", raising=False)
    monkeypatch.delenv("SESSION_COOKIE_SAMESITE", raising=False)

    options = _session_cookie_options()

    assert options == {"httponly": True, "samesite": "lax", "secure": True}


def test_session_cookie_samesite_none_forces_secure(monkeypatch):
    """SameSite=None requires Secure even if local env overrides it off."""
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("SESSION_COOKIE_SAMESITE", "none")

    options = _session_cookie_options()

    assert options == {"httponly": True, "samesite": "none", "secure": True}

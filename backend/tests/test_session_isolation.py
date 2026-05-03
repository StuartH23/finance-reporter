"""Tests for session isolation — confirms users don't share data."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from routers.upload import _sessions, clear_session, get_session_ledger


def _make_ledger(desc: str) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": pd.to_datetime(["2025-01-01"]),
            "description": [desc],
            "amount": [100.0],
            "category": ["Test"],
            "source_file": ["test.csv"],
        }
    )


def test_sessions_are_isolated():
    """Two different session IDs should have independent ledger data."""
    sid_a = "session-a"
    sid_b = "session-b"

    # Set up two sessions
    _sessions[sid_a] = [_make_ledger("User A transaction")]
    _sessions[sid_b] = [_make_ledger("User B transaction")]

    ledger_a = get_session_ledger(sid_a)
    ledger_b = get_session_ledger(sid_b)

    assert len(ledger_a) == 1
    assert len(ledger_b) == 1
    assert ledger_a["description"].iloc[0] == "User A transaction"
    assert ledger_b["description"].iloc[0] == "User B transaction"

    # Cleanup
    del _sessions[sid_a]
    del _sessions[sid_b]


def test_clear_session_only_affects_target():
    """Clearing one session should not affect another."""
    sid_a = "session-clear-a"
    sid_b = "session-clear-b"

    _sessions[sid_a] = [_make_ledger("A")]
    _sessions[sid_b] = [_make_ledger("B")]

    clear_session(sid_a)

    assert get_session_ledger(sid_a).empty
    assert len(get_session_ledger(sid_b)) == 1

    # Cleanup
    del _sessions[sid_a]
    del _sessions[sid_b]


def test_unknown_session_returns_empty():
    """A session ID that doesn't exist should return an empty DataFrame."""
    result = get_session_ledger("nonexistent-session")
    assert result.empty
    assert list(result.columns) == [
        "transaction_id",
        "date",
        "description",
        "amount",
        "category",
        "source_file",
    ]


def test_none_session_returns_empty():
    """None session ID should return an empty DataFrame."""
    result = get_session_ledger(None)
    assert result.empty

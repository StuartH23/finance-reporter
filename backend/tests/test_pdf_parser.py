"""Tests for pdf_parser cross-year detection — confirms single decrement."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sdk.pdf_parser import (
    _detect_cross_year,
    _parse_transaction_row,
    _pass1_classify_lines,
    _pass1_classify_lines_with_state,
    _pass2_extract_rows,
)


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


def test_parse_credit_card_statement_row_with_ref_month_date():
    row = _parse_transaction_row(
        ["002", "Apr", "8", "Restaurant", "48.50"],
        orphan_amounts=[],
    )

    assert row == {"Date": "4/8", "Description": "Restaurant", "Amount": "-48.50"}


def test_parse_credit_card_statement_payment_as_positive_ledger_amount():
    row = _parse_transaction_row(
        ["001", "Apr", "8", "Payment", "-2,000.00"],
        orphan_amounts=[],
    )

    assert row == {"Date": "4/8", "Description": "Payment", "Amount": "2,000.00"}


def test_parse_credit_card_statement_uses_rightmost_amount():
    row = _parse_transaction_row(
        ["002", "Apr", "8", "Cafe", "Ref", "5.00", "12.34"],
        orphan_amounts=[],
    )

    assert row == {"Date": "4/8", "Description": "Cafe Ref 5.00", "Amount": "-12.34"}


def test_pass2_accepts_preparsed_credit_card_rows(monkeypatch):
    cached_row = {"Date": "4/8", "Description": "Restaurant", "Amount": "-48.50"}

    def fail_if_reparsed(*args, **kwargs):
        raise AssertionError("cached credit-card row should not be reparsed")

    monkeypatch.setattr("sdk.pdf_parser._parse_transaction_row", fail_if_reparsed)

    rows = _pass2_extract_rows({12: cached_row}, orphan_amounts=[])

    assert rows == [cached_row]


def test_pass2_does_not_apply_credit_card_signs_to_unparsed_lines():
    rows = _pass2_extract_rows(
        {12: ["002", "Apr", "8", "Restaurant", "48.50"]},
        orphan_amounts=[],
    )

    assert rows == [{"Date": "002", "Description": "Apr 8 Restaurant", "Amount": "48.50"}]


def test_pass1_preparses_credit_card_rows_after_table_header():
    line_map = {
        8: [
            {"text": "Ref", "x0": 1},
            {"text": "#", "x0": 2},
            {"text": "Month", "x0": 3},
            {"text": "Day", "x0": 4},
            {"text": "Details", "x0": 5},
            {"text": "Amount", "x0": 6},
        ],
        12: [
            {"text": "002", "x0": 1},
            {"text": "Apr", "x0": 2},
            {"text": "8", "x0": 3},
            {"text": "Restaurant", "x0": 4},
            {"text": "48.50", "x0": 5},
        ],
    }

    rows = _pass1_classify_lines(line_map, orphan_amounts=[])

    assert rows == {
        12: {"Date": "4/8", "Description": "Restaurant", "Amount": "-48.50"}
    }


def test_pass1_carries_credit_card_table_state_across_pages():
    header_page = {
        8: [
            {"text": "Ref", "x0": 1},
            {"text": "#", "x0": 2},
            {"text": "Month", "x0": 3},
            {"text": "Day", "x0": 4},
            {"text": "Details", "x0": 5},
            {"text": "Amount", "x0": 6},
        ],
    }
    continuation_page = {
        8: [
            {"text": "003", "x0": 1},
            {"text": "Apr", "x0": 2},
            {"text": "9", "x0": 3},
            {"text": "Coffee", "x0": 4},
            {"text": "6.25", "x0": 5},
        ],
    }

    first_rows, in_table = _pass1_classify_lines_with_state(
        header_page, orphan_amounts=[], in_credit_card_table=False
    )
    second_rows, in_table = _pass1_classify_lines_with_state(
        continuation_page, orphan_amounts=[], in_credit_card_table=in_table
    )

    assert first_rows == {}
    assert in_table is True
    assert second_rows == {
        8: {"Date": "4/9", "Description": "Coffee", "Amount": "-6.25"}
    }


def test_pass1_resets_credit_card_table_state_on_summary_line():
    header_page = {
        8: [
            {"text": "Ref", "x0": 1},
            {"text": "#", "x0": 2},
            {"text": "Month", "x0": 3},
            {"text": "Day", "x0": 4},
            {"text": "Details", "x0": 5},
            {"text": "Amount", "x0": 6},
        ],
        12: [
            {"text": "Ending", "x0": 1},
            {"text": "Balance", "x0": 2},
            {"text": "100.00", "x0": 3},
        ],
    }
    later_page = {
        8: [
            {"text": "003", "x0": 1},
            {"text": "Apr", "x0": 2},
            {"text": "9", "x0": 3},
            {"text": "Coffee", "x0": 4},
            {"text": "6.25", "x0": 5},
        ],
    }

    _, in_table = _pass1_classify_lines_with_state(
        header_page, orphan_amounts=[], in_credit_card_table=False
    )
    rows, in_table = _pass1_classify_lines_with_state(
        later_page, orphan_amounts=[], in_credit_card_table=in_table
    )

    assert in_table is False
    assert rows == {}


def test_pass1_keeps_credit_card_transaction_with_summary_word():
    line_map = {
        8: [
            {"text": "Ref", "x0": 1},
            {"text": "#", "x0": 2},
            {"text": "Month", "x0": 3},
            {"text": "Day", "x0": 4},
            {"text": "Details", "x0": 5},
            {"text": "Amount", "x0": 6},
        ],
        12: [
            {"text": "004", "x0": 1},
            {"text": "Apr", "x0": 2},
            {"text": "10", "x0": 3},
            {"text": "Balance", "x0": 4},
            {"text": "Transfer", "x0": 5},
            {"text": "-50.00", "x0": 6},
        ],
    }

    rows = _pass1_classify_lines(line_map, orphan_amounts=[])

    assert rows == {
        12: {"Date": "4/10", "Description": "Balance Transfer", "Amount": "50.00"}
    }


def test_pass1_ignores_unparseable_credit_card_table_lines():
    line_map = {
        8: [
            {"text": "Ref", "x0": 1},
            {"text": "#", "x0": 2},
            {"text": "Month", "x0": 3},
            {"text": "Day", "x0": 4},
            {"text": "Details", "x0": 5},
            {"text": "Amount", "x0": 6},
        ],
        12: [
            {"text": "Rewards", "x0": 1},
            {"text": "earned", "x0": 2},
            {"text": "10.00", "x0": 3},
        ],
    }
    orphan_amounts = []

    rows = _pass1_classify_lines(line_map, orphan_amounts=orphan_amounts)

    assert rows == {}
    assert orphan_amounts == []

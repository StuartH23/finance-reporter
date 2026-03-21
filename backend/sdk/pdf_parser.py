"""Chase PDF statement parser using word-coordinate clustering."""

import io
import re
from collections import defaultdict

import pandas as pd
import pdfplumber

from .year_detection import infer_year

# Compiled patterns used across parsing functions.
DATE_WORD_RE = re.compile(r"^\d{1,2}/\d{1,2}$")
AMOUNT_WORD_RE = re.compile(r"^-?\$?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2}$")
LONG_NUM_RE = re.compile(r"\b\d{10,}\b")
REF_LABEL_RE = re.compile(
    r"\b(PPD|ACH|WEB|TEL|CCD)\s+ID\s*:?|\bWeb\s+ID\s*:?|\bTel\s+ID\s*:?",
    re.IGNORECASE,
)
MARKER_RE = re.compile(r"\*(?:end|start)\*", re.IGNORECASE)
DETAIL_DATE_RE = re.compile(r"^detail(\d{1,2}/\d{1,2})$", re.IGNORECASE)
SUMMARY_LINE_RE = re.compile(
    r"\b(balance|deposits\b|withdrawals?|summary|subtotal|beginning|ending"
    r"|account\s+number|transaction\s+detail)\b",
    re.IGNORECASE,
)


def _clean_marker_texts(texts: list[str]) -> tuple[list[str], bool]:
    """Strip Chase page-break markers and recover embedded dates.

    Returns (cleaned_texts, had_marker).
    """
    cleaned: list[str] = []
    had_marker = False
    marker_digit = ""
    for t in texts:
        if MARKER_RE.search(t):
            had_marker = True
            md = re.search(r"transac(\d)tion", t, re.IGNORECASE)
            if md:
                marker_digit = md.group(1)
            continue
        dm = DETAIL_DATE_RE.match(t)
        if dm:
            cleaned.append(marker_digit + dm.group(1))
            marker_digit = ""
            continue
        cleaned.append(t)
    return (cleaned if cleaned else texts), had_marker


def _classify_line(
    y_key: int,
    texts: list[str],
    had_marker: bool,
    orphan_amounts: list[str],
    prev_dateless: tuple[int, list[str]] | None,
    txn_lines: dict[int, list[str]],
) -> tuple[int, list[str]] | None:
    """Classify a single line as transaction, orphan-amount, or skip.

    Mutates txn_lines and orphan_amounts in place.
    Returns updated prev_dateless.
    """
    if DATE_WORD_RE.match(texts[0]):
        return _handle_dated_line(
            y_key, texts, had_marker, orphan_amounts, prev_dateless, txn_lines
        )
    if not SUMMARY_LINE_RE.search(" ".join(texts)):
        return _handle_dateless_line(y_key, texts, orphan_amounts)
    return None


def _handle_dated_line(
    y_key: int,
    texts: list[str],
    had_marker: bool,
    orphan_amounts: list[str],
    prev_dateless: tuple[int, list[str]] | None,
    txn_lines: dict[int, list[str]],
) -> None:
    """Process a line that starts with a date."""
    has_amounts = any(AMOUNT_WORD_RE.match(t) for t in texts)
    if had_marker and not has_amounts and prev_dateless is not None:
        dl_key, dl_texts = prev_dateless
        txn_lines[dl_key] = [texts[0]] + dl_texts
        for t in dl_texts:
            if AMOUNT_WORD_RE.match(t) and t in orphan_amounts:
                orphan_amounts.remove(t)
    else:
        txn_lines[y_key] = texts
    return None


def _handle_dateless_line(
    y_key: int,
    texts: list[str],
    orphan_amounts: list[str],
) -> tuple[int, list[str]] | None:
    """Process a non-date, non-summary line — collect orphan amounts."""
    has_amounts = any(AMOUNT_WORD_RE.match(t) for t in texts)
    new_prev = (y_key, texts) if has_amounts else None

    has_negative = any(t.startswith("-") for t in texts if AMOUNT_WORD_RE.match(t))
    if not has_negative:
        for t in texts:
            if AMOUNT_WORD_RE.match(t) and not t.startswith("-"):
                orphan_amounts.append(t)
    return new_prev


def _extract_words_from_page(page) -> dict[int, list]:
    """Extract words from a page and bucket them by y-position."""
    words = page.extract_words(
        x_tolerance=2, y_tolerance=3, keep_blank_chars=False, use_text_flow=False
    )
    line_map: dict[int, list] = defaultdict(list)
    for w in words or []:
        y_center = (w["top"] + w["bottom"]) / 2
        line_map[round(y_center / 4) * 4].append(w)
    return line_map


def _pass1_classify_lines(
    line_map: dict[int, list],
    orphan_amounts: list[str],
) -> dict[int, list[str]]:
    """Pass 1: separate transaction lines from orphan amounts."""
    txn_lines: dict[int, list[str]] = {}
    prev_dateless: tuple[int, list[str]] | None = None

    for y_key in sorted(line_map.keys()):
        line = sorted(line_map[y_key], key=lambda w: w["x0"])
        texts = [w["text"] for w in line]
        if not texts:
            continue

        texts, had_marker = _clean_marker_texts(texts)

        prev_dateless = _classify_line(
            y_key, texts, had_marker, orphan_amounts, prev_dateless, txn_lines
        )

    return txn_lines


def _parse_transaction_row(texts: list[str], orphan_amounts: list[str]) -> dict | None:
    """Parse a single transaction line into a row dict."""
    amt_indices = [i for i, t in enumerate(texts) if AMOUNT_WORD_RE.match(t)]
    if not amt_indices:
        return None

    if len(amt_indices) >= 2:
        txn_idx = amt_indices[-2]
        amount_text = texts[txn_idx]
        desc_end = txn_idx
    else:
        desc_end = amt_indices[0]
        amount_text = None

    description = " ".join(texts[1:desc_end])
    description = LONG_NUM_RE.sub("", description)
    description = REF_LABEL_RE.sub("", description)
    description = re.sub(r"\s+", " ", description).strip()

    if not description:
        return None

    if amount_text is None:
        amount_text = orphan_amounts.pop(0) if orphan_amounts else texts[amt_indices[-1]]

    return {"Date": texts[0], "Description": description, "Amount": amount_text}


def _pass2_extract_rows(
    txn_lines: dict[int, list[str]],
    orphan_amounts: list[str],
) -> list[dict]:
    """Pass 2: extract transaction data from classified lines."""
    raw_rows: list[dict] = []
    for y_key in sorted(txn_lines.keys()):
        row = _parse_transaction_row(txn_lines[y_key], orphan_amounts)
        if row:
            raw_rows.append(row)
    return raw_rows


def _append_orphan_deposit(raw_rows: list[dict], orphan_amounts: list[str]) -> None:
    """Append a single leftover orphan as a deposit if exactly one remains."""
    if raw_rows and len(orphan_amounts) == 1:
        only = orphan_amounts[0]
        if only and not only.startswith("-"):
            raw_rows.append(
                {
                    "Date": raw_rows[-1]["Date"],
                    "Description": "Deposit (from statement)",
                    "Amount": only,
                }
            )


def _detect_cross_year(raw_rows: list[dict], detected_year: int) -> int:
    """Adjust year if transactions span a year boundary (Dec→Jan)."""
    months_seen: set = set()
    for row in raw_rows:
        parts = row["Date"].split("/")
        if parts:
            try:
                m = int(parts[0])
                if 1 <= m <= 12:
                    months_seen.add(m)
            except ValueError:
                pass
    if (months_seen & {11, 12}) and (months_seen & {1, 2}):
        return detected_year - 1
    return detected_year


def _apply_years(raw_rows: list[dict], base_year: int) -> list[dict]:
    """Append year to MM/DD dates, rolling over at year boundaries."""
    year = base_year
    max_year = year + 1
    prev_month: int | None = None
    result = []

    for row in raw_rows:
        month = int(row["Date"].split("/")[0])
        if month == 0 or month > 12:
            continue
        if prev_month is not None and month < prev_month and prev_month >= 11:
            year = min(year + 1, max_year)
        prev_month = month
        result.append(
            {
                "Date": f"{row['Date']}/{year}",
                "Description": row["Description"],
                "Amount": row["Amount"],
            }
        )

    return result


def parse_pdf_words_to_df(
    file_bytes: bytes, filename: str = "", year_override: int | None = None
) -> tuple[pd.DataFrame | None, int]:
    """Extract transactions from a Chase PDF using word-coordinate clustering."""
    raw_rows: list[dict] = []
    orphan_amounts: list[str] = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        all_page_text = "\n".join((p.extract_text() or "") for p in pdf.pages)
        detected_year = (
            year_override if year_override is not None else infer_year(all_page_text, filename)
        )

        for page in pdf.pages:
            line_map = _extract_words_from_page(page)
            if not line_map:
                continue
            txn_lines = _pass1_classify_lines(line_map, orphan_amounts)
            raw_rows.extend(_pass2_extract_rows(txn_lines, orphan_amounts))

    _append_orphan_deposit(raw_rows, orphan_amounts)

    if not raw_rows:
        return None, detected_year

    detected_year = _detect_cross_year(raw_rows, detected_year)
    result_rows = _apply_years(raw_rows, detected_year)

    if not result_rows:
        return None, detected_year

    return pd.DataFrame(result_rows), detected_year

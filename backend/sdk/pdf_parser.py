"""Chase PDF statement parser using word-coordinate clustering."""

import io
import re
from collections import defaultdict

import pandas as pd
import pdfplumber

from .year_detection import infer_year

ParsedTransaction = dict[str, str]
ClassifiedTransaction = list[str] | ParsedTransaction

# Compiled patterns used across parsing functions.
DATE_WORD_RE = re.compile(r"^\d{1,2}/\d{1,2}$")
AMOUNT_WORD_RE = re.compile(r"^-?\$?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2}$")
REF_NUM_RE = re.compile(r"^\d{3,}$")
MONTH_WORDS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}
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
    txn_lines: dict[int, ClassifiedTransaction],
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
    txn_lines: dict[int, ClassifiedTransaction],
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
) -> dict[int, ClassifiedTransaction]:
    """Pass 1: separate transaction lines from orphan amounts."""
    txn_lines, _ = _pass1_classify_lines_with_state(
        line_map, orphan_amounts, in_credit_card_table=False
    )
    return txn_lines


def _pass1_classify_lines_with_state(
    line_map: dict[int, list],
    orphan_amounts: list[str],
    in_credit_card_table: bool,
) -> tuple[dict[int, ClassifiedTransaction], bool]:
    txn_lines: dict[int, ClassifiedTransaction] = {}
    prev_dateless: tuple[int, list[str]] | None = None

    for y_key in sorted(line_map.keys()):
        line = sorted(line_map[y_key], key=lambda w: w["x0"])
        texts = [w["text"] for w in line]
        if not texts:
            continue

        texts, had_marker = _clean_marker_texts(texts)
        if _is_credit_card_statement_header(texts):
            in_credit_card_table = True
            prev_dateless = None
            continue
        if in_credit_card_table:
            credit_card_row = _parse_credit_card_statement_row(texts)
            if credit_card_row:
                txn_lines[y_key] = credit_card_row
                prev_dateless = None
                continue
            if SUMMARY_LINE_RE.search(" ".join(texts)):
                in_credit_card_table = False
                prev_dateless = None
                continue
            continue

        prev_dateless = _classify_line(
            y_key,
            texts,
            had_marker,
            orphan_amounts,
            prev_dateless,
            txn_lines,
        )

    return txn_lines, in_credit_card_table


def _is_credit_card_statement_header(texts: list[str]) -> bool:
    header = ["ref", "#", "month", "day", "details", "amount"]
    if len(texts) < len(header):
        return False
    if texts[0].strip().lower().rstrip(".:") != "ref":
        return False
    tokens = [text.strip().lower().rstrip(".:") for text in texts[: len(header)]]
    return tokens == header


def _credit_card_amount_index(texts: list[str]) -> int | None:
    """Return the amount index for a Ref # Month Day Details Amount row."""
    if len(texts) < 5:
        return None
    month = MONTH_WORDS.get(texts[1].strip(".").lower())
    if month is None:
        return None
    if not REF_NUM_RE.match(texts[0]):
        return None
    if not texts[2].isdigit():
        return None
    day = int(texts[2])
    if not 1 <= day <= 31:
        return None
    for index in range(len(texts) - 1, 2, -1):
        text = texts[index]
        if AMOUNT_WORD_RE.match(text):
            return index
    return None


def _invert_amount_text(amount_text: str) -> str:
    """Flip credit-card statement signs into ledger signs."""
    if amount_text.startswith("-"):
        return amount_text[1:]
    if amount_text.startswith("$"):
        return f"-{amount_text}"
    return f"-{amount_text}"


def _parse_credit_card_statement_row(texts: list[str]) -> dict | None:
    """Parse a Ref # Month Day Details Amount credit-card transaction row."""
    amount_index = _credit_card_amount_index(texts)
    if amount_index is None:
        return None
    return _build_credit_card_statement_row(texts, amount_index)


def _build_credit_card_statement_row(texts: list[str], amount_index: int) -> dict | None:
    description = " ".join(texts[3:amount_index]).strip()
    if not description:
        return None

    month = MONTH_WORDS[texts[1].strip(".").lower()]
    date = f"{month}/{int(texts[2])}"
    return {
        "Date": date,
        "Description": description,
        "Amount": _invert_amount_text(texts[amount_index]),
    }


def _parse_transaction_row(
    texts: list[str],
    orphan_amounts: list[str],
    allow_credit_card: bool = True,
) -> dict | None:
    """Parse a single transaction line into a row dict."""
    if allow_credit_card:
        credit_card_amount_index = _credit_card_amount_index(texts)
        if credit_card_amount_index is not None:
            return _build_credit_card_statement_row(texts, credit_card_amount_index)

    amount_indexes = _rightmost_amount_indexes(texts, limit=2)
    if not amount_indexes:
        return None

    if len(amount_indexes) >= 2:
        # Generic bank rows often end with running balance; the transaction amount
        # is the amount immediately before it.
        txn_idx = amount_indexes[1]
        amount_text = texts[txn_idx]
        desc_end = txn_idx
    else:
        desc_end = amount_indexes[0]
        amount_text = None

    description = " ".join(texts[1:desc_end])
    description = LONG_NUM_RE.sub("", description)
    description = REF_LABEL_RE.sub("", description)
    description = re.sub(r"\s+", " ", description).strip()

    if not description:
        return None

    if amount_text is None:
        amount_text = orphan_amounts.pop(0) if orphan_amounts else texts[amount_indexes[0]]

    return {"Date": texts[0], "Description": description, "Amount": amount_text}


def _rightmost_amount_indexes(texts: list[str], limit: int) -> list[int]:
    indexes: list[int] = []
    for index in range(len(texts) - 1, -1, -1):
        if AMOUNT_WORD_RE.match(texts[index]):
            indexes.append(index)
            if len(indexes) == limit:
                break
    return indexes


def _pass2_extract_rows(
    txn_lines: dict[int, ClassifiedTransaction],
    orphan_amounts: list[str],
) -> list[dict]:
    """Pass 2: extract transaction data from classified lines."""
    raw_rows: list[dict] = []
    for y_key in sorted(txn_lines.keys()):
        classified = txn_lines[y_key]
        row = (
            classified
            if isinstance(classified, dict)
            else _parse_transaction_row(classified, orphan_amounts, allow_credit_card=False)
        )
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
    in_credit_card_table = False

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        if year_override is None:
            all_page_text = "\n".join((p.extract_text() or "") for p in pdf.pages)
            detected_year = infer_year(all_page_text, filename)
        else:
            detected_year = year_override

        for page in pdf.pages:
            line_map = _extract_words_from_page(page)
            if not line_map:
                continue
            txn_lines, in_credit_card_table = _pass1_classify_lines_with_state(
                line_map, orphan_amounts, in_credit_card_table
            )
            raw_rows.extend(_pass2_extract_rows(txn_lines, orphan_amounts))

    _append_orphan_deposit(raw_rows, orphan_amounts)

    if not raw_rows:
        return None, detected_year

    detected_year = _detect_cross_year(raw_rows, detected_year)
    result_rows = _apply_years(raw_rows, detected_year)

    if not result_rows:
        return None, detected_year

    return pd.DataFrame(result_rows), detected_year

"""Infer statement year from PDF text and filename."""

import re
from collections import Counter
from datetime import date
from typing import Optional


def _has_cross_year_dates(text: str) -> bool:
    """Check if text contains both Nov/Dec and Jan/Feb date patterns."""
    has_late = bool(re.search(r"\b1[12]\s*[/\-]\s*\d{1,2}\b", text))
    has_early = bool(re.search(r"\b0?[12]\s*[/\-]\s*\d{1,2}\b", text))
    return has_late and has_early


def _from_range_header(text: str, text_normalized: str) -> Optional[int]:
    """Extract year from 'Month DD, YYYY through ...' header."""
    match = re.search(
        r"(January|February|March|April|May|June|July|August|September"
        r"|October|November|December)\s+\d{1,2},?\s+(20\d{2})\s+through\b",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    start_month = match.group(1).lower()
    year = int(match.group(2))
    if start_month in ("january", "february") and _has_cross_year_dates(text_normalized):
        return year - 1
    return year


def _from_four_digit_years(text: str, text_normalized: str) -> Optional[int]:
    """Extract year from 4-digit year patterns in text."""
    matches = re.findall(r"\b(20\d{2})\b", text)
    if not matches:
        return None

    years = sorted(set(int(y) for y in matches))
    if len(years) == 2 and years[1] == years[0] + 1:
        return years[0]
    if len(years) == 1 and _has_cross_year_dates(text_normalized):
        return years[0] - 1
    return int(Counter(matches).most_common(1)[0][0])


def _from_two_digit_years(text: str) -> Optional[int]:
    """Extract year from MM/DD/YY patterns."""
    matches = re.findall(r"\d{1,2}/\d{1,2}/(\d{2})\b", text)
    if matches:
        return 2000 + int(Counter(matches).most_common(1)[0][0])
    return None


def _from_filename(filename: str) -> Optional[int]:
    """Extract year from filename like 20260217-statements.pdf."""
    match = re.search(r"(20\d{2})", filename)
    return int(match.group(1)) if match else None


def infer_year(text: str, filename: str = "") -> int:
    """Return the most likely statement year, or current year as fallback."""
    text_normalized = re.sub(r"\s+", " ", text)

    for fn in [
        lambda: _from_range_header(text, text_normalized),
        lambda: _from_four_digit_years(text, text_normalized),
        lambda: _from_two_digit_years(text),
        lambda: _from_filename(filename),
    ]:
        result = fn()
        if result is not None:
            return result

    return date.today().year

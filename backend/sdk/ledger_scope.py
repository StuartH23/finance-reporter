"""Shared helpers for period-scoped ledger views."""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from typing import Literal

import pandas as pd

Granularity = Literal["year", "quarter", "month"]

_YEAR_PATTERN = re.compile(r"^\d{4}$")
_QUARTER_PATTERN = re.compile(r"^\d{4}-Q[1-4]$")
_MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


@dataclass(frozen=True)
class ScopedLedger:
    period_key: str | None
    period_label: str | None
    start_date: pd.Timestamp | None
    end_date: pd.Timestamp | None
    rows: pd.DataFrame


def period_key_is_valid(period: str, granularity: Granularity) -> bool:
    if granularity == "year":
        return _YEAR_PATTERN.match(period) is not None
    if granularity == "quarter":
        return _QUARTER_PATTERN.match(period) is not None
    return _MONTH_PATTERN.match(period) is not None


def period_key_for_dates(dates: pd.Series, granularity: Granularity) -> pd.Series:
    if granularity == "year":
        return dates.dt.year.astype(str)
    if granularity == "quarter":
        return dates.dt.year.astype(str) + "-Q" + dates.dt.quarter.astype(str)
    return dates.dt.strftime("%Y-%m")


def period_label(period_key: str | None, granularity: Granularity) -> str | None:
    if not period_key:
        return None
    if granularity == "year":
        return period_key
    if granularity == "quarter":
        year_str, quarter_str = period_key.split("-Q")
        return f"Q{quarter_str} {year_str}"
    parsed = pd.to_datetime(f"{period_key}-01", errors="coerce")
    return period_key if pd.isna(parsed) else parsed.strftime("%B %Y")


def sort_period_keys(period_keys: list[str], granularity: Granularity) -> list[str]:
    if granularity == "year":
        return sorted(period_keys, key=int, reverse=True)
    if granularity == "month":
        return sorted(period_keys, reverse=True)

    def quarter_sort_key(value: str) -> tuple[int, int]:
        year_str, quarter_str = value.split("-Q")
        return (int(year_str), int(quarter_str))

    return sorted(period_keys, key=quarter_sort_key, reverse=True)


def period_bounds(period_key: str, granularity: Granularity) -> tuple[pd.Timestamp, pd.Timestamp]:
    if granularity == "year":
        year = int(period_key)
        return pd.Timestamp(year=year, month=1, day=1), pd.Timestamp(year=year, month=12, day=31)
    if granularity == "quarter":
        year_str, quarter_str = period_key.split("-Q")
        start_month = (int(quarter_str) - 1) * 3 + 1
        end_month = start_month + 2
        end_day = calendar.monthrange(int(year_str), end_month)[1]
        return (
            pd.Timestamp(year=int(year_str), month=start_month, day=1),
            pd.Timestamp(year=int(year_str), month=end_month, day=end_day),
        )

    year_str, month_str = period_key.split("-")
    end_day = calendar.monthrange(int(year_str), int(month_str))[1]
    return (
        pd.Timestamp(year=int(year_str), month=int(month_str), day=1),
        pd.Timestamp(year=int(year_str), month=int(month_str), day=end_day),
    )


def latest_period_key(ledger: pd.DataFrame, granularity: Granularity) -> str | None:
    if ledger.empty:
        return None
    keys = period_key_for_dates(ledger["date"], granularity).dropna().unique().tolist()
    sorted_keys = sort_period_keys(keys, granularity)
    return sorted_keys[0] if sorted_keys else None


def scoped_ledger(
    ledger: pd.DataFrame,
    *,
    granularity: Granularity,
    period: str | None = None,
) -> ScopedLedger:
    selected = period or latest_period_key(ledger, granularity)
    if not selected:
        return ScopedLedger(None, None, None, None, ledger.iloc[0:0].copy())

    start_date, end_date = period_bounds(selected, granularity)
    if ledger.empty:
        rows = ledger.copy()
    else:
        rows = ledger[(ledger["date"] >= start_date) & (ledger["date"] <= end_date)].copy()

    return ScopedLedger(
        period_key=selected,
        period_label=period_label(selected, granularity),
        start_date=start_date,
        end_date=end_date,
        rows=rows,
    )

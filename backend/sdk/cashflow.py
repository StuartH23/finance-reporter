"""Cash-flow graph builders for Sankey visualizations."""

from __future__ import annotations

import re
from typing import Literal

import pandas as pd

Granularity = Literal["month", "quarter"]
GroupBy = Literal["category", "merchant"]

_MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_QUARTER_PATTERN = re.compile(r"^\d{4}-Q[1-4]$")


def round_money(value: float) -> float:
    """Round to cents with a tiny epsilon to reduce float jitter."""
    return round(float(value) + 1e-9, 2)


def normalize_merchant(value: str) -> str:
    """Normalize a transaction description into a stable merchant label."""
    text = " ".join(str(value or "").split())
    if not text:
        return "Unknown Merchant"
    return text[:60]


def period_key_is_valid(period: str, granularity: Granularity) -> bool:
    """Validate period key format based on granularity."""
    if granularity == "month":
        return _MONTH_PATTERN.match(period) is not None
    return _QUARTER_PATTERN.match(period) is not None


def _period_key_series(dates: pd.Series, granularity: Granularity) -> pd.Series:
    if granularity == "month":
        return dates.dt.strftime("%Y-%m")
    return dates.dt.year.astype(str) + "-Q" + dates.dt.quarter.astype(str)


def period_key_label(period_key: str | None, granularity: Granularity) -> str | None:
    """Return a human-readable label for a period key."""
    if not period_key:
        return None

    if granularity == "month":
        parsed = pd.to_datetime(f"{period_key}-01", errors="coerce")
        if pd.isna(parsed):
            return period_key
        return parsed.strftime("%B %Y")

    year_str, quarter_str = period_key.split("-Q")
    return f"Q{quarter_str} {year_str}"


def _sort_period_keys(period_keys: list[str], granularity: Granularity) -> list[str]:
    if granularity == "month":
        return sorted(period_keys, reverse=True)

    def quarter_sort_key(value: str) -> tuple[int, int]:
        year_str, quarter_str = value.split("-Q")
        return (int(year_str), int(quarter_str))

    return sorted(period_keys, key=quarter_sort_key, reverse=True)


def _collapse_expense_groups(
    expenses: pd.DataFrame, group_by: GroupBy, max_groups: int
) -> pd.DataFrame:
    if expenses.empty:
        return pd.DataFrame(columns=["group_key", "amount", "transactions"])

    expenses = expenses.copy()
    expenses["spend"] = -expenses["amount"]

    if group_by == "category":
        categories = expenses["category"].astype(str).str.strip()
        expenses["group_key"] = categories.where(categories != "", "Uncategorized")
    else:
        expenses["group_key"] = expenses["description"].apply(normalize_merchant)

    grouped = (
        expenses.groupby("group_key", as_index=False)
        .agg(amount=("spend", "sum"), transactions=("spend", "count"))
        .sort_values("amount", ascending=False)
    )

    if len(grouped) <= max_groups:
        return grouped

    top = grouped.head(max_groups).copy()
    other = grouped.iloc[max_groups:]
    top.loc[len(top)] = {
        "group_key": "Other",
        "amount": float(other["amount"].sum()),
        "transactions": int(other["transactions"].sum()),
    }
    return top


def _allocate_income_to_expenses(income_total: float, expense_amounts: list[float]) -> list[float]:
    if income_total <= 0 or not expense_amounts:
        return [0.0 for _ in expense_amounts]

    expenses_total = sum(expense_amounts)
    if expenses_total <= 0:
        return [0.0 for _ in expense_amounts]

    if income_total >= expenses_total:
        return [round_money(amount) for amount in expense_amounts]

    ratio = income_total / expenses_total
    allocated = [round_money(amount * ratio) for amount in expense_amounts]

    delta = round_money(income_total - sum(allocated))
    if abs(delta) >= 0.01 and allocated:
        index = max(range(len(expense_amounts)), key=lambda idx: expense_amounts[idx])
        allocated[index] = round_money(max(0.0, allocated[index] + delta))

    # Keep allocation <= expense amount after rounding adjustments.
    allocated = [min(round_money(expense_amounts[idx]), allocated[idx]) for idx in range(len(allocated))]

    remaining = round_money(income_total - sum(allocated))
    if remaining > 0:
        by_room = sorted(
            range(len(expense_amounts)),
            key=lambda idx: expense_amounts[idx] - allocated[idx],
            reverse=True,
        )
        for index in by_room:
            if remaining <= 0:
                break
            room = round_money(expense_amounts[index] - allocated[index])
            if room <= 0:
                continue
            added = min(room, remaining)
            allocated[index] = round_money(allocated[index] + added)
            remaining = round_money(remaining - added)

    return allocated


def build_cashflow_payload(
    pnl_ledger: pd.DataFrame,
    *,
    granularity: Granularity,
    group_by: GroupBy,
    period: str | None = None,
    max_groups: int = 7,
) -> dict:
    """Build a Sankey-friendly cashflow payload from normalized P&L ledger rows."""
    if pnl_ledger.empty:
        return {
            "granularity": granularity,
            "group_by": group_by,
            "period_key": period,
            "period_label": period_key_label(period, granularity),
            "available_periods": [],
            "totals": {"income": 0.0, "expenses": 0.0, "net": 0.0},
            "nodes": [],
            "links": [],
            "groups": [],
            "transaction_count": 0,
        }

    ledger = pnl_ledger.copy()
    ledger["period_key"] = _period_key_series(ledger["date"], granularity)

    available_keys = _sort_period_keys(ledger["period_key"].dropna().unique().tolist(), granularity)
    selected_period = period or (available_keys[0] if available_keys else None)

    period_rows = (
        ledger[ledger["period_key"] == selected_period].copy()
        if selected_period
        else ledger.iloc[0:0].copy()
    )

    available_periods = [
        {
            "key": period_key,
            "label": period_key_label(period_key, granularity) or period_key,
        }
        for period_key in available_keys
    ]

    if period_rows.empty:
        return {
            "granularity": granularity,
            "group_by": group_by,
            "period_key": selected_period,
            "period_label": period_key_label(selected_period, granularity),
            "available_periods": available_periods,
            "totals": {"income": 0.0, "expenses": 0.0, "net": 0.0},
            "nodes": [],
            "links": [],
            "groups": [],
            "transaction_count": 0,
        }

    income_total = round_money(float(period_rows.loc[period_rows["amount"] > 0, "amount"].sum()))
    expenses = period_rows[period_rows["amount"] < 0].copy()
    grouped_expenses = _collapse_expense_groups(expenses, group_by=group_by, max_groups=max_groups)
    expense_amounts = [round_money(float(value)) for value in grouped_expenses["amount"].tolist()]
    expenses_total = round_money(sum(expense_amounts))
    net_total = round_money(income_total - expenses_total)

    nodes: list[dict] = []
    links: list[dict] = []
    groups: list[dict] = []
    shortfall_links: list[dict] = []
    shortfall_total = 0.0

    nodes.append(
        {
            "id": "income",
            "label": "Income",
            "type": "income",
            "value": income_total,
            "group_key": None,
        }
    )

    income_allocations = _allocate_income_to_expenses(income_total, expense_amounts)

    for index, row in grouped_expenses.reset_index(drop=True).iterrows():
        amount = round_money(float(row["amount"]))
        income_share = income_allocations[index] if index < len(income_allocations) else 0.0
        deficit = round_money(max(0.0, amount - income_share))
        node_id = f"expense-{index + 1}"
        group_key = str(row["group_key"])

        nodes.append(
            {
                "id": node_id,
                "label": group_key,
                "type": "expense",
                "value": amount,
                "group_key": group_key,
            }
        )
        groups.append(
            {
                "key": group_key,
                "label": group_key,
                "amount": amount,
                "transactions": int(row["transactions"]),
            }
        )

        if income_share > 0:
            links.append({"source": "income", "target": node_id, "value": round_money(income_share)})

        if deficit > 0:
            shortfall_total = round_money(shortfall_total + deficit)
            shortfall_links.append({"source": "shortfall", "target": node_id, "value": deficit})

    savings_total = round_money(max(0.0, income_total - expenses_total))
    if savings_total > 0:
        nodes.append(
            {
                "id": "savings",
                "label": "Savings",
                "type": "savings",
                "value": savings_total,
                "group_key": None,
            }
        )
        links.append({"source": "income", "target": "savings", "value": savings_total})

    if shortfall_total > 0:
        nodes.append(
            {
                "id": "shortfall",
                "label": "Shortfall",
                "type": "shortfall",
                "value": shortfall_total,
                "group_key": None,
            }
        )
        links.extend(shortfall_links)

    return {
        "granularity": granularity,
        "group_by": group_by,
        "period_key": selected_period,
        "period_label": period_key_label(selected_period, granularity),
        "available_periods": available_periods,
        "totals": {
            "income": income_total,
            "expenses": expenses_total,
            "net": net_total,
        },
        "nodes": nodes,
        "links": links,
        "groups": groups,
        "transaction_count": int(len(period_rows)),
    }

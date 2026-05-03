"""Aggregations exposed to the chat agent as tools.

Each function accepts a ledger DataFrame plus typed arguments and returns a
JSON-serializable dict. Keep results small — the model reads them directly.
"""

from __future__ import annotations

from datetime import datetime

import pandas as pd

from .categories import TRANSFER_CATEGORIES
from .subscriptions import build_subscription_payload, normalize_merchant


def _spend_frame(ledger: pd.DataFrame) -> pd.DataFrame:
    if ledger.empty:
        return ledger
    return ledger[(ledger["amount"] < 0) & (~ledger["category"].isin(TRANSFER_CATEGORIES))].copy()


def _parse_date(value: str, field: str) -> pd.Timestamp:
    try:
        return pd.Timestamp(value)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"{field} must be YYYY-MM-DD, got {value!r}") from exc


def _filter_range(
    frame: pd.DataFrame, start_date: str | None, end_date: str | None
) -> pd.DataFrame:
    if frame.empty:
        return frame
    mask = pd.Series(True, index=frame.index)
    if start_date:
        mask &= frame["date"] >= _parse_date(start_date, "start_date")
    if end_date:
        mask &= frame["date"] <= _parse_date(end_date, "end_date")
    return frame[mask]


def top_merchants(
    ledger: pd.DataFrame,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 10,
) -> dict:
    """Return merchants with the highest total spend in the date range."""
    spend = _filter_range(_spend_frame(ledger), start_date, end_date)
    if spend.empty:
        return {"merchants": [], "total_spend": 0.0, "date_range": [start_date, end_date]}

    spend = spend.assign(merchant=spend["description"].apply(normalize_merchant))
    grouped = (
        spend.groupby("merchant", sort=False)
        .agg(total=("amount", "sum"), transactions=("amount", "count"))
        .reset_index()
    )
    grouped["total"] = grouped["total"].abs().round(2)
    grouped = grouped.sort_values("total", ascending=False).head(limit)

    return {
        "merchants": grouped.to_dict(orient="records"),
        "total_spend": round(float(spend["amount"].abs().sum()), 2),
        "date_range": [start_date, end_date],
    }


def spending_by_category(
    ledger: pd.DataFrame,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """Return total spend grouped by category for a date range."""
    spend = _filter_range(_spend_frame(ledger), start_date, end_date)
    if spend.empty:
        return {"categories": [], "total_spend": 0.0, "date_range": [start_date, end_date]}

    grouped = (
        spend.groupby("category", sort=False)
        .agg(total=("amount", "sum"), transactions=("amount", "count"))
        .reset_index()
    )
    grouped["total"] = grouped["total"].abs().round(2)
    grouped = grouped.sort_values("total", ascending=False)

    return {
        "categories": grouped.to_dict(orient="records"),
        "total_spend": round(float(spend["amount"].abs().sum()), 2),
        "date_range": [start_date, end_date],
    }


def month_over_month_delta(ledger: pd.DataFrame, month: str) -> dict:
    """Compare per-category spend in `month` (YYYY-MM) against the prior month."""
    try:
        period = pd.Period(month, freq="M")
    except ValueError as exc:
        raise ValueError(f"month must be YYYY-MM, got {month!r}") from exc

    prior = period - 1
    spend = _spend_frame(ledger)
    if spend.empty:
        return {"month": str(period), "prior_month": str(prior), "changes": []}

    spend = spend.assign(period=spend["date"].dt.to_period("M"))
    current = spend[spend["period"] == period]
    previous = spend[spend["period"] == prior]

    def by_cat(frame: pd.DataFrame) -> pd.Series:
        return frame.groupby("category")["amount"].sum().abs()

    current_totals = by_cat(current)
    previous_totals = by_cat(previous)
    all_cats = sorted(set(current_totals.index) | set(previous_totals.index))

    changes = []
    for cat in all_cats:
        cur = float(current_totals.get(cat, 0.0))
        prev = float(previous_totals.get(cat, 0.0))
        delta = cur - prev
        pct = (delta / prev * 100) if prev > 0 else None
        changes.append(
            {
                "category": cat,
                "current": round(cur, 2),
                "previous": round(prev, 2),
                "delta": round(delta, 2),
                "percent_change": round(pct, 1) if pct is not None else None,
            }
        )

    changes.sort(key=lambda c: abs(c["delta"]), reverse=True)
    return {
        "month": str(period),
        "prior_month": str(prior),
        "changes": changes,
    }


def unusual_charges(ledger: pd.DataFrame, lookback_days: int = 90) -> dict:
    """Transactions whose amount is >2 std dev above a merchant's recent mean."""
    spend = _spend_frame(ledger)
    if spend.empty:
        return {"charges": [], "lookback_days": lookback_days}

    today = pd.Timestamp(datetime.now().date())
    cutoff = today - pd.Timedelta(days=lookback_days)
    recent = spend[spend["date"] >= cutoff].copy()
    if recent.empty:
        return {"charges": [], "lookback_days": lookback_days}

    recent["merchant"] = recent["description"].apply(normalize_merchant)
    recent["abs_amount"] = recent["amount"].abs()

    stats = recent.groupby("merchant")["abs_amount"].agg(["mean", "std", "count"])
    stats = stats[stats["count"] >= 3]

    charges: list[dict] = []
    for merchant, row in stats.iterrows():
        std = float(row["std"] or 0.0)
        mean = float(row["mean"])
        if std <= 0:
            continue
        threshold = mean + 2 * std
        hits = recent[(recent["merchant"] == merchant) & (recent["abs_amount"] > threshold)]
        for _, charge in hits.iterrows():
            charges.append(
                {
                    "date": charge["date"].strftime("%Y-%m-%d"),
                    "merchant": merchant,
                    "description": charge["description"],
                    "amount": round(float(charge["abs_amount"]), 2),
                    "merchant_average": round(mean, 2),
                    "threshold": round(threshold, 2),
                }
            )

    charges.sort(key=lambda c: c["amount"], reverse=True)
    return {"charges": charges, "lookback_days": lookback_days}


def list_subscriptions_tool(
    ledger: pd.DataFrame,
    preferences: dict[str, dict[str, bool]] | None = None,
    active_only: bool = True,
) -> dict:
    """Return detected recurring charges in a compact shape for the agent."""
    payload = build_subscription_payload(ledger, preferences or {})
    if active_only:
        payload = [s for s in payload if s["active"] and not s["ignored"]]

    summary = [
        {
            "merchant": s["merchant"],
            "cadence": s["cadence"],
            "amount": s["amount"],
            "baseline_amount": s["baseline_amount"],
            "trend": s["trend"],
            "price_increase": s["price_increase"],
            "last_charge_date": s["last_charge_date"],
            "next_expected_charge_date": s["next_expected_charge_date"],
            "charge_count": s["charge_count"],
            "confidence": s["confidence"],
        }
        for s in payload
    ]
    _to_monthly = {"weekly": 365 / 12 / 7, "monthly": 1.0, "annual": 1 / 12}
    total = round(sum(s["amount"] * _to_monthly.get(s["cadence"], 1.0) for s in summary), 2)
    return {"subscriptions": summary, "count": len(summary), "monthly_estimate": total}


def ledger_date_bounds(ledger: pd.DataFrame) -> dict:
    """Return the earliest and latest transaction dates — useful context for the agent."""
    if ledger.empty:
        return {"earliest": None, "latest": None, "transaction_count": 0}
    return {
        "earliest": ledger["date"].min().strftime("%Y-%m-%d"),
        "latest": ledger["date"].max().strftime("%Y-%m-%d"),
        "transaction_count": len(ledger),
    }

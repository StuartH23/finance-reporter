"""Coach-style insight generation from ledger and budget data."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import UTC, datetime

import pandas as pd

from .budget import load_budget
from .categories import TRANSFER_CATEGORIES
from .ledger import summarize


@dataclass
class InsightCandidate:
    """Internal candidate insight before filtering and conflict resolution."""

    insight_id: str
    kind: str
    title: str
    observation: str
    significance: str
    action: str
    confidence: float
    severity: int
    template_key: str
    template_vars: dict[str, float | int | str]
    digest: str


def _format_currency(value: float, currency: str = "USD") -> str:
    symbol = "$" if currency.upper() == "USD" else f"{currency.upper()} "
    return f"{symbol}{value:,.0f}"


def _format_percent(value: float) -> str:
    return f"{value:.1f}%"


def _month_bounds(year: int, month: int):
    return datetime(year, month, 1), datetime(year, month, monthrange(year, month)[1])


def _complete_months(pnl: pd.DataFrame) -> list[pd.Period]:
    if pnl.empty:
        return []

    data_min = pnl["date"].min().to_pydatetime()
    data_max = pnl["date"].max().to_pydatetime()

    complete: list[pd.Period] = []
    for period in sorted(pnl["date"].dt.to_period("M").unique()):
        month_start, month_end = _month_bounds(period.year, period.month)
        if data_min.date() <= month_start.date() and data_max.date() >= month_end.date():
            complete.append(period)
    return complete


def _confidence_from_volatility(base: float, values: pd.Series) -> float:
    if values.empty:
        return max(0.0, min(1.0, base - 0.25))

    mean = float(values.mean())
    std = float(values.std(ddof=0))
    volatility = (std / mean) if mean > 0 else 0.0

    adjusted = base
    if volatility > 0.5:
        adjusted -= 0.2
    elif volatility > 0.3:
        adjusted -= 0.1

    return max(0.0, min(1.0, adjusted))


def _spending_trend_candidate(
    spending: pd.DataFrame,
    months: list[pd.Period],
    currency: str,
) -> InsightCandidate | None:
    if len(months) < 2:
        return None

    prior_month = months[-2]
    current_month = months[-1]

    by_cat = (
        spending[spending["month"].isin([prior_month, current_month])]
        .groupby(["category", "month"], sort=False)["abs_amount"]
        .sum()
        .unstack(fill_value=0.0)
    )
    if by_cat.empty:
        return None

    by_cat["delta"] = by_cat.get(current_month, 0.0) - by_cat.get(prior_month, 0.0)
    by_cat["delta_abs"] = by_cat["delta"].abs()

    winner = by_cat.sort_values("delta_abs", ascending=False).head(1)
    if winner.empty:
        return None

    category = str(winner.index[0])
    row = winner.iloc[0]
    current_val = float(row.get(current_month, 0.0))
    prior_val = float(row.get(prior_month, 0.0))
    delta = float(row["delta"])

    if abs(delta) < 40:
        return None

    pct_delta = (delta / prior_val * 100) if prior_val > 0 else (100.0 if delta > 0 else 0.0)
    direction = "up" if delta > 0 else "down"

    txns = int(
        spending[
            (spending["category"] == category)
            & (spending["month"].isin([prior_month, current_month]))
        ]["amount"].count()
    )

    base_confidence = 0.55 + min(0.2, txns / 20) + min(0.2, abs(pct_delta) / 100)
    conf = _confidence_from_volatility(
        base_confidence,
        spending[spending["category"] == category]
        .groupby("month", sort=False)["abs_amount"]
        .sum()
        .tail(6),
    )

    change_money = _format_currency(abs(delta), currency)
    current_money = _format_currency(current_val, currency)
    prior_money = _format_currency(prior_val, currency)

    if direction == "up":
        title = f"{category} spending rose this period"
        observation = (
            f"{category} spending increased by {change_money} ({_format_percent(abs(pct_delta))}) "
            f"from {prior_money} to {current_money}."
        )
        significance = (
            "When one category climbs quickly, it can crowd out savings and make "
            "next month feel tight."
        )
        action = (
            f"Set a one-week cap for {category} and move {change_money} to a "
            "protected essentials/savings bucket today."
        )
        severity = 2
    else:
        title = f"{category} spending improved this period"
        observation = (
            f"{category} spending dropped by {change_money} ({_format_percent(abs(pct_delta))}) "
            f"from {prior_money} to {current_money}."
        )
        significance = (
            "This creates extra room you can intentionally direct before it gets "
            "absorbed elsewhere."
        )
        action = (
            f"Route at least half of that {change_money} reduction into your top goal this week."
        )
        severity = 1

    return InsightCandidate(
        insight_id="spending-trend",
        kind="spending_trend",
        title=title,
        observation=observation,
        significance=significance,
        action=action,
        confidence=conf,
        severity=severity,
        template_key=f"spending_trend_{direction}",
        template_vars={
            "category": category,
            "change_amount": abs(delta),
            "pct_change": abs(pct_delta),
            "prior_amount": prior_val,
            "current_amount": current_val,
        },
        digest=(
            f"{category} is {direction} by {change_money} vs last month. "
            f"Action: "
            f"{'Cap for one week.' if direction == 'up' else 'Move the savings to your goal.'}"
        ),
    )


def _goal_trajectory_candidate(monthly: pd.DataFrame, currency: str) -> InsightCandidate | None:
    budget = load_budget()
    monthly_budget = float(sum(budget.values()))
    if monthly_budget <= 0 or monthly.empty:
        return None

    recent = monthly.tail(min(3, len(monthly))).copy()
    avg_expenses = float(recent["expenses"].mean())
    gap = monthly_budget - avg_expenses
    utilization = (avg_expenses / monthly_budget * 100) if monthly_budget > 0 else 0.0

    conf_base = 0.58 + min(0.18, len(recent) / 12)
    conf = _confidence_from_volatility(conf_base, recent["expenses"])

    if abs(gap) < 35:
        return None

    if gap >= 0:
        title = "Your spending goal is on track"
        observation = (
            f"Recent monthly spending averages {_format_currency(avg_expenses, currency)} "
            f"against a budget of {_format_currency(monthly_budget, currency)} "
            f"({_format_percent(utilization)} used)."
        )
        significance = (
            "Staying under plan consistently compounds into more flexibility and faster progress."
        )
        action = (
            f"Schedule an automatic transfer of {_format_currency(gap * 0.5, currency)} "
            "after payday to lock in progress."
        )
        key = "goal_trajectory_on_track"
        severity = 1
    else:
        short = abs(gap)
        title = "Your spending goal is drifting off track"
        observation = (
            f"Recent monthly spending averages {_format_currency(avg_expenses, currency)}, "
            f"about {_format_currency(short, currency)} above your "
            f"{_format_currency(monthly_budget, currency)} target."
        )
        significance = (
            "Small monthly overruns can become a larger gap over a quarter if left unadjusted."
        )
        action = (
            f"Pick one flexible category to trim by {_format_currency(short, currency)} "
            "this month and track it weekly."
        )
        key = "goal_trajectory_off_track"
        severity = 2

    return InsightCandidate(
        insight_id="goal-trajectory",
        kind="goal_trajectory",
        title=title,
        observation=observation,
        significance=significance,
        action=action,
        confidence=conf,
        severity=severity,
        template_key=key,
        template_vars={
            "avg_expenses": avg_expenses,
            "monthly_budget": monthly_budget,
            "gap": gap,
            "utilization_pct": utilization,
        },
        digest=(
            f"Goal trajectory: {'on track' if gap >= 0 else 'off track'} by "
            f"{_format_currency(abs(gap), currency)} per month."
        ),
    )


def _cashflow_risk_candidate(monthly: pd.DataFrame, spending: pd.DataFrame, currency: str):
    if monthly.empty:
        return None

    recent = monthly.tail(min(3, len(monthly))).copy()
    avg_net = float(recent["net"].mean())
    if avg_net >= -30:
        return None

    projected_shortfall = abs(avg_net)

    top_category = None
    if not spending.empty:
        latest_month = spending["month"].max()
        top = (
            spending[spending["month"] == latest_month]
            .groupby("category", sort=False)["abs_amount"]
            .sum()
            .sort_values(ascending=False)
        )
        if not top.empty:
            top_category = str(top.index[0])

    conf_base = 0.62 + min(0.16, len(recent) / 12) + min(0.12, projected_shortfall / 1000)
    conf = _confidence_from_volatility(conf_base, recent["net"].abs())

    focus = top_category or "a flexible category"
    trim = _format_currency(max(50.0, projected_shortfall * 0.6), currency)

    return InsightCandidate(
        insight_id="cashflow-risk",
        kind="cashflow_risk",
        title="Cashflow risk: possible monthly shortfall",
        observation=(
            f"Your recent net cashflow averages -"
            f"{_format_currency(projected_shortfall, currency)} per month."
        ),
        significance=(
            "If this pattern continues, you could need to borrow or dip into "
            "savings to cover regular bills."
        ),
        action=(f"Reduce {focus} by {trim} this month and set a weekly check-in to stay ahead."),
        confidence=conf,
        severity=3,
        template_key="cashflow_risk_shortfall",
        template_vars={
            "projected_shortfall": projected_shortfall,
            "focus_category": focus,
            "trim_amount": max(50.0, projected_shortfall * 0.6),
        },
        digest=(
            f"Risk: trend suggests a {_format_currency(projected_shortfall, currency)} "
            "monthly shortfall. "
            f"Action: trim {focus}."
        ),
    )


def _positive_reinforcement_candidate(
    monthly: pd.DataFrame, currency: str
) -> InsightCandidate | None:
    if monthly.empty:
        return None

    streak = 0
    for value in reversed(monthly["net"].tolist()):
        if value > 0:
            streak += 1
        else:
            break

    if streak < 2:
        return None

    recent_gain = float(monthly.tail(streak)["net"].sum())
    conf = min(0.95, 0.65 + min(0.25, streak / 10))

    return InsightCandidate(
        insight_id="positive-reinforcement",
        kind="positive_reinforcement",
        title="You are building a strong consistency streak",
        observation=(
            f"You have {streak} profitable month{'s' if streak != 1 else ''} in a row, with "
            f"{_format_currency(recent_gain, currency)} net positive across that streak."
        ),
        significance=(
            "Consistency matters more than perfection. This pattern is exactly "
            "what makes goals easier over time."
        ),
        action=(
            f"Celebrate it, then automate "
            f"{_format_currency(max(25.0, recent_gain * 0.1), currency)} to savings "
            "so the streak compounds."
        ),
        confidence=conf,
        severity=1,
        template_key="positive_reinforcement_streak",
        template_vars={
            "streak_months": streak,
            "streak_net": recent_gain,
            "auto_transfer": max(25.0, recent_gain * 0.1),
        },
        digest=(
            f"Win: {streak}-month positive streak. Action: auto-transfer a small part of it today."
        ),
    )


def _resolve_conflicts(
    candidates: list[InsightCandidate], threshold: float
) -> tuple[list[InsightCandidate], int]:
    accepted = [c for c in candidates if c.confidence >= threshold]
    suppressed = len(candidates) - len(accepted)

    by_kind: dict[str, InsightCandidate] = {}
    for item in sorted(accepted, key=lambda c: (c.severity, c.confidence), reverse=True):
        if item.kind not in by_kind:
            by_kind[item.kind] = item

    selected = list(by_kind.values())

    has_negative = any(
        i.kind in {"cashflow_risk"}
        or (i.kind == "goal_trajectory" and i.template_key.endswith("off_track"))
        for i in selected
    )
    if has_negative:
        before = len(selected)
        selected = [i for i in selected if i.kind != "positive_reinforcement"]
        suppressed += before - len(selected)

    selected.sort(key=lambda c: (c.severity, c.confidence), reverse=True)
    return selected, suppressed


def build_insights(
    ledger: pd.DataFrame,
    *,
    locale: str = "en-US",
    currency: str = "USD",
    confidence_threshold: float = 0.58,
) -> dict:
    """Build coach-style insights from a ledger."""
    if ledger.empty:
        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "locale": locale,
            "currency": currency,
            "period_label": None,
            "insights": [],
            "digest": [],
            "suppressed": 0,
        }

    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()
    if pnl.empty:
        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "locale": locale,
            "currency": currency,
            "period_label": None,
            "insights": [],
            "digest": [],
            "suppressed": 0,
        }

    complete = _complete_months(pnl)
    if complete:
        pnl = pnl[pnl["date"].dt.to_period("M").isin(complete)].copy()

    if pnl.empty:
        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "locale": locale,
            "currency": currency,
            "period_label": None,
            "insights": [],
            "digest": [],
            "suppressed": 0,
        }

    monthly = summarize(pnl)
    monthly["period"] = pd.PeriodIndex(monthly["month_str"], freq="M")

    spending = pnl[pnl["amount"] < 0].copy()
    spending["abs_amount"] = -spending["amount"]
    spending["month"] = spending["date"].dt.to_period("M")

    month_periods = sorted(monthly["period"].tolist())
    period_label = month_periods[-1].strftime("%B %Y") if month_periods else None

    candidates: list[InsightCandidate] = []

    trend = _spending_trend_candidate(spending, month_periods, currency)
    if trend:
        candidates.append(trend)

    goal = _goal_trajectory_candidate(monthly, currency)
    if goal:
        candidates.append(goal)

    risk = _cashflow_risk_candidate(monthly, spending, currency)
    if risk:
        candidates.append(risk)

    positive = _positive_reinforcement_candidate(monthly, currency)
    if positive:
        candidates.append(positive)

    selected, suppressed = _resolve_conflicts(candidates, confidence_threshold)

    payload = []
    for item in selected:
        payload.append(
            {
                "id": item.insight_id,
                "kind": item.kind,
                "title": item.title,
                "observation": item.observation,
                "significance": item.significance,
                "action": item.action,
                "why_this_matters": item.significance,
                "do_this_now": item.action,
                "confidence": round(item.confidence, 3),
                "template_key": item.template_key,
                "template_vars": item.template_vars,
                "digest": item.digest,
                "period_label": period_label,
            }
        )

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "locale": locale,
        "currency": currency,
        "period_label": period_label,
        "insights": payload,
        "digest": payload[:3],
        "suppressed": suppressed,
    }

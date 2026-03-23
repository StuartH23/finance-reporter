"""Rule-based next-best-action generation and ranking."""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, date, datetime, timedelta
from typing import Literal

import pandas as pd

from .categories import TRANSFER_CATEGORIES

ActionOutcome = Literal["completed", "dismissed", "snoozed"]

ACTION_TYPES = (
    "save_transfer",
    "spending_cap",
    "bill_review",
    "debt_extra_payment",
    "subscription_cleanup",
)

DEFAULT_METRIC_WEIGHTS = {
    "impact": 0.38,
    "urgency": 0.28,
    "confidence": 0.22,
    "effort": 0.12,
}

DEFAULT_DISMISS_COOLDOWN_DAYS = 3
DEFAULT_SNOOZE_DAYS = 2
DIVERSITY_WINDOW_DAYS = 7
PERSONALIZATION_STEP = 0.08
MAX_DAILY_ACTIONS = 3

_DEBT_HINT = re.compile(
    r"(?:loan|credit\s*card|student|mortgage|auto\s*loan|line\s*of\s*credit|interest)",
    re.IGNORECASE,
)


class ActionCandidate(dict):
    """Dict-backed action candidate with scoring metadata."""


def default_personalization_state() -> dict:
    """Return default in-memory personalization state."""
    return {
        "metric_weights": dict(DEFAULT_METRIC_WEIGHTS),
        "type_bias": {},
        "history": [],
        "states": {},
        "catalog": {},
    }


def _today() -> date:
    return datetime.now(UTC).date()


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def _fmt_money(amount: float) -> str:
    return f"${abs(amount):,.0f}"


def _action_id(action_type: str, anchor: str) -> str:
    digest = hashlib.sha1(f"{action_type}:{anchor}".encode(), usedforsecurity=False).hexdigest()
    return digest[:16]


def _ensure_state(state: dict | None) -> dict:
    if state is None:
        return default_personalization_state()
    merged = default_personalization_state()
    merged.update(state)
    merged["metric_weights"] = {
        **DEFAULT_METRIC_WEIGHTS,
        **(state.get("metric_weights") or {}),
    }
    merged["type_bias"] = state.get("type_bias") or {}
    merged["history"] = state.get("history") or []
    merged["states"] = state.get("states") or {}
    merged["catalog"] = state.get("catalog") or {}
    return merged


def _monthly_totals(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame(columns=["month", "income", "expense", "net"])

    scoped = frame.copy()
    scoped["month"] = scoped["date"].dt.to_period("M").astype(str)
    income = (
        scoped[scoped["amount"] > 0]
        .groupby("month", sort=True)["amount"]
        .sum()
        .rename("income")
    )
    expense = (
        -scoped[scoped["amount"] < 0]
        .groupby("month", sort=True)["amount"]
        .sum()
        .rename("expense")
    )
    out = pd.concat([income, expense], axis=1).fillna(0).reset_index()
    out["net"] = out["income"] - out["expense"]
    return out


def _build_save_transfer(monthly: pd.DataFrame) -> ActionCandidate | None:
    if monthly.empty:
        return None
    avg_net = float(monthly["net"].mean())
    avg_income = float(monthly["income"].mean())
    if avg_net <= 40:
        return None

    transfer = round(min(500.0, max(25.0, avg_net * 0.25, avg_income * 0.05)), 2)
    impact = transfer
    return ActionCandidate(
        action_id=_action_id("save_transfer", f"{int(transfer)}"),
        action_type="save_transfer",
        title=f"Auto-transfer {_fmt_money(transfer)} to savings",
        rationale=(
            f"Your average monthly cashflow is positive by {_fmt_money(avg_net)}. "
            f"Scheduling a recurring transfer captures surplus before it gets spent."
        ),
        impact_estimate=f"Builds about {_fmt_money(impact)} per month ({_fmt_money(impact * 12)}/year).",
        impact_monthly=round(impact, 2),
        impact_score=_clamp(impact / 400),
        urgency_score=0.56,
        confidence_score=_clamp(0.55 + min(0.25, len(monthly) * 0.05)),
        effort_score=0.14,
    )


def _build_spending_cap(spending: pd.DataFrame, budget: dict[str, float]) -> ActionCandidate | None:
    if spending.empty:
        return None

    scoped = spending.copy()
    scoped["month"] = scoped["date"].dt.to_period("M").astype(str)
    by_month_cat = (
        scoped.groupby(["month", "category"], sort=False)["amount"].sum().abs().reset_index()
    )
    if by_month_cat.empty:
        return None

    latest_month = by_month_cat["month"].max()
    latest = by_month_cat[by_month_cat["month"] == latest_month].copy()
    latest = latest.sort_values("amount", ascending=False).reset_index(drop=True)
    if latest.empty:
        return None

    pick = latest.iloc[0]
    category = str(pick["category"])
    latest_spend = float(pick["amount"])
    history_cat = by_month_cat[by_month_cat["category"] == category].sort_values("month")
    baseline = (
        float(history_cat.iloc[:-1]["amount"].mean())
        if len(history_cat) > 1
        else latest_spend
    )
    trend_jump = max(0.0, latest_spend - baseline)

    budgeted = float(budget.get(category, 0.0))
    overage = max(0.0, latest_spend - budgeted) if budgeted > 0 else 0.0
    cap = round(min(250.0, max(20.0, max(overage * 0.7, trend_jump * 0.3, latest_spend * 0.08))), 2)

    rationale = (
        f"{category} spending reached {_fmt_money(latest_spend)} in {latest_month}. "
        f"Setting a soft cap now can prevent repeat overspending next month."
    )
    if budgeted > 0:
        rationale = (
            f"{category} is {_fmt_money(overage)} over your {_fmt_money(budgeted)} budget in {latest_month}. "
            "A temporary cap can pull this category back in range."
        )

    return ActionCandidate(
        action_id=_action_id("spending_cap", category.lower()),
        action_type="spending_cap",
        title=f"Set a {_fmt_money(cap)} cap for {category}",
        rationale=rationale,
        impact_estimate=f"Could reduce spending by about {_fmt_money(cap)} next month.",
        impact_monthly=round(cap, 2),
        impact_score=_clamp(cap / 220),
        urgency_score=0.78 if overage > 0 else 0.62,
        confidence_score=_clamp(0.52 + min(0.25, len(history_cat) * 0.06)),
        effort_score=0.38,
    )


def _build_bill_review(subscriptions: list[dict]) -> ActionCandidate | None:
    scoped = [s for s in subscriptions if s.get("active") and not s.get("ignored")]
    if not scoped:
        return None

    prioritized = sorted(
        scoped,
        key=lambda s: (
            not bool(s.get("price_increase")),
            -float(s.get("amount", 0.0)),
            -float(s.get("confidence", 0.0)),
        ),
    )
    pick = prioritized[0]
    amount = float(pick.get("amount", 0.0))
    baseline = float(pick.get("baseline_amount", amount))
    delta = max(0.0, amount - baseline)
    savings = round(max(delta, amount * (0.12 if pick.get("essential") else 0.18), 6.0), 2)

    review_reason = "recent increase" if pick.get("price_increase") else "high recurring charge"
    return ActionCandidate(
        action_id=_action_id("bill_review", str(pick["stream_id"])),
        action_type="bill_review",
        title=f"Review {pick['merchant']} bill",
        rationale=(
            f"{pick['merchant']} has a {review_reason} at {_fmt_money(amount)}/month. "
            "A quick renegotiation or plan audit can lower it without canceling."
        ),
        impact_estimate=f"Potential savings: about {_fmt_money(savings)} per month.",
        impact_monthly=round(savings, 2),
        impact_score=_clamp(savings / 120),
        urgency_score=0.83 if pick.get("price_increase") else 0.58,
        confidence_score=_clamp(float(pick.get("confidence", 0.55))),
        effort_score=0.33,
    )


def _build_debt_extra_payment(pnl: pd.DataFrame) -> ActionCandidate | None:
    if pnl.empty:
        return None

    debt = pnl[
        (pnl["amount"] < 0)
        & (
            pnl["description"].str.contains(_DEBT_HINT, na=False)
            | pnl["category"].str.contains(_DEBT_HINT, na=False)
        )
    ].copy()
    if debt.empty:
        return None

    debt["month"] = debt["date"].dt.to_period("M").astype(str)
    monthly_debt = debt.groupby("month", sort=True)["amount"].sum().abs()
    avg_payment = float(monthly_debt.mean())
    if avg_payment < 40:
        return None

    extra = round(min(300.0, max(25.0, avg_payment * 0.16)), 2)
    est_yearly_interest_saved = round(extra * 12 * 0.18, 2)

    return ActionCandidate(
        action_id=_action_id("debt_extra_payment", "core"),
        action_type="debt_extra_payment",
        title=f"Add {_fmt_money(extra)} to your next debt payment",
        rationale=(
            f"Debt-related payments average {_fmt_money(avg_payment)} monthly. "
            "A small extra principal payment now lowers future interest drag."
        ),
        impact_estimate=(
            f"Estimated interest savings: about {_fmt_money(est_yearly_interest_saved)} per year."
        ),
        impact_monthly=round(extra, 2),
        impact_score=_clamp(extra / 250),
        urgency_score=0.72,
        confidence_score=0.64,
        effort_score=0.44,
    )


def _build_subscription_cleanup(subscriptions: list[dict]) -> ActionCandidate | None:
    optional = [
        s for s in subscriptions if s.get("active") and not s.get("ignored") and not s.get("essential")
    ]
    if not optional:
        return None

    optional.sort(key=lambda s: float(s.get("amount", 0.0)), reverse=True)
    review = optional[:2]
    monthly = round(sum(float(s.get("amount", 0.0)) for s in review) * 0.7, 2)
    names = ", ".join(str(s["merchant"]) for s in review)

    return ActionCandidate(
        action_id=_action_id("subscription_cleanup", names.lower()),
        action_type="subscription_cleanup",
        title=f"Clean up {len(review)} optional subscription(s)",
        rationale=(
            f"{names} look optional based on your preferences and recurring-charge patterns. "
            "Canceling or pausing one can free up immediate monthly cashflow."
        ),
        impact_estimate=f"Potential monthly savings: about {_fmt_money(monthly)}.",
        impact_monthly=round(monthly, 2),
        impact_score=_clamp(monthly / 140),
        urgency_score=0.68,
        confidence_score=_clamp(
            sum(float(s.get("confidence", 0.6)) for s in review) / max(1, len(review))
        ),
        effort_score=0.27,
    )


def generate_action_candidates(
    ledger: pd.DataFrame,
    budget: dict[str, float],
    subscriptions: list[dict],
) -> list[ActionCandidate]:
    """Generate rule-based candidate actions from available financial context."""
    if ledger.empty:
        return []

    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()
    if pnl.empty:
        return []

    spending = pnl[pnl["amount"] < 0].copy()
    monthly = _monthly_totals(pnl)

    candidates = [
        _build_save_transfer(monthly),
        _build_spending_cap(spending, budget),
        _build_bill_review(subscriptions),
        _build_debt_extra_payment(pnl),
        _build_subscription_cleanup(subscriptions),
    ]
    out = [c for c in candidates if c is not None]

    # Never return empty if transactions indicate there is actionable data.
    if not out and not spending.empty:
        top = spending.groupby("category", sort=False)["amount"].sum().abs().sort_values(ascending=False)
        category = str(top.index[0])
        amount = float(top.iloc[0])
        fallback = round(min(160.0, max(20.0, amount * 0.07)), 2)
        out.append(
            ActionCandidate(
                action_id=_action_id("spending_cap", f"fallback-{category.lower()}"),
                action_type="spending_cap",
                title=f"Set a spending checkpoint for {category}",
                rationale=(
                    f"{category} is your largest spending bucket. A simple checkpoint can curb "
                    "unplanned spend before month-end."
                ),
                impact_estimate=f"Likely impact: about {_fmt_money(fallback)} in monthly savings.",
                impact_monthly=round(fallback, 2),
                impact_score=_clamp(fallback / 180),
                urgency_score=0.55,
                confidence_score=0.5,
                effort_score=0.3,
            )
        )

    return out


def _recent_count(history: list[dict], action_type: str, as_of: date) -> int:
    cutoff = as_of - timedelta(days=DIVERSITY_WINDOW_DAYS)
    count = 0
    for event in history:
        try:
            happened = datetime.fromisoformat(event["at"]).date()
        except (KeyError, TypeError, ValueError):
            continue
        if happened >= cutoff and event.get("action_type") == action_type:
            count += 1
    return count


def _on_cooldown(candidate: ActionCandidate, state: dict, as_of: date) -> bool:
    current = state.get("states", {}).get(candidate["action_id"], {})
    for key in ("cooldown_until", "snooze_until"):
        raw = current.get(key)
        if not raw:
            continue
        try:
            until = datetime.fromisoformat(raw).date()
        except ValueError:
            continue
        if until >= as_of:
            return True

    if current.get("status") == "completed":
        updated_at = current.get("updated_at")
        if updated_at:
            try:
                completed_day = datetime.fromisoformat(updated_at).date()
            except ValueError:
                completed_day = date.min
            if completed_day == as_of:
                return True

    return False


def rank_action_candidates(
    candidates: list[ActionCandidate],
    personalization_state: dict | None = None,
    *,
    as_of: date | None = None,
) -> list[ActionCandidate]:
    """Rank candidates with weighted metrics, diversity penalties, and cooldown filters."""
    state = _ensure_state(personalization_state)
    today = as_of or _today()
    weights = state["metric_weights"]
    history = state["history"]
    type_bias = state.get("type_bias", {})

    ranked: list[ActionCandidate] = []
    for candidate in candidates:
        if _on_cooldown(candidate, state, today):
            continue

        diversity_penalty = _recent_count(history, candidate["action_type"], today) * 0.08
        weighted = (
            (candidate["impact_score"] * weights["impact"])
            + (candidate["urgency_score"] * weights["urgency"])
            + (candidate["confidence_score"] * weights["confidence"])
            + ((1 - candidate["effort_score"]) * weights["effort"])
        )
        score = round(
            weighted
            + float(type_bias.get(candidate["action_type"], 0.0))
            - diversity_penalty,
            6,
        )

        enriched = ActionCandidate(candidate)
        enriched["score"] = score
        enriched["state"] = "suggested"
        ranked.append(enriched)

    ranked.sort(key=lambda c: c["score"], reverse=True)
    return ranked


def pick_daily_actions(
    ledger: pd.DataFrame,
    budget: dict[str, float],
    subscriptions: list[dict],
    personalization_state: dict | None = None,
    *,
    max_actions: int = MAX_DAILY_ACTIONS,
    as_of: date | None = None,
) -> tuple[list[ActionCandidate], list[ActionCandidate], dict]:
    """Generate and rank daily actions. Returns selected, all-ranked, and merged state."""
    state = _ensure_state(personalization_state)
    candidates = generate_action_candidates(ledger, budget, subscriptions)
    ranked = rank_action_candidates(candidates, state, as_of=as_of)

    selected: list[ActionCandidate] = []
    type_counts: dict[str, int] = {}
    for candidate in ranked:
        count = type_counts.get(candidate["action_type"], 0)
        # Prefer diverse cards in the top feed (max one per type when alternatives exist).
        if count >= 1 and len(ranked) > max_actions:
            continue
        selected.append(candidate)
        type_counts[candidate["action_type"]] = count + 1
        if len(selected) >= max_actions:
            break

    if not selected and ranked:
        selected = ranked[:max_actions]

    catalog = {
        c["action_id"]: {
            "action_type": c["action_type"],
            "impact_score": c["impact_score"],
            "urgency_score": c["urgency_score"],
            "confidence_score": c["confidence_score"],
            "effort_score": c["effort_score"],
            "title": c["title"],
        }
        for c in ranked
    }
    state["catalog"] = catalog

    return selected, ranked, state


def _renormalize_weights(weights: dict[str, float]) -> dict[str, float]:
    bounded = {k: max(0.05, min(0.65, float(v))) for k, v in weights.items()}
    total = sum(bounded.values()) or 1.0
    return {k: round(v / total, 6) for k, v in bounded.items()}


def apply_action_feedback(
    state: dict | None,
    *,
    action_id: str,
    outcome: ActionOutcome,
    snooze_days: int | None = None,
    as_of: datetime | None = None,
) -> tuple[dict, dict | None]:
    """Persist user feedback and adjust personalization weights."""
    merged = _ensure_state(state)
    now = as_of or datetime.now(UTC)
    today = now.date()

    action_meta = merged.get("catalog", {}).get(action_id)
    if action_meta is None:
        return merged, None

    status_entry = merged["states"].setdefault(action_id, {})
    status_entry["status"] = outcome
    status_entry["updated_at"] = now.isoformat()
    status_entry["action_type"] = action_meta["action_type"]
    status_entry.pop("cooldown_until", None)
    status_entry.pop("snooze_until", None)

    if outcome == "dismissed":
        status_entry["cooldown_until"] = (
            today + timedelta(days=DEFAULT_DISMISS_COOLDOWN_DAYS)
        ).isoformat()
    elif outcome == "snoozed":
        days = max(1, min(14, snooze_days or DEFAULT_SNOOZE_DAYS))
        status_entry["snooze_until"] = (today + timedelta(days=days)).isoformat()

    weights = dict(merged["metric_weights"])
    direction = 0.0
    if outcome == "completed":
        direction = 1.0
    elif outcome == "dismissed":
        direction = -1.0
    elif outcome == "snoozed":
        direction = -0.35

    for metric in ("impact", "urgency", "confidence", "effort"):
        metric_key = f"{metric}_score"
        value = float(action_meta.get(metric_key, 0.5))
        if metric == "effort":
            value = 1 - value
        delta = PERSONALIZATION_STEP * direction * (value - 0.5)
        weights[metric] = float(weights.get(metric, DEFAULT_METRIC_WEIGHTS[metric])) + delta
    merged["metric_weights"] = _renormalize_weights(weights)

    bias = dict(merged.get("type_bias", {}))
    adjustment = 0.0
    if outcome == "completed":
        adjustment = 0.03
    elif outcome == "dismissed":
        adjustment = -0.04
    elif outcome == "snoozed":
        adjustment = -0.015
    kind = action_meta["action_type"]
    bias[kind] = round(max(-0.2, min(0.2, float(bias.get(kind, 0.0)) + adjustment)), 4)
    merged["type_bias"] = bias

    merged["history"].append(
        {
            "action_id": action_id,
            "action_type": action_meta["action_type"],
            "outcome": outcome,
            "at": now.isoformat(),
        }
    )
    merged["history"] = merged["history"][-200:]

    return merged, status_entry

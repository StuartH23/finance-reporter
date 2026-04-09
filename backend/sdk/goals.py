"""Goal progress tracking and deterministic paycheck allocation engine."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from math import ceil
import re


DEBT_KEYWORDS = (
    "debt",
    "loan",
    "card",
    "credit",
    "student",
    "mortgage",
)


@dataclass(frozen=True)
class AllocationGoal:
    """A goal shape used by the allocation engine."""

    goal_id: str
    name: str
    category: str
    priority: int
    remaining_amount: float
    target_date: str | None


@dataclass(frozen=True)
class AllocationInput:
    """Normalized allocation input for deterministic processing."""

    paycheck_amount: float
    fixed_obligations_total: float
    safety_buffer: float
    minimum_emergency_buffer: float
    mode: str
    paychecks_per_month: int


def _to_cents(value: float) -> int:
    return max(0, int(round(value * 100)))


def _from_cents(value: int) -> float:
    return round(value / 100, 2)


def _days_until(target_date: str | None, *, today: date) -> int | None:
    if not target_date:
        return None
    try:
        target = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        return None
    return (target - today).days


def _urgency_weight(days_until: int | None) -> float:
    if days_until is None:
        return 1.0
    if days_until <= 0:
        return 2.5
    if days_until <= 90:
        return 2.0
    if days_until <= 180:
        return 1.5
    return 1.0


def _priority_weight(priority: int) -> float:
    normalized = max(1, min(priority, 5))
    return float(6 - normalized)


def _allocate_weighted_with_caps(total_cents: int, capacities: list[int], weights: list[float]) -> list[int]:
    """Allocate cents by weights while respecting per-goal caps, deterministically."""
    if total_cents <= 0 or not capacities:
        return [0 for _ in capacities]

    alloc = [0 for _ in capacities]
    remaining = total_cents

    while remaining > 0:
        active = [idx for idx, cap in enumerate(capacities) if cap > alloc[idx]]
        if not active:
            break

        weight_sum = sum(max(0.0, weights[idx]) for idx in active)
        if weight_sum <= 0:
            raw = {idx: remaining / len(active) for idx in active}
        else:
            raw = {idx: (remaining * max(0.0, weights[idx])) / weight_sum for idx in active}

        progressed = 0
        fractions: list[tuple[float, int]] = []
        for idx in active:
            base = int(raw[idx])
            cap_left = capacities[idx] - alloc[idx]
            step = min(base, cap_left)
            if step > 0:
                alloc[idx] += step
                remaining -= step
                progressed += step
            fractions.append((raw[idx] - base, idx))

        if remaining <= 0:
            break

        fractions.sort(key=lambda item: (-item[0], item[1]))
        for _, idx in fractions:
            if remaining <= 0:
                break
            if capacities[idx] <= alloc[idx]:
                continue
            alloc[idx] += 1
            remaining -= 1
            progressed += 1

        if progressed == 0:
            break

    return alloc


def compute_goal_progress(
    ledger,
    *,
    goal_name: str,
    goal_category: str,
    target_amount: float,
) -> dict:
    """Compute cumulative and monthly contribution progress for a goal."""
    if ledger.empty:
        return {
            "contributed_amount": 0.0,
            "remaining_amount": round(max(0.0, target_amount), 2),
            "progress_pct": 0.0,
            "contribution_history": [],
        }

    tokens = {
        t
        for t in re.findall(r"[a-z0-9]+", f"{goal_name} {goal_category}".lower())
        if len(t) >= 3
    }
    category_hint = goal_category.lower()
    debt_goal = "debt" in category_hint

    rows = ledger.copy()
    rows["description_lc"] = rows["description"].astype(str).str.lower()
    rows["category_lc"] = rows["category"].astype(str).str.lower()

    def is_match(row) -> bool:
        desc = row["description_lc"]
        cat = row["category_lc"]
        token_match = any(token in desc or token in cat for token in tokens)
        if debt_goal:
            debt_match = any(keyword in desc or keyword in cat for keyword in DEBT_KEYWORDS)
            return token_match or debt_match
        return token_match

    matched = rows[(rows["amount"] < 0) & rows.apply(is_match, axis=1)].copy()
    if matched.empty:
        return {
            "contributed_amount": 0.0,
            "remaining_amount": round(max(0.0, target_amount), 2),
            "progress_pct": 0.0,
            "contribution_history": [],
        }

    matched["contribution"] = -matched["amount"]
    matched["month"] = matched["date"].dt.strftime("%Y-%m")
    by_month = (
        matched.groupby("month", sort=True)["contribution"].sum().reset_index().to_dict(orient="records")
    )

    contributed = float(matched["contribution"].sum())
    remaining = max(0.0, target_amount - contributed)
    progress_pct = 100.0 if target_amount <= 0 else min(100.0, (contributed / target_amount) * 100)

    return {
        "contributed_amount": round(contributed, 2),
        "remaining_amount": round(remaining, 2),
        "progress_pct": round(progress_pct, 1),
        "contribution_history": [
            {"month": row["month"], "amount": round(float(row["contribution"]), 2)} for row in by_month
        ],
    }


def _required_per_paycheck(
    remaining_amount: float,
    target_date: str | None,
    paychecks_per_month: int,
    *,
    today: date,
) -> float | None:
    if remaining_amount <= 0:
        return 0.0
    if not target_date:
        return None

    try:
        target = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        return None

    days_remaining = (target - today).days
    if days_remaining <= 0:
        return round(remaining_amount, 2)

    paychecks = max(1, ceil((days_remaining / 30.0) * max(1, paychecks_per_month)))
    return round(remaining_amount / paychecks, 2)


def build_paycheck_plan(
    payload: AllocationInput,
    goals: list[AllocationGoal],
    *,
    today: date | None = None,
) -> dict:
    """Build a deterministic paycheck recommendation with guardrails and explanations."""
    today = today or date.today()

    paycheck_cents = _to_cents(payload.paycheck_amount)
    needs_cents = _to_cents(payload.fixed_obligations_total)
    safety_cents = _to_cents(payload.safety_buffer)
    min_emergency_cents = _to_cents(payload.minimum_emergency_buffer)

    warnings: list[str] = []
    explanation: list[str] = []

    if needs_cents > paycheck_cents:
        shortfall = needs_cents - paycheck_cents
        warnings.append(
            f"Fixed obligations exceed this paycheck by ${_from_cents(shortfall):,.2f}."
        )
        explanation.append("All available funds were assigned to required obligations.")
        return {
            "paycheck_amount": _from_cents(paycheck_cents),
            "allocation_mode": payload.mode,
            "needs": _from_cents(paycheck_cents),
            "goals": 0.0,
            "discretionary": 0.0,
            "safety_buffer_reserved": 0.0,
            "goal_allocations": [],
            "warnings": warnings,
            "explanations": explanation,
        }

    remaining_after_needs = paycheck_cents - needs_cents
    reserve = min(safety_cents, remaining_after_needs)
    if reserve < safety_cents:
        warnings.append("Paycheck cannot fully fund the requested safety buffer after fixed obligations.")

    distributable = remaining_after_needs - reserve
    goals_share = 0.8 if payload.mode == "aggressive_savings" else 0.55
    goals_cents = int(round(distributable * goals_share))
    discretionary_cents = distributable - goals_cents

    active_goals = [goal for goal in goals if goal.remaining_amount > 0]
    emergency_goals = [goal for goal in active_goals if "emergency" in goal.category.lower()]
    if min_emergency_cents > 0 and not emergency_goals:
        warnings.append(
            "Minimum emergency contribution is enabled, but no active emergency goal is selected."
        )
    if emergency_goals and min_emergency_cents > 0:
        emergency_remaining = _to_cents(sum(goal.remaining_amount for goal in emergency_goals))
        emergency_min = min(min_emergency_cents, emergency_remaining)
        if goals_cents < emergency_min:
            delta = emergency_min - goals_cents
            shift = min(delta, discretionary_cents)
            goals_cents += shift
            discretionary_cents -= shift
            if shift < delta:
                warnings.append(
                    "Emergency minimum contribution could not be fully met after obligations and safety buffer."
                )

    capacities = [_to_cents(goal.remaining_amount) for goal in active_goals]
    weights = []
    for goal in active_goals:
        days = _days_until(goal.target_date, today=today)
        weights.append(_priority_weight(goal.priority) * _urgency_weight(days))

    allocations_cents = [0 for _ in active_goals]
    emergency_indices = [
        idx for idx, goal in enumerate(active_goals) if "emergency" in goal.category.lower()
    ]

    # Enforce an emergency-goal floor first, then allocate remaining funds normally.
    emergency_floor_cents = 0
    if emergency_indices and min_emergency_cents > 0 and goals_cents > 0:
        emergency_capacity = sum(capacities[idx] for idx in emergency_indices)
        emergency_floor_cents = min(min_emergency_cents, goals_cents, emergency_capacity)
        if emergency_floor_cents > 0:
            emergency_allocations = _allocate_weighted_with_caps(
                emergency_floor_cents,
                [capacities[idx] for idx in emergency_indices],
                [weights[idx] for idx in emergency_indices],
            )
            for offset, idx in enumerate(emergency_indices):
                allocations_cents[idx] = emergency_allocations[offset]

    remaining_goal_cents = goals_cents - sum(allocations_cents)
    if remaining_goal_cents > 0:
        capacities_left = [
            max(0, capacity - allocations_cents[idx]) for idx, capacity in enumerate(capacities)
        ]
        extra_allocations = _allocate_weighted_with_caps(remaining_goal_cents, capacities_left, weights)
        allocations_cents = [
            base + extra for base, extra in zip(allocations_cents, extra_allocations, strict=False)
        ]

    allocated_total = sum(allocations_cents)
    if allocated_total < goals_cents:
        discretionary_cents += goals_cents - allocated_total
        goals_cents = allocated_total

    goal_rows = []
    infeasible: list[str] = []

    for goal, amount_cents in zip(active_goals, allocations_cents, strict=False):
        required = _required_per_paycheck(
            goal.remaining_amount,
            goal.target_date,
            payload.paychecks_per_month,
            today=today,
        )
        amount = _from_cents(amount_cents)
        feasible = None
        if required is not None:
            feasible = amount + 0.01 >= required
            if not feasible:
                infeasible.append(
                    f"{goal.name} needs about ${required:,.2f}/paycheck to hit {goal.target_date}."
                )

        goal_rows.append(
            {
                "goal_id": goal.goal_id,
                "name": goal.name,
                "category": goal.category,
                "priority": goal.priority,
                "target_date": goal.target_date,
                "recommended_amount": amount,
                "remaining_after_allocation": round(max(0.0, goal.remaining_amount - amount), 2),
                "required_per_paycheck": required,
                "feasible": feasible,
            }
        )

    if payload.mode == "aggressive_savings":
        explanation.append("Aggressive savings mode increases the post-buffer share sent to goals.")
    else:
        explanation.append("Balanced mode keeps a larger discretionary slice after obligations and buffer.")
    explanation.append("Fixed obligations are funded first, then safety buffer, then goals/discretionary.")

    warnings.extend(infeasible)

    return {
        "paycheck_amount": _from_cents(paycheck_cents),
        "allocation_mode": payload.mode,
        "needs": _from_cents(needs_cents),
        "goals": _from_cents(goals_cents),
        "discretionary": _from_cents(discretionary_cents),
        "safety_buffer_reserved": _from_cents(reserve),
        "goal_allocations": goal_rows,
        "warnings": warnings,
        "explanations": explanation,
    }


def what_changed_lines(recommended: dict, saved_plan: dict | None) -> list[str]:
    """Create short transparency lines comparing recommendation vs saved custom split."""
    if not saved_plan:
        return ["No saved custom split found, so this plan is based only on current inputs and goals."]

    lines: list[str] = []
    for bucket in ("needs", "goals", "discretionary"):
        delta = round(float(recommended.get(bucket, 0.0)) - float(saved_plan.get(bucket, 0.0)), 2)
        if abs(delta) < 0.01:
            continue
        direction = "increased" if delta > 0 else "decreased"
        lines.append(f"{bucket.title()} {direction} by ${abs(delta):,.2f} versus your saved custom split.")

    if not lines:
        lines.append("No material change from your saved custom split.")

    return lines

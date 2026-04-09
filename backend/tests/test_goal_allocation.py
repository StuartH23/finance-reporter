"""Unit tests for the deterministic paycheck allocation engine."""

from datetime import date

from sdk.goals import AllocationGoal, AllocationInput, build_paycheck_plan


def test_allocation_is_deterministic_for_same_inputs():
    payload = AllocationInput(
        paycheck_amount=2000,
        fixed_obligations_total=1200,
        safety_buffer=150,
        minimum_emergency_buffer=100,
        mode="balanced",
        paychecks_per_month=2,
    )
    goals = [
        AllocationGoal(
            goal_id="g1",
            name="Emergency Fund",
            category="emergency",
            priority=1,
            remaining_amount=4000,
            target_date="2026-12-31",
        ),
        AllocationGoal(
            goal_id="g2",
            name="Vacation",
            category="vacation",
            priority=3,
            remaining_amount=1500,
            target_date="2026-09-30",
        ),
    ]

    first = build_paycheck_plan(payload, goals, today=date(2026, 3, 22))
    second = build_paycheck_plan(payload, goals, today=date(2026, 3, 22))

    assert first == second


def test_never_allocates_below_fixed_obligations():
    payload = AllocationInput(
        paycheck_amount=1000,
        fixed_obligations_total=1400,
        safety_buffer=100,
        minimum_emergency_buffer=50,
        mode="balanced",
        paychecks_per_month=2,
    )

    result = build_paycheck_plan(payload, [], today=date(2026, 3, 22))

    assert result["needs"] == 1000.0
    assert result["goals"] == 0.0
    assert result["discretionary"] == 0.0
    assert any("Fixed obligations exceed" in warning for warning in result["warnings"])


def test_aggressive_mode_allocates_more_to_goals_than_balanced():
    common = dict(
        paycheck_amount=2200,
        fixed_obligations_total=1200,
        safety_buffer=100,
        minimum_emergency_buffer=0,
        paychecks_per_month=2,
    )
    goals = [
        AllocationGoal(
            goal_id="g1",
            name="Emergency Fund",
            category="emergency",
            priority=1,
            remaining_amount=5000,
            target_date=None,
        )
    ]

    balanced = build_paycheck_plan(
        AllocationInput(**common, mode="balanced"),
        goals,
        today=date(2026, 3, 22),
    )
    aggressive = build_paycheck_plan(
        AllocationInput(**common, mode="aggressive_savings"),
        goals,
        today=date(2026, 3, 22),
    )

    assert aggressive["goals"] > balanced["goals"]
    assert aggressive["discretionary"] < balanced["discretionary"]


def test_respects_minimum_emergency_buffer_rule():
    payload = AllocationInput(
        paycheck_amount=1800,
        fixed_obligations_total=1200,
        safety_buffer=200,
        minimum_emergency_buffer=300,
        mode="balanced",
        paychecks_per_month=2,
    )
    goals = [
        AllocationGoal(
            goal_id="g1",
            name="Emergency Fund",
            category="emergency",
            priority=2,
            remaining_amount=2000,
            target_date="2026-10-01",
        ),
        AllocationGoal(
            goal_id="g2",
            name="Trip",
            category="vacation",
            priority=4,
            remaining_amount=800,
            target_date=None,
        ),
    ]

    result = build_paycheck_plan(payload, goals, today=date(2026, 3, 22))
    emergency = next(row for row in result["goal_allocations"] if row["goal_id"] == "g1")

    assert emergency["recommended_amount"] >= 300.0

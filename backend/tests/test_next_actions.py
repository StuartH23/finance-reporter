"""Unit tests for next-best-action ranking and cooldown behavior."""

from datetime import UTC, date, datetime, timedelta

from sdk.next_actions import (
    ActionCandidate,
    apply_action_feedback,
    default_personalization_state,
    rank_action_candidates,
)


def _candidate(
    action_id: str,
    action_type: str,
    *,
    impact: float,
    urgency: float,
    confidence: float,
    effort: float,
) -> ActionCandidate:
    return ActionCandidate(
        action_id=action_id,
        action_type=action_type,
        title=f"{action_type} title",
        rationale="rationale",
        impact_estimate="impact",
        impact_monthly=50.0,
        impact_score=impact,
        urgency_score=urgency,
        confidence_score=confidence,
        effort_score=effort,
    )


def test_ranking_prefers_higher_weighted_signal():
    state = default_personalization_state()
    candidates = [
        _candidate(
            "a1",
            "save_transfer",
            impact=0.9,
            urgency=0.7,
            confidence=0.8,
            effort=0.2,
        ),
        _candidate(
            "a2",
            "spending_cap",
            impact=0.3,
            urgency=0.4,
            confidence=0.4,
            effort=0.6,
        ),
    ]

    ranked = rank_action_candidates(candidates, state, as_of=date(2026, 3, 22))
    assert [r["action_id"] for r in ranked] == ["a1", "a2"]


def test_diversity_penalty_demotes_repeated_type():
    state = default_personalization_state()
    now = datetime(2026, 3, 22, 15, tzinfo=UTC)
    state["history"] = [
        {
            "action_id": "x1",
            "action_type": "spending_cap",
            "outcome": "dismissed",
            "at": now.isoformat(),
        },
        {
            "action_id": "x2",
            "action_type": "spending_cap",
            "outcome": "completed",
            "at": (now - timedelta(days=1)).isoformat(),
        },
    ]

    candidates = [
        _candidate(
            "repeat",
            "spending_cap",
            impact=0.75,
            urgency=0.78,
            confidence=0.8,
            effort=0.3,
        ),
        _candidate(
            "fresh",
            "bill_review",
            impact=0.72,
            urgency=0.74,
            confidence=0.81,
            effort=0.3,
        ),
    ]

    ranked = rank_action_candidates(candidates, state, as_of=date(2026, 3, 22))
    assert ranked[0]["action_id"] == "fresh"


def test_dismiss_feedback_adds_cooldown_and_filters_candidate():
    state = default_personalization_state()
    state["catalog"] = {
        "abc": {
            "action_type": "subscription_cleanup",
            "impact_score": 0.7,
            "urgency_score": 0.6,
            "confidence_score": 0.65,
            "effort_score": 0.2,
            "title": "Clean up",
        }
    }

    updated, status = apply_action_feedback(
        state,
        action_id="abc",
        outcome="dismissed",
        as_of=datetime(2026, 3, 22, 10, tzinfo=UTC),
    )
    assert status is not None
    assert status["status"] == "dismissed"
    assert status["cooldown_until"] == "2026-03-25"

    ranked = rank_action_candidates(
        [
            _candidate(
                "abc",
                "subscription_cleanup",
                impact=0.8,
                urgency=0.7,
                confidence=0.7,
                effort=0.2,
            )
        ],
        updated,
        as_of=date(2026, 3, 23),
    )
    assert ranked == []

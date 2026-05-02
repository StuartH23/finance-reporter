"""Personalized next-best-action feed endpoints."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, HTTPException, Request

from routers.upload import get_action_state, get_session_ledger, get_subscription_preferences
from schemas import (
    NextBestActionFeedbackRequest,
    NextBestActionFeedbackResponse,
    NextBestActionFeedResponse,
)
from sdk import (
    apply_action_feedback,
    build_subscription_payload,
    default_personalization_state,
    load_budget,
    pick_daily_actions,
)

router = APIRouter(tags=["actions"])


@router.get("/actions/feed", response_model=NextBestActionFeedResponse)
def get_next_best_actions(request: Request, session_id: str | None = Cookie(default=None)):
    ledger = get_session_ledger(session_id, request)
    actionable_data_exists = not ledger.empty
    if ledger.empty:
        return {
            "feed_date": datetime.now(UTC).date().isoformat(),
            "count": 0,
            "actionable_data_exists": False,
            "actions": [],
        }

    budget = load_budget()
    preferences = get_subscription_preferences(session_id, request)
    subscriptions = build_subscription_payload(ledger, preferences)

    state = get_action_state(session_id, request)
    if not state:
        state.update(default_personalization_state())

    selected, _, merged_state = pick_daily_actions(
        ledger,
        budget,
        subscriptions,
        personalization_state=state,
    )
    if session_id:
        state.clear()
        state.update(merged_state)

    actions = [
        {
            "action_id": a["action_id"],
            "action_type": a["action_type"],
            "title": a["title"],
            "rationale": a["rationale"],
            "impact_estimate": a["impact_estimate"],
            "impact_monthly": a["impact_monthly"],
            "score": a["score"],
            "state": a["state"],
        }
        for a in selected
    ]

    return {
        "feed_date": datetime.now(UTC).date().isoformat(),
        "count": len(actions),
        "actionable_data_exists": actionable_data_exists,
        "actions": actions,
    }


@router.post("/actions/{action_id}/feedback", response_model=NextBestActionFeedbackResponse)
def submit_action_feedback(
    request: Request,
    action_id: str,
    payload: NextBestActionFeedbackRequest,
    session_id: str | None = Cookie(default=None),
):
    state = get_action_state(session_id, request)
    if not state:
        raise HTTPException(status_code=400, detail="No active action feed for this session")

    merged, status_entry = apply_action_feedback(
        state,
        action_id=action_id,
        outcome=payload.outcome,
        snooze_days=payload.snooze_days,
    )
    if status_entry is None:
        raise HTTPException(status_code=404, detail="Action not found in current feed context")

    state.clear()
    state.update(merged)

    return {
        "status": "ok",
        "action_id": action_id,
        "outcome": payload.outcome,
        "cooldown_until": status_entry.get("cooldown_until"),
        "snooze_until": status_entry.get("snooze_until"),
    }

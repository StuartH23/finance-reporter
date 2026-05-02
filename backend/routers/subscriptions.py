"""Subscription center and recurring-charge alerts."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, Query, Request

from routers.upload import (
    get_session_ledger,
    get_subscription_preferences,
    set_subscription_preference,
)
from schemas import (
    ReminderResponse,
    SubscriptionAlertsResponse,
    SubscriptionListResponse,
    SubscriptionPreferenceResponse,
    SubscriptionPreferenceUpdate,
)
from sdk import build_alerts, build_subscription_payload

router = APIRouter(tags=["subscriptions"])


def _get_subscriptions(
    session_id: str | None,
    threshold: float,
    request: Request,
) -> list[dict]:
    ledger = get_session_ledger(session_id, request)
    preferences = get_subscription_preferences(session_id, request)
    return build_subscription_payload(
        ledger,
        preferences,
        price_increase_threshold=threshold,
    )


@router.get("/subscriptions", response_model=SubscriptionListResponse)
def list_subscriptions(
    request: Request,
    session_id: str | None = Cookie(default=None),
    status: str = Query(default="all", pattern="^(all|active|ignored)$"),
    filter_increased: bool = Query(default=False),
    filter_optional: bool = Query(default=False),
    threshold: float = Query(default=0.10, ge=0, le=1),
):
    subscriptions = _get_subscriptions(session_id, threshold, request)

    if status == "active":
        subscriptions = [s for s in subscriptions if s["active"] and not s["ignored"]]
    elif status == "ignored":
        subscriptions = [s for s in subscriptions if s["ignored"]]
    else:
        subscriptions = [s for s in subscriptions if not s["ignored"]]

    if filter_increased:
        subscriptions = [s for s in subscriptions if s["price_increase"]]
    if filter_optional:
        subscriptions = [s for s in subscriptions if not s["essential"]]

    return {"subscriptions": subscriptions, "count": len(subscriptions)}


@router.get("/subscriptions/alerts", response_model=SubscriptionAlertsResponse)
def get_subscription_alerts(
    request: Request,
    session_id: str | None = Cookie(default=None),
    threshold: float = Query(default=0.10, ge=0, le=1),
    include_missed: bool = Query(default=True),
):
    subscriptions = _get_subscriptions(session_id, threshold, request)
    alerts = build_alerts(subscriptions, include_missed=include_missed)
    return {"alerts": alerts, "count": len(alerts)}


@router.post("/subscriptions/{stream_id}/preferences", response_model=SubscriptionPreferenceResponse)
def update_subscription_preferences(
    request: Request,
    stream_id: str,
    update: SubscriptionPreferenceUpdate,
    session_id: str | None = Cookie(default=None),
):
    subscriptions = _get_subscriptions(session_id, threshold=0.10, request=request)
    stream_ids = {s["stream_id"] for s in subscriptions}
    if stream_id not in stream_ids:
        raise HTTPException(status_code=404, detail="Subscription stream not found")
    if update.essential is None and update.ignored is None:
        raise HTTPException(status_code=400, detail="No preference fields were provided")

    set_subscription_preference(
        session_id,
        stream_id,
        request,
        essential=update.essential,
        ignored=update.ignored,
    )
    prefs = get_subscription_preferences(session_id, request).get(stream_id, {})
    return {
        "status": "ok",
        "stream_id": stream_id,
        "essential": bool(prefs.get("essential", False)),
        "ignored": bool(prefs.get("ignored", False)),
    }


@router.post("/subscriptions/{stream_id}/remind-cancel", response_model=ReminderResponse)
def remind_cancel(
    request: Request,
    stream_id: str,
    session_id: str | None = Cookie(default=None),
):
    subscriptions = _get_subscriptions(session_id, threshold=0.10, request=request)
    selected = next((s for s in subscriptions if s["stream_id"] == stream_id), None)
    if selected is None:
        raise HTTPException(status_code=404, detail="Subscription stream not found")
    return {
        "status": "ok",
        "stream_id": stream_id,
        "message": f"Reminder: review and cancel {selected['merchant']} if no longer needed.",
    }

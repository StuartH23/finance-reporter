"""Subscription center and recurring-charge alerts."""

from __future__ import annotations

import json
import logging
import os

import anthropic
from fastapi import APIRouter, Cookie, HTTPException, Query, Request

from routers.upload import (
    get_session_ledger,
    get_subscription_preferences,
    set_subscription_preference,
)
from schemas import (
    CancelInfoResponse,
    SubscriptionAlertsResponse,
    SubscriptionListResponse,
    SubscriptionPreferenceResponse,
    SubscriptionPreferenceUpdate,
    SubscriptionReviewResponse,
)
from sdk import (
    build_alerts,
    build_subscription_payload,
    build_subscription_summary,
    lookup_cancel_info,
)

logger = logging.getLogger(__name__)

REVIEW_MODEL_ID = "claude-haiku-4-5"
REVIEW_MAX_TOKENS = 400
REVIEW_VERDICTS = {"likely_authorized", "review_needed", "price_concern"}
_REVIEW_FALLBACK_REASON = (
    "Couldn't parse the model verdict; flagging this charge for manual review."
)
_review_cache: dict[str, dict] = {}

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
    view: str = Query(default="all", pattern="^(all|upcoming)$"),
    status_group: str | None = Query(default=None, pattern="^(active|inactive)$"),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    sort: str = Query(default="priority", pattern="^(priority|due_asc|due_desc|amount_desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=250),
):
    ledger = get_session_ledger(session_id, request)
    preferences = get_subscription_preferences(session_id, request)
    subscriptions = build_subscription_payload(
        ledger,
        preferences,
        price_increase_threshold=threshold,
    )
    summary = build_subscription_summary(subscriptions, ledger)

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

    if view == "upcoming":
        subscriptions = [
            s for s in subscriptions if s.get("status_group") == "active" and s.get("next_due_date")
        ]
    if status_group:
        subscriptions = [s for s in subscriptions if s.get("status_group") == status_group]
    if month:
        subscriptions = [
            s for s in subscriptions if str(s.get("next_due_date") or "").startswith(month)
        ]

    if sort == "priority":
        payment_priority = {"upcoming": 0, "paid_variance": 1, "paid_ok": 2, "inactive": 3}
        subscriptions.sort(
            key=lambda s: (
                1 if s.get("status_group") == "inactive" else 0,
                payment_priority.get(str(s.get("payment_state")), 9),
                s.get("next_due_date") is None,
                s.get("next_due_date") or "",
                -float(s.get("amount", 0.0)),
            )
        )
    elif sort == "due_asc":
        subscriptions.sort(
            key=lambda s: (s.get("next_due_date") is None, s.get("next_due_date") or "")
        )
    elif sort == "due_desc":
        subscriptions.sort(
            key=lambda s: (s.get("next_due_date") is None, s.get("next_due_date") or ""),
            reverse=True,
        )
    elif sort == "amount_desc":
        subscriptions.sort(key=lambda s: float(s.get("amount", 0.0)), reverse=True)

    total_count = len(subscriptions)
    start = (page - 1) * page_size
    end = start + page_size
    subscriptions = subscriptions[start:end]

    return {"subscriptions": subscriptions, "count": total_count, "summary": summary}


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


@router.post(
    "/subscriptions/{stream_id}/preferences", response_model=SubscriptionPreferenceResponse
)
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


def _review_cache_key(session_id: str | None, sub: dict) -> str:
    return "|".join(
        [
            session_id or "",
            str(sub["stream_id"]),
            str(sub["last_charge_date"]),
            f"{float(sub['amount']):.2f}",
            f"{float(sub['baseline_amount']):.2f}",
            str(sub["charge_count"]),
            "1" if sub["price_increase"] else "0",
            "1" if sub["is_new_recurring"] else "0",
        ]
    )


def _build_review_prompt(sub: dict) -> str:
    history_lines = "\n".join(
        f"- {c['date']}, ${float(c['amount']):.2f}"
        for c in sub.get("charge_history", [])[-6:]
    ) or "(none)"
    return (
        "You review a single recurring charge from a personal-finance app and decide "
        "whether it looks legitimate, deserves user review, or shows a price-concern signal.\n\n"
        f"Merchant: {sub['merchant']}\n"
        f"Cadence: {sub['cadence']}\n"
        f"Current amount: ${float(sub['amount']):.2f}\n"
        f"Baseline amount: ${float(sub['baseline_amount']):.2f} (median of prior charges)\n"
        f"Charge count: {sub['charge_count']}\n"
        f"Recent charges:\n{history_lines}\n\n"
        f"Flags:\n"
        f"- new_recurring: {sub['is_new_recurring']}\n"
        f"- price_increase: {sub['price_increase']}\n\n"
        "Respond with strict JSON only, no prose, exactly this shape:\n"
        '{"verdict": "likely_authorized" | "review_needed" | "price_concern", '
        '"reason": "<1-2 sentences>", "evidence": ["<short>", "<short>"]}\n\n'
        "Rules:\n"
        '- "price_concern" if there is a clear price increase from baseline.\n'
        '- "review_needed" if the charge is new (3 or fewer occurrences) and may be unfamiliar.\n'
        '- "likely_authorized" if the charge has been stable for several months at the same amount.\n'
        "- evidence: 1-3 short bullets citing concrete dates/amounts.\n"
        "- Do not include anything outside the JSON object."
    )


def _coerce_review(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {
            "verdict": "review_needed",
            "reason": _REVIEW_FALLBACK_REASON,
            "evidence": [],
        }
    verdict = str(payload.get("verdict", "")).strip()
    if verdict not in REVIEW_VERDICTS:
        return {
            "verdict": "review_needed",
            "reason": _REVIEW_FALLBACK_REASON,
            "evidence": [],
        }
    reason = str(payload.get("reason", "")).strip() or _REVIEW_FALLBACK_REASON
    raw_evidence = payload.get("evidence", [])
    evidence: list[str] = []
    if isinstance(raw_evidence, list):
        for item in raw_evidence:
            if isinstance(item, str | int | float):
                text = str(item).strip()
                if text:
                    evidence.append(text)
    return {"verdict": verdict, "reason": reason, "evidence": evidence[:3]}


def _call_review_model(prompt: str) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured.")

    client = anthropic.Anthropic(api_key=api_key)
    try:
        result = client.messages.create(
            model=REVIEW_MODEL_ID,
            max_tokens=REVIEW_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.RateLimitError as exc:
        raise HTTPException(status_code=503, detail="Upstream model rate limit.") from exc
    except anthropic.APIStatusError as exc:
        raise HTTPException(
            status_code=502, detail=f"Upstream model error: {exc.message}"
        ) from exc
    except anthropic.APIConnectionError as exc:
        raise HTTPException(status_code=502, detail="Could not reach model API.") from exc

    text = next((b.text for b in result.content if getattr(b, "type", None) == "text"), "")
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
    try:
        parsed = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Subscription review model returned non-JSON: %s", text[:200])
        return {}
    return parsed if isinstance(parsed, dict) else {}


@router.post(
    "/subscriptions/{stream_id}/review",
    response_model=SubscriptionReviewResponse,
)
def review_subscription(
    request: Request,
    stream_id: str,
    session_id: str | None = Cookie(default=None),
):
    subscriptions = _get_subscriptions(session_id, threshold=0.10, request=request)
    selected = next((s for s in subscriptions if s["stream_id"] == stream_id), None)
    if selected is None:
        raise HTTPException(status_code=404, detail="Subscription stream not found")
    if not (selected["is_new_recurring"] or selected["price_increase"]):
        raise HTTPException(
            status_code=409,
            detail="Subscription is not eligible for review.",
        )

    cache_key = _review_cache_key(session_id, selected)
    cached_payload = _review_cache.get(cache_key)
    if cached_payload is not None:
        return {**cached_payload, "stream_id": stream_id, "cached": True}

    prompt = _build_review_prompt(selected)
    raw = _call_review_model(prompt)
    coerced = _coerce_review(raw)
    if coerced["reason"] == _REVIEW_FALLBACK_REASON:
        logger.warning(
            "Subscription review fell back to review_needed for stream %s", stream_id
        )
    _review_cache[cache_key] = coerced
    return {**coerced, "stream_id": stream_id, "cached": False}


@router.get(
    "/subscriptions/{stream_id}/cancel-info",
    response_model=CancelInfoResponse,
)
def get_cancel_info(
    request: Request,
    stream_id: str,
    session_id: str | None = Cookie(default=None),
):
    subscriptions = _get_subscriptions(session_id, threshold=0.10, request=request)
    selected = next((s for s in subscriptions if s["stream_id"] == stream_id), None)
    if selected is None:
        raise HTTPException(status_code=404, detail="Subscription stream not found")

    entry = lookup_cancel_info(selected["merchant"])
    if entry is None:
        return {
            "stream_id": stream_id,
            "merchant": selected["merchant"],
            "found": False,
        }
    return {
        "stream_id": stream_id,
        "merchant": selected["merchant"],
        "found": True,
        "display_name": entry.get("display_name"),
        "cancel_url": entry.get("cancel_url"),
        "support_url": entry.get("support_url"),
        "phone": entry.get("phone"),
        "notes": entry.get("notes"),
    }

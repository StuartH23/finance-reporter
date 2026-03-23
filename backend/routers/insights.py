"""Coach-style insights endpoints."""

from fastapi import APIRouter, Cookie, Query

from routers.upload import get_session_ledger
from schemas import InsightsResponse
from sdk import build_insights

router = APIRouter(tags=["insights"])


@router.get("/insights", response_model=InsightsResponse)
def insights(
    locale: str = Query(default="en-US"),
    currency: str = Query(default="USD"),
    confidence_threshold: float = Query(default=0.58, ge=0.0, le=1.0),
    session_id: str | None = Cookie(default=None),
):
    """Return coach-style insights generated from the current session ledger."""
    ledger = get_session_ledger(session_id)
    return build_insights(
        ledger,
        locale=locale,
        currency=currency,
        confidence_threshold=confidence_threshold,
    )

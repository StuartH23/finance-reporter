"""Cash-flow endpoint for Sankey-style graph data."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Cookie, HTTPException, Query, Request

from routers.upload import get_session_ledger
from schemas import CashFlowResponse
from sdk import TRANSFER_CATEGORIES, build_cashflow_payload, period_key_is_valid

router = APIRouter(tags=["cashflow"])


@router.get("/cashflow", response_model=CashFlowResponse)
def cashflow(
    request: Request,
    session_id: str | None = Cookie(default=None),
    granularity: Literal["month", "quarter"] = Query(default="month"),
    group_by: Literal["category", "merchant"] = Query(default="category"),
    period: str | None = Query(default=None),
):
    """Return period/grouping-aware flow data for Sankey visualizations."""
    if period and not period_key_is_valid(period, granularity):
        expected = "YYYY-MM" if granularity == "month" else "YYYY-Q#"
        raise HTTPException(
            status_code=422,
            detail=f"Invalid period '{period}'. Expected {expected} for granularity={granularity}.",
        )

    ledger = get_session_ledger(session_id, request)
    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()

    return build_cashflow_payload(
        pnl,
        granularity=granularity,
        group_by=group_by,
        period=period,
    )

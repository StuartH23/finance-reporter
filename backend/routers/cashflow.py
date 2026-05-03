"""Cash-flow endpoint for Sankey-style graph data."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Cookie, HTTPException, Query, Request

from routers.upload import get_session_ledger
from schemas import CashFlowResponse
from sdk import (
    TRANSFER_CATEGORIES,
    build_cashflow_payload,
    period_key_is_valid,
    selected_period_key,
)

router = APIRouter(tags=["cashflow"])


@router.get("/cashflow", response_model=CashFlowResponse)
def cashflow(
    request: Request,
    session_id: str | None = Cookie(default=None),
    granularity: Literal["year", "month", "quarter"] = Query(default="month"),
    group_by: Literal["category", "merchant"] = Query(default="category"),
    period: str | None = Query(default=None),
):
    """Return period/grouping-aware flow data for Sankey visualizations."""
    if period and not period_key_is_valid(period, granularity):
        expected = {"year": "YYYY", "month": "YYYY-MM", "quarter": "YYYY-Q#"}[granularity]
        raise HTTPException(
            status_code=422,
            detail=f"Invalid period '{period}'. Expected {expected} for granularity={granularity}.",
        )

    ledger = get_session_ledger(session_id, request)
    transfer_rows = ledger[ledger["category"].isin(TRANSFER_CATEGORIES)].copy()
    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()
    pnl = pnl[pnl["amount"] != 0].copy()

    payload = build_cashflow_payload(
        pnl,
        granularity=granularity,
        group_by=group_by,
        period=period,
    )
    selected_period = payload["period_key"] or selected_period_key(
        ledger,
        granularity=granularity,
        period=period,
    )
    if not transfer_rows.empty and selected_period:
        transfer_rows = transfer_rows.copy()
        if granularity == "year":
            transfer_periods = transfer_rows["date"].dt.year.astype(str)
        elif granularity == "month":
            transfer_periods = transfer_rows["date"].dt.strftime("%Y-%m")
        else:
            transfer_periods = (
                transfer_rows["date"].dt.year.astype(str)
                + "-Q"
                + transfer_rows["date"].dt.quarter.astype(str)
            )
        transfer_rows = transfer_rows[transfer_periods == selected_period].copy()
    transfer_total = (
        round(float(transfer_rows["amount"].abs().sum()), 2) if not transfer_rows.empty else 0.0
    )
    payload["totals"]["transfers"] = transfer_total
    return payload

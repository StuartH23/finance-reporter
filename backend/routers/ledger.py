"""Ledger retrieval endpoints."""

from __future__ import annotations

import io
from typing import Literal

from fastapi import APIRouter, Cookie, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from routers.upload import get_category_overrides, get_session_ledger
from schemas import (
    CategoryUpdateRequest,
    CategoryUpdateResponse,
    LedgerResponse,
    TransferResponse,
)
from sdk import TRANSFER_CATEGORIES
from sdk.ledger_scope import period_key_is_valid, scoped_ledger
from sdk.semantics import resolve_semantic_type

router = APIRouter(tags=["ledger"])

Granularity = Literal["year", "quarter", "month"]
TransactionType = Literal["income", "spending", "transfer"]
SortField = Literal["date", "description", "amount", "category", "source_file"]
SortDirection = Literal["asc", "desc"]


def _format_transactions(rows):
    if rows.empty:
        return []
    output = rows.copy()
    if "transaction_id" not in output.columns:
        output["transaction_id"] = [str(index + 1) for index in range(len(output))]
    if "category_edited" not in output.columns:
        output["category_edited"] = False
    output = output.rename(columns={"transaction_id": "id"})
    output["date"] = output["date"].dt.strftime("%Y-%m-%d")
    return output[
        ["id", "date", "description", "amount", "category", "source_file", "category_edited"]
    ].to_dict(orient="records")


def _filtered_rows(
    ledger,
    *,
    granularity: Granularity = "month",
    period: str | None = None,
    category: str | None = None,
    transaction_type: TransactionType | None = None,
    source_file: str | None = None,
    search: str | None = None,
    sort: SortField = "date",
    direction: SortDirection = "asc",
):
    if period and not period_key_is_valid(period, granularity):
        expected = {"year": "YYYY", "quarter": "YYYY-Q#", "month": "YYYY-MM"}[granularity]
        raise HTTPException(
            status_code=422,
            detail=f"Invalid period '{period}'. Expected {expected} for granularity={granularity}.",
        )

    scoped = scoped_ledger(ledger, granularity=granularity, period=period)
    rows = scoped.rows.copy()

    if rows.empty:
        return rows

    if category:
        if category == "Uncategorized":
            rows = rows[rows["category"].astype(str).str.strip().isin(["", "Uncategorized"])]
        else:
            rows = rows[rows["category"] == category]
    if source_file:
        rows = rows[rows["source_file"] == source_file]
    if search:
        needle = search.strip().lower()
        if needle:
            rows = rows[
                rows["description"].astype(str).str.lower().str.contains(needle, regex=False)
                | rows["category"].astype(str).str.lower().str.contains(needle, regex=False)
                | rows["source_file"].astype(str).str.lower().str.contains(needle, regex=False)
            ]
    if transaction_type:
        if transaction_type == "transfer":
            rows = rows[rows["category"].isin(TRANSFER_CATEGORIES)]
        else:
            semantic_types = rows.apply(
                lambda row: resolve_semantic_type(row, category=str(row.get("category", ""))),
                axis=1,
            )
            rows = rows[semantic_types == transaction_type]

    rows = rows.sort_values(sort, ascending=direction == "asc").reset_index(drop=True)
    return rows


@router.get("/ledger", response_model=LedgerResponse)
def get_ledger(request: Request, session_id: str | None = Cookie(default=None)):
    """Return all transactions in the current session."""
    ledger = get_session_ledger(session_id, request)
    rows = ledger.sort_values("date").reset_index(drop=True) if not ledger.empty else ledger
    return {"transactions": _format_transactions(rows), "count": len(rows)}


@router.get("/ledger/transactions", response_model=LedgerResponse)
def get_transactions(
    request: Request,
    session_id: str | None = Cookie(default=None),
    granularity: Granularity = Query(default="month"),
    period: str | None = Query(default=None),
    category: str | None = Query(default=None),
    type: TransactionType | None = Query(default=None),
    source_file: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort: SortField = Query(default="date"),
    direction: SortDirection = Query(default="asc"),
):
    """Return server-filtered transaction rows for the selected period."""
    ledger = get_session_ledger(session_id, request)
    rows = _filtered_rows(
        ledger,
        granularity=granularity,
        period=period,
        category=category,
        transaction_type=type,
        source_file=source_file,
        search=search,
        sort=sort,
        direction=direction,
    )
    return {"transactions": _format_transactions(rows), "count": len(rows)}


@router.get("/ledger/transactions/export")
def export_transactions(
    request: Request,
    session_id: str | None = Cookie(default=None),
    granularity: Granularity = Query(default="month"),
    period: str | None = Query(default=None),
    category: str | None = Query(default=None),
    type: TransactionType | None = Query(default=None),
    source_file: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort: SortField = Query(default="date"),
    direction: SortDirection = Query(default="asc"),
    format: Literal["csv", "xlsx"] = Query(default="csv"),
):
    """Export the same filtered transaction set returned by /ledger/transactions."""
    ledger = get_session_ledger(session_id, request)
    rows = _filtered_rows(
        ledger,
        granularity=granularity,
        period=period,
        category=category,
        transaction_type=type,
        source_file=source_file,
        search=search,
        sort=sort,
        direction=direction,
    )
    export_rows = rows.copy()
    if export_rows.empty:
        export_rows = export_rows.reindex(
            columns=["transaction_id", "date", "description", "amount", "category", "source_file"]
        )
    export_rows = export_rows.rename(columns={"transaction_id": "id"})
    if "date" in export_rows.columns and not export_rows.empty:
        export_rows["date"] = export_rows["date"].dt.strftime("%Y-%m-%d")
    export_rows = export_rows[["id", "date", "description", "amount", "category", "source_file"]]

    extension = "xlsx" if format == "xlsx" else "csv"
    filename = f"transactions-{period or 'latest'}.{extension}"

    if format == "csv":
        buffer = io.StringIO()
        export_rows.to_csv(buffer, index=False)
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    buffer = io.BytesIO()
    try:
        export_rows.to_excel(buffer, index=False, sheet_name="Transactions")
    except ModuleNotFoundError as exc:
        raise HTTPException(status_code=500, detail="XLSX export requires openpyxl.") from exc
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch(
    "/ledger/transactions/{transaction_id}/category",
    response_model=CategoryUpdateResponse,
)
def update_transaction_category(
    transaction_id: str,
    payload: CategoryUpdateRequest,
    request: Request,
    session_id: str | None = Cookie(default=None),
):
    """Apply a session-only category override to exactly one transaction row."""
    category = payload.category.strip()
    if not category:
        raise HTTPException(status_code=422, detail="Category is required.")

    ledger = get_session_ledger(session_id, request)
    if ledger.empty or transaction_id not in set(ledger["transaction_id"].astype(str)):
        raise HTTPException(status_code=404, detail="Transaction not found.")

    overrides = get_category_overrides(session_id, request)
    overrides[transaction_id] = category
    return {"id": transaction_id, "category": category, "category_edited": True}


@router.get("/ledger/transfers", response_model=TransferResponse)
def get_transfers(request: Request, session_id: str | None = Cookie(default=None)):
    """Return transfer transactions excluded from P&L."""
    ledger = get_session_ledger(session_id, request)
    transfers = ledger[ledger["category"].isin(TRANSFER_CATEGORIES)].copy()

    if transfers.empty:
        return {"transactions": [], "count": 0, "summary": []}

    summary = (
        transfers.groupby("category", sort=False)
        .agg(total=("amount", "sum"), transactions=("amount", "count"))
        .reset_index()
        .sort_values("total")
    )

    transfers_out = transfers.sort_values("date").reset_index(drop=True)

    return {
        "transactions": _format_transactions(transfers_out),
        "count": len(transfers_out),
        "summary": summary.to_dict(orient="records"),
    }

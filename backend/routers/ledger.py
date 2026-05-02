"""Ledger retrieval endpoints."""

from fastapi import APIRouter, Cookie, Request

from routers.upload import get_session_ledger
from schemas import LedgerResponse, TransferResponse
from sdk import TRANSFER_CATEGORIES

router = APIRouter(tags=["ledger"])


@router.get("/ledger", response_model=LedgerResponse)
def get_ledger(request: Request, session_id: str | None = Cookie(default=None)):
    """Return all transactions in the current session."""
    ledger = get_session_ledger(session_id, request)
    if ledger.empty:
        return {"transactions": [], "count": 0}

    rows = (
        ledger[["date", "description", "amount", "category", "source_file"]]
        .sort_values("date")
        .reset_index(drop=True)
    )
    rows["date"] = rows["date"].dt.strftime("%Y-%m-%d")

    return {
        "transactions": rows.to_dict(orient="records"),
        "count": len(rows),
    }


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

    transfers_out = (
        transfers[["date", "description", "amount", "category", "source_file"]]
        .sort_values("date")
        .reset_index(drop=True)
    )
    transfers_out["date"] = transfers_out["date"].dt.strftime("%Y-%m-%d")

    return {
        "transactions": transfers_out.to_dict(orient="records"),
        "count": len(transfers_out),
        "summary": summary.to_dict(orient="records"),
    }

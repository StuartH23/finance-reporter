"""P&L summary endpoints."""

from fastapi import APIRouter, Cookie

from routers.upload import get_session_ledger
from schemas import CategoryBreakdownResponse, MonthlyPnlResponse, YearlyPnlResponse
from sdk import TRANSFER_CATEGORIES, summarize

router = APIRouter(tags=["pnl"])


@router.get("/pnl/monthly", response_model=MonthlyPnlResponse)
def monthly_pnl(session_id: str | None = Cookie(default=None)):
    """Return monthly P&L summary."""
    ledger = get_session_ledger(session_id)
    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()

    if pnl.empty:
        return {"months": []}

    monthly = summarize(pnl)

    return {
        "months": monthly[["month_str", "income", "expenses", "net", "profitable"]].to_dict(
            orient="records"
        ),
    }


@router.get("/pnl/yearly", response_model=YearlyPnlResponse)
def yearly_pnl(session_id: str | None = Cookie(default=None)):
    """Return yearly P&L summary."""
    ledger = get_session_ledger(session_id)
    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()

    if pnl.empty:
        return {"years": []}

    pnl["year"] = pnl["date"].dt.year
    pnl["income"] = pnl["amount"].where(pnl["amount"] > 0, 0)
    pnl["expense"] = pnl["amount"].where(pnl["amount"] < 0, 0)

    yearly = (
        pnl.groupby("year", as_index=False)
        .agg(income=("income", "sum"), expenses=("expense", "sum"), net=("amount", "sum"))
        .sort_values("year")
    )
    yearly["expenses"] = -yearly["expenses"]
    yearly["profitable"] = yearly["net"] > 0
    yearly["year"] = yearly["year"].astype(int)

    return {"years": yearly.to_dict(orient="records")}


@router.get("/pnl/categories", response_model=CategoryBreakdownResponse)
def category_breakdown(session_id: str | None = Cookie(default=None)):
    """Return spending breakdown by category."""
    ledger = get_session_ledger(session_id)
    if ledger.empty:
        return {"categories": [], "spending_chart": []}

    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()

    # Full category breakdown
    cat_summary = (
        pnl.groupby("category", sort=False)
        .agg(
            income=("amount", lambda x: float(x[x > 0].sum())),
            expenses=("amount", lambda x: float(-x[x < 0].sum())),
            net=("amount", "sum"),
            transactions=("amount", "count"),
        )
        .reset_index()
        .sort_values("expenses", ascending=False)
    )

    # Spending pie chart data
    spending = pnl[pnl["amount"] < 0].copy()
    spending["abs_amount"] = -spending["amount"]
    by_cat = (
        spending.groupby("category", sort=False)["abs_amount"]
        .agg(["sum", "count"])
        .rename(columns={"sum": "total", "count": "transactions"})
        .reset_index()
        .sort_values("total", ascending=False)
    )

    total = by_cat["total"].sum()
    by_cat["percentage"] = (by_cat["total"] / total * 100).round(1) if total > 0 else 0

    return {
        "categories": cat_summary.to_dict(orient="records"),
        "spending_chart": by_cat.to_dict(orient="records"),
    }

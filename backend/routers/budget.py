"""Budget management endpoints."""

from calendar import monthrange
from datetime import date, datetime

from fastapi import APIRouter, Cookie, Query

from routers.upload import get_session_ledger
from schemas import (
    BudgetListResponse,
    BudgetUpdate,
    BudgetUpdateResponse,
    BudgetVsActualResponse,
    QuickCheckResponse,
)
from sdk import TRANSFER_CATEGORIES, budget_vs_actual, load_budget, save_budget

router = APIRouter(tags=["budget"])


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    """Return first/last day for a given calendar month."""
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def _complete_month_keys(pnl):
    """Return YYYY-MM keys for months fully covered by parsed date range."""
    if pnl.empty:
        return set()

    data_min = pnl["date"].min().date()
    data_max = pnl["date"].max().date()
    month_periods = pnl["date"].dt.to_period("M").unique()

    complete: set[str] = set()
    for period in month_periods:
        month_start, month_end = _month_bounds(period.year, period.month)
        if data_min <= month_start and data_max >= month_end:
            complete.add(f"{period.year:04d}-{period.month:02d}")
    return complete


def _filter_to_complete_months(pnl):
    """Filter parsed rows down to complete months only."""
    complete_keys = _complete_month_keys(pnl)
    if not complete_keys:
        return pnl.iloc[0:0].copy(), complete_keys

    month_keys = pnl["date"].dt.strftime("%Y-%m")
    return pnl[month_keys.isin(complete_keys)].copy(), complete_keys


@router.get("/budget", response_model=BudgetListResponse)
def get_budget():
    """Return current monthly budget."""
    budget = load_budget()
    return {"budget": [{"category": k, "monthly_budget": v} for k, v in budget.items()]}


@router.put("/budget", response_model=BudgetUpdateResponse)
def update_budget(data: BudgetUpdate):
    """Update monthly budget targets."""
    save_budget(data.budget)
    return {"status": "saved", "categories": len(data.budget)}


@router.get("/budget/vs-actual", response_model=BudgetVsActualResponse)
def get_budget_vs_actual(session_id: str | None = Cookie(default=None)):
    """Compare budget against actual spending."""
    budget = load_budget()
    ledger = get_session_ledger(session_id)
    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()
    pnl, _ = _filter_to_complete_months(pnl)

    if pnl.empty or not budget:
        return {"comparison": [], "summary": {}}

    comparison = budget_vs_actual(pnl, budget)

    # Filter to categories with budget or actual spending
    comparison = comparison[(comparison["monthly_budget"] > 0) | (comparison["total_actual"] > 0)]

    n_months = int(comparison["months"].max()) if not comparison.empty else 1
    total_budget = float(comparison["monthly_budget"].sum())
    total_avg = float(comparison["avg_actual"].sum())

    return {
        "comparison": comparison[
            ["category", "monthly_budget", "avg_actual", "total_actual", "diff", "pct_used"]
        ].to_dict(orient="records"),
        "summary": {
            "monthly_budget": total_budget,
            "avg_monthly_spending": total_avg,
            "surplus_deficit": total_budget - total_avg,
            "months_of_data": n_months,
        },
    }


@router.get("/budget/quick-check", response_model=QuickCheckResponse)
def quick_check(month: str | None = Query(default=None), session_id: str | None = Cookie(default=None)):
    """Quick monthly budget status for a target month (or current/most recent)."""
    budget = load_budget()
    ledger = get_session_ledger(session_id)
    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()
    pnl, complete_month_keys = _filter_to_complete_months(pnl)

    if pnl.empty or not budget:
        return {"month": None, "status": "no_data"}

    if month:
        try:
            selected = datetime.strptime(month, "%Y-%m")
        except ValueError:
            return {"month": None, "status": "no_data"}
        selected_key = selected.strftime("%Y-%m")
        if selected_key not in complete_month_keys:
            return {"month": selected.strftime("%B %Y"), "status": "no_data"}
        current_month = pnl[
            (pnl["date"].dt.year == selected.year) & (pnl["date"].dt.month == selected.month)
        ].copy()
        month_label = selected.strftime("%B %Y")
        if current_month.empty:
            return {"month": month_label, "status": "no_data"}
    else:
        today = date.today()
        today_key = today.strftime("%Y-%m")
        target_key = today_key if today_key in complete_month_keys else max(complete_month_keys)
        current_month = pnl[pnl["date"].dt.strftime("%Y-%m") == target_key].copy()
        month_label = datetime.strptime(target_key, "%Y-%m").strftime("%B %Y")

    spending = current_month[current_month["amount"] < 0].copy()
    spending["abs_amount"] = -spending["amount"]

    by_cat = (
        spending.groupby("category", sort=False)["abs_amount"]
        .sum()
        .reset_index()
        .rename(columns={"abs_amount": "spent"})
    )

    total_budget = sum(budget.values())
    total_spent = float(by_cat["spent"].sum())

    items = []
    for _, row in by_cat.iterrows():
        cat = row["category"]
        spent = float(row["spent"])
        budgeted = budget.get(cat, 0.0)
        items.append(
            {
                "category": cat,
                "spent": spent,
                "budgeted": budgeted,
                "remaining": budgeted - spent if budgeted > 0 else None,
                "pct_used": round(spent / budgeted * 100, 1) if budgeted > 0 else None,
                "over_budget": spent > budgeted if budgeted > 0 else None,
            }
        )

    items.sort(key=lambda x: x["spent"], reverse=True)

    return {
        "month": month_label,
        "total_budget": total_budget,
        "total_spent": total_spent,
        "total_remaining": total_budget - total_spent,
        "pct_used": round(total_spent / total_budget * 100, 1) if total_budget > 0 else 0,
        "categories": items,
    }

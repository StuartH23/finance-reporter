"""Budget management endpoints."""

from datetime import date

from fastapi import APIRouter, Cookie

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
def quick_check(session_id: str | None = Cookie(default=None)):
    """Quick monthly budget status — how you're doing this month."""
    budget = load_budget()
    ledger = get_session_ledger(session_id)
    pnl = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()

    if pnl.empty or not budget:
        return {"month": None, "status": "no_data"}

    today = date.today()
    current_month = pnl[
        (pnl["date"].dt.year == today.year) & (pnl["date"].dt.month == today.month)
    ].copy()

    if current_month.empty:
        # Fall back to most recent month
        most_recent = pnl["date"].max()
        current_month = pnl[
            (pnl["date"].dt.year == most_recent.year) & (pnl["date"].dt.month == most_recent.month)
        ].copy()
        month_label = most_recent.strftime("%B %Y")
    else:
        month_label = today.strftime("%B %Y")

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

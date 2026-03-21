"""Budget loading and comparison."""

from pathlib import Path

import pandas as pd

BUDGET_PATH = Path(__file__).resolve().parent.parent / "data" / "budget.csv"


def load_budget() -> dict[str, float]:
    """Load monthly budget targets from CSV. Returns {category: amount}."""
    if not BUDGET_PATH.exists():
        return {}
    df = pd.read_csv(BUDGET_PATH)
    return dict(zip(df["category"], df["monthly_budget"]))


def save_budget(budget: dict[str, float]) -> None:
    """Save monthly budget targets to CSV."""
    df = pd.DataFrame([{"category": k, "monthly_budget": v} for k, v in budget.items()])
    df.to_csv(BUDGET_PATH, index=False)


def budget_vs_actual(pnl_ledger: pd.DataFrame, budget: dict[str, float]) -> pd.DataFrame:
    """Compare actual monthly spending per category against budget.

    Returns a DataFrame with columns:
    category, monthly_budget, avg_actual, total_actual, months, diff, pct_used
    """
    spending = pnl_ledger[pnl_ledger["amount"] < 0].copy()
    spending["abs_amount"] = -spending["amount"]
    spending["month"] = spending["date"].dt.to_period("M")

    n_months = spending["month"].nunique() or 1

    by_cat = (
        spending.groupby("category", sort=False)["abs_amount"]
        .agg(["sum", "count"])
        .rename(columns={"sum": "total_actual", "count": "transactions"})
        .reset_index()
    )
    by_cat["avg_actual"] = by_cat["total_actual"] / n_months
    by_cat["months"] = n_months

    # Merge with budget
    budget_df = pd.DataFrame([{"category": k, "monthly_budget": v} for k, v in budget.items()])
    result = budget_df.merge(by_cat, on="category", how="outer").fillna(0)
    result["diff"] = result["monthly_budget"] - result["avg_actual"]
    result["pct_used"] = result.apply(
        lambda r: (r["avg_actual"] / r["monthly_budget"] * 100) if r["monthly_budget"] > 0 else 0.0,
        axis=1,
    )
    return result.sort_values("total_actual", ascending=False)

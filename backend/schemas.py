"""Pydantic response and request models for all API endpoints."""

from __future__ import annotations

from pydantic import BaseModel

# --- Upload ---


class FileResult(BaseModel):
    file: str
    status: str
    transactions: int


class UploadResponse(BaseModel):
    files: list[FileResult]
    total_transactions: int
    pnl_transactions: int
    transfer_transactions: int


# --- Ledger ---


class Transaction(BaseModel):
    date: str
    description: str
    amount: float
    category: str
    source_file: str


class LedgerResponse(BaseModel):
    transactions: list[Transaction]
    count: int


class TransferSummaryItem(BaseModel):
    category: str
    total: float
    transactions: int


class TransferResponse(BaseModel):
    transactions: list[Transaction]
    count: int
    summary: list[TransferSummaryItem]


# --- P&L ---


class MonthlyPnl(BaseModel):
    month_str: str
    income: float
    expenses: float
    net: float
    profitable: bool


class MonthlyPnlResponse(BaseModel):
    months: list[MonthlyPnl]


class YearlyPnl(BaseModel):
    year: int
    income: float
    expenses: float
    net: float
    profitable: bool


class YearlyPnlResponse(BaseModel):
    years: list[YearlyPnl]


class CategorySummary(BaseModel):
    category: str
    income: float
    expenses: float
    net: float
    transactions: int


class SpendingChartItem(BaseModel):
    category: str
    total: float
    transactions: int
    percentage: float | None = None


class CategoryBreakdownResponse(BaseModel):
    categories: list[CategorySummary]
    spending_chart: list[SpendingChartItem]


# --- Budget ---


class BudgetItem(BaseModel):
    category: str
    monthly_budget: float


class BudgetListResponse(BaseModel):
    budget: list[BudgetItem]


class BudgetUpdate(BaseModel):
    budget: dict[str, float]


class BudgetUpdateResponse(BaseModel):
    status: str
    categories: int


class BudgetComparison(BaseModel):
    category: str
    monthly_budget: float
    avg_actual: float
    total_actual: float
    diff: float
    pct_used: float


class BudgetSummary(BaseModel):
    monthly_budget: float
    avg_monthly_spending: float
    surplus_deficit: float
    months_of_data: int


class BudgetVsActualResponse(BaseModel):
    comparison: list[BudgetComparison]
    summary: BudgetSummary | dict


class QuickCheckCategory(BaseModel):
    category: str
    spent: float
    budgeted: float
    remaining: float | None
    pct_used: float | None
    over_budget: bool | None


class QuickCheckResponse(BaseModel):
    month: str | None
    status: str | None = None
    total_budget: float | None = None
    total_spent: float | None = None
    total_remaining: float | None = None
    pct_used: float | None = None
    categories: list[QuickCheckCategory] | None = None


# --- Categories ---


class CategoriesResponse(BaseModel):
    categories: list[dict[str, str]]


# --- Health ---


class HealthResponse(BaseModel):
    status: str

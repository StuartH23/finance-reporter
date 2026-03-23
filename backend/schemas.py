"""Pydantic response and request models for all API endpoints."""

from __future__ import annotations

from typing import Literal

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


# --- Subscriptions ---


class SubscriptionChargePoint(BaseModel):
    date: str
    amount: float


class SubscriptionItem(BaseModel):
    stream_id: str
    merchant: str
    cadence: str
    confidence: float
    active: bool
    ignored: bool
    essential: bool
    amount: float
    baseline_amount: float
    expected_amount: float
    next_expected_charge_date: str | None
    last_charge_date: str
    trend: str
    price_increase: bool
    charge_count: int
    charge_history: list[SubscriptionChargePoint]
    cancellation_candidate: bool
    negotiation_opportunity: bool
    is_new_recurring: bool
    missed_expected_charge: bool


class SubscriptionListResponse(BaseModel):
    subscriptions: list[SubscriptionItem]
    count: int


class SubscriptionPreferenceUpdate(BaseModel):
    essential: bool | None = None
    ignored: bool | None = None


class SubscriptionPreferenceResponse(BaseModel):
    status: str
    stream_id: str
    essential: bool
    ignored: bool


class SubscriptionAlert(BaseModel):
    stream_id: str
    merchant: str
    alert_type: str
    message: str


class SubscriptionAlertsResponse(BaseModel):
    alerts: list[SubscriptionAlert]
    count: int


class ReminderResponse(BaseModel):
    status: str
    stream_id: str
    message: str


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


# --- Feature interest ---


class FeatureInterestRequest(BaseModel):
    email: str
    name: str | None = None
    features: list[str]
    notes: str | None = None


class FeatureInterestResponse(BaseModel):
    status: str
    total_signups: int
    feature_counts: dict[str, int]


# --- Categories ---


class CategoriesResponse(BaseModel):
    categories: list[dict[str, str]]


# --- Next-best actions ---


class NextBestAction(BaseModel):
    action_id: str
    action_type: Literal[
        "save_transfer",
        "spending_cap",
        "bill_review",
        "debt_extra_payment",
        "subscription_cleanup",
    ]
    title: str
    rationale: str
    impact_estimate: str
    impact_monthly: float
    score: float
    state: Literal["suggested", "completed", "dismissed", "snoozed"]


class NextBestActionFeedResponse(BaseModel):
    feed_date: str
    count: int
    actionable_data_exists: bool
    actions: list[NextBestAction]


class NextBestActionFeedbackRequest(BaseModel):
    outcome: Literal["completed", "dismissed", "snoozed"]
    snooze_days: int | None = None


class NextBestActionFeedbackResponse(BaseModel):
    status: str
    action_id: str
    outcome: Literal["completed", "dismissed", "snoozed"]
    cooldown_until: str | None = None
    snooze_until: str | None = None


# --- Health ---


class HealthResponse(BaseModel):
    status: str

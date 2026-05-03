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
    dominant_category: str = "Uncategorized"
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
    status_group: Literal["active", "inactive"] | None = None
    payment_state: Literal["paid_ok", "paid_variance", "upcoming", "inactive"] | None = None
    next_due_date: str | None = None
    last_paid_amount: float | None = None
    manually_managed: bool = False


class SubscriptionSummary(BaseModel):
    monthly_run_rate: float
    annual_run_rate: float
    active_count: int
    latest_month_total: float
    latest_month_label: str
    latest_month_is_complete: bool


class SubscriptionListResponse(BaseModel):
    subscriptions: list[SubscriptionItem]
    count: int
    summary: SubscriptionSummary


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


class CancelInfoResponse(BaseModel):
    stream_id: str
    merchant: str
    found: bool
    display_name: str | None = None
    cancel_url: str | None = None
    support_url: str | None = None
    phone: str | None = None
    notes: str | None = None


class SubscriptionReviewResponse(BaseModel):
    stream_id: str
    verdict: Literal["likely_authorized", "review_needed", "price_concern"]
    reason: str
    evidence: list[str]
    cached: bool


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


class CashFlowPeriod(BaseModel):
    key: str
    label: str


class CashFlowTotals(BaseModel):
    income: float
    expenses: float
    net: float
    transfers: float = 0.0


class CashFlowNode(BaseModel):
    id: str
    label: str
    type: Literal["income", "expense", "savings", "shortfall"]
    value: float
    group_key: str | None = None


class CashFlowLink(BaseModel):
    source: str
    target: str
    value: float


class CashFlowGroup(BaseModel):
    key: str
    label: str
    amount: float
    transactions: int


class CashFlowResponse(BaseModel):
    granularity: Literal["month", "quarter"]
    group_by: Literal["category", "merchant"]
    period_key: str | None
    period_label: str | None
    available_periods: list[CashFlowPeriod]
    totals: CashFlowTotals
    nodes: list[CashFlowNode]
    links: list[CashFlowLink]
    groups: list[CashFlowGroup]
    transaction_count: int


# --- Insights ---


class InsightItem(BaseModel):
    id: str
    kind: str
    title: str
    observation: str
    significance: str
    action: str
    why_this_matters: str
    do_this_now: str
    confidence: float
    template_key: str
    template_vars: dict[str, str | float | int]
    digest: str
    period_label: str | None = None


class InsightsResponse(BaseModel):
    generated_at: str
    locale: str
    currency: str
    period_label: str | None = None
    insights: list[InsightItem]
    digest: list[InsightItem]
    suppressed: int


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


# --- Goals ---


class GoalContributionPoint(BaseModel):
    month: str
    amount: float


class GoalCreate(BaseModel):
    name: str
    target_amount: float
    target_date: str | None = None
    priority: int
    category: str
    status: str = "active"


class GoalUpdate(BaseModel):
    name: str
    target_amount: float
    target_date: str | None = None
    priority: int
    category: str
    status: str


class GoalResponse(BaseModel):
    id: str
    name: str
    target_amount: float
    target_date: str | None
    priority: int
    category: str
    status: str
    created_at: str
    updated_at: str
    contributed_amount: float
    remaining_amount: float
    progress_pct: float
    contribution_history: list[GoalContributionPoint]


class GoalListResponse(BaseModel):
    goals: list[GoalResponse]
    count: int


class GoalUpsertResponse(BaseModel):
    status: str
    goal: GoalResponse


class PaycheckObligation(BaseModel):
    name: str
    amount: float


class PaycheckGoalAllocation(BaseModel):
    goal_id: str
    name: str
    category: str
    priority: int
    target_date: str | None
    recommended_amount: float
    remaining_after_allocation: float
    required_per_paycheck: float | None
    feasible: bool | None


class PaycheckPlanRequest(BaseModel):
    paycheck_amount: float
    fixed_obligations: list[PaycheckObligation]
    safety_buffer: float = 0
    minimum_emergency_buffer: float = 0
    mode: str = "balanced"
    paychecks_per_month: int = 2
    goal_ids: list[str] | None = None


class PaycheckPlanResponse(BaseModel):
    paycheck_amount: float
    allocation_mode: str
    fixed_obligations_total: float
    needs: float
    goals: float
    discretionary: float
    safety_buffer_reserved: float
    goal_allocations: list[PaycheckGoalAllocation]
    warnings: list[str]
    explanations: list[str]
    what_changed: list[str]


class PaycheckPlanSaveRequest(BaseModel):
    paycheck_amount: float
    fixed_obligations: list[PaycheckObligation]
    safety_buffer_reserved: float
    minimum_emergency_buffer: float = 0
    mode: str
    needs: float
    goals: float
    discretionary: float
    goal_allocations: list[PaycheckGoalAllocation]


class PaycheckPlanSaveResponse(BaseModel):
    status: str
    plan: dict


class SavedPaycheckPlanResponse(BaseModel):
    status: str
    plan: dict


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


# --- Analyst chat ---


class AnalystMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AnalystChatRequest(BaseModel):
    messages: list[AnalystMessage]
    demo_ledger_csv: str | None = None


class AnalystChatResponse(BaseModel):
    content: str


# --- Health ---


class HealthResponse(BaseModel):
    status: str

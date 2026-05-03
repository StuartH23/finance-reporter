"""PnL Reporter SDK — reusable financial data processing library."""

from .budget import budget_vs_actual, load_budget, save_budget
from .cashflow import (
    build_cashflow_payload,
    normalize_merchant,
    period_key_is_valid,
    selected_period_key,
)
from .categories import TRANSFER_CATEGORIES, categorize, load_categories
from .csv_handler import ColumnGuess, guess_columns
from .goals import build_paycheck_plan, compute_goal_progress, what_changed_lines
from .insights import build_insights
from .merchant_directory import lookup_cancel_info
from .ledger import build_ledger, clean_amount, summarize
from .next_actions import (
    apply_action_feedback,
    default_personalization_state,
    pick_daily_actions,
)
from .pdf_parser import parse_pdf_words_to_df
from .semantics import category_semantic_type, is_budgetable_spending, resolve_semantic_type
from .subscriptions import (
    build_alerts,
    build_subscription_payload,
    build_subscription_summary,
    detect_recurring_streams,
)
from .year_detection import infer_year

__all__ = [
    "TRANSFER_CATEGORIES",
    "ColumnGuess",
    "apply_action_feedback",
    "budget_vs_actual",
    "build_alerts",
    "build_cashflow_payload",
    "build_insights",
    "build_ledger",
    "build_paycheck_plan",
    "build_subscription_payload",
    "build_subscription_summary",
    "categorize",
    "category_semantic_type",
    "clean_amount",
    "compute_goal_progress",
    "default_personalization_state",
    "detect_recurring_streams",
    "guess_columns",
    "infer_year",
    "is_budgetable_spending",
    "load_budget",
    "load_categories",
    "lookup_cancel_info",
    "normalize_merchant",
    "parse_pdf_words_to_df",
    "period_key_is_valid",
    "pick_daily_actions",
    "resolve_semantic_type",
    "save_budget",
    "selected_period_key",
    "summarize",
    "what_changed_lines",
]

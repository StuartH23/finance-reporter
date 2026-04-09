"""PnL Reporter SDK — reusable financial data processing library."""

from .budget import budget_vs_actual, load_budget, save_budget
from .categories import TRANSFER_CATEGORIES, categorize, load_categories
from .csv_handler import ColumnGuess, guess_columns
from .goals import build_paycheck_plan, compute_goal_progress, what_changed_lines
from .insights import build_insights
from .ledger import build_ledger, clean_amount, summarize
from .next_actions import (
    apply_action_feedback,
    default_personalization_state,
    pick_daily_actions,
)
from .pdf_parser import parse_pdf_words_to_df
from .subscriptions import build_alerts, build_subscription_payload, detect_recurring_streams
from .year_detection import infer_year

__all__ = [
    "TRANSFER_CATEGORIES",
    "ColumnGuess",
    "budget_vs_actual",
    "build_paycheck_plan",
    "build_ledger",
    "build_alerts",
    "build_insights",
    "build_subscription_payload",
    "categorize",
    "clean_amount",
    "compute_goal_progress",
    "detect_recurring_streams",
    "guess_columns",
    "infer_year",
    "load_budget",
    "load_categories",
    "default_personalization_state",
    "pick_daily_actions",
    "apply_action_feedback",
    "parse_pdf_words_to_df",
    "save_budget",
    "summarize",
    "what_changed_lines",
]

"""PnL Reporter SDK — reusable financial data processing library."""

from .budget import budget_vs_actual, load_budget, save_budget
from .categories import TRANSFER_CATEGORIES, categorize, load_categories
from .csv_handler import ColumnGuess, guess_columns
from .goals import build_paycheck_plan, compute_goal_progress, what_changed_lines
from .ledger import build_ledger, clean_amount, summarize
from .pdf_parser import parse_pdf_words_to_df
from .subscriptions import build_alerts, build_subscription_payload, detect_recurring_streams
from .year_detection import infer_year

__all__ = [
    "TRANSFER_CATEGORIES",
    "ColumnGuess",
    "budget_vs_actual",
    "build_alerts",
    "build_paycheck_plan",
    "build_ledger",
    "build_subscription_payload",
    "categorize",
    "clean_amount",
    "compute_goal_progress",
    "detect_recurring_streams",
    "guess_columns",
    "infer_year",
    "load_budget",
    "load_categories",
    "parse_pdf_words_to_df",
    "save_budget",
    "summarize",
    "what_changed_lines",
]

# Finance Report Generator — Architecture & Implementation Docs

## Overview

Decoupled **React + Vite frontend** (TypeScript) and **FastAPI backend** (Python 3.13+). The original Streamlit code is preserved in `deprecated/streamlit-app/`.

---

## Directory Structure

```
pnl-reporter/
├── run.py                          # Starts both backend + frontend
├── backend/
│   ├── main.py                     # FastAPI app entry point
│   ├── schemas.py                  # Pydantic request/response models
│   ├── requirements.txt            # Python dependencies
│   ├── data/
│   │   ├── categories.csv          # Category regex rules
│   │   └── budget.csv              # Monthly budget targets
│   ├── sdk/                        # Reusable core library
│   │   ├── __init__.py             # Public exports
│   │   ├── pdf_parser.py           # Chase PDF word-coordinate parser
│   │   ├── csv_handler.py          # CSV column auto-detection
│   │   ├── ledger.py               # Ledger building + monthly summaries
│   │   ├── categories.py           # Transaction categorization
│   │   ├── budget.py               # Budget CRUD + comparison
│   │   └── year_detection.py       # Year inference from PDFs
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── upload.py               # POST /api/upload
│   │   ├── ledger.py               # GET /api/ledger, /api/ledger/transfers
│   │   ├── pnl.py                  # GET /api/pnl/monthly, /yearly, /categories
│   │   ├── budget.py               # GET/PUT /api/budget, /budget/vs-actual, /budget/quick-check
│   │   └── categories.py           # GET /api/categories
│   └── tests/
│       ├── __init__.py
│       ├── test_api_integration.py
│       ├── test_categories_endpoint.py
│       ├── test_ledger.py
│       ├── test_pdf_parser.py
│       ├── test_session_isolation.py
│       ├── test_upload.py
│       └── test_year_detection.py
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts              # Proxies /api → backend:8000
│   └── src/
│       ├── main.tsx                # React root
│       ├── index.css               # Global dark theme
│       ├── App.tsx                 # Router + sidebar layout
│       ├── App.css                 # Layout + component styles
│       ├── api/
│       │   ├── types.ts            # TypeScript interfaces (mirrors backend schemas)
│       │   └── client.ts           # Typed fetch wrappers with request deduplication
│       ├── components/
│       │   ├── FileUploader.tsx    # Drag-and-drop CSV/PDF upload
│       │   ├── PnlTable.tsx        # Yearly + monthly P&L tables
│       │   ├── SpendingPieChart.tsx # Donut chart by category
│       │   ├── TransactionList.tsx # Paginated transaction table
│       │   ├── BudgetEditor.tsx    # Editable budget grid
│       │   └── BudgetQuickCheck.tsx# Monthly budget snapshot
│       ├── pages/
│       │   ├── Dashboard.tsx       # Upload → P&L → Charts → Transactions
│       │   └── Budget.tsx          # Quick check + budget editor
│       └── __tests__/
│           └── client.test.ts      # API client tests
└── deprecated/
    └── streamlit-app/              # Original code for reference/revert
```

---

## How to Run

```bash
python run.py
```

Opens frontend at http://localhost:5173, backend API at http://localhost:8000. Ctrl+C stops both.

Or run individually:

```bash
# Backend
cd backend && source .venv/bin/activate && uvicorn main:app --reload

# Frontend
cd frontend && npm run dev
```

---

## run.py

Launches both processes and handles graceful shutdown.

```python
"""PnL Reporter — start backend and frontend together."""

import os
import subprocess
import sys
import signal

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")
FRONTEND_DIR = os.path.join(ROOT, "frontend")
VENV_PYTHON = os.path.join(BACKEND_DIR, ".venv", "bin", "python")


def main():
    procs = []

    # Backend: uvicorn via the venv python
    print("[run.py] Starting backend on http://localhost:8000 ...")
    backend = subprocess.Popen(
        [VENV_PYTHON, "-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
        cwd=BACKEND_DIR,
    )
    procs.append(backend)

    # Frontend: vite dev server
    print("[run.py] Starting frontend on http://localhost:5173 ...")
    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=FRONTEND_DIR,
    )
    procs.append(frontend)

    print("[run.py] App running — open http://localhost:5173")
    print("[run.py] Press Ctrl+C to stop.\n")

    def shutdown(sig, frame):
        print("\n[run.py] Shutting down...")
        for p in procs:
            p.terminate()
        for p in procs:
            p.wait()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Wait for either process to exit
    for p in procs:
        p.wait()


if __name__ == "__main__":
    main()
```

---

## Backend

### main.py — FastAPI App

Sets up CORS (allows frontend dev server), mounts all routers under `/api`, imports Pydantic response models from `schemas.py`.

```python
"""PnL Reporter — FastAPI entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import budget, categories, ledger, pnl, upload
from schemas import HealthResponse

app = FastAPI(title="PnL Reporter API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(ledger.router, prefix="/api")
app.include_router(pnl.router, prefix="/api")
app.include_router(budget.router, prefix="/api")
app.include_router(categories.router, prefix="/api")


@app.get("/api/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}
```

### schemas.py — Pydantic Models

All API request/response models in one file. Frontend `types.ts` mirrors these.

```python
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
```

### requirements.txt

```
fastapi>=0.111.0
uvicorn[standard]>=0.30.0
python-multipart>=0.0.9
pandas>=2.2.2
python-dateutil>=2.9.0
pdfplumber>=0.11.4
```

---

## Backend SDK (`backend/sdk/`)

The SDK is a Python package containing all the reusable data processing logic. Routers are thin wrappers that call into these functions. This is the part you can expand as a library.

### sdk/__init__.py — Public Exports

```python
"""PnL Reporter SDK — reusable financial data processing library."""

from .budget import budget_vs_actual, load_budget, save_budget
from .categories import TRANSFER_CATEGORIES, categorize, load_categories
from .csv_handler import ColumnGuess, guess_columns
from .ledger import build_ledger, clean_amount, summarize
from .pdf_parser import parse_pdf_words_to_df
from .year_detection import infer_year

__all__ = [
    "TRANSFER_CATEGORIES",
    "ColumnGuess",
    "budget_vs_actual",
    "build_ledger",
    "categorize",
    "clean_amount",
    "guess_columns",
    "infer_year",
    "load_budget",
    "load_categories",
    "parse_pdf_words_to_df",
    "save_budget",
    "summarize",
]
```

### sdk/pdf_parser.py — PDF Statement Parser

Parses Chase PDF statements using word-coordinate clustering (not table extraction). Two-pass approach: first classifies lines as transactions vs orphan amounts, then extracts structured rows.

**Key functions:**
- `parse_pdf_words_to_df(file_bytes, filename, year_override)` → `(DataFrame | None, int)` — main entry point
- `_pass1_classify_lines(line_map, orphan_amounts)` → transaction lines dict
- `_pass2_extract_rows(txn_lines, orphan_amounts)` → list of row dicts

```python
"""Chase PDF statement parser using word-coordinate clustering."""

import io
import re
from collections import defaultdict

import pandas as pd
import pdfplumber

from .year_detection import infer_year

# Compiled patterns used across parsing functions.
DATE_WORD_RE = re.compile(r"^\d{1,2}/\d{1,2}$")
AMOUNT_WORD_RE = re.compile(r"^-?\$?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2}$")
LONG_NUM_RE = re.compile(r"\b\d{10,}\b")
REF_LABEL_RE = re.compile(
    r"\b(PPD|ACH|WEB|TEL|CCD)\s+ID\s*:?|\bWeb\s+ID\s*:?|\bTel\s+ID\s*:?",
    re.IGNORECASE,
)
MARKER_RE = re.compile(r"\*(?:end|start)\*", re.IGNORECASE)
DETAIL_DATE_RE = re.compile(r"^detail(\d{1,2}/\d{1,2})$", re.IGNORECASE)
SUMMARY_LINE_RE = re.compile(
    r"\b(balance|deposits\b|withdrawals?|summary|subtotal|beginning|ending"
    r"|account\s+number|transaction\s+detail)\b",
    re.IGNORECASE,
)
```

*(Helper functions `_clean_marker_texts`, `_extract_words_from_page`, `_classify_line`, `_handle_dated_line`, `_handle_dateless_line`, `_parse_transaction_row`, `_append_orphan_deposit`, `_detect_cross_year`, `_apply_years` omitted for brevity — see full file in `backend/sdk/pdf_parser.py`)*

### sdk/csv_handler.py — CSV Column Detection

Auto-detects common column names for date, description, amount, debit, credit.

```python
"""CSV column detection and guessing."""

import re
from dataclasses import dataclass


@dataclass
class ColumnGuess:
    date: str | None
    description: str | None
    amount: str | None
    debit: str | None
    credit: str | None


DATE_CANDIDATES = ["date", "posting date", "transaction date", "posted date"]
DESCRIPTION_CANDIDATES = ["description", "merchant", "payee", "details", "memo"]
AMOUNT_CANDIDATES = ["amount", "transaction amount", "amt"]
DEBIT_CANDIDATES = ["debit", "withdrawal", "charge"]
CREDIT_CANDIDATES = ["credit", "deposit", "payment"]


def _normalize_col(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def guess_columns(columns: list[str]) -> ColumnGuess:
    normalized = {_normalize_col(c): c for c in columns}

    def find(candidates: list[str]) -> str | None:
        for candidate in candidates:
            if candidate in normalized:
                return normalized[candidate]
        return None

    return ColumnGuess(
        date=find(DATE_CANDIDATES),
        description=find(DESCRIPTION_CANDIDATES),
        amount=find(AMOUNT_CANDIDATES),
        debit=find(DEBIT_CANDIDATES),
        credit=find(CREDIT_CANDIDATES),
    )
```

### sdk/ledger.py — Ledger Building & Summarization

Normalizes raw data into a standard `(date, description, amount)` ledger and aggregates monthly P&L.

```python
"""Ledger building and summarization."""

import pandas as pd


def clean_amount(value) -> float | None:
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if text == "":
        return None

    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]

    text = text.replace("$", "").replace(",", "")
    try:
        amount = float(text)
    except ValueError:
        return None

    return -amount if negative else amount


def build_ledger(
    df: pd.DataFrame,
    date_col: str,
    desc_col: str,
    amount_col: str | None,
    debit_col: str | None,
    credit_col: str | None,
    flip_sign: bool,
) -> pd.DataFrame:
    if amount_col:
        amount = df[amount_col].apply(clean_amount)
    elif debit_col or credit_col:
        debit = df[debit_col].apply(clean_amount) if debit_col else pd.Series(0, index=df.index)
        credit = df[credit_col].apply(clean_amount) if credit_col else pd.Series(0, index=df.index)
        amount = credit.fillna(0) - debit.fillna(0)
    else:
        raise ValueError("No amount, debit, or credit column provided")

    if flip_sign:
        amount = -amount

    ledger = pd.DataFrame(
        {
            "date": pd.to_datetime(df[date_col], errors="coerce"),
            "description": df[desc_col].astype(str).fillna(""),
            "amount": amount,
        }
    )
    ledger = ledger.dropna(subset=["date", "amount"])
    return ledger


def summarize(ledger: pd.DataFrame) -> pd.DataFrame:
    """Aggregate ledger to monthly P&L (income, expenses, net) per month."""
    ledger = ledger.copy()
    ledger["month"] = ledger["date"].dt.to_period("M").dt.to_timestamp()
    ledger["income"] = ledger["amount"].where(ledger["amount"] > 0, 0)
    ledger["expense"] = ledger["amount"].where(ledger["amount"] < 0, 0)

    monthly = (
        ledger.groupby("month", as_index=False)
        .agg(
            income=("income", "sum"),
            expenses=("expense", "sum"),
            net=("amount", "sum"),
        )
        .sort_values("month")
    )
    monthly["expenses"] = -monthly["expenses"]
    monthly["profitable"] = monthly["net"] > 0
    monthly["month_str"] = monthly["month"].dt.strftime("%Y-%m")
    return monthly
```

### sdk/categories.py — Transaction Categorization

Loads regex rules from `categories.csv` and matches transaction descriptions.

```python
"""Category loading and transaction categorization."""

import re

import pandas as pd

TRANSFER_CATEGORIES: set[str] = {
    "Credit Card Payments",
    "Venmo Transfers",
    "Personal Transfers",
    "Investments",
}


def load_categories(path: str) -> list[tuple[str, re.Pattern | None]]:
    categories = []
    df = pd.read_csv(path)
    for _, row in df.iterrows():
        category = str(row["category"]).strip()
        keywords = str(row["keywords"]).strip()
        if keywords and keywords.lower() != "nan":
            pattern = re.compile(keywords, re.IGNORECASE)
        else:
            pattern = None
        categories.append((category, pattern))
    return categories


def categorize(description: str, rules: list[tuple[str, re.Pattern | None]]) -> str:
    for category, pattern in rules:
        if pattern and pattern.search(description or ""):
            return category
    return "Uncategorized"
```

### sdk/budget.py — Budget Management

Loads/saves flat CSV, compares actual spending vs budget targets.

```python
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
```

### sdk/year_detection.py — Year Inference

Tries multiple strategies to detect the statement year from PDF text or filename.

```python
"""Infer statement year from PDF text and filename."""

import re
from collections import Counter
from datetime import date


def _from_range_header(text: str, text_normalized: str) -> int | None:
    """Extract year from 'Month DD, YYYY through ...' header."""
    match = re.search(
        r"(January|February|March|April|May|June|July|August|September"
        r"|October|November|December)\s+\d{1,2},?\s+(20\d{2})\s+through\b",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    year = int(match.group(2))
    return year


def _from_four_digit_years(text: str, text_normalized: str) -> int | None:
    """Extract year from 4-digit year patterns in text."""
    matches = re.findall(r"\b(20\d{2})\b", text)
    if not matches:
        return None

    years = sorted(set(int(y) for y in matches))
    if len(years) == 2 and years[1] == years[0] + 1:
        return years[0]
    return int(Counter(matches).most_common(1)[0][0])


def _from_two_digit_years(text: str) -> int | None:
    """Extract year from MM/DD/YY patterns."""
    matches = re.findall(r"\d{1,2}/\d{1,2}/(\d{2})\b", text)
    if matches:
        return 2000 + int(Counter(matches).most_common(1)[0][0])
    return None


def _from_filename(filename: str) -> int | None:
    """Extract year from filename like 20260217-statements.pdf."""
    match = re.search(r"(20\d{2})", filename)
    return int(match.group(1)) if match else None


def infer_year(text: str, filename: str = "") -> int:
    """Return the most likely statement year, or current year as fallback."""
    text_normalized = re.sub(r"\s+", " ", text)

    for fn in [
        lambda: _from_range_header(text, text_normalized),
        lambda: _from_four_digit_years(text, text_normalized),
        lambda: _from_two_digit_years(text),
        lambda: _from_filename(filename),
    ]:
        result = fn()
        if result is not None:
            return result

    return date.today().year
```

---

## Backend Routers (`backend/routers/`)

All routers use cookie-based session management. Each endpoint that reads ledger data accepts a `session_id` cookie parameter to isolate data between users/tabs.

### routers/upload.py — File Upload

Accepts multiple CSV/PDF files, parses them through the SDK, categorizes transactions, and stores in a per-session in-memory store.

```python
"""File upload and parsing endpoint."""

import io
import uuid

import pandas as pd
import pdfplumber
from fastapi import APIRouter, Cookie, File, Response, UploadFile

from schemas import UploadResponse
from sdk import (
    TRANSFER_CATEGORIES,
    build_ledger,
    categorize,
    guess_columns,
    infer_year,
    load_categories,
    parse_pdf_words_to_df,
)

router = APIRouter(tags=["upload"])

# Per-session ledger storage keyed by session ID
_sessions: dict[str, list[pd.DataFrame]] = {}

EMPTY_LEDGER = pd.DataFrame(columns=["date", "description", "amount", "category", "source_file"])


def get_session_ledger(session_id: str | None = None) -> pd.DataFrame:
    """Return the combined session ledger for a given session."""
    if not session_id or session_id not in _sessions:
        return EMPTY_LEDGER.copy()
    frames = _sessions[session_id]
    if not frames:
        return EMPTY_LEDGER.copy()
    return pd.concat(frames, ignore_index=True)


def clear_session(session_id: str) -> None:
    """Clear stored ledger data for a session."""
    if session_id in _sessions:
        _sessions[session_id].clear()


def _ensure_session(session_id: str | None, response: Response) -> str:
    """Return existing session ID or create a new one and set cookie."""
    if session_id and session_id in _sessions:
        return session_id
    sid = str(uuid.uuid4())
    _sessions[sid] = []
    response.set_cookie(key="session_id", value=sid, httponly=True, samesite="lax")
    return sid


@router.post("/upload", response_model=UploadResponse)
async def upload_files(
    response: Response,
    files: list[UploadFile] = File(...),
    session_id: str | None = Cookie(default=None),
):
    """Upload CSV/PDF files, parse them, and return the combined ledger."""
    sid = _ensure_session(session_id, response)

    categories = load_categories(
        str(
            __import__("pathlib").Path(__file__).resolve().parent.parent / "data" / "categories.csv"
        )
    )

    clear_session(sid)
    results = []

    for uploaded in files:
        content = await uploaded.read()
        filename = uploaded.filename or "unknown"

        if filename.lower().endswith(".pdf"):
            ledger_df = _process_pdf(content, filename)
        else:
            ledger_df = _process_csv(content)

        if ledger_df is None or ledger_df.empty:
            results.append({"file": filename, "status": "error", "transactions": 0})
            continue

        ledger_df["source_file"] = filename
        ledger_df["category"] = ledger_df["description"].apply(lambda d: categorize(d, categories))
        _sessions[sid].append(ledger_df)
        results.append({"file": filename, "status": "ok", "transactions": len(ledger_df)})

    combined = get_session_ledger(sid)
    pnl_rows = combined[~combined["category"].isin(TRANSFER_CATEGORIES)]
    transfer_rows = combined[combined["category"].isin(TRANSFER_CATEGORIES)]

    return {
        "files": results,
        "total_transactions": len(combined),
        "pnl_transactions": len(pnl_rows),
        "transfer_transactions": len(transfer_rows),
    }


def _process_pdf(content: bytes, filename: str) -> pd.DataFrame | None:
    """Parse a PDF and return a ledger DataFrame."""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        all_text = "\n".join((page.extract_text() or "") for page in pdf.pages)
    year = infer_year(all_text, filename)

    df, _ = parse_pdf_words_to_df(content, filename=filename, year_override=year)
    if df is None or df.empty:
        return None

    return build_ledger(
        df=df,
        date_col="Date",
        desc_col="Description",
        amount_col="Amount",
        debit_col=None,
        credit_col=None,
        flip_sign=False,
    )


def _process_csv(content: bytes) -> pd.DataFrame | None:
    """Parse a CSV with auto-detected columns and return a ledger DataFrame."""
    try:
        df = pd.read_csv(io.BytesIO(content))
    except (pd.errors.EmptyDataError, pd.errors.ParserError):
        return None
    guess = guess_columns(list(df.columns))

    if not guess.date or not guess.description:
        return None
    if not guess.amount and not guess.debit and not guess.credit:
        return None

    return build_ledger(
        df=df,
        date_col=guess.date,
        desc_col=guess.description,
        amount_col=guess.amount,
        debit_col=guess.debit if not guess.amount else None,
        credit_col=guess.credit if not guess.amount else None,
        flip_sign=False,
    )
```

**Design notes:**
- Session state is in-memory (`_sessions` dict keyed by UUID). Restarting the server clears all sessions.
- Each upload clears the current session's data (`clear_session()`).
- CSV auto-detection uses `guess_columns()` — validates that date, description, and at least one amount column are detected.
- CSV parsing has error handling for empty/malformed files.

### routers/ledger.py — Transaction Retrieval

```python
"""Ledger retrieval endpoints."""

from fastapi import APIRouter, Cookie

from routers.upload import get_session_ledger
from schemas import LedgerResponse, TransferResponse
from sdk import TRANSFER_CATEGORIES

router = APIRouter(tags=["ledger"])


@router.get("/ledger", response_model=LedgerResponse)
def get_ledger(session_id: str | None = Cookie(default=None)):
    """Return all transactions in the current session."""
    ledger = get_session_ledger(session_id)
    if ledger.empty:
        return {"transactions": [], "count": 0}

    rows = (
        ledger[["date", "description", "amount", "category", "source_file"]]
        .sort_values("date")
        .reset_index(drop=True)
    )
    rows["date"] = rows["date"].dt.strftime("%Y-%m-%d")

    return {
        "transactions": rows.to_dict(orient="records"),
        "count": len(rows),
    }


@router.get("/ledger/transfers", response_model=TransferResponse)
def get_transfers(session_id: str | None = Cookie(default=None)):
    """Return transfer transactions excluded from P&L."""
    ledger = get_session_ledger(session_id)
    transfers = ledger[ledger["category"].isin(TRANSFER_CATEGORIES)].copy()

    if transfers.empty:
        return {"transactions": [], "count": 0, "summary": []}

    summary = (
        transfers.groupby("category", sort=False)
        .agg(total=("amount", "sum"), transactions=("amount", "count"))
        .reset_index()
        .sort_values("total")
    )

    transfers_out = (
        transfers[["date", "description", "amount", "category", "source_file"]]
        .sort_values("date")
        .reset_index(drop=True)
    )
    transfers_out["date"] = transfers_out["date"].dt.strftime("%Y-%m-%d")

    return {
        "transactions": transfers_out.to_dict(orient="records"),
        "count": len(transfers_out),
        "summary": summary.to_dict(orient="records"),
    }
```

### routers/pnl.py — P&L Summaries

```python
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
```

### routers/budget.py — Budget + Quick Check

Includes `GET /api/budget/quick-check` which gives a snapshot of the current (or most recent) month's spending vs budget.

```python
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
```

### routers/categories.py — Category Rules

```python
"""Category management endpoints."""

from pathlib import Path

import pandas as pd
from fastapi import APIRouter

from schemas import CategoriesResponse

router = APIRouter(tags=["categories"])

CATEGORIES_PATH = Path(__file__).resolve().parent.parent / "data" / "categories.csv"


@router.get("/categories", response_model=CategoriesResponse)
def get_categories():
    """Return all category rules."""
    if not CATEGORIES_PATH.exists():
        return {"categories": []}
    df = pd.read_csv(CATEGORIES_PATH).fillna("")
    return {
        "categories": df.to_dict(orient="records"),
    }
```

---

## Frontend

Built with React 19, TypeScript, Vite, React Router, and Recharts. Dark theme with CSS custom properties.

### vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

### api/types.ts — TypeScript Interfaces

Mirrors the backend Pydantic models for type-safe API calls.

```typescript
// Upload
export interface FileResult {
  file: string
  status: 'ok' | 'error'
  transactions: number
}

export interface UploadResponse {
  files: FileResult[]
  total_transactions: number
  pnl_transactions: number
  transfer_transactions: number
}

// Ledger
export interface Transaction {
  date: string
  description: string
  amount: number
  category: string
  source_file: string
}

export interface LedgerResponse {
  transactions: Transaction[]
  count: number
}

// Transfers
export interface TransferSummaryItem {
  category: string
  total: number
  transactions: number
}

export interface TransferResponse {
  transactions: Transaction[]
  count: number
  summary: TransferSummaryItem[]
}

// P&L
export interface MonthlyPnl {
  month_str: string
  income: number
  expenses: number
  net: number
  profitable: boolean
}

export interface MonthlyPnlResponse {
  months: MonthlyPnl[]
}

export interface YearlyPnl {
  year: number
  income: number
  expenses: number
  net: number
  profitable: boolean
}

export interface YearlyPnlResponse {
  years: YearlyPnl[]
}

// Category breakdown
export interface CategorySummary {
  category: string
  income: number
  expenses: number
  net: number
  transactions: number
}

export interface SpendingChartItem {
  category: string
  total: number
  transactions: number
  percentage?: number
}

export interface CategoryBreakdownResponse {
  categories: CategorySummary[]
  spending_chart: SpendingChartItem[]
}

// Budget
export interface BudgetItem {
  category: string
  monthly_budget: number
}

export interface BudgetListResponse {
  budget: BudgetItem[]
}

export interface BudgetUpdateResponse {
  status: string
  categories: number
}

export interface BudgetComparison {
  category: string
  monthly_budget: number
  avg_actual: number
  total_actual: number
  diff: number
  pct_used: number
}

export interface BudgetSummary {
  monthly_budget: number
  avg_monthly_spending: number
  surplus_deficit: number
  months_of_data: number
}

export interface BudgetVsActualResponse {
  comparison: BudgetComparison[]
  summary: BudgetSummary | Record<string, never>
}

// Quick Check
export interface QuickCheckCategory {
  category: string
  spent: number
  budgeted: number
  remaining: number | null
  pct_used: number | null
  over_budget: boolean | null
}

export interface QuickCheckResponse {
  month: string | null
  status?: string
  total_budget?: number
  total_spent?: number
  total_remaining?: number
  pct_used?: number
  categories?: QuickCheckCategory[]
}

// Categories
export interface CategoryRule {
  category: string
  keywords: string
}

export interface CategoriesResponse {
  categories: CategoryRule[]
}

// Health
export interface HealthResponse {
  status: string
}
```

### api/client.ts — API Client

Typed fetch wrappers with built-in GET request deduplication: if two components request the same endpoint before the first resolves, the second caller shares the same promise and the server sees only one request. Cache is automatically invalidated after mutations (POST/PUT).

```typescript
import type {
  BudgetListResponse,
  BudgetUpdateResponse,
  BudgetVsActualResponse,
  CategoryBreakdownResponse,
  LedgerResponse,
  MonthlyPnlResponse,
  QuickCheckResponse,
  TransferResponse,
  UploadResponse,
  YearlyPnlResponse,
} from './types'

const BASE = '/api'

const _inflight = new Map<string, Promise<unknown>>()

export function invalidateCache(): void {
  _inflight.clear()
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || 'GET'

  if (method !== 'GET') {
    const res = await fetch(`${BASE}${path}`, options)
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
    const data = (await res.json()) as T
    invalidateCache()
    return data
  }

  if (_inflight.has(path)) return _inflight.get(path) as Promise<T>

  const promise = fetch(`${BASE}${path}`, options)
    .then((res) => {
      if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
      return res.json() as Promise<T>
    })
    .finally(() => _inflight.delete(path))

  _inflight.set(path, promise)
  return promise
}

export async function uploadFiles(files: FileList | File[]): Promise<UploadResponse> { ... }
export async function getLedger(): Promise<LedgerResponse> { ... }
export async function getTransfers(): Promise<TransferResponse> { ... }
export async function getMonthlyPnl(): Promise<MonthlyPnlResponse> { ... }
export async function getYearlyPnl(): Promise<YearlyPnlResponse> { ... }
export async function getCategoryBreakdown(): Promise<CategoryBreakdownResponse> { ... }
export async function getBudget(): Promise<BudgetListResponse> { ... }
export async function updateBudget(budget: Record<string, number>): Promise<BudgetUpdateResponse> { ... }
export async function getBudgetVsActual(): Promise<BudgetVsActualResponse> { ... }
export async function getBudgetQuickCheck(): Promise<QuickCheckResponse> { ... }
```

### App.tsx — Router + Layout

Sidebar navigation with `NavLink`. Tracks `ledgerVersion` counter that increments after each upload to trigger data refreshes in child components.

```typescript
import { useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import Budget from './pages/Budget'
import Dashboard from './pages/Dashboard'
import './App.css'

function App() {
  const [ledgerVersion, setLedgerVersion] = useState(0)

  const onUploadComplete = () => setLedgerVersion((v) => v + 1)

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <h1 className="logo">Finance Report Generator</h1>
          <div className="nav-links">
            <NavLink to="/" end>
              Profit and Loss Report
            </NavLink>
            <NavLink to="/budget">Budget</NavLink>
          </div>
        </nav>
        <main className="content">
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard onUploadComplete={onUploadComplete} ledgerVersion={ledgerVersion} />
              }
            />
            <Route path="/budget" element={<Budget ledgerVersion={ledgerVersion} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
```

### Pages

**Dashboard.tsx** — Composes upload form, P&L tables, spending chart, and transaction list:

```typescript
function Dashboard({ onUploadComplete, ledgerVersion }: DashboardProps) {
  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <FileUploader onUploadComplete={onUploadComplete} />
      <PnlTable ledgerVersion={ledgerVersion} />
      <SpendingPieChart ledgerVersion={ledgerVersion} />
      <TransactionList ledgerVersion={ledgerVersion} />
    </div>
  )
}
```

**Budget.tsx** — Quick check summary + editable budget grid:

```typescript
function Budget({ ledgerVersion }: BudgetPageProps) {
  return (
    <div>
      <h1 className="page-title">Budget</h1>
      <BudgetQuickCheck ledgerVersion={ledgerVersion} />
      <BudgetEditor ledgerVersion={ledgerVersion} />
    </div>
  )
}
```

### Components

- **FileUploader.tsx** — Drag-and-drop file upload with click-to-browse fallback. Accepts `.csv` and `.pdf` files. Shows per-file results and aggregate counts (total, P&L, transfers). Includes scoped CSS for drop zone styling.

- **PnlTable.tsx** — Fetches yearly and monthly P&L data. Yearly view shows metric cards (Income, Expenses, Net, Result). Monthly view shows a table with color-coded amounts.

- **SpendingPieChart.tsx** — Recharts donut chart of spending by category. Collapses categories below 2% into "Other". Below the chart, a full category breakdown table with income, expenses, net, and transaction count.

- **TransactionList.tsx** — Paginated table of all transactions (initially shows 50, expand to see all). Columns: Date, Description, Amount, Category, Source. Uses composite key `${date}-${description}-${index}`.

- **BudgetEditor.tsx** — Editable table of monthly budget targets per category. Number inputs with save button. Includes error state handling for failed saves.

- **BudgetQuickCheck.tsx** — Current/most-recent month budget snapshot. Shows overall metrics (Budget, Spent, Remaining, % Used) with progress bar. Per-category breakdown with individual progress bars color-coded by usage (green < 85%, yellow 85-100%, red > 100%).

---

## API Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | Upload CSV/PDF files |
| `GET` | `/api/ledger` | All transactions (sorted by date) |
| `GET` | `/api/ledger/transfers` | Transfer-only transactions + summary |
| `GET` | `/api/pnl/monthly` | Monthly P&L (income, expenses, net) |
| `GET` | `/api/pnl/yearly` | Yearly P&L aggregates |
| `GET` | `/api/pnl/categories` | Category breakdown + spending chart data |
| `GET` | `/api/budget` | List monthly budget targets |
| `PUT` | `/api/budget` | Update budget targets |
| `GET` | `/api/budget/vs-actual` | Budget vs actual spending comparison |
| `GET` | `/api/budget/quick-check` | Current month budget status |
| `GET` | `/api/categories` | List all category rules |
| `GET` | `/api/health` | Health check |

---

## Testing

**Backend tests** (pytest):
```bash
cd backend && source .venv/bin/activate && pytest tests/
```

**Frontend tests** (vitest):
```bash
cd frontend && npm run test
```

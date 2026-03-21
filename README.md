# Finance Report Generator

Upload bank and credit card statements (CSV or PDF) and generate Profit & Loss reports with monthly breakdowns, category analysis, and budget tracking.

## Features
- Accepts multiple CSV or PDF uploads (bank + credit card statements).
- Normalizes common column formats into a single ledger.
- Parses Chase PDF statements using word-coordinate clustering.
- Categorizes transactions using regex-based keyword rules.
- Produces yearly and monthly P&L summaries.
- Spending breakdown by category with interactive donut chart.
- Budget management with monthly targets and vs-actual comparison.
- Per-session data isolation via cookies (multi-user safe).

## Quick start

```bash
python run.py
```

This starts the FastAPI backend on `http://localhost:8000` and the React frontend on `http://localhost:5173`. Open `http://localhost:5173` in your browser. `Ctrl+C` stops both.

### Run individually

```bash
# Backend
cd backend && source .venv/bin/activate && uvicorn main:app --reload

# Frontend
cd frontend && npm run dev
```

### First-time setup

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# Frontend
cd frontend && npm install
```

## CSV requirements
The app auto-detects columns. Common patterns it supports:
- Date: `Date`, `Posting Date`, `Transaction Date`, `Posted Date`
- Description: `Description`, `Merchant`, `Payee`, `Details`, `Memo`
- Amount: `Amount`, `Transaction Amount`, `Amt` (negative for expenses, positive for income)
- Or separate: `Debit`/`Withdrawal`/`Charge` + `Credit`/`Deposit`/`Payment`

## PDF support
Chase PDF statements are parsed using a word-coordinate clustering approach. The parser auto-detects the statement year from headers, dates, or filenames. For other banks, export CSVs from your portal.

## Categories
Edit `backend/data/categories.csv` to customize your category rules. Each row has a `category` and a `keywords` regex pattern matched case-insensitively against transaction descriptions.

Transfer categories (Credit Card Payments, Venmo Transfers, Personal Transfers, Investments) are excluded from P&L calculations.

## Budget
Edit `backend/data/budget.csv` or use the Budget page in the UI to set monthly spending targets per category. The Quick Check view shows how your current month tracks against the budget.

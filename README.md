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

## Bill Autopilot + Subscription Center
- Detects likely recurring charges by grouping transactions with normalized merchant names and scoring cadence fit (`weekly`, `monthly`, `annual`) plus amount stability.
- Provides a Subscription Center at `/subscriptions` with:
  - Active recurring streams, confidence, current amount, baseline, and next expected charge date.
  - Filters for active/ignored streams, increased-only, and optional-only.
  - Per-stream actions to ignore false positives, mark essential/optional, and trigger cancel reminders.
- Generates alerts for:
  - `price_increased`
  - `new_recurring_charge_detected`
  - `missed_expected_charge` (optional warning)

### Tuning knobs
- API threshold for price increase detection: `threshold` query param on:
  - `GET /api/subscriptions` (default `0.10`)
  - `GET /api/subscriptions/alerts` (default `0.10`)
- Missed charge warning toggle:
  - `GET /api/subscriptions/alerts?include_missed=true|false` (default `true`)

### Notes
- Subscription preferences (`ignored`, `essential`) are stored per session and cleared when a new upload replaces session ledger data.
- No DB migration is required for this feature.

## Feature 3: Goal-Driven Budgeting
- New goal model fields: `name`, `target_amount`, `target_date` (optional), `priority`, `category`, `status`.
- Goal progress is recomputed from synced transaction history (`contributed_amount`, `remaining_amount`, `progress_pct`, and monthly contribution history).
- Paycheck allocation supports two deterministic modes:
  - `balanced`: larger discretionary share after obligations and safety buffer.
  - `aggressive_savings`: larger goals share after obligations and safety buffer.
- Guardrails:
  - Required obligations are funded first and never under-allocated.
  - Safety buffer is reserved before goals/discretionary split.
  - Minimum emergency contribution is enforced when possible.
  - Goals with target dates are checked for paycheck-level feasibility and warnings are returned when underfunded.
- Users can accept the recommendation directly or edit needs/goals/discretionary and save a custom split.
- "What changed" text compares the latest recommendation to the saved custom split for transparency.

### Allocation Rules + Assumptions
- Inputs: paycheck amount, fixed obligations, safety buffer, emergency minimum, allocation mode, paychecks per month, active goals.
- Processing order: fixed obligations -> safety buffer -> goals/discretionary split -> weighted goal distribution.
- Goal weighting uses priority and date urgency; allocations are capped by each goal's remaining amount and resolved in cents for deterministic output.
- Feasibility assumes `paychecks_per_month` and compares required-per-paycheck vs recommended amount.
- Progress matching uses goal/category token matching against synced negative transactions, with debt keyword fallback for debt goals.

### TODO: Future ML Personalization
- Learn user override patterns to tune default mode and bucket shares per paycheck.
- Learn per-goal contribution propensity from historical acceptance/edit behavior.
- Personalize feasibility confidence by observed paycheck variability and seasonality.

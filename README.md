# Finance Report Generator

A full-stack personal finance analysis app that converts raw bank statements into actionable insights, budgets, and next-best actions.

## What This Project Demonstrates

- Building and shipping a decoupled `FastAPI + React` product
- Parsing messy real-world data inputs (`CSV` and bank statement `PDF`)
- Producing decision-oriented outputs (P&L trends, budget checks, insights, action feed)
- Designing typed APIs and testable frontend/backend modules

## Core Features

- Statement upload via CSV or PDF
- Ledger normalization and categorization
- Monthly and yearly P&L reporting
- Spending visualization and transaction drill-down
- Budget editor and budget-vs-actual analysis
- Goal budgeting planner
- Subscription center workflow
- Insight panel and personalized next-best-action feed

## Architecture

```text
React + Vite (TypeScript)
  -> /api requests
FastAPI (Python)
  -> routers (upload, ledger, pnl, insights, actions, budget, goals, categories, subscriptions)
  -> sdk modules (parsing, categorization, analytics, recommendations)
In-memory session state (development profile)
```

## Tech Stack

- Frontend: React 19, TypeScript, Vite, TanStack Query, Recharts, Vitest, Biome
- Backend: FastAPI, Pandas, pdfplumber, Pydantic
- Tooling: pytest, Ruff, npm

## Quick Start

### Prerequisites

- Python `3.13+`
- Node.js `18+` and npm
- macOS/Linux shell (`bash` or `zsh`)

### One-time setup

From repo root:

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### Run the app

```bash
python3 run.py
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`

## Usage Flow

1. Open `http://localhost:5173`
2. Upload one or more bank/credit-card statements (`.csv` or `.pdf`)
3. Accept the privacy notice (once per browser session)
4. Review Dashboard outputs:
   - P&L tables
   - Spending chart
   - Transaction list
   - Insights and recommended actions
5. Navigate to `Budget`, `Goals`, and `Subscriptions` for planning workflows

## Supported Input Formats

### CSV

The parser auto-detects common column names.

- Date: `Date`, `Posting Date`, `Transaction Date`, `Posted Date`
- Description: `Description`, `Merchant`, `Payee`, `Details`, `Memo`
- Amount: `Amount`, `Transaction Amount`, `Amt`
- Split amount columns are also supported (for example `Debit` + `Credit`)

### PDF

- Chase statements are supported by the current parser
- For non-Chase institutions, CSV export is the recommended path

## Quality Checks

```bash
# Backend tests
cd backend && .venv/bin/pytest -q

# Frontend tests
cd frontend && npm test

# Frontend lint + typecheck
cd frontend && npm run lint && npm run typecheck
```

## Known Constraints

- Data/session state is in-memory in the backend process
- Restarting the backend clears uploaded session data
- PDF parsing is currently optimized for Chase statement layout

## Documentation

- Detailed technical docs: `DOCS.md`
- Feature tuning note: `docs/feature5-action-feed-tuning.md`

## Roadmap

- Persistent storage for multi-session history
- Expanded PDF parser coverage across institutions
- Deployable cloud environment with auth
- CI/CD and release automation

## Troubleshooting

- `python3.13: command not found`
  - Install Python 3.13, then recreate `backend/.venv`
- `ModuleNotFoundError` on backend startup
  - Re-activate venv and reinstall: `pip install -r backend/requirements.txt`
- Frontend fails to start
  - Reinstall dependencies: `cd frontend && npm install`

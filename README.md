# Finance Report Generator

If you want implementation details, API notes, or deeper technical docs, use `DOCS.md`.

## 1. Prerequisites

- Python `3.13+`
- Node.js `18+` and npm
- macOS/Linux shell (commands below use `bash`/`zsh`)

## 2. One-time setup

From the repo root:

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

## 3. Start the app

From the repo root:

```bash
python3 run.py
```

This starts:

- Backend API: `http://localhost:8000`
- Frontend UI: `http://localhost:5173`

Open `http://localhost:5173` in your browser.

## 4. Generate your report

1. On the Dashboard, upload one or more bank/credit-card statements (`.csv` or `.pdf`).
2. Accept the Privacy Notice when prompted (required once per browser session).
3. Review outputs on the Dashboard:
   - P&L tables
   - Spending chart
   - Transaction list
   - Insights and next-best actions
4. Use other tabs as needed:
   - `Budget`
   - `Goals`
   - `Subscriptions`

## 5. Supported input format

### CSV

The parser auto-detects common column names.

- Date: `Date`, `Posting Date`, `Transaction Date`, `Posted Date`
- Description: `Description`, `Merchant`, `Payee`, `Details`, `Memo`
- Amount: `Amount`, `Transaction Amount`, `Amt`
- Or split amount columns: debit/credit style columns (for example `Debit` + `Credit`)

### PDF

- Chase statements are supported by the current PDF parser.
- For other banks, export CSV for best reliability.

## 6. Stop the app

Press `Ctrl+C` in the terminal where `run.py` is running.

## 7. Troubleshooting

- `python3.13: command not found`
  - Install Python 3.13, then recreate `backend/.venv`.
- `ModuleNotFoundError` when starting backend
  - Activate the backend venv and reinstall: `pip install -r backend/requirements.txt`.
- Frontend does not load
  - Reinstall dependencies: `cd frontend && npm install`.
- Upload works but data disappears after restart
  - Upload/session data is stored in memory for the running backend process; restarting clears it.

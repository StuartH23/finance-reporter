# P&L Reporter

Upload bank and credit card statements (CSV or PDF) and generate a yearly Profit & Loss summary with monthly breakdowns.

## What this MVP does
- Accepts multiple CSV or PDF uploads (bank + credit card statements).
- Normalizes common column formats into a single ledger.
- Categorizes transactions using a simple keyword rules file.
- Produces a yearly P&L summary and a month-by-month view.

## Quick start
1. Create a virtual environment and install dependencies.
2. Run the app.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

## CSV requirements
This app will try to auto-detect columns, but these are common patterns it supports:
- Date: `Date`, `Posting Date`, `Transaction Date`
- Description: `Description`, `Merchant`, `Payee`, `Details`
- Amount: `Amount` (negative for expenses, positive for income)
- Or separate: `Debit` + `Credit`

If your columns don’t map cleanly, the app will show you what it detected.

## PDF notes
PDF extraction is best-effort. If the app can’t find tables, export CSVs from your bank/credit card portal and upload those instead.

## Categories
Edit `categories.csv` to customize your category rules. The app will match keywords (case-insensitive) in the Description.

## Next steps (we can add)
- PDF statement parsing
- Rules editor UI
- Tax-time export (Schedule C style)
- Account/statement tagging

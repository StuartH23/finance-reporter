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

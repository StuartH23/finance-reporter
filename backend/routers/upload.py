"""File upload and parsing endpoint."""

import io
import os
import time
import uuid
from collections.abc import Callable

import pandas as pd
import pdfplumber
from fastapi import APIRouter, Cookie, File, HTTPException, Request, Response, UploadFile

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

# Per-session storage keyed by session ID. Session ownership is tracked
# separately so authenticated users cannot read another user's cookie-backed data.
_sessions: dict[str, list[pd.DataFrame]] = {}
_session_owners: dict[str, str] = {}
_session_last_seen: dict[str, float] = {}
_session_subscription_preferences: dict[str, dict[str, dict[str, bool]]] = {}
_session_action_state: dict[str, dict] = {}
_session_cleanup_callbacks: list[Callable[[str], None]] = []

EMPTY_LEDGER = pd.DataFrame(columns=["date", "description", "amount", "category", "source_file"])
PRODUCTION_ENVS = {"prod", "production"}
PUBLIC_SESSION_OWNER = "public"
MAX_UPLOAD_FILES = int(os.getenv("MAX_UPLOAD_FILES", "5"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_UPLOAD_TOTAL_BYTES = int(
    os.getenv("MAX_UPLOAD_TOTAL_BYTES", str(MAX_UPLOAD_BYTES * MAX_UPLOAD_FILES))
)
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "25"))
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", str(24 * 60 * 60)))


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _session_cookie_options() -> dict[str, object]:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    samesite = os.getenv("SESSION_COOKIE_SAMESITE", "lax").strip().lower()
    if samesite not in {"lax", "strict", "none"}:
        samesite = "lax"

    secure = _env_flag("SESSION_COOKIE_SECURE", app_env in PRODUCTION_ENVS)
    if samesite == "none":
        secure = True

    return {"httponly": True, "samesite": samesite, "secure": secure}


def _session_owner(request: Request | None = None) -> str | None:
    if request is None:
        return None
    current_user = getattr(request.state, "current_user", None)
    if current_user is None:
        return PUBLIC_SESSION_OWNER
    return str(current_user.user_id)


def _session_belongs_to_owner(session_id: str, owner: str | None) -> bool:
    if owner is None:
        return True
    return _session_owners.get(session_id) == owner


def _drop_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
    _session_owners.pop(session_id, None)
    _session_last_seen.pop(session_id, None)
    _session_subscription_preferences.pop(session_id, None)
    _session_action_state.pop(session_id, None)
    for callback in _session_cleanup_callbacks:
        callback(session_id)


def register_session_cleanup(callback: Callable[[str], None]) -> None:
    """Register cleanup for session-scoped stores owned by other modules."""
    _session_cleanup_callbacks.append(callback)


def _prune_expired_sessions() -> None:
    if SESSION_TTL_SECONDS <= 0:
        return
    cutoff = time.time() - SESSION_TTL_SECONDS
    for session_id, last_seen in list(_session_last_seen.items()):
        if last_seen < cutoff:
            _drop_session(session_id)


def _touch_session(session_id: str) -> None:
    _session_last_seen[session_id] = time.time()


def session_is_accessible(session_id: str | None, request: Request | None = None) -> bool:
    """Return whether the request may access the session-scoped state."""
    _prune_expired_sessions()
    if not session_id or session_id not in _sessions:
        return False
    accessible = _session_belongs_to_owner(session_id, _session_owner(request))
    if accessible:
        _touch_session(session_id)
    return accessible


def get_session_ledger(
    session_id: str | None = None,
    request: Request | None = None,
) -> pd.DataFrame:
    """Return the combined session ledger for a given session."""
    _prune_expired_sessions()
    if not session_id or session_id not in _sessions:
        return EMPTY_LEDGER.copy()
    if not _session_belongs_to_owner(session_id, _session_owner(request)):
        return EMPTY_LEDGER.copy()
    _touch_session(session_id)
    frames = _sessions[session_id]
    if not frames:
        return EMPTY_LEDGER.copy()
    return pd.concat(frames, ignore_index=True)


def clear_session(session_id: str, request: Request | None = None) -> None:
    """Clear stored ledger data for a session."""
    _prune_expired_sessions()
    if not _session_belongs_to_owner(session_id, _session_owner(request)):
        return
    if session_id in _sessions:
        _sessions[session_id].clear()
    if session_id in _session_subscription_preferences:
        _session_subscription_preferences[session_id].clear()
    if session_id in _session_action_state:
        _session_action_state[session_id].clear()


def get_subscription_preferences(
    session_id: str | None,
    request: Request | None = None,
) -> dict[str, dict[str, bool]]:
    """Return per-stream subscription preferences for a given session."""
    _prune_expired_sessions()
    if not session_id:
        return {}
    if not _session_belongs_to_owner(session_id, _session_owner(request)):
        return {}
    _touch_session(session_id)
    return _session_subscription_preferences.setdefault(session_id, {})


def get_action_state(session_id: str | None, request: Request | None = None) -> dict:
    """Return in-memory action ranking state for a session."""
    _prune_expired_sessions()
    if not session_id:
        return {}
    if not _session_belongs_to_owner(session_id, _session_owner(request)):
        return {}
    _touch_session(session_id)
    return _session_action_state.setdefault(session_id, {})


def set_subscription_preference(
    session_id: str | None,
    stream_id: str,
    request: Request | None = None,
    *,
    ignored: bool | None = None,
    essential: bool | None = None,
) -> None:
    """Set stream preference flags for a session."""
    _prune_expired_sessions()
    if not session_id:
        return
    if not _session_belongs_to_owner(session_id, _session_owner(request)):
        return
    _touch_session(session_id)
    preferences = _session_subscription_preferences.setdefault(session_id, {})
    stream = preferences.setdefault(stream_id, {})
    if ignored is not None:
        stream["ignored"] = ignored
    if essential is not None:
        stream["essential"] = essential


def _ensure_session(
    session_id: str | None,
    response: Response,
    request: Request | None = None,
) -> str:
    """Return existing session ID or create a new one and set cookie."""
    _prune_expired_sessions()
    owner = _session_owner(request)
    if session_id and session_id in _sessions and _session_belongs_to_owner(session_id, owner):
        _touch_session(session_id)
        return session_id
    sid = str(uuid.uuid4())
    _sessions[sid] = []
    _session_owners[sid] = owner or PUBLIC_SESSION_OWNER
    _touch_session(sid)
    _session_action_state[sid] = {}
    response.set_cookie(key="session_id", value=sid, **_session_cookie_options())
    return sid


def ensure_session_id(
    response: Response,
    session_id: str | None = None,
    request: Request | None = None,
) -> str:
    """Public wrapper for ensuring a session exists and returning its ID."""
    return _ensure_session(session_id, response, request)


@router.post("/upload", response_model=UploadResponse)
async def upload_files(
    request: Request,
    response: Response,
    files: list[UploadFile] = File(...),
    session_id: str | None = Cookie(default=None),
):
    """Upload CSV/PDF files, parse them, and return the combined ledger."""
    if len(files) > MAX_UPLOAD_FILES:
        raise HTTPException(status_code=413, detail=f"Upload at most {MAX_UPLOAD_FILES} files.")

    sid = _ensure_session(session_id, response, request)

    categories = load_categories(
        str(
            __import__("pathlib").Path(__file__).resolve().parent.parent / "data" / "categories.csv"
        )
    )

    results = []
    staged_ledgers: list[pd.DataFrame] = []
    total_upload_bytes = 0

    for uploaded in files:
        content = await uploaded.read()
        total_upload_bytes += len(content)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"{uploaded.filename or 'file'} exceeds the "
                    f"{MAX_UPLOAD_BYTES} byte upload limit."
                ),
            )
        if total_upload_bytes > MAX_UPLOAD_TOTAL_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Upload request exceeds the {MAX_UPLOAD_TOTAL_BYTES} byte total limit.",
            )
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
        staged_ledgers.append(ledger_df)
        results.append({"file": filename, "status": "ok", "transactions": len(ledger_df)})

    clear_session(sid, request)
    _sessions[sid].extend(staged_ledgers)

    combined = get_session_ledger(sid, request)
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
        if len(pdf.pages) > MAX_PDF_PAGES:
            raise HTTPException(
                status_code=413,
                detail=f"{filename} exceeds the {MAX_PDF_PAGES} page PDF limit.",
            )
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

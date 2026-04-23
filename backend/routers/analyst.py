"""Financial analyst chat endpoint backed by Claude Haiku 4.5.

Requires ANTHROPIC_API_KEY in the environment. Rate-limited to 5 requests per
30 minutes per session_id cookie (applies to guest and signed-in users alike).
"""

import os
import time
from collections import deque

import anthropic
import pandas as pd
from fastapi import APIRouter, Cookie, HTTPException, Response

from routers.upload import ensure_session_id, get_session_ledger
from schemas import AnalystChatRequest, AnalystChatResponse

router = APIRouter(tags=["analyst"])

RATE_LIMIT_MAX = 5
RATE_LIMIT_WINDOW_SECONDS = 30 * 60
MAX_LEDGER_ROWS = 6000
MAX_TOKENS = 1024
MODEL_ID = "claude-haiku-4-5"

SYSTEM_PROMPT = """You are a personal financial analyst. The user may upload one or more statements (CSV or PDF) spanning multiple months or years. All transactions are combined into a single ledger CSV with columns: date, description, amount, category, source_file. Positive amounts are income; negative are expenses. Categories in {Credit Card Payments, Venmo Transfers, Personal Transfers, Investments} are transfers — exclude them from P&L unless explicitly asked.

Your job:
- Answer questions about spending, income, trends, and anomalies
- Produce monthly or yearly P&L on demand (income, expenses, net)
- Break down spending by category and flag outliers vs prior months
- Detect recurring charges and subscriptions from repeated merchants and amounts
- Compare against a budget if the user provides one (category → monthly target)
- Recommend concrete next actions with dollar impact (e.g. "cancel X, save $Y/mo")

Rules:
- Before writing any dollar figure, sum the relevant rows from the CSV first. Never estimate or eyeball a total.
- Every dollar amount you state must be an exact sum from the data, rounded to the nearest cent (e.g. $3,842.17). This applies to category totals, annual totals, per-merchant totals, and savings estimates derived from the data.
- Never use ~, ≈, +, "about", "around", or ranges (e.g. "$X–$Y") for any amount you can calculate. If you cannot calculate it exactly, say so explicitly rather than guessing.
- Always cite the month or date range a number came from
- If a question needs data you don't have, ask — don't invent
- Prefer tables and short bullets over long prose
- Percentages to 1 decimal place
- When the user asks an open question ("how am I doing?"), lead with the headline number, then 3–5 supporting bullets, then one recommended action"""

_rate_limits: dict[str, deque[float]] = {}


def _check_rate_limit(session_id: str) -> None:
    """Raise 429 if the session has exceeded RATE_LIMIT_MAX within the window."""
    now = time.time()
    bucket = _rate_limits.setdefault(session_id, deque())
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT_MAX:
        retry_after = max(1, int(bucket[0] + RATE_LIMIT_WINDOW_SECONDS - now))
        raise HTTPException(
            status_code=429,
            detail="Rate limit reached (5 questions per 30 min).",
            headers={"Retry-After": str(retry_after)},
        )
    bucket.append(now)


def _ledger_to_csv(df: pd.DataFrame) -> str:
    """Serialize the ledger to CSV. If rows exceed the cap, sample uniformly
    across the full date range so all years remain represented."""
    if df.empty:
        return "(no ledger uploaded yet)"
    if "date" in df.columns:
        df = df.sort_values("date")
    if len(df) > MAX_LEDGER_ROWS:
        df = df.sample(n=MAX_LEDGER_ROWS, random_state=0).sort_values("date")
    return df.to_csv(index=False)


@router.post("/analyst/chat", response_model=AnalystChatResponse)
def analyst_chat(
    req: AnalystChatRequest,
    response: Response,
    session_id: str | None = Cookie(default=None),
):
    """Answer a financial question about the session's ledger."""
    sid = ensure_session_id(response, session_id)
    _check_rate_limit(sid)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured.")

    if not req.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty.")

    ledger_csv = _ledger_to_csv(get_session_ledger(sid))
    client = anthropic.Anthropic(api_key=api_key)

    try:
        result = client.messages.create(
            model=MODEL_ID,
            max_tokens=MAX_TOKENS,
            system=[
                {"type": "text", "text": SYSTEM_PROMPT},
                {
                    "type": "text",
                    "text": f"Ledger CSV:\n{ledger_csv}",
                    "cache_control": {"type": "ephemeral"},
                },
            ],
            messages=[{"role": m.role, "content": m.content} for m in req.messages],
        )
    except anthropic.RateLimitError as exc:
        raise HTTPException(
            status_code=503, detail="Upstream model rate limit."
        ) from exc
    except anthropic.APIStatusError as exc:
        raise HTTPException(
            status_code=502, detail=f"Upstream model error: {exc.message}"
        ) from exc
    except anthropic.APIConnectionError as exc:
        raise HTTPException(
            status_code=502, detail="Could not reach model API."
        ) from exc

    text = next(
        (b.text for b in result.content if getattr(b, "type", None) == "text"), ""
    )
    return AnalystChatResponse(content=text)

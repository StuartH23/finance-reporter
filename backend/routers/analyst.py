"""Financial analyst chat endpoint backed by Claude Haiku 4.5.

Requires ANTHROPIC_API_KEY in the environment. Rate-limited to 5 requests per
30 minutes per session_id cookie (applies to guest and signed-in users alike).
"""

import os
import time
from collections import deque

import anthropic
import pandas as pd
from fastapi import APIRouter, Cookie, Header, HTTPException, Request, Response

from auth import get_auth_settings
from routers.upload import ensure_session_id, get_session_ledger
from schemas import AnalystChatRequest, AnalystChatResponse

router = APIRouter(tags=["analyst"])

RATE_LIMIT_MAX = 5
RATE_LIMIT_WINDOW_SECONDS = 30 * 60
MAX_LEDGER_ROWS = 6000
MAX_TOKENS = 1024
MODEL_ID = "claude-haiku-4-5"

SYSTEM_PROMPT = """You are a personal financial analyst and budget optimizer.

## Data Context
The user may upload one or more financial statements (CSV or PDF). All transactions are normalized into a single ledger CSV with the following columns:

- date (ISO format preferred)
- description (merchant or memo)
- amount (positive = income, negative = expense)
- category
- source_file (origin of transaction)

### Category Rules
The following categories are considered transfers and must be excluded from income/expense calculations unless explicitly requested:
{Credit Card Payments, Venmo Transfers, Personal Transfers, Investments}

## Conversation Awareness
You have access to the full conversation history. Reference prior messages and answers when relevant — do not treat each question as stateless. If the user refers to something you said earlier, use that context rather than recalculating from scratch.

## Core Responsibilities
You must:
1. Answer questions about spending, income, trends, and anomalies
2. Generate monthly or yearly P&L (income, expenses, net)
3. Break down spending by category and identify outliers vs prior periods
4. Detect recurring charges (subscriptions) using repeated merchants and amounts
5. Audit subscriptions and suggest cancellation opportunities
6. Apply the 50/30/20 rule (needs / wants / savings) to evaluate spending allocation
7. Compare actuals vs a user-provided budget (category → monthly target)
8. Build debt payoff strategies on request:
   - Avalanche (highest interest rate first)
   - Snowball (smallest balance first)
   Include payoff timeline and total interest impact
9. Calculate an emergency fund target based on essential monthly expenses:
   - 3-month and 6-month targets
10. Recommend specific, actionable optimizations with clear dollar impact

## Calculation Rules (STRICT)
- ALL dollar figures MUST be computed directly from the dataset
- NEVER estimate, approximate, or infer missing values
- Round all currency to exactly 2 decimal places (e.g. $3,842.17)
- Do NOT use: ~, ≈, "about", "around", ranges (e.g. $X–$Y), or guesses
- If exact calculation is not possible → explicitly say: "Insufficient data to calculate"
- Always specify the exact date range used for every number
- Percentages must be rounded to 1 decimal place

## Analytical Standards
- Detect anomalies by comparing against historical monthly averages
- Flag unusually large or new expenses
- Identify spending trends (increasing, decreasing, stable)
- Clearly distinguish between needs vs wants when applying 50/30/20

## Output Format
- Prefer structured outputs:
  - Tables for financial breakdowns
  - Short bullet points for insights
- Avoid long paragraphs unless necessary

## Open-Ended Questions
If the user asks something broad (e.g., "How am I doing?"), respond in this order:
1. Headline metric (net savings or deficit)
2. 3–5 key insights
3. 1 high-impact recommendation

## Required Ending Section
Every substantive response MUST end with:

**Next Steps**
- 2–3 prioritized, specific actions
- Each must include a clear dollar impact (e.g., "$42.13/month saved") OR a concrete timeline

## Clarification Rule
If the request cannot be completed with the available data:
- Ask a targeted follow-up question
- Do NOT fabricate or assume missing data

## Tone
- Direct, analytical, and practical
- Focus on clarity and decision-making
- No fluff, no generic advice"""

_rate_limits: dict[str, deque[float]] = {}


def _is_authenticated(authorization: str | None) -> bool:
    """Return True if the request carries a valid auth token or auth is disabled."""
    try:
        settings = get_auth_settings()
    except Exception:
        return False
    from auth import LOCAL_AUTH_MODES
    if settings.mode in LOCAL_AUTH_MODES:
        return True
    if not authorization:
        return False
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return False
    try:
        from auth import _decode_cognito_access_token
        _decode_cognito_access_token(token.strip(), settings)
        return True
    except Exception:
        return False


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


def _evenly_spaced_years(years: list[int], count: int) -> list[int]:
    """Pick years spread across the available range when the cap is smaller."""
    if count >= len(years):
        return years
    if count == 1:
        return [years[len(years) // 2]]
    return [years[round(i * (len(years) - 1) / (count - 1))] for i in range(count)]


def _sample_invalid_fill(
    valid: pd.DataFrame, invalid: pd.DataFrame, cap: int, random_state: int
) -> pd.DataFrame:
    """Return all valid rows plus enough invalid-date rows to reach the cap."""
    if invalid.empty:
        return valid
    remainder = cap - len(valid)
    sampled_invalid = invalid.sample(
        n=min(remainder, len(invalid)), random_state=random_state
    )
    return pd.concat([valid, sampled_invalid], ignore_index=False)


def _allocate_year_rows(counts: pd.Series, cap: int) -> pd.Series:
    """Allocate a capped row budget while guaranteeing one row per year."""
    allocation = pd.Series(1, index=counts.index, dtype="int64")
    slack = counts - allocation
    remaining = cap - int(allocation.sum())

    if remaining <= 0 or int(slack.sum()) <= 0:
        return allocation

    scaled = slack * remaining / slack.sum()
    extra = scaled.astype(int).clip(upper=slack)
    allocation += extra
    remaining -= int(extra.sum())

    if remaining <= 0:
        return allocation

    fractional = (scaled - extra).sort_values(ascending=False)
    for year in fractional.index:
        if remaining == 0:
            break
        if allocation[year] < counts[year]:
            allocation[year] += 1
            remaining -= 1
    return allocation


def _sample_year_groups(
    valid: pd.DataFrame, allocation: pd.Series, random_state: int
) -> pd.DataFrame:
    """Sample each year group according to its allocated row count."""
    sampled = []
    for year, year_count in allocation.items():
        year_frame = valid[valid["year"] == year].drop(columns="year")
        sampled.append(
            year_frame.sample(n=int(year_count), random_state=random_state + int(year))
        )
    return pd.concat(sampled, ignore_index=False)


def _sample_ledger_across_years(
    df: pd.DataFrame, cap: int, random_state: int = 0
) -> pd.DataFrame:
    """Downsample by year so dense periods do not crowd out sparse years."""
    if len(df) <= cap:
        return df
    if "date" not in df.columns:
        return df.sample(n=cap, random_state=random_state)

    valid = df[df["date"].notna()].copy()
    invalid = df[df["date"].isna()].copy()
    if valid.empty:
        return df.sample(n=cap, random_state=random_state)
    if len(valid) <= cap:
        return _sample_invalid_fill(valid, invalid, cap, random_state)

    valid["year"] = valid["date"].dt.year
    counts = valid.groupby("year").size().sort_index()
    years = counts.index.tolist()

    if cap < len(years):
        allocation = pd.Series(1, index=_evenly_spaced_years(years, cap), dtype="int64")
        return _sample_year_groups(valid, allocation, random_state)

    allocation = _allocate_year_rows(counts, cap)
    return _sample_year_groups(valid, allocation, random_state)


def _ledger_to_csv(df: pd.DataFrame) -> str:
    """Serialize the ledger to CSV.

    If rows exceed the cap, sample across calendar years so all available
    periods remain represented instead of favoring dense recent years.
    """
    if df.empty:
        return "(no ledger uploaded yet)"
    if "date" in df.columns:
        df = df.sort_values("date")
    if len(df) > MAX_LEDGER_ROWS:
        df = _sample_ledger_across_years(df, MAX_LEDGER_ROWS, random_state=0)
        if "date" in df.columns:
            df = df.sort_values("date")
    return df.to_csv(index=False)


def _demo_ledger_csv_to_prompt_csv(demo_ledger_csv: str) -> str:
    import io

    df = pd.read_csv(io.StringIO(demo_ledger_csv))
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
    return _ledger_to_csv(df)


def _call_analyst_model(req: AnalystChatRequest, ledger_csv: str) -> AnalystChatResponse:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured.")

    if not req.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty.")

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


def build_analyst_response(req: AnalystChatRequest, ledger: pd.DataFrame) -> AnalystChatResponse:
    if req.demo_ledger_csv:
        ledger_csv = _demo_ledger_csv_to_prompt_csv(req.demo_ledger_csv)
    else:
        ledger_csv = _ledger_to_csv(ledger)
    return _call_analyst_model(req, ledger_csv)


@router.post("/analyst/chat", response_model=AnalystChatResponse)
def analyst_chat(
    req: AnalystChatRequest,
    request: Request,
    response: Response,
    session_id: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
):
    """Answer a financial question about the session's ledger."""
    sid = ensure_session_id(response, session_id, request)

    ledger = get_session_ledger(sid, request)
    if ledger.empty and not req.demo_ledger_csv and not _is_authenticated(authorization):
        raise HTTPException(
            status_code=401,
            detail="Authentication required or demo session must be initialized.",
        )

    _check_rate_limit(sid)
    return build_analyst_response(req, ledger)

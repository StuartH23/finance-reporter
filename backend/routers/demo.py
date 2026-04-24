"""Demo session seeding endpoint.

Provides unauthenticated endpoints to load demo transaction data into the
current session (so the AI analyst can answer questions about it) and to
clear that data when the user exits demo mode or signs in.
"""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, Cookie, Response
from pydantic import BaseModel

from routers.upload import _sessions, clear_session, ensure_session_id

router = APIRouter(tags=["demo"])


class DemoTransaction(BaseModel):
    date: str
    description: str
    amount: float
    category: str
    source_file: str


class DemoSeedRequest(BaseModel):
    transactions: list[DemoTransaction]


class DemoSeedResponse(BaseModel):
    status: str
    count: int


class DemoClearResponse(BaseModel):
    status: str


@router.post("/demo/seed", response_model=DemoSeedResponse)
def seed_demo_session(
    req: DemoSeedRequest,
    response: Response,
    session_id: str | None = Cookie(default=None),
):
    """Load demo transactions into the session so AI endpoints can use them."""
    sid = ensure_session_id(response, session_id)
    _sessions[sid] = []
    if req.transactions:
        records = [t.model_dump() for t in req.transactions]
        df = pd.DataFrame(records)
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        _sessions[sid] = [df]
    return DemoSeedResponse(status="ok", count=len(req.transactions))


@router.post("/demo/clear", response_model=DemoClearResponse)
def clear_demo_session(
    session_id: str | None = Cookie(default=None),
):
    """Clear demo data from the session."""
    if session_id:
        clear_session(session_id)
    return DemoClearResponse(status="ok")

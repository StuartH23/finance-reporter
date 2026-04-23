"""Conversational chat agent powered by Anthropic Claude Haiku.

Exposes a single POST /api/chat endpoint that takes a rolling transcript of
messages and returns the assistant's next reply. The agent can call a small
set of aggregation tools over the session's ledger.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path

import anthropic
from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel

from routers.upload import get_session_ledger, get_subscription_preferences
from sdk.chat_tools import (
    ledger_date_bounds,
    list_subscriptions_tool,
    month_over_month_delta,
    spending_by_category,
    top_merchants,
    unusual_charges,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])

MODEL = os.getenv("CHAT_MODEL", "claude-haiku-4-5-20251001")
MAX_TOOL_ITERATIONS = 6
MAX_TOKENS = 1024
DOCS_PATH = Path(__file__).resolve().parent.parent.parent / "DOCS.md"


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list[str]


TOOLS = [
    {
        "name": "ledger_date_bounds",
        "description": (
            "Return the earliest and latest transaction dates in the user's ledger, "
            "plus the total transaction count. Call this first if you need to pick a "
            "date range but don't know what data is available."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "top_merchants",
        "description": (
            "Largest merchants by total spend in a date range. Use for 'where is my "
            "money going' or 'who am I spending the most on' questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "YYYY-MM-DD (optional)"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD (optional)"},
                "limit": {"type": "integer", "default": 10},
            },
        },
    },
    {
        "name": "spending_by_category",
        "description": (
            "Total spend grouped by category for a date range. Use for 'where does my "
            "money go by category' questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "YYYY-MM-DD (optional)"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD (optional)"},
            },
        },
    },
    {
        "name": "month_over_month_delta",
        "description": (
            "Compare per-category spending in one month against the prior month. Use "
            "for 'what changed' or 'where is my money leaking' questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "string", "description": "YYYY-MM"},
            },
            "required": ["month"],
        },
    },
    {
        "name": "list_subscriptions",
        "description": (
            "Detected recurring charges (subscriptions) with cadence, amount trend, "
            "and price-increase flags. Use for subscription or recurring-charge questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "active_only": {"type": "boolean", "default": True},
            },
        },
    },
    {
        "name": "unusual_charges",
        "description": (
            "Transactions more than 2 standard deviations above a merchant's typical "
            "amount in the last N days. Use for 'any unusual charges' questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "lookback_days": {"type": "integer", "default": 90},
            },
        },
    },
]


SYSTEM_INSTRUCTIONS = """You are the finance-reporter assistant. You help the user
understand their own transaction data, spending patterns, and subscriptions.

You have two jobs:
1. Answer questions about how the application works, using the documentation below.
2. Answer questions about the user's money by calling tools, then summarizing the
   result in plain English with concrete dollar figures.

Rules:
- For any question about the user's money, call a tool. Never guess numbers.
- Quote merchant names and amounts exactly as returned by the tools.
- If a tool returns an empty result, say so plainly — do not invent data.
- Keep replies under 5 sentences unless the user asks for more detail.
- If you don't know the available date range, call ledger_date_bounds first.
- Round dollar amounts to whole dollars in prose unless precision matters.
"""


@lru_cache(maxsize=1)
def _docs_block() -> str:
    try:
        return DOCS_PATH.read_text(encoding="utf-8")
    except OSError:
        logger.warning("DOCS.md not readable at %s; continuing without it", DOCS_PATH)
        return ""


@lru_cache(maxsize=1)
def _client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return anthropic.Anthropic(api_key=api_key)


def _system_blocks() -> list[dict]:
    docs = _docs_block()
    system_text = SYSTEM_INSTRUCTIONS
    if docs:
        system_text += "\n\n# Application documentation\n<docs>\n" + docs + "\n</docs>"
    return [
        {
            "type": "text",
            "text": system_text,
            "cache_control": {"type": "ephemeral"},
        }
    ]


def _run_tool(name: str, args: dict, session_id: str | None) -> dict:
    ledger = get_session_ledger(session_id)
    if name == "ledger_date_bounds":
        return ledger_date_bounds(ledger)
    if name == "top_merchants":
        return top_merchants(ledger, **args)
    if name == "spending_by_category":
        return spending_by_category(ledger, **args)
    if name == "month_over_month_delta":
        return month_over_month_delta(ledger, **args)
    if name == "list_subscriptions":
        prefs = get_subscription_preferences(session_id)
        return list_subscriptions_tool(ledger, preferences=prefs, **args)
    if name == "unusual_charges":
        return unusual_charges(ledger, **args)
    raise ValueError(f"Unknown tool: {name}")


def _to_anthropic_messages(history: list[ChatMessage]) -> list[dict]:
    """Convert inbound plain-text messages to Anthropic's format."""
    out: list[dict] = []
    for msg in history:
        if msg.role not in {"user", "assistant"}:
            raise HTTPException(status_code=400, detail=f"Invalid role: {msg.role}")
        out.append({"role": msg.role, "content": msg.content})
    return out


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest, session_id: str | None = Cookie(default=None)):
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages is required")

    try:
        client = _client()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    messages = _to_anthropic_messages(request.messages)
    tool_calls: list[str] = []

    for _ in range(MAX_TOOL_ITERATIONS):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=_system_blocks(),
                tools=TOOLS,
                messages=messages,
            )
        except anthropic.APIError as exc:
            logger.exception("Anthropic API error")
            raise HTTPException(status_code=502, detail=f"Chat backend error: {exc}") from exc

        if response.stop_reason != "tool_use":
            reply = "".join(
                block.text for block in response.content if block.type == "text"
            ).strip()
            return ChatResponse(reply=reply or "(no response)", tool_calls=tool_calls)

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            tool_calls.append(block.name)
            try:
                result = _run_tool(block.name, dict(block.input), session_id)
                content = json.dumps(result, default=str)
                is_error = False
            except Exception as exc:
                logger.exception("Tool %s failed", block.name)
                content = json.dumps({"error": str(exc)})
                is_error = True
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": content,
                    "is_error": is_error,
                }
            )

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    raise HTTPException(status_code=504, detail="Chat agent exceeded tool-call limit")

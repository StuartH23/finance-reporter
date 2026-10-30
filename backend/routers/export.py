"""Full-account export and JSON backup restore."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse

from routers.goals import (
    export_goal_state,
    replace_saved_paycheck_plan,
    replace_session_goals,
)
from routers.ledger import _format_transactions
from routers.upload import (
    ensure_session_id,
    get_action_state,
    get_session_ledger,
    get_subscription_preferences,
    replace_imported_session,
    session_is_accessible,
)
from sdk.budget import load_budget, save_budget
from sdk.categories import load_category_rules, save_category_rules
from sdk.export_bundle import (
    BackupValidationError,
    assemble_backup,
    backup_counts,
    backup_preview,
    dumps_backup,
    materialize_action_state,
    materialize_budgets,
    materialize_category_rules,
    materialize_goals,
    materialize_paycheck_plan,
    materialize_subscription_preferences,
    materialize_transactions,
    parse_backup,
    render_xlsx,
    render_zip,
)
from sdk.subscriptions import build_subscription_payload

router = APIRouter(tags=["export"])


def _utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _collect_backup(request: Request, session_id: str | None) -> dict:
    ledger = get_session_ledger(session_id, request)
    if ledger.empty:
        transactions: list[dict] = []
    else:
        ordered = ledger.sort_values(["date", "transaction_id"], kind="mergesort")
        transactions = _format_transactions(ordered)

    budgets = [
        {"category": category, "monthly_budget": float(amount)}
        for category, amount in load_budget().items()
    ]
    accessible = bool(session_id) and session_is_accessible(session_id, request)
    preferences = get_subscription_preferences(session_id, request) if accessible else {}
    subscriptions = build_subscription_payload(ledger, preferences)
    if accessible and session_id is not None:
        goals, paycheck_plan = export_goal_state(session_id, ledger)
        action_state = get_action_state(session_id, request)
    else:
        goals = []
        paycheck_plan = None
        action_state = {}

    return assemble_backup(
        exported_at=_utc_now_iso(),
        transactions=transactions,
        budgets=budgets,
        category_rules=load_category_rules(),
        subscriptions=subscriptions,
        goals=goals,
        paycheck_plan=paycheck_plan,
        action_state=action_state,
    )


async def _read_backup(request: Request) -> dict:
    try:
        payload = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Backup must be JSON.") from exc
    try:
        return parse_backup(payload)
    except BackupValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _attachment(payload: bytes | str, media_type: str, filename: str) -> StreamingResponse:
    body = payload.encode("utf-8") if isinstance(payload, str) else payload
    return StreamingResponse(
        iter([body]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export")
def download_export(
    request: Request,
    session_id: str | None = Cookie(default=None),
    format: str = Query(default="zip", pattern="^(xlsx|zip|json)$"),
):
    """Download every saved record as a workbook, a CSV zip, or JSON."""
    document = _collect_backup(request, session_id)
    exported_on = str(document["exported_at"])[:10]
    if format == "json":
        return _attachment(
            dumps_backup(document),
            "application/json",
            f"finance-export-{exported_on}.json",
        )
    if format == "xlsx":
        return _attachment(
            render_xlsx(document),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"finance-export-{exported_on}.xlsx",
        )
    return _attachment(render_zip(document), "application/zip", f"finance-export-{exported_on}.zip")


@router.post("/export/preview")
async def preview_backup(request: Request):
    """Validate a JSON backup and describe what restore would replace."""
    document = await _read_backup(request)
    return backup_preview(document)


@router.post("/export/restore")
async def restore_backup(
    request: Request,
    response: Response,
    session_id: str | None = Cookie(default=None),
):
    """Replace the current account data with a previously exported JSON backup."""
    document = await _read_backup(request)
    sid = ensure_session_id(response, session_id, request)
    frame, overrides = materialize_transactions(document)
    save_budget(materialize_budgets(document))
    save_category_rules(materialize_category_rules(document))
    replace_imported_session(
        sid,
        ledger=frame,
        category_overrides=overrides,
        subscription_preferences=materialize_subscription_preferences(document),
        action_state=materialize_action_state(document),
        request=request,
    )
    replace_session_goals(sid, materialize_goals(document))
    replace_saved_paycheck_plan(sid, materialize_paycheck_plan(document))
    return {"status": "restored", "version": 1, "counts": backup_counts(document)}

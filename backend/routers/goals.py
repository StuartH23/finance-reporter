"""Goal-driven budgeting and paycheck planning endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, HTTPException, Request, Response

from routers.upload import (
    ensure_session_id,
    get_session_ledger,
    register_session_cleanup,
    session_is_accessible,
)
from schemas import (
    GoalCreate,
    GoalListResponse,
    GoalUpdate,
    GoalUpsertResponse,
    PaycheckObligation,
    PaycheckPlanRequest,
    PaycheckPlanResponse,
    PaycheckPlanSaveRequest,
    PaycheckPlanSaveResponse,
    SavedPaycheckPlanResponse,
)
from sdk.goals import (
    AllocationGoal,
    AllocationInput,
    build_paycheck_plan,
    compute_goal_progress,
    what_changed_lines,
)

router = APIRouter(tags=["goals"])

_session_goals: dict[str, list[dict]] = {}
_session_saved_plans: dict[str, dict] = {}


def _clear_goal_session(session_id: str) -> None:
    _session_goals.pop(session_id, None)
    _session_saved_plans.pop(session_id, None)


register_session_cleanup(_clear_goal_session)


def _utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _goal_store(session_id: str) -> list[dict]:
    return _session_goals.setdefault(session_id, [])


def _progress_enriched_goal(goal: dict, ledger) -> dict:
    progress = compute_goal_progress(
        ledger,
        goal_name=goal["name"],
        goal_category=goal["category"],
        target_amount=float(goal["target_amount"]),
    )
    return {
        **goal,
        **progress,
    }


def _enriched_goals(session_id: str, ledger) -> list[dict]:
    return [_progress_enriched_goal(goal, ledger) for goal in _goal_store(session_id)]


def _obligations_total(obligations: list[PaycheckObligation]) -> float:
    return round(sum(float(item.amount) for item in obligations), 2)


def _validate_saved_split(data: PaycheckPlanSaveRequest) -> None:
    total = round(
        data.needs + data.goals + data.discretionary + data.safety_buffer_reserved,
        2,
    )
    if abs(total - data.paycheck_amount) > 0.01:
        raise HTTPException(status_code=400, detail="Saved split must total the paycheck amount.")

    fixed_total = _obligations_total(data.fixed_obligations)
    if data.needs + 0.01 < fixed_total:
        raise HTTPException(
            status_code=400,
            detail="Needs allocation cannot fall below fixed obligations.",
        )

    goal_total = round(
        sum(float(item.recommended_amount) for item in data.goal_allocations),
        2,
    )
    if abs(goal_total - data.goals) > 0.01:
        raise HTTPException(
            status_code=400,
            detail="Goal allocation rows must sum to the goals bucket total.",
        )

    emergency_rows = [
        item for item in data.goal_allocations if "emergency" in item.category.lower()
    ]
    emergency_total = round(
        sum(float(item.recommended_amount) for item in emergency_rows),
        2,
    )
    if (
        data.minimum_emergency_buffer > 0
        and emergency_rows
        and emergency_total + 0.01 < data.minimum_emergency_buffer
    ):
        raise HTTPException(
            status_code=400,
            detail="Custom split must satisfy the minimum emergency-buffer contribution.",
        )


@router.get("/goals", response_model=GoalListResponse)
def list_goals(request: Request, session_id: str | None = Cookie(default=None)):
    if not session_is_accessible(session_id, request) or session_id not in _session_goals:
        return {"goals": [], "count": 0}

    ledger = get_session_ledger(session_id, request)
    goals = _enriched_goals(session_id, ledger)
    goals.sort(key=lambda item: (item["priority"], item["name"].lower()))
    return {"goals": goals, "count": len(goals)}


@router.post("/goals", response_model=GoalUpsertResponse)
def create_goal(
    data: GoalCreate,
    request: Request,
    response: Response,
    session_id: str | None = Cookie(default=None),
):
    sid = ensure_session_id(response, session_id, request)
    now = _utc_now_iso()
    row = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "target_amount": round(float(data.target_amount), 2),
        "target_date": data.target_date,
        "priority": int(data.priority),
        "category": data.category.strip(),
        "status": data.status,
        "created_at": now,
        "updated_at": now,
    }
    _goal_store(sid).append(row)

    goal = _progress_enriched_goal(row, get_session_ledger(sid, request))
    return {"status": "saved", "goal": goal}


@router.put("/goals/{goal_id}", response_model=GoalUpsertResponse)
def update_goal(
    request: Request,
    goal_id: str,
    data: GoalUpdate,
    session_id: str | None = Cookie(default=None),
):
    if not session_is_accessible(session_id, request) or session_id not in _session_goals:
        raise HTTPException(status_code=404, detail="Goal not found")

    now = _utc_now_iso()
    store = _goal_store(session_id)

    for idx, existing in enumerate(store):
        if existing["id"] != goal_id:
            continue

        updated = {
            **existing,
            "name": data.name.strip(),
            "target_amount": round(float(data.target_amount), 2),
            "target_date": data.target_date,
            "priority": int(data.priority),
            "category": data.category.strip(),
            "status": data.status,
            "updated_at": now,
        }
        store[idx] = updated
        goal = _progress_enriched_goal(updated, get_session_ledger(session_id, request))
        return {"status": "saved", "goal": goal}

    raise HTTPException(status_code=404, detail="Goal not found")


@router.get("/goals/paycheck-plan/saved", response_model=SavedPaycheckPlanResponse)
def get_saved_paycheck_plan(request: Request, session_id: str | None = Cookie(default=None)):
    if not session_is_accessible(session_id, request):
        return {"status": "empty", "plan": {}}
    saved = _session_saved_plans.get(session_id)
    if not saved:
        return {"status": "empty", "plan": {}}
    return {"status": "ok", "plan": saved}


@router.post("/goals/paycheck-plan", response_model=PaycheckPlanResponse)
def recommend_paycheck_plan(
    data: PaycheckPlanRequest,
    request: Request,
    response: Response,
    session_id: str | None = Cookie(default=None),
):
    sid = ensure_session_id(response, session_id, request)
    ledger = get_session_ledger(sid, request)
    goals = _enriched_goals(sid, ledger)

    selected = [goal for goal in goals if goal["status"] == "active"]
    if data.goal_ids:
        selected_ids = set(data.goal_ids)
        selected = [goal for goal in selected if goal["id"] in selected_ids]

    engine_goals = [
        AllocationGoal(
            goal_id=goal["id"],
            name=goal["name"],
            category=goal["category"],
            priority=int(goal["priority"]),
            remaining_amount=float(goal["remaining_amount"]),
            target_date=goal["target_date"],
        )
        for goal in selected
    ]

    fixed_total = _obligations_total(data.fixed_obligations)
    plan = build_paycheck_plan(
        AllocationInput(
            paycheck_amount=data.paycheck_amount,
            fixed_obligations_total=fixed_total,
            safety_buffer=data.safety_buffer,
            minimum_emergency_buffer=data.minimum_emergency_buffer,
            mode=data.mode,
            paychecks_per_month=data.paychecks_per_month,
        ),
        engine_goals,
    )

    saved = _session_saved_plans.get(sid)
    what_changed = what_changed_lines(plan, saved)

    return {
        **plan,
        "fixed_obligations_total": fixed_total,
        "what_changed": what_changed,
    }


@router.post("/goals/paycheck-plan/save", response_model=PaycheckPlanSaveResponse)
def save_custom_paycheck_plan(
    data: PaycheckPlanSaveRequest,
    request: Request,
    response: Response,
    session_id: str | None = Cookie(default=None),
):
    sid = ensure_session_id(response, session_id, request)
    _validate_saved_split(data)

    row = {
        "paycheck_amount": round(float(data.paycheck_amount), 2),
        "allocation_mode": data.mode,
        "fixed_obligations_total": _obligations_total(data.fixed_obligations),
        "needs": round(float(data.needs), 2),
        "goals": round(float(data.goals), 2),
        "discretionary": round(float(data.discretionary), 2),
        "safety_buffer_reserved": round(float(data.safety_buffer_reserved), 2),
        "minimum_emergency_buffer": round(float(data.minimum_emergency_buffer), 2),
        "goal_allocations": [item.model_dump() for item in data.goal_allocations],
        "saved_at": _utc_now_iso(),
    }
    _session_saved_plans[sid] = row
    return {"status": "saved", "plan": row}

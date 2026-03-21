"""Feature interest signup endpoints."""

from __future__ import annotations

import csv
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException

from schemas import FeatureInterestRequest, FeatureInterestResponse

router = APIRouter(tags=["feature-interest"])

ALLOWED_FEATURES = {
    "Rollover Budgets",
    "Flexible vs Category Budget Modes",
    "Move Money Between Categories",
    "Goal Buckets",
}

INTEREST_LOG_PATH = Path(__file__).resolve().parent.parent / "data" / "feature_interest.csv"


def _read_existing_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", newline="", encoding="utf-8") as csvfile:
        return list(csv.DictReader(csvfile))


def _count_features(rows: list[dict[str, str]]) -> dict[str, int]:
    counts = {feature: 0 for feature in sorted(ALLOWED_FEATURES)}
    for row in rows:
        features = [item.strip() for item in row.get("features", "").split(";") if item.strip()]
        for feature in features:
            if feature in counts:
                counts[feature] += 1
    return counts


@router.post("/feature-interest", response_model=FeatureInterestResponse)
def signup_feature_interest(data: FeatureInterestRequest):
    """Store feature-interest submissions for roadmap validation."""
    selected_features = [feature for feature in data.features if feature in ALLOWED_FEATURES]
    if not selected_features:
        raise HTTPException(
            status_code=400,
            detail="Choose at least one valid feature.",
        )

    if "@" not in data.email or "." not in data.email:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    INTEREST_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing_rows = _read_existing_rows(INTEREST_LOG_PATH)

    row = {
        "submitted_at_utc": datetime.now(UTC).isoformat(),
        "email": data.email.strip().lower(),
        "name": (data.name or "").strip(),
        "features": ";".join(selected_features),
        "notes": (data.notes or "").strip(),
    }

    write_header = not INTEREST_LOG_PATH.exists()
    with INTEREST_LOG_PATH.open("a", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=list(row.keys()))
        if write_header:
            writer.writeheader()
        writer.writerow(row)

    all_rows = existing_rows + [row]
    return {
        "status": "saved",
        "total_signups": len(all_rows),
        "feature_counts": _count_features(all_rows),
    }

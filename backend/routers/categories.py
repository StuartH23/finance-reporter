"""Category management endpoints."""

from pathlib import Path

import pandas as pd
from fastapi import APIRouter

from schemas import CategoriesResponse

router = APIRouter(tags=["categories"])

CATEGORIES_PATH = Path(__file__).resolve().parent.parent / "data" / "categories.csv"


@router.get("/categories", response_model=CategoriesResponse)
def get_categories():
    """Return all category rules."""
    if not CATEGORIES_PATH.exists():
        return {"categories": []}
    df = pd.read_csv(CATEGORIES_PATH).fillna("")
    return {
        "categories": df.to_dict(orient="records"),
    }

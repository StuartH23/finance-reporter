"""Category management endpoints."""

import pandas as pd
from fastapi import APIRouter

from schemas import CategoriesResponse
from sdk.data_paths import resolve_data_csv

router = APIRouter(tags=["categories"])


@router.get("/categories", response_model=CategoriesResponse)
def get_categories():
    """Return all category rules."""
    path = resolve_data_csv("categories.csv")
    if not path.exists():
        return {"categories": []}
    df = pd.read_csv(path).fillna("")
    return {
        "categories": df.to_dict(orient="records"),
    }

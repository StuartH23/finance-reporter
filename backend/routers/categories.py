"""Category management endpoints."""

from fastapi import APIRouter

from schemas import CategoriesResponse
from sdk.categories import load_category_rules

router = APIRouter(tags=["categories"])


@router.get("/categories", response_model=CategoriesResponse)
def get_categories():
    """Return all category rules, preferring the local override."""
    return {"categories": load_category_rules()}

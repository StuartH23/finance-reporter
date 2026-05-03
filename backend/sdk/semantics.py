"""Semantic policy helpers shared by budget and cash-flow views."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from .categories import TRANSFER_CATEGORIES

SemanticType = Literal["income", "spending", "transfer", "reimbursement", "ignored"]

_CATEGORY_SEMANTICS: dict[str, SemanticType] = {
    "Income": "income",
    "Owner Draw": "ignored",
}


def category_semantic_type(category: str | None) -> SemanticType:
    normalized = (category or "").strip()
    if normalized in TRANSFER_CATEGORIES:
        return "transfer"
    return _CATEGORY_SEMANTICS.get(normalized, "spending")


def resolve_semantic_type(
    row: Mapping[str, object] | None = None,
    *,
    category: str | None = None,
) -> SemanticType:
    """Resolve transaction semantics with row override precedence."""

    if row is not None:
        for key in (
            "semantic_override",
            "semantic_type_override",
            "transaction_semantic_type",
            "semantic_type",
        ):
            raw_value = row.get(key)
            if isinstance(raw_value, str):
                normalized = raw_value.strip().lower()
                if normalized in {"income", "spending", "transfer", "reimbursement", "ignored"}:
                    return normalized  # type: ignore[return-value]

    return category_semantic_type(category)


def is_budgetable_spending(category: str | None) -> bool:
    return category_semantic_type(category) == "spending"

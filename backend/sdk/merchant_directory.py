"""Lookup cancel/support metadata for known subscription merchants.

The directory is a curated JSON file keyed by tokens shaped like
`normalize_merchant()` output. Multi-token canonical keys
(e.g. "AMAZON PRIME") require *all* tokens to appear in the merchant;
single-token keys (e.g. "NETFLIX") match when that token is present.
The directory is ordered most-specific to least and the first match wins.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_DIRECTORY_PATH = Path(__file__).parent / "merchant_cancellation_directory.json"


@lru_cache(maxsize=1)
def _load_directory() -> list[dict]:
    with _DIRECTORY_PATH.open() as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError("merchant directory must be a JSON list")
    return data


def _key_token_sets(entry: dict) -> list[set[str]]:
    keys: list[set[str]] = []
    for raw in [entry.get("canonical_key", ""), *entry.get("aliases", [])]:
        tokens = {t for t in str(raw).upper().split() if t}
        if tokens:
            keys.append(tokens)
    return keys


def lookup_cancel_info(merchant: str) -> dict | None:
    """Return the directory entry whose key matches the merchant, or None."""
    if not merchant:
        return None
    merchant_tokens = {t for t in str(merchant).upper().split() if t}
    if not merchant_tokens:
        return None
    for entry in _load_directory():
        for key_tokens in _key_token_sets(entry):
            if key_tokens.issubset(merchant_tokens):
                return entry
    return None

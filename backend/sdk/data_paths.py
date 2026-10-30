"""Locations for shipped example data and optional local overrides."""

from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
LOCAL_DIR = DATA_DIR / "local"


def resolve_data_csv(filename: str) -> Path:
    """Prefer a gitignored file in data/local, then the shipped example."""
    override = LOCAL_DIR / filename
    if override.is_file():
        return override
    return DATA_DIR / filename


def local_data_csv(filename: str) -> Path:
    """Return the gitignored path, creating data/local when needed."""
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    return LOCAL_DIR / filename

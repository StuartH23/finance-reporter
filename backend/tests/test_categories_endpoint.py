"""Tests for categories endpoint — confirms missing file doesn't crash."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_get_categories_returns_list():
    """GET /api/categories should return a list (empty or populated), not 500."""
    response = client.get("/api/categories")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    assert isinstance(data["categories"], list)


def test_get_categories_missing_file(tmp_path, monkeypatch):
    """When categories.csv doesn't exist, should return empty list, not crash."""
    import routers.categories as cat_mod

    monkeypatch.setattr(cat_mod, "CATEGORIES_PATH", tmp_path / "nonexistent.csv")
    response = client.get("/api/categories")
    assert response.status_code == 200
    assert response.json() == {"categories": []}

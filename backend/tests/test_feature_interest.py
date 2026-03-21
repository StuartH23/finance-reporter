"""Tests for feature interest signup endpoint."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from main import app
from routers import feature_interest


def test_feature_interest_signup_saves_and_returns_counts(tmp_path, monkeypatch):
    path = tmp_path / "feature_interest.csv"
    monkeypatch.setattr(feature_interest, "INTEREST_LOG_PATH", path)
    client = TestClient(app)

    payload = {
        "email": "user@example.com",
        "name": "Test User",
        "features": ["Rollover Budgets", "Goal Buckets"],
        "notes": "Please build these soon.",
    }
    response = client.post("/api/feature-interest", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "saved"
    assert data["total_signups"] == 1
    assert data["feature_counts"]["Rollover Budgets"] == 1
    assert data["feature_counts"]["Goal Buckets"] == 1
    assert data["feature_counts"]["Move Money Between Categories"] == 0
    assert path.exists()


def test_feature_interest_requires_valid_email(tmp_path, monkeypatch):
    path = tmp_path / "feature_interest.csv"
    monkeypatch.setattr(feature_interest, "INTEREST_LOG_PATH", path)
    client = TestClient(app)

    response = client.post(
        "/api/feature-interest",
        json={
            "email": "not-an-email",
            "features": ["Goal Buckets"],
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Enter a valid email address."


def test_feature_interest_requires_feature_selection(tmp_path, monkeypatch):
    path = tmp_path / "feature_interest.csv"
    monkeypatch.setattr(feature_interest, "INTEREST_LOG_PATH", path)
    client = TestClient(app)

    response = client.post(
        "/api/feature-interest",
        json={
            "email": "user@example.com",
            "features": ["Unknown Feature"],
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Choose at least one valid feature."

"""PnL Reporter — FastAPI entry point."""

import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from auth import get_current_user
from routers import (
    actions,
    budget,
    cashflow,
    categories,
    feature_interest,
    goals,
    insights,
    ledger,
    pnl,
    subscriptions,
    upload,
)
from schemas import HealthResponse

app = FastAPI(title="PnL Reporter API", version="1.0.0")
protected_route_dependencies = [Depends(get_current_user)]


def _cors_allow_origins() -> list[str]:
    raw_origins = os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    )
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


def _frontend_dist_dir() -> Path:
    configured = os.getenv("FRONTEND_DIST_DIR")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent / "static"


def _mount_frontend() -> None:
    dist_dir = _frontend_dist_dir()
    index_path = dist_dir / "index.html"
    if not index_path.is_file():
        return

    assets_dir = dist_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    screenshots_dir = dist_dir / "screenshots"
    if screenshots_dir.is_dir():
        app.mount(
            "/screenshots",
            StaticFiles(directory=screenshots_dir),
            name="frontend-screenshots",
        )

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str = ""):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")

        requested_path = (dist_dir / full_path).resolve()
        try:
            requested_path.relative_to(dist_dir.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Not Found") from exc

        if full_path and requested_path.is_file():
            return FileResponse(requested_path)
        return FileResponse(index_path)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api", dependencies=protected_route_dependencies)
app.include_router(ledger.router, prefix="/api", dependencies=protected_route_dependencies)
app.include_router(pnl.router, prefix="/api", dependencies=protected_route_dependencies)
app.include_router(cashflow.router, prefix="/api", dependencies=protected_route_dependencies)
app.include_router(insights.router, prefix="/api", dependencies=protected_route_dependencies)
app.include_router(actions.router, prefix="/api", dependencies=protected_route_dependencies)
app.include_router(budget.router, prefix="/api", dependencies=protected_route_dependencies)
app.include_router(goals.router, prefix="/api", dependencies=protected_route_dependencies)
app.include_router(categories.router, prefix="/api")
app.include_router(feature_interest.router, prefix="/api", dependencies=protected_route_dependencies)
app.include_router(subscriptions.router, prefix="/api", dependencies=protected_route_dependencies)


@app.get("/api/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}


_mount_frontend()

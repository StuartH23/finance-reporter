"""PnL Reporter — FastAPI entry point."""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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

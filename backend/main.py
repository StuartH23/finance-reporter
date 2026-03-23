"""PnL Reporter — FastAPI entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import budget, categories, feature_interest, goals, ledger, pnl, subscriptions, upload
from schemas import HealthResponse

app = FastAPI(title="PnL Reporter API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(ledger.router, prefix="/api")
app.include_router(pnl.router, prefix="/api")
app.include_router(budget.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(feature_interest.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")


@app.get("/api/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}

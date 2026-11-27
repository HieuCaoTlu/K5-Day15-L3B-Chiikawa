from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.db import session_scope

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> JSONResponse:
    """Docker healthcheck + bước kiểm tra sau deploy. DB hỏng → 503 để `docker compose up --wait` báo lỗi."""
    settings = get_settings()
    try:
        with session_scope() as session:
            session.execute(text("SELECT 1"))
        db = "ok"
    except Exception as exc:  # noqa: BLE001
        db = f"error: {type(exc).__name__}"
    body = {
        "status": "ok" if db == "ok" else "degraded",
        "env": settings.app_env,
        "db": db,
        "llm": "gemini" if settings.google_api_key else "mock",
        "demo_mode": settings.demo_mode,
        "mock_nodes": settings.mock_nodes or None,
    }
    return JSONResponse(body, status_code=200 if db == "ok" else 503)

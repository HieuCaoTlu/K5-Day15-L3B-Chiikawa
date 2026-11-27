from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.db import session_scope

router = APIRouter(tags=["health"])


def _llm_status(settings) -> str:
    """Provider LLM đang dùng; "mock" khi provider đó chưa có key (agent chạy luật dự phòng)."""
    provider = settings.active_llm_provider
    key = settings.openrouter_api_key if provider == "openrouter" else settings.google_api_key
    return provider if key else "mock"


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
        "llm": _llm_status(settings),
        "demo_mode": settings.demo_mode,
        "mock_nodes": settings.mock_nodes or None,
    }
    return JSONResponse(body, status_code=200 if db == "ok" else 503)

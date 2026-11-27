import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, agent, health, items
from app.config import get_settings
from app.db import init_db, session_scope
from app.seed import seed

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    init_db()
    if settings.seed_on_start:
        with session_scope() as session:
            if added := seed(session):
                logger.info("Seeded %d items", added)
    from app.agent.graph import get_graph

    get_graph()  # dựng graph + checkpointer ngay: Postgres lỗi thì lộ lúc khởi động, không đợi request đầu
    logger.info(
        "Start %s (env=%s, db=%s, llm=%s, demo_mode=%s, mock_nodes=%s)",
        settings.app_name,
        settings.app_env,
        "postgres" if settings.is_postgres else "sqlite",
        "gemini" if settings.google_api_key else "mock",
        settings.demo_mode,
        settings.mock_nodes or "-",
    )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    public_docs = settings.app_env != "production"  # prod ẩn /docs (lộ danh sách route)
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if public_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if public_docs else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(items.router, prefix="/api/v1")
    app.include_router(agent.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")
    return app


app = create_app()

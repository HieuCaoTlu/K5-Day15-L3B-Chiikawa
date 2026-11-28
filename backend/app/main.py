import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, agent, health, items, pitching, planning, quality
from app.config import get_settings
from app.db import init_db, session_scope
from app.planning import github_app, setup
from app.planning.github import AUTH_CALLBACK, SETUP_CALLBACK
from app.planning.push import reminder_loop
from app.planning.push import vapid as push_keys
from app.planning.sync import poll_loop
from app.seed import seed

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")


class _PlanningOAuthLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) == 5:
            path = str(args[2]).partition("?")[0]
            if path in (AUTH_CALLBACK, SETUP_CALLBACK):
                record.args = (*args[:2], path, *args[3:])
        return True


logging.getLogger("uvicorn.access").addFilter(_PlanningOAuthLogFilter())


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
    if setup.code_required() and not github_app.current():
        setup.announce_code()
    background = []
    if push_keys():
        background.append(asyncio.create_task(reminder_loop()))
    if settings.planning_poll_seconds > 0:
        # Luôn chạy: kết nối GitHub có thể được tạo sau khi khởi động. Có webhook thì mỗi lượt tự bỏ qua.
        background.append(asyncio.create_task(poll_loop(settings.planning_poll_seconds)))
    try:
        yield
    finally:
        for task in background:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


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
    app.include_router(planning.router, prefix="/api/v1")
    app.include_router(pitching.router, prefix="/api/v1")
    app.include_router(quality.router, prefix="/api/v1")
    return app


app = create_app()

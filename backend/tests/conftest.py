"""Test chạy offline: SQLite trong RAM, không key Gemini, checkpointer trong bộ nhớ. Không gọi mạng."""

import os

os.environ.update(
    APP_ENV="test",
    DATABASE_URL="sqlite://",
    GOOGLE_API_KEY="",
    OPENROUTER_API_KEY="",
    LLM_PROVIDER="auto",
    DEMO_MODE="false",
    MOCK_NODES="",
    SEED_ON_START="true",
    PLANNING_PUSH_AUTO="false",
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.agent.graph import get_graph  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import reset_engine  # noqa: E402


def _reset() -> None:
    get_settings.cache_clear()
    get_graph.cache_clear()
    reset_engine()


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch):
    """Mỗi test một DB + một checkpointer mới. Đổi env trong test bằng monkeypatch.setenv rồi gọi lại _reset()."""
    _reset()
    yield
    _reset()


@pytest.fixture
def client():
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


@pytest.fixture
def set_env(monkeypatch):
    def _set(**values: str) -> None:
        for key, value in values.items():
            monkeypatch.setenv(key, value)
        _reset()

    return _set

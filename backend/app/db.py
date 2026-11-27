"""SQLAlchemy: engine dùng chung, Base cho model, session cho FastAPI.

Hackathon: tạo bảng bằng create_all lúc khởi động (không Alembic). Đổi cột → xoá volume Postgres hoặc tự ALTER.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine, _session_factory
    if _engine is None:
        url = get_settings().database_url
        kwargs: dict = {}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
            if url in ("sqlite://", "sqlite:///:memory:"):
                kwargs["poolclass"] = StaticPool  # một DB trong RAM dùng chung mọi luồng (test)
            else:
                Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        else:
            kwargs["pool_pre_ping"] = True
        _engine = create_engine(url, **kwargs)
        _session_factory = sessionmaker(_engine, expire_on_commit=False)
    return _engine


def reset_engine() -> None:
    """Dùng trong test: bỏ engine cũ để đọc lại DATABASE_URL."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


def init_db() -> None:
    from app import models  # noqa: F401 — đăng ký model vào Base.metadata

    Base.metadata.create_all(get_engine())


@contextmanager
def session_scope() -> Iterator[Session]:
    get_engine()
    assert _session_factory is not None
    with _session_factory() as session:
        yield session


def get_session() -> Iterator[Session]:
    """Dependency FastAPI: `session: Session = Depends(get_session)`."""
    with session_scope() as session:
        yield session

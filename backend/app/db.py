"""SQLAlchemy: engine dùng chung, Base cho model, session cho FastAPI.

Hackathon: tạo bảng bằng create_all lúc khởi động (không Alembic). Đổi cột → xoá volume Postgres hoặc tự ALTER.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
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
        is_sqlite = url.startswith("sqlite")
        is_memory = url in ("sqlite://", "sqlite:///:memory:")
        if is_sqlite:
            kwargs["connect_args"] = {"check_same_thread": False, "timeout": 15}
            if is_memory:
                kwargs["poolclass"] = StaticPool  # một DB trong RAM dùng chung mọi luồng (test)
            else:
                Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        else:
            kwargs["pool_pre_ping"] = True
        _engine = create_engine(url, **kwargs)
        if is_sqlite:

            @event.listens_for(_engine, "connect")
            def _configure_sqlite(dbapi_conn, _record) -> None:
                cursor = dbapi_conn.cursor()
                try:
                    cursor.execute("PRAGMA busy_timeout=15000")
                    if not is_memory:
                        cursor.execute("PRAGMA journal_mode=WAL")
                        cursor.execute("PRAGMA synchronous=NORMAL")
                finally:
                    cursor.close()

        _session_factory = sessionmaker(_engine, expire_on_commit=False)
    return _engine


def sqlite_begin_immediate(db: Session) -> None:
    """Xin khoá ghi SQLite ngay đầu giao dịch để tránh nâng cấp SHARED → RESERVED gây SQLITE_BUSY."""
    if db.get_bind().dialect.name != "sqlite":
        return
    conn = db.connection()
    raw = conn.connection.driver_connection
    if raw is not None and not raw.in_transaction:
        conn.exec_driver_sql("BEGIN IMMEDIATE")


def reset_engine() -> None:
    """Dùng trong test: bỏ engine cũ để đọc lại DATABASE_URL."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


def init_db() -> None:
    from app import models  # noqa: F401 — đăng ký model vào Base.metadata
    from app.planning import models as planning_models  # noqa: F401

    Base.metadata.create_all(get_engine())


@contextmanager
def session_scope() -> Iterator[Session]:
    get_engine()
    assert _session_factory is not None
    with _session_factory() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise


def get_session() -> Iterator[Session]:
    """Dependency FastAPI: `session: Session = Depends(get_session)`."""
    with session_scope() as session:
        yield session

"""WebSocket báo cho cả đội khi dữ liệu đổi.

Chỉ gửi {"type": "changed"}; trình duyệt tự đọc lại GET /state, nên quyền xem vẫn do API đó kiểm tra.
Tín hiệu lấy từ sự kiện commit của SQLAlchemy, nên mọi đường ghi dữ liệu đội đều được báo.
Danh sách kết nối nằm trong bộ nhớ: đúng khi backend chạy một tiến trình (như Dockerfile hiện tại).
"""

import asyncio
import threading
from collections import defaultdict
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import session_scope
from app.planning.auth import session_for
from app.planning.models import PlanningMember, PlanningTeam

router = APIRouter()
CHANGED = '{"type":"changed"}'
PONG = '{"type":"pong"}'
_PENDING = "planning_live_teams"


class _Listener:
    def __init__(self, github_id: str = "") -> None:
        self.loop = asyncio.get_running_loop()
        self.outbox: asyncio.Queue[str] = asyncio.Queue()
        self.revoked = asyncio.Event()
        self.waiting = False  # đã có tín hiệu chờ gửi thì không xếp thêm
        self.github_id = github_id

    def _queue_change(self) -> None:
        if not self.revoked.is_set() and not self.waiting:
            self.waiting = True
            self.outbox.put_nowait(CHANGED)

    def notify(self) -> None:
        # Commit chạy ở luồng khác với vòng lặp giữ WebSocket.
        if not self.loop.is_closed():
            self.loop.call_soon_threadsafe(self._queue_change)

    def close(self) -> None:
        if not self.loop.is_closed():
            self.loop.call_soon_threadsafe(self.revoked.set)


_listeners: defaultdict[str, set[_Listener]] = defaultdict(set)
_lock = threading.Lock()


@event.listens_for(Session, "after_flush")
def _collect(db: Session, _context) -> None:
    changed = [*db.new, *db.deleted, *(row for row in db.dirty if db.is_modified(row))]
    teams = {row.id if isinstance(row, PlanningTeam) else getattr(row, "team_id", None) for row in changed}
    if teams := teams - {None}:
        db.info.setdefault(_PENDING, set()).update(teams)


@event.listens_for(Session, "after_commit")
def _publish(db: Session) -> None:
    teams = db.info.pop(_PENDING, set())
    with _lock:
        targets = [listener for team in teams for listener in _listeners.get(team, ())]
    for listener in targets:
        listener.notify()


@event.listens_for(Session, "after_rollback")
def _discard(db: Session) -> None:
    db.info.pop(_PENDING, None)


def revoke(team_id: str, github_id: str) -> int:
    """Đóng mọi WebSocket của một người với đội này, gọi sau khi người đó bị xóa khỏi đội. Trả số kết nối bị đóng."""
    with _lock:
        targets = [listener for listener in _listeners.get(team_id, ()) if listener.github_id == github_id]
    for listener in targets:
        listener.close()
    return len(targets)


def _member_of(socket: WebSocket) -> tuple[str, str] | None:
    # Đóng phiên DB ngay: kết nối WebSocket sống lâu, không được giữ chỗ trong pool.
    with session_scope() as db:
        session = session_for(socket, db)
        member = db.get(PlanningMember, session.github_id) if session else None
        return (member.team_id, member.github_id) if member else None


def _allowed_origin(socket: WebSocket) -> bool:
    # WebSocket không bị CORS chặn nên tự kiểm tra Origin.
    settings = get_settings()
    origin = socket.headers.get("origin")
    return settings.app_env != "production" or origin in (None, settings.site_origin)


async def _send(socket: WebSocket, listener: _Listener) -> None:
    while True:
        message = await listener.outbox.get()
        if message == CHANGED:
            listener.waiting = False
        await socket.send_text(message)


async def _receive(socket: WebSocket, listener: _Listener) -> None:
    while True:
        if await socket.receive_text() == "ping":
            listener.outbox.put_nowait(PONG)


@router.websocket("/ws")
async def watch_team(socket: WebSocket):
    await socket.accept()
    found = await run_in_threadpool(_member_of, socket) if _allowed_origin(socket) else None
    if not found:
        await socket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    team, github_id = found
    listener = _Listener(github_id)
    with _lock:
        _listeners[team].add(listener)
    tasks: list[asyncio.Task] = []
    try:
        # Kiểm tra lại membership sau khi đã đăng ký listener để tránh lọt khi bị xóa đúng lúc đang kết nối.
        if listener.revoked.is_set() or await run_in_threadpool(_member_of, socket) != (team, github_id):
            with suppress(WebSocketDisconnect, RuntimeError):
                await socket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        send_task = asyncio.create_task(_send(socket, listener))
        recv_task = asyncio.create_task(_receive(socket, listener))
        revoke_task = asyncio.create_task(listener.revoked.wait())
        tasks = [send_task, recv_task, revoke_task]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        if revoke_task in done or listener.revoked.is_set():
            with suppress(WebSocketDisconnect, RuntimeError):
                await socket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        for task in done:
            error = task.exception()
            if error and not isinstance(error, (WebSocketDisconnect, RuntimeError)):
                raise error
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        with _lock:
            _listeners[team].discard(listener)
            if not _listeners[team]:
                del _listeners[team]

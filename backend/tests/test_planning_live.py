"""WebSocket báo cho cả đội khi dữ liệu đổi. Chỉ gửi tín hiệu, dữ liệu vẫn đọc qua GET /state."""

import asyncio
import threading

import anyio
import pytest
from starlette.websockets import WebSocketDisconnect

from app.config import get_settings
from app.planning import live
from tests.test_planning import BASE, _demo, _state, _write
from tests.test_planning_team import _invite, _join, people  # noqa: F401 — fixture

PROJECT = {
    "name": "Chiikawa",
    "done": {"product": False, "planning": False, "pitching": False, "quality": False, "maintaining": False},
}
CHANGED = {"type": "changed"}
PONG = {"type": "pong"}


@pytest.fixture(autouse=True)
def isolate_listeners():
    with live._lock:
        live._listeners.clear()
    yield
    with live._lock:
        live._listeners.clear()


def _next(socket):
    """Gửi ping rồi đọc tin kế tiếp: không có tín hiệu thì nhận pong ngay, test không bị treo."""
    socket.send_text("ping")
    return socket.receive_json()


def _rename(client, name):
    version = _state(client)["project"]["version"]
    _write(client, "PUT", "/project", {**PROJECT, "name": name, "version": version})


def _team(people):  # noqa: F811
    leader = people(demo=False)
    _demo(leader)
    member = people()
    _join(member, _invite(leader))
    return leader, member


def test_teammates_are_told_when_shared_data_changes(people):  # noqa: F811
    leader, member = _team(people)
    with member.websocket_connect(f"{BASE}/ws") as socket:
        assert _next(socket) == PONG
        _rename(leader, "Tên mới")
        assert _next(socket) == CHANGED


def test_member_joining_is_announced(people):  # noqa: F811
    leader = people(demo=False)
    _demo(leader)
    code = _invite(leader)
    with leader.websocket_connect(f"{BASE}/ws") as socket:
        assert _next(socket) == PONG
        _join(people(), code)
        assert _next(socket) == CHANGED


def test_other_teams_are_not_told(people):  # noqa: F811
    first = people(demo=False)
    _demo(first)
    second = people(demo=False)
    _demo(second)
    with first.websocket_connect(f"{BASE}/ws") as socket:
        assert _next(socket) == PONG
        _rename(second, "Đội khác")
        assert _next(socket) == PONG


def test_rejected_write_is_not_announced(people):  # noqa: F811
    leader, member = _team(people)
    with leader.websocket_connect(f"{BASE}/ws") as socket:
        assert _next(socket) == PONG
        _write(member, "PUT", "/thinking", {"version": 0, "session": "th-x", "msgs": []}, expected=403)
        assert _next(socket) == PONG


def test_removed_member_socket_is_closed(people):  # noqa: F811
    leader, member = _team(people)
    member_id = _state(member)["profile"]["github_id"]
    with leader.websocket_connect(f"{BASE}/ws") as kept:
        assert _next(kept) == PONG
        with member.websocket_connect(f"{BASE}/ws") as socket:
            assert _next(socket) == PONG
            _write(leader, "DELETE", f"/members/{member_id}")
            with pytest.raises(WebSocketDisconnect) as closed:
                while True:  # có thể nhận tín hiệu "changed" trước khi bị đóng
                    assert socket.receive_json() == CHANGED
        assert closed.value.code == 1008
        reply = _next(kept)
        if reply == CHANGED:
            reply = kept.receive_json()
        assert reply == PONG


@pytest.mark.parametrize("login", [False, True])
def test_outsiders_cannot_listen(people, login):  # noqa: F811
    outsider = people(demo=login)
    with pytest.raises(WebSocketDisconnect) as closed, outsider.websocket_connect(f"{BASE}/ws") as socket:
        socket.receive_json()
    assert closed.value.code == 1008


def test_foreign_origin_is_refused_in_production(people, monkeypatch):  # noqa: F811
    settings = get_settings()
    monkeypatch.setattr(settings, "site_url", "http://localhost:3000")
    leader = people(demo=False)
    _demo(leader)
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "demo_mode", True)
    headers = {"Origin": "https://trang-la.example"}
    with pytest.raises(WebSocketDisconnect) as closed:
        with leader.websocket_connect(f"{BASE}/ws", headers=headers) as socket:
            socket.receive_json()
    assert closed.value.code == 1008
    with leader.websocket_connect(f"{BASE}/ws", headers={"Origin": settings.site_origin}) as socket:
        assert _next(socket) == PONG


def test_membership_rechecked_after_listener_registration(people, monkeypatch):  # noqa: F811
    leader, member = _team(people)
    member_id = _state(member)["profile"]["github_id"]
    real_member_of = live._member_of
    calls = 0

    def disappear_on_second_check(socket):
        nonlocal calls
        calls += 1
        found = real_member_of(socket)
        return found if calls == 1 else None

    monkeypatch.setattr(live, "_member_of", disappear_on_second_check)
    with pytest.raises(WebSocketDisconnect) as closed, member.websocket_connect(f"{BASE}/ws") as socket:
        socket.receive_json()
    assert closed.value.code == 1008
    assert calls == 2
    monkeypatch.setattr(live, "_member_of", real_member_of)
    with leader.websocket_connect(f"{BASE}/ws") as socket:
        assert _next(socket) == PONG
    assert not any(listener.github_id == member_id for listeners in live._listeners.values() for listener in listeners)


def test_revoke_closes_socket_even_when_send_hangs(people, monkeypatch):  # noqa: F811
    leader, member = _team(people)
    member_id = _state(member)["profile"]["github_id"]
    send_started = threading.Event()

    async def stuck_send(_socket, _listener):
        send_started.set()
        await asyncio.Future()

    monkeypatch.setattr(live, "_send", stuck_send)
    with pytest.raises(WebSocketDisconnect) as closed, member.websocket_connect(f"{BASE}/ws") as socket:
        assert send_started.wait(timeout=2)
        _write(leader, "DELETE", f"/members/{member_id}")
        socket.receive_json()
    assert closed.value.code == 1008


class _ClosingSocket:
    """WebSocket giả: trình duyệt ngắt kết nối khi test ra hiệu."""

    headers: dict[str, str] = {}

    def __init__(self) -> None:
        self.gone = asyncio.Event()

    async def accept(self) -> None: ...

    async def close(self, code: int = 1000) -> None: ...

    async def receive_text(self) -> str:
        await self.gone.wait()
        raise WebSocketDisconnect(1000)


def test_server_cancel_during_cleanup_stays_inside_its_scope(monkeypatch):
    """Server hủy đúng lúc đang dọn tác vụ: lệnh hủy không được lọt ra ngoài và listener vẫn được gỡ."""
    monkeypatch.setattr(live, "_member_of", lambda _socket: ("team", "user"))

    async def run() -> None:
        socket = _ClosingSocket()
        scope = anyio.CancelScope()

        async def slow_to_stop(_socket, _listener):
            try:
                await asyncio.Future()
            except asyncio.CancelledError:
                scope.cancel()
                with anyio.CancelScope(shield=True):
                    for _ in range(3):
                        await asyncio.sleep(0)
                raise

        monkeypatch.setattr(live, "_send", slow_to_stop)

        async def serve() -> None:
            with scope:
                await live.watch_team(socket)

        server = asyncio.create_task(serve())
        await asyncio.sleep(0.05)
        socket.gone.set()
        await server

    # Thứ tự của set tác vụ không cố định nên lặp nhiều lần.
    for _ in range(40):
        asyncio.run(run())
        assert not live._listeners

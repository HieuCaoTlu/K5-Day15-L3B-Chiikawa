"""WebSocket báo cho cả đội khi dữ liệu đổi. Chỉ gửi tín hiệu, dữ liệu vẫn đọc qua GET /state."""

import pytest
from starlette.websockets import WebSocketDisconnect

from app.config import get_settings
from tests.test_planning import BASE, _demo, _state, _write
from tests.test_planning_team import _invite, _join, people  # noqa: F401 — fixture

PROJECT = {
    "name": "Chiikawa",
    "done": {"product": False, "planning": False, "pitching": False, "quality": False, "maintaining": False},
}
CHANGED = {"type": "changed"}
PONG = {"type": "pong"}


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
        _join(people(), code)
        assert _next(socket) == CHANGED


def test_other_teams_are_not_told(people):  # noqa: F811
    first = people(demo=False)
    _demo(first)
    second = people(demo=False)
    _demo(second)
    with first.websocket_connect(f"{BASE}/ws") as socket:
        _rename(second, "Đội khác")
        assert _next(socket) == PONG


def test_rejected_write_is_not_announced(people):  # noqa: F811
    leader, member = _team(people)
    with leader.websocket_connect(f"{BASE}/ws") as socket:
        _write(member, "PUT", "/thinking", {"version": 0, "session": "th-x", "msgs": []}, expected=403)
        assert _next(socket) == PONG


@pytest.mark.parametrize("login", [False, True])
def test_outsiders_cannot_listen(people, login):  # noqa: F811
    outsider = people(demo=login)
    with pytest.raises(WebSocketDisconnect) as closed, outsider.websocket_connect(f"{BASE}/ws") as socket:
        socket.receive_json()
    assert closed.value.code == 1008


def test_foreign_origin_is_refused_in_production(people, monkeypatch):  # noqa: F811
    leader, _ = _team(people)
    monkeypatch.setattr(get_settings(), "app_env", "production")
    monkeypatch.setattr(get_settings(), "demo_mode", True)
    headers = {"Origin": "https://trang-la.example"}
    with pytest.raises(WebSocketDisconnect) as closed:
        with leader.websocket_connect(f"{BASE}/ws", headers=headers) as socket:
            socket.receive_json()
    assert closed.value.code == 1008
    with leader.websocket_connect(f"{BASE}/ws", headers={"Origin": get_settings().site_origin}) as socket:
        assert _next(socket) == PONG

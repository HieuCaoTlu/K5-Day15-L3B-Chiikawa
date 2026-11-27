import base64
import json

import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from pywebpush import WebPushException

from app.db import session_scope
from app.main import create_app
from app.planning import push
from app.planning.models import PlanningSubscription
from tests.test_planning import BASE, WRITE, _demo, _state, _subscription, _write


@pytest.fixture
def auto_push(set_env, tmp_path):
    """Bật chế độ tự tạo khóa, lưu khóa vào thư mục tạm."""
    path = tmp_path / "vapid.json"
    set_env(PLANNING_PUSH_AUTO="true", PLANNING_VAPID_FILE=str(path))
    # Không để vòng nhắc hạn chạy chen vào test.
    return path


@pytest.fixture
def browser(auto_push, monkeypatch):
    async def idle():
        return None

    monkeypatch.setattr("app.main.reminder_loop", idle)
    with TestClient(create_app()) as client:
        _demo(client)
        yield client


def _raw(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def test_keys_are_created_once_and_only_the_public_one_is_exposed(browser, auto_push):
    state = _state(browser)
    saved = json.loads(auto_push.read_text(encoding="utf-8"))
    assert state["push_key"] == saved["public"]
    assert len(_raw(saved["public"])) == 65
    assert len(_raw(saved["private"])) == 32
    private = ec.derive_private_key(int.from_bytes(_raw(saved["private"]), "big"), ec.SECP256R1())
    point = private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    assert point == _raw(saved["public"])
    assert saved["private"] not in browser.get(BASE + "/state").text
    assert push.vapid().public == saved["public"]


def test_environment_keys_win_and_auto_can_be_turned_off(set_env, tmp_path):
    set_env(PLANNING_PUSH_AUTO="false", PLANNING_VAPID_FILE=str(tmp_path / "unused.json"))
    assert push.vapid() is None
    set_env(
        PUSH_VAPID_PUBLIC_KEY="env-public",
        PUSH_VAPID_PRIVATE_KEY="env-private",
        PUSH_VAPID_SUBJECT="mailto:team@example.org",
    )
    assert push.vapid() == push.Vapid("env-public", "env-private", "mailto:team@example.org")
    assert not (tmp_path / "unused.json").exists()


def test_test_notification_reaches_only_this_browser(browser, monkeypatch):
    _write(browser, "POST", "/push/test", expected=409)
    data = _subscription()
    _write(browser, "POST", "/push/subscription", data)
    assert _state(browser)["push_registered"] is True
    with session_scope() as db:
        db.add(PlanningSubscription(id="other", session_id="other-session", github_id="nguoi-khac", data=data))
        db.commit()
    captured = []

    def send(_self, method, url, **kwargs):
        captured.append((method, url, kwargs["data"]))
        response = requests.Response()
        response.status_code = 201
        return response

    monkeypatch.setattr(requests.Session, "request", send)
    _write(browser, "POST", "/push/test")
    assert [(method, url) for method, url, _ in captured] == [("POST", data["endpoint"])]
    assert "Thông báo".encode() not in captured[0][2]  # nội dung được mã hóa


@pytest.mark.parametrize(("status", "expected", "kept"), [(410, 409, False), (500, 502, True)])
def test_failed_test_notification_is_explained(browser, monkeypatch, status, expected, kept):
    _write(browser, "POST", "/push/subscription", _subscription())

    def fail(**_kwargs):
        response = requests.Response()
        response.status_code = status
        raise WebPushException("lỗi", response=response)

    monkeypatch.setattr(push, "webpush", fail)
    _write(browser, "POST", "/push/test", expected=expected)
    assert _state(browser)["push_registered"] is kept


def test_test_notification_needs_the_planning_header_and_a_session(client):
    assert client.post(BASE + "/push/test").status_code == 403
    assert client.post(BASE + "/push/test", headers=WRITE).status_code == 401

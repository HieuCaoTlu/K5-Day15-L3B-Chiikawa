import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.db import session_scope
from app.main import create_app
from app.planning import github, push
from app.planning.models import PlanningDelivery, PlanningSubscription, PlanningTask
from app.planning.schemas import VIETNAM

BASE = "/api/v1/planning"
WRITE = {"X-Planning-Request": "1"}


def _urlsafe(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _subscription() -> dict:
    receiver = ec.generate_private_key(ec.SECP256R1()).public_key()
    encoded = receiver.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return {
        "endpoint": "https://fcm.googleapis.com/fcm/send/tang",
        "keys": {"p256dh": _urlsafe(encoded), "auth": _urlsafe(bytes(range(16)))},
    }


def _state(client):
    return client.get(BASE + "/state").json()


def _write(client, method, path, data=None, expected=204):
    result = client.request(method, BASE + path, headers=WRITE, json=data)
    assert result.status_code == expected, result.text
    return result


def _member(login, name):
    return {"login": login, "name": name, "experience": "Viết API FastAPI", "avatar": 1, "tags": ["API", "Python"]}


def _team(client, leader, member):
    _write(client, "PUT", "/members", {"members": [_member(leader, "Đạt"), _member(member, "Lan")]})


def _demo(client):
    _write(client, "POST", "/auth/demo")
    _team(client, "truong-nhom-demo", "lan-demo")
    _choose(client, "demo-1")


def _choose(client, repo_id, reset=False, expected=204):
    return _write(
        client,
        "PUT",
        "/repo",
        {
            "repo_id": repo_id,
            "repo_version": _state(client)["repo_version"],
            "reset_confirmed": reset,
        },
        expected=expected,
    )


def _draft(client):
    today = datetime.now(VIETNAM).date()
    return _write(
        client,
        "POST",
        "/draft",
        {
            "repo_version": _state(client)["repo_version"],
            "brief": {
                "overview": "Làm luồng tra cứu trạng thái đơn hàng.",
                "stories": ["Viết API tra cứu", "Dựng trang tra cứu"],
                "starts_on": today.isoformat(),
                "ends_on": (today + timedelta(days=8)).isoformat(),
            },
        },
        expected=200,
    ).json()


def _apply(client, draft, expected=204):
    _write(
        client,
        "POST",
        "/apply",
        {
            "repo_version": _state(client)["repo_version"],
            "draft_id": draft["id"],
            "plan": draft["plan"],
        },
        expected=expected,
    )


def _tasks(client):
    return [task for sprint in _state(client)["sprints"] for task in sprint["tasks"]]


def _demo_pull(client, task, author, state, number=1):
    _write(
        client,
        "POST",
        "/demo/pull",
        {
            "number": number,
            "title": f"[{task['code']}] Tra cứu đơn",
            "author_id": author,
            "state": state,
            "repo_version": _state(client)["repo_version"],
        },
    )


def test_demo_drafts_require_approval_and_repo_reset_discards_the_old_plan(client):
    assert _state(client)["profile"] is None
    assert client.post(BASE + "/auth/demo").status_code == 403
    _demo(client)
    draft = _draft(client)
    assert draft["source"] == "fallback"
    assert len(draft["plan"]["sprints"]) == 2
    assert _tasks(client) == []
    draft["plan"]["sprints"][0]["tasks"][0]["title"] = "Đọc tình trạng đơn"
    _apply(client, draft)
    _apply(client, draft, expected=409)

    task, other = _tasks(client)[:2]
    assert task["title"] == "Đọc tình trạng đơn"
    assert task["criteria"]
    assert len({item["assignee_id"] for item in _tasks(client)}) == 2
    _demo_pull(client, task, task["assignee_id"], "draft")
    assert _tasks(client)[0]["progress"] == "doing"
    _demo_pull(client, task, task["assignee_id"], "open")
    assert _tasks(client)[0]["progress"] == "review"
    _demo_pull(client, task, task["assignee_id"], "merged")
    assert _tasks(client)[0]["progress"] == "done"

    wrong_author = next(
        item["github_id"] for item in _state(client)["members"] if item["github_id"] != other["assignee_id"]
    )
    for _ in range(2):
        _demo_pull(client, other, wrong_author, "open", number=2)
    current = _tasks(client)[1]
    assert current["progress"] == "todo"
    assert len(current["pulls"]) == 1
    assert "task được giao cho @" in current["pulls"][0]["note"]
    old_version = _state(client)["repo_version"]
    _write(client, "PUT", "/pulls/2/link", {"repo_version": old_version, "task_id": other["id"]})
    assert _tasks(client)[1]["progress"] == "review"
    assert _tasks(client)[1]["assignee_id"] == other["assignee_id"]

    _choose(client, "demo-2", expected=409)
    assert _tasks(client)
    _choose(client, "demo-2", reset=True)
    assert _tasks(client) == []
    assert _state(client)["inbox"] == []
    assert len(_state(client)["members"]) == 2
    _write(client, "PUT", "/pulls/2/link", {"repo_version": old_version, "task_id": other["id"]}, expected=409)
    _choose(client, "demo-1", reset=True)
    _apply(client, _draft(client))
    assert _tasks(client)[0]["id"] > other["id"]


def _start_oauth(client, intent):
    response = client.get(BASE + "/auth/github", params={"intent": intent}, follow_redirects=False)
    assert response.status_code == 303
    query = parse_qs(urlsplit(response.headers["location"]).query)
    assert query["code_challenge_method"] == ["S256"]
    return query["state"][0]


def _login(client, code, intent="login"):
    state = _start_oauth(client, intent)
    return client.get(BASE + "/auth/github/callback", params={"state": state, "code": code}, follow_redirects=False)


def _signed_event(client, event, delivery, payload, secret="test-webhook"):
    raw = json.dumps(payload).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post(
        BASE + "/github/webhook",
        content=raw,
        headers={
            "X-GitHub-Event": event,
            "X-GitHub-Delivery": delivery,
            "X-Hub-Signature-256": f"sha256={signature}",
        },
    )


def test_github_login_roles_and_signed_pull_sync(set_env, monkeypatch):
    set_env(
        GITHUB_CLIENT_ID="test-client",
        GITHUB_CLIENT_SECRET="test-secret",
        GITHUB_APP_SLUG="tang-test",
        GITHUB_APP_PRIVATE_KEY_B64="test-key",
        GITHUB_WEBHOOK_SECRET="test-webhook",
    )
    fetch_mock = [
        {"id": "11", "name": "team/planning", "branch": "main", "installation_id": "21", "private": True},
        {"id": "12", "name": "team/other", "branch": "main", "installation_id": "21", "private": True},
    ]
    people = {
        "lead": {"github_id": "301", "login": "lead", "name": "Đạt"},
        "lan": {"github_id": "302", "login": "lan", "name": "Lan"},
    }
    monkeypatch.setattr(github, "user_token", lambda code, _verifier: code)
    monkeypatch.setattr(github, "current_user", lambda token: people[token])
    monkeypatch.setattr(github, "find_user", lambda login: people[login])
    monkeypatch.setattr(github, "accessible_repos", lambda _token: fetch_mock)
    monkeypatch.setattr(github, "repo_pulls", lambda _repo, _install: ({"name": "team/planning", "branch": "main"}, []))

    app = create_app()
    with TestClient(app) as client:
        assert _state(client)["github_enabled"]
        _start_oauth(client, "login")
        bad = client.get(
            BASE + "/auth/github/callback", params={"state": "bad", "code": "lead"}, follow_redirects=False
        )
        assert bad.headers["location"] == "/planning?github=state"
        assert _state(client)["profile"] is None
        assert _login(client, "lead").headers["location"] == "/planning"
        _team(client, "lead", "lan")
        _choose(client, "11", expected=403)
        assert _login(client, "lan", "repos").headers["location"] == "/planning?github=account"
        assert _login(client, "lead", "repos").headers["location"] == "/planning?github=discovered"
        _choose(client, "11")
        _apply(client, _draft(client))
        task = _tasks(client)[0]
        updated = datetime.now(UTC) + timedelta(seconds=5)
        raw_pr = {
            "number": 21,
            "state": "open",
            "title": "Tra cứu đơn",
            "body": f"Task [{task['code']}]",
            "draft": False,
            "updated_at": updated.isoformat(),
            "base": {"ref": "main"},
            "user": {"id": int(task["assignee_id"]), "login": "lan"},
        }
        event = {"action": "opened", "installation": {"id": 21}, "repository": {"id": 11}, "pull_request": raw_pr}
        assert _signed_event(client, "pull_request", "bad-sig", event, "wrong-secret").status_code == 401
        assert (
            _signed_event(client, "pull_request", "wrong-repo", {**event, "repository": {"id": 12}}).status_code == 204
        )
        assert _tasks(client)[0]["progress"] == "todo"
        assert _signed_event(client, "pull_request", "open-1", event).status_code == 204
        assert _tasks(client)[0]["progress"] == "review"

        closed = {
            **event,
            "action": "closed",
            "sender": {"id": 990},
            "pull_request": {
                **raw_pr,
                "state": "closed",
                "merged": True,
                "updated_at": (updated + timedelta(seconds=2)).isoformat(),
            },
        }
        assert _signed_event(client, "pull_request", "open-1", closed).status_code == 204
        assert _tasks(client)[0]["progress"] == "review"
        assert _signed_event(client, "pull_request", "merge-2", closed).status_code == 204
        assert _signed_event(client, "pull_request", "late-open", event).status_code == 204
        assert _tasks(client)[0]["progress"] == "done"
        assert len(_tasks(client)[0]["pulls"]) == 1
        with session_scope() as db:
            assert len(list(db.scalars(select(PlanningDelivery)))) == 3

        with TestClient(app) as member:
            assert _login(member, "lan").headers["location"] == "/planning"
            assert _state(member)["role"] == "member"
            assert _state(member)["choices"] is None
            assert _tasks(member)[0]["progress"] == "done"
            _write(member, "PUT", "/repo", {"repo_id": "12", "repo_version": 1}, expected=403)

        assert (
            _signed_event(
                client,
                "installation_repositories",
                "removed",
                {
                    "action": "removed",
                    "installation": {"id": 21},
                    "repositories_removed": [{"id": 11}],
                },
            ).status_code
            == 204
        )
        assert not _state(client)["repo"]["access"]
        assert _tasks(client)[0]["pulls"] == []


def test_push_only_notifies_the_assignee_and_respects_deadline_changes(client, monkeypatch):
    _demo(client)
    draft = _draft(client)
    _apply(client, draft)
    board = _state(client)
    profile = board["profile"]
    settings = get_settings()
    monkeypatch.setattr(settings, "push_vapid_public_key", "test-pub")
    monkeypatch.setattr(settings, "push_vapid_private_key", "test-priv")
    monkeypatch.setattr(settings, "push_vapid_subject", "mailto:test@example.org")
    other = next(member for member in board["members"] if member["github_id"] != profile["github_id"])
    task_id = _tasks(client)[0]["id"]
    instant = datetime.now(UTC)
    with session_scope() as db:
        for task in db.scalars(select(PlanningTask)):
            task.deadline = instant + timedelta(hours=3)
            task.assignee_id = profile["github_id"] if task.id == task_id else other["github_id"]
        db.commit()

    data = _subscription()
    _write(client, "POST", "/push/subscription", {**data, "endpoint": "https://example.org/push"}, expected=422)
    _write(client, "POST", "/push/subscription", data)
    sent = []

    def record(_subscription, task, hours, _ttl):
        sent.append((task.id, hours))
        return True

    monkeypatch.setattr(push, "_deliver", record)
    push.deliver_due()
    push.deliver_due()
    assert sent == [(task_id, 24)]

    monkeypatch.setattr(push, "now", lambda: instant + timedelta(hours=2, minutes=5))
    push.deliver_due()
    assert sent[-1] == (task_id, 1)
    with session_scope() as db:
        task = db.get(PlanningTask, task_id)
        task.pr_status = "done"
        task.reminders = []
        db.commit()
    push.deliver_due()
    assert len(sent) == 2
    _write(client, "POST", "/auth/logout")
    assert _state(client)["profile"] is None


def test_web_push_encrypts_the_message_and_prevents_redirects(monkeypatch):
    sender = ec.generate_private_key(ec.SECP256R1())
    settings = get_settings()
    private = sender.private_numbers().private_value.to_bytes(32, "big")
    monkeypatch.setattr(settings, "push_vapid_public_key", "unused-in-delivery")
    monkeypatch.setattr(settings, "push_vapid_private_key", _urlsafe(private))
    monkeypatch.setattr(settings, "push_vapid_subject", "mailto:team@example.org")
    captured = {}

    def send(_self, method, url, **kwargs):
        captured.update(method=method, url=url, **kwargs)
        response = requests.Response()
        response.status_code = 201
        return response

    monkeypatch.setattr(requests.Session, "request", send)
    subscription = PlanningSubscription(data=_subscription())
    assert push._deliver(subscription, PlanningTask(id=24), 1, 1800)
    assert captured["method"] == "POST"
    assert captured["url"] == subscription.data["endpoint"]
    assert captured["allow_redirects"] is False
    headers = {name.lower(): value for name, value in captured["headers"].items()}
    assert headers["content-encoding"] == "aes128gcm"
    assert headers["authorization"].startswith("vapid ")
    assert b"/planning" not in captured["data"]

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.planning import github, sync
from tests.test_planning import _apply, _choose, _demo, _draft, _login, _real_team, _state, _tasks

GITHUB_ENV = {
    "GITHUB_CLIENT_ID": "test-client",
    "GITHUB_CLIENT_SECRET": "test-secret",
    "GITHUB_APP_SLUG": "tang-test",
    "GITHUB_APP_PRIVATE_KEY_B64": "test-key",
    "GITHUB_WEBHOOK_SECRET": "test-webhook",
}


@pytest.fixture
def connected(set_env, monkeypatch):
    """Một đội dùng GitHub thật (giả lập) đã có sprint. Trả (client, hàm đặt PR, số lượt đã đọc)."""
    clients = []

    def _make(site_url="http://localhost:3000"):
        set_env(**GITHUB_ENV, SITE_URL=site_url)
        people = {
            "lead": {"github_id": "301", "login": "lead", "name": "Đạt"},
            "lan": {"github_id": "302", "login": "lan", "name": "Lan"},
        }
        pulls, reads = [], []
        monkeypatch.setattr(github, "user_token", lambda code, _verifier: code)
        monkeypatch.setattr(github, "current_user", lambda token: people[token])
        monkeypatch.setattr(github, "find_user", lambda login: people[login])
        repo = {"id": "11", "name": "team/planning", "branch": "main", "installation_id": "21", "private": True}
        monkeypatch.setattr(github, "accessible_repos", lambda _token: [repo])

        def read(_repo, _install):
            reads.append(1)
            return {"name": "team/planning", "branch": "main"}, list(pulls)

        monkeypatch.setattr(github, "repo_pulls", read)
        client = TestClient(create_app(), base_url="https://testserver")
        client.__enter__()
        clients.append(client)
        _login(client, "lead")
        _real_team(client, "lead", "lan")
        _login(client, "lead", "repos")
        _choose(client, "11")
        _apply(client, _draft(client))
        reads.clear()

        def put_pull(state="open", merged=False, draft=False):
            task = _tasks(client)[0]
            pulls[:] = [
                {
                    "number": 21,
                    "state": state,
                    "merged": merged,
                    "draft": draft,
                    "title": f"[{task['code']}] Tra cứu đơn",
                    "body": "",
                    "updated_at": (datetime.now(UTC) + timedelta(seconds=5)).isoformat(),
                    "base": {"ref": "main"},
                    "user": {"id": int(task["assignee_id"]), "login": "lead"},
                }
            ]

        return client, put_pull, reads

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


def test_background_sync_moves_tasks_without_anyone_open(connected):
    client, put_pull, _ = connected()
    for kwargs, expected in (({"draft": True}, "doing"), ({}, "review"), ({"state": "closed", "merged": True}, "done")):
        put_pull(**kwargs)
        assert sync.sync_pulls() == 1
        assert _tasks(client)[0]["progress"] == expected


def test_background_sync_is_skipped_when_github_can_send_webhooks(connected):
    client, put_pull, reads = connected(site_url="https://tang.example.com")
    put_pull()
    assert sync.sync_pulls() == 0
    assert reads == []
    assert _tasks(client)[0]["progress"] == "todo"


def test_background_sync_ignores_demo_teams_and_missing_setup(client):
    _demo(client)
    assert sync.sync_pulls() == 0


def test_github_error_is_logged_and_missing_repo_stops_being_read(connected, monkeypatch, caplog):
    client, _, _ = connected()

    def fail(status):
        def read(_repo, _install):
            raise github.GitHubError(status)

        monkeypatch.setattr(github, "repo_pulls", read)

    fail(502)
    assert sync.sync_pulls() == 0
    assert _state(client)["repo"]["access"] is True
    assert "502" in caplog.text
    fail(404)
    assert sync.sync_pulls() == 0
    assert _state(client)["repo"]["access"] is False


def test_poll_loop_keeps_running_after_a_failure(monkeypatch):
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("lỗi tạm thời")

    monkeypatch.setattr(sync, "sync_pulls", flaky)

    async def run():
        task = asyncio.create_task(sync.poll_loop(0.01))
        for _ in range(200):
            if len(calls) >= 2:
                break
            await asyncio.sleep(0.01)
        task.cancel()

    asyncio.run(run())
    assert len(calls) >= 2

from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import session_scope
from app.main import create_app
from app.planning import github
from tests.test_planning import BASE, _apply, _choose, _demo, _draft, _login, _real_team, _state, _tasks, _write

GITHUB_ENV = {
    "GITHUB_CLIENT_ID": "test-client",
    "GITHUB_CLIENT_SECRET": "test-secret",
    "GITHUB_APP_SLUG": "tang-test",
    "GITHUB_APP_PRIVATE_KEY_B64": "test-key",
    "GITHUB_WEBHOOK_SECRET": "",
}
PEOPLE = {
    "lead": {"github_id": "301", "login": "lead", "name": "Đạt"},
    "lan": {"github_id": "302", "login": "lan", "name": "Lan"},
}
REPO = "team/planning"
SECRET = "gho_secret_"


class FakeGitHub:
    """Giả lập đúng các lời gọi REST mà việc tạo PR cần, lưu nhánh, commit và PR trong bộ nhớ."""

    def __init__(self):
        self.refs = {"main": "base-sha"}
        self.commits = {"base-sha": {"tree": "tree-base", "parents": []}}
        self.pulls = []
        self.writes = []
        self.fail = {}
        self.tokens = []

    def api(self, path, token="", method="GET", **kwargs):
        self.tokens.append(token)
        login = token.removeprefix(SECRET)
        body, params = kwargs.get("json") or {}, kwargs.get("params") or {}
        if (method, path.split("?")[0]) in self.fail:
            raise github.GitHubError(*self.fail[(method, path.split("?")[0])])
        if method != "GET":
            self.writes.append((method, path, body))
        prefix = f"/repos/{REPO}"
        if path == f"{prefix}/pulls" and method == "GET":
            return [p for p in self.pulls if p["state"] == "open" and params["head"] == f"team:{p['head']['ref']}"]
        if path.startswith(f"{prefix}/git/ref/heads/"):
            name = path.removeprefix(f"{prefix}/git/ref/heads/")
            if name not in self.refs:
                raise github.GitHubError(404)
            return {"object": {"sha": self.refs[name]}}
        if path == f"{prefix}/git/refs":
            self.refs[body["ref"].removeprefix("refs/heads/")] = body["sha"]
            return {}
        if path.startswith(f"{prefix}/git/commits/"):
            return {"tree": {"sha": self.commits[path.rsplit("/", 1)[1]]["tree"]}}
        if path == f"{prefix}/git/commits":
            sha = f"commit-{len(self.commits)}"
            self.commits[sha] = {"tree": body["tree"], "parents": body["parents"], "message": body["message"]}
            return {"sha": sha}
        if path.startswith(f"{prefix}/git/refs/heads/") and method == "PATCH":
            assert body["force"] is False
            self.refs[path.removeprefix(f"{prefix}/git/refs/heads/")] = body["sha"]
            return {}
        if path.startswith(f"{prefix}/compare/"):
            head = path.rsplit("...", 1)[1]
            return {"ahead_by": 0 if self.refs[head] in ("base-sha", "stale-sha") else 2}
        if path == f"{prefix}/pulls" and method == "POST":
            pull = {
                "number": len(self.pulls) + 1,
                "state": "open",
                "draft": body["draft"],
                "title": body["title"],
                "body": body["body"],
                "updated_at": (datetime.now(UTC) + timedelta(seconds=5)).isoformat(),
                "base": {"ref": body["base"]},
                "head": {"ref": body["head"]},
                "user": {"id": int(PEOPLE[login]["github_id"]), "login": login},
            }
            self.pulls.append(pull)
            return pull
        raise AssertionError(f"lời gọi chưa giả lập: {method} {path}")


@pytest.fixture
def team(set_env, monkeypatch):
    """Đội thật (giả lập GitHub): trưởng nhóm `lead`, thành viên `lan`, task đầu giao cho `lan`."""
    set_env(**GITHUB_ENV)
    fake = FakeGitHub()
    monkeypatch.setattr(github, "_api", fake.api)
    monkeypatch.setattr(github, "user_token", lambda code, _verifier: SECRET + code)
    monkeypatch.setattr(github, "current_user", lambda token: PEOPLE[token.removeprefix(SECRET)])
    monkeypatch.setattr(github, "find_user", lambda login: PEOPLE[login])
    repo = {"id": "11", "name": REPO, "branch": "main", "installation_id": "21", "private": False}
    monkeypatch.setattr(github, "accessible_repos", lambda _token: [repo])
    monkeypatch.setattr(github, "repo_pulls", lambda *_: ({"name": REPO, "branch": "main"}, []))
    app = create_app()
    with TestClient(app) as leader, TestClient(app) as member:
        _login(leader, "lead")
        _real_team(leader, "lead", "lan")
        _login(leader, "lead", "repos")
        _choose(leader, "11")
        draft = _draft(leader)
        for sprint in draft["plan"]["sprints"]:
            for task in sprint["tasks"]:
                task["assignee_id"] = "302"
        _apply(leader, draft)
        _login(member, "lan")
        yield leader, member, fake


def _begin(client, task_id, expected=200, version=None):
    version = _state(client)["repo_version"] if version is None else version
    return _write(client, "POST", f"/tasks/{task_id}/pr", {"repo_version": version}, expected=expected)


def _confirm(client, response, code):
    state = parse_qs(urlsplit(response.json()["url"]).query)["state"][0]
    result = client.get(BASE + "/auth/github/callback", params={"state": state, "code": code}, follow_redirects=False)
    return result.headers["location"]


def _first(client):
    return _tasks(client)[0]


def test_assignee_gets_branch_and_draft_pull_request(team, caplog):
    leader, member, fake = team
    task = _first(member)
    assert task["can_start"] is True
    assert _first(leader)["can_start"] is False

    started = _begin(member, task["id"])
    assert started.json()["url"].startswith("https://github.com/login/oauth/authorize?")
    assert fake.writes == []
    location = _confirm(member, started, "lan")
    assert location == f"/planning?github=pr_created&task={task['id']}"

    branch = f"task/t-{task['id']}"
    commit = fake.commits[fake.refs[branch]]
    assert commit == {"tree": "tree-base", "parents": ["base-sha"], "message": f"chore: bắt đầu T-{task['id']}"}
    assert fake.refs["main"] == "base-sha"
    pull = fake.pulls[0]
    assert (pull["draft"], pull["head"]["ref"], pull["base"]["ref"]) == (True, branch, "main")
    assert pull["title"] == f"[T-{task['id']}] {task['title']}"
    assert task["criteria"][0] in pull["body"]

    after = _first(member)
    assert after["progress"] == "doing"
    assert [row["number"] for row in after["pulls"]] == [1]
    assert after["can_start"] is False
    _begin(member, task["id"], expected=409)
    assert set(fake.tokens) == {SECRET + "lan"}
    with session_scope() as db:
        tables = [row[0] for row in db.execute(text("SELECT name FROM sqlite_master WHERE type = 'table'"))]
        stored = " ".join(str(db.execute(text(f"SELECT * FROM {name}")).all()) for name in tables)
    assert "planning_tasks" in tables
    assert SECRET not in stored
    assert SECRET not in caplog.text
    assert SECRET not in member.get(BASE + "/state").text


def test_only_the_assignee_may_start_and_only_with_a_same_origin_post(team):
    leader, member, fake = team
    task_id = _first(member)["id"]
    _begin(leader, task_id, expected=403)
    _begin(member, 999999, expected=404)
    _begin(member, task_id, expected=409, version=99)
    assert member.post(BASE + f"/tasks/{task_id}/pr", json={"repo_version": 1}).status_code == 403
    assert member.get(BASE + "/auth/github", params={"intent": f"pr-{task_id}-1"}).status_code == 422
    assert fake.writes == []


def test_done_tasks_and_demo_teams_cannot_start(team, client):
    leader, member, _ = team
    task_id = _first(member)["id"]
    data = {"repo_version": _state(leader)["repo_version"], "status": "done"}
    _write(leader, "PUT", f"/tasks/{task_id}/status", data)
    assert _first(member)["can_start"] is False
    _begin(member, task_id, expected=409)
    _demo(client)
    _apply(client, _draft(client))
    assert all(task["can_start"] is False for task in _tasks(client))
    me = _state(client)["profile"]["github_id"]
    own = next(task for task in _tasks(client) if task["assignee_id"] == me)
    _begin(client, own["id"], expected=409)


def test_nothing_is_written_when_the_account_or_task_changes(team):
    leader, member, fake = team
    task = _first(member)
    started = _begin(member, task["id"])
    assert _confirm(member, started, "lead") == f"/planning?github=account&task={task['id']}"
    started = _begin(member, task["id"])
    fields = ("title", "description", "criteria", "deadline", "assignee_id", "status")
    body = {key: task[key] for key in fields} | {"assignee_id": "301"}
    _write(leader, "PATCH", f"/tasks/{task['id']}", {"repo_version": 1, "task": body})
    assert _confirm(member, started, "lan") == f"/planning?github=pr_stale&task={task['id']}"
    assert fake.writes == []


def test_existing_open_pull_request_is_reused(team):
    _, member, fake = team
    task = _first(member)
    started = _begin(member, task["id"])
    branch = f"task/t-{task['id']}"
    fake.refs[branch] = "work-sha"
    fake.pulls.append(
        {
            "number": 7,
            "state": "open",
            "draft": False,
            "title": f"[T-{task['id']}] Đã mở sẵn",
            "body": "",
            "updated_at": datetime.now(UTC).isoformat(),
            "base": {"ref": "main"},
            "head": {"ref": branch},
            "user": {"id": 302, "login": "lan"},
        }
    )
    assert _confirm(member, started, "lan") == f"/planning?github=pr_exists&task={task['id']}"
    assert fake.writes == []
    assert [row["number"] for row in _first(member)["pulls"]] == [7]


@pytest.mark.parametrize(("sha", "writes_commit"), [("work-sha", False), ("stale-sha", True), ("base-sha", True)])
def test_existing_branch_keeps_its_work(team, sha, writes_commit):
    _, member, fake = team
    task = _first(member)
    branch = f"task/t-{task['id']}"
    fake.refs[branch] = sha
    fake.commits.setdefault(sha, {"tree": "tree-work", "parents": []})
    _confirm(member, _begin(member, task["id"]), "lan")
    methods = [(method, path.rsplit("/", 2)[-1]) for method, path, _ in fake.writes]
    assert ("POST", "refs") not in methods
    assert any(path.endswith("/git/commits") for _, path, _ in fake.writes) is writes_commit
    if writes_commit:
        assert fake.commits[fake.refs[branch]]["parents"] == [sha]
    else:
        assert fake.refs[branch] == sha
    assert len(fake.pulls) == 1


@pytest.mark.parametrize(
    ("call", "error", "status"),
    [
        (("POST", f"/repos/{REPO}/git/refs"), (403,), "pr_permission"),
        (("POST", f"/repos/{REPO}/git/refs"), (404,), "pr_permission"),
        (("GET", f"/repos/{REPO}/git/ref/heads/main"), (409,), "pr_empty"),
        (("POST", f"/repos/{REPO}/pulls"), (422, "Draft pull requests are not supported"), "pr_draft"),
        (("POST", f"/repos/{REPO}/pulls"), (502,), "pr_failed"),
    ],
)
def test_github_failures_are_explained(team, call, error, status):
    _, member, fake = team
    task = _first(member)
    fake.fail[call] = error
    assert _confirm(member, _begin(member, task["id"]), "lan") == f"/planning?github={status}&task={task['id']}"
    assert fake.pulls == []
    assert _first(member)["pulls"] == []


def test_leader_sees_who_lacks_write_access(team, monkeypatch):
    leader, member, _ = team

    def access(repo_id, installation_id, repo, logins):
        assert (repo_id, installation_id, repo) == ("11", "21", REPO)
        return {"app_can_write": False, "members": {"lead": True, "lan": None}}

    monkeypatch.setattr(github, "repo_access", access)
    result = leader.get(BASE + "/repo/access").json()
    assert result["available"] is True
    assert result["app_can_write"] is False
    assert {row["login"]: row["write"] for row in result["members"]} == {"lead": True, "lan": None}
    assert result["settings_url"] == f"https://github.com/{REPO}/settings/access"
    assert result["invitations_url"] == f"https://github.com/{REPO}/invitations"
    assert result["app_url"] == "https://github.com/settings/apps/tang-test/permissions"
    assert member.get(BASE + "/repo/access").status_code == 403


def test_repo_access_reports_unknown_instead_of_guessing(monkeypatch, set_env):
    set_env(**GITHUB_ENV)
    monkeypatch.setattr(github, "_repo_token", lambda *_: "installation-token")
    monkeypatch.setattr(github, "_app_jwt", lambda: "app-jwt")

    def api(path, token="", method="GET", **_):
        if path == "/app/installations/21":
            return {"permissions": {"contents": "write", "pull_requests": "read"}}
        if path.endswith("/lead/permission"):
            return {"permission": "admin"}
        if path.endswith("/doc/permission"):
            return {"permission": "read"}
        raise github.GitHubError(403)

    monkeypatch.setattr(github, "_api", api)
    result = github.repo_access("11", "21", REPO, ["lead", "doc", "lan"])
    assert result == {"app_can_write": False, "members": {"lead": True, "doc": False, "lan": None}}

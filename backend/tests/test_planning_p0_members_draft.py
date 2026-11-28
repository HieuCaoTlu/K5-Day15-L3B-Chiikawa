import pytest
from fastapi.testclient import TestClient

from app.db import session_scope
from app.main import create_app
from app.planning import github
from app.planning.models import PlanningMember
from tests.test_planning import BASE, _choose, _demo, _draft, _login, _member, _state, _tasks, _write
from tests.test_planning_auto import _approve, _auto
from tests.test_planning_pr import GITHUB_ENV, PEOPLE, REPO
from tests.test_planning_team import _invite, _join


@pytest.fixture
def real_team(set_env, monkeypatch):
    set_env(**GITHUB_ENV)
    monkeypatch.setattr(github, "user_token", lambda code, _verifier: code)
    monkeypatch.setattr(github, "current_user", lambda token: PEOPLE[token])
    monkeypatch.setattr(
        github,
        "accessible_repos",
        lambda _token: [{"id": "11", "name": REPO, "branch": "main", "installation_id": "21", "private": True}],
    )
    monkeypatch.setattr(github, "repo_pulls", lambda *_args: ({"name": REPO, "branch": "main"}, []))

    def reject_lookup(_login):
        pytest.fail("Không cần tra GitHub để thêm người vào đội thật.")

    monkeypatch.setattr(github, "find_user", reject_lookup)
    app = create_app()
    with TestClient(app) as leader, TestClient(app) as guest:
        _login(leader, "lead")
        _login(guest, "lan")
        yield leader, guest


@pytest.mark.parametrize("existing_team", [False, True])
@pytest.mark.parametrize("guest_id", [None, "302"])
def test_real_team_requires_invite_for_new_member(real_team, existing_team, guest_id):
    leader, guest = real_team
    self_row = _member("lead", "Đạt")
    if existing_team:
        _write(leader, "PUT", "/members", {"members": [self_row]})
    new_row = {**_member("lan", "Lan"), "github_id": guest_id}
    denied = _write(leader, "PUT", "/members", {"members": [self_row, new_row]}, expected=409)
    assert "mã mời" in denied.json()["detail"]
    assert _state(leader)["role"] == ("leader" if existing_team else None)
    assert _state(guest)["role"] is None
    with session_scope() as db:
        assert db.get(PlanningMember, "302") is None


def test_real_leader_can_edit_member_who_joined_by_invite(real_team):
    leader, guest = real_team
    _write(leader, "PUT", "/members", {"members": [_member("lead", "Đạt")]})
    _join(guest, _invite(leader))
    rows = [{key: value for key, value in row.items() if key != "leader"} for row in _state(leader)["members"]]
    joined = next(row for row in rows if row["github_id"] == "302")
    joined.update(name="Lan Anh", experience="Kiểm thử API", tags=["QA"], avatar=3)
    _write(leader, "PUT", "/members", {"members": rows})
    assert next(row for row in _state(guest)["members"] if row["github_id"] == "302") == {**joined, "leader": False}


def test_demo_team_can_add_member(client):
    _demo(client)
    rows = [{key: value for key, value in row.items() if key != "leader"} for row in _state(client)["members"]]
    _write(client, "PUT", "/members", {"members": [*rows, _member("minh-demo", "Minh")]})
    assert {row["login"] for row in _state(client)["members"]} == {"truong-nhom-demo", "lan-demo", "minh-demo"}


def test_real_auto_assigns_only_members_who_joined(real_team, monkeypatch):
    leader, guest = real_team
    _write(leader, "PUT", "/members", {"members": [_member("lead", "Đạt")]})
    _join(guest, _invite(leader))
    outsider = {"github_id": "303", "login": "minh", "name": "Minh"}
    monkeypatch.setattr(github, "repo_collaborators", lambda *_args: [*PEOPLE.values(), outsider])
    _login(leader, "lead", "repos")
    _choose(leader, "11")
    _approve(leader)

    result = _auto(leader)
    assert result["created"] is True
    assert result["added"] == []
    assert result["invite_suggestions"] == ["minh"]
    assert {row["github_id"] for row in _state(leader)["members"]} == {"301", "302"}
    assert {task["assignee_id"] for task in _tasks(leader)} == {"301", "302"}
    with session_scope() as db:
        assert db.get(PlanningMember, "303") is None


def _draft_ref(client, draft):
    return {"draft_id": draft["id"], "repo_version": _state(client)["repo_version"]}


def test_discard_draft_allows_auto_plan_again(client):
    _demo(client)
    draft = _draft(client)
    _approve(client)
    assert _state(client)["auto_plan"] is False
    assert _auto(client) == {"created": False}

    _write(client, "DELETE", "/draft", _draft_ref(client, draft))
    state = _state(client)
    assert state["draft"] is None
    assert state["sprints"] == []
    assert state["auto_plan"] is True
    assert _auto(client)["created"] is True


@pytest.mark.parametrize("wrong_field", ["draft_id", "repo_version"])
def test_discard_draft_rejects_stale_reference(client, wrong_field):
    _demo(client)
    draft = _draft(client)
    data = _draft_ref(client, draft)
    data[wrong_field] = "f" * 32 if wrong_field == "draft_id" else data["repo_version"] + 1
    _write(client, "DELETE", "/draft", data, expected=409)
    assert _state(client)["draft"] == draft


def test_discard_draft_requires_leader(real_team):
    leader, guest = real_team
    _write(leader, "PUT", "/members", {"members": [_member("lead", "Đạt")]})
    _join(guest, _invite(leader))
    _login(leader, "lead", "repos")
    _choose(leader, "11")
    draft = _draft(leader)

    _write(guest, "DELETE", "/draft", _draft_ref(leader, draft), expected=403)
    assert _state(leader)["draft"] == draft


def test_discard_draft_requires_same_origin(client):
    _demo(client)
    draft = _draft(client)
    response = client.request("DELETE", BASE + "/draft", json=_draft_ref(client, draft))
    assert response.status_code == 403
    assert _state(client)["draft"] == draft

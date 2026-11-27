from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.db import session_scope
from app.main import create_app
from app.planning.generator import _number_sprints
from app.planning.models import PlanningSession
from app.planning.schemas import Plan, ProposedSprint
from tests.test_planning import BASE, WRITE, _apply, _choose, _demo, _demo_pull, _draft, _state, _tasks, _write

EMPTY = {"overview": "", "stories": [], "roles": {}, "links": {}, "stack": [], "cost": {}, "revenue": ""}
PROFILE = {"name": "Hoa", "experience": "Thiết kế UX trên Figma", "tags": ["Thiết kế"], "avatar": 2}


@pytest.fixture
def people():
    """Hàm mở thêm một trình duyệt mới trên cùng ứng dụng."""
    app = create_app()
    clients = []

    def _open(demo=True):
        client = TestClient(app)
        client.__enter__()
        clients.append(client)
        if demo:
            _write(client, "POST", "/auth/demo")
        return client

    yield _open
    for client in reversed(clients):
        client.__exit__(None, None, None)


def _invite(leader):
    _write(leader, "POST", "/invite")
    return _state(leader)["invite_code"]


def _join(client, code, expected=204, **profile):
    return _write(client, "POST", "/join", {**PROFILE, **profile, "code": code}, expected=expected)


def _board(client, expected=204, **data):
    body = {**EMPTY, "version": _state(client)["board"]["version"]}
    return _write(client, "PUT", "/board", {**body, **data}, expected=expected)


def test_join_with_code_gives_member_access(people):
    leader = people(demo=False)
    _demo(leader)
    assert _state(leader)["invite_code"] is None
    code = _invite(leader)
    assert len(code) == 8
    assert not set(code) & set("0O1I")

    guest = people()
    assert _state(guest)["role"] is None
    _join(guest, f" {code[:4].lower()}-{code[4:].lower()} ")
    state = _state(guest)
    assert state["role"] == "member"
    assert state["invite_code"] is None
    assert len(state["members"]) == 3
    logins = [member["login"].casefold() for member in state["members"]]
    assert len(set(logins)) == 3
    assert state["profile"]["login"] in logins
    assert state["repo"]["name"] == "tang-demo/san-pham"
    _join(guest, code, expected=409)
    _write(guest, "POST", "/invite", expected=403)
    _write(guest, "DELETE", "/invite", expected=403)


def test_replaced_or_disabled_code_stops_working(people):
    leader = people(demo=False)
    _demo(leader)
    old = _invite(leader)
    new = _invite(leader)
    assert new != old
    guest = people()
    _join(guest, old, expected=404)
    _write(leader, "DELETE", "/invite")
    assert _state(leader)["invite_code"] is None
    _join(guest, new, expected=404)
    assert _state(guest)["role"] is None


def test_wrong_codes_are_rate_limited(people):
    leader = people(demo=False)
    _demo(leader)
    code = _invite(leader)
    guest = people()
    for _ in range(10):
        _join(guest, "AAAAAAAA", expected=404)
    _join(guest, code, expected=429)
    assert _state(guest)["role"] is None


def test_demo_and_real_accounts_cannot_share_a_team(people):
    leader = people(demo=False)
    _demo(leader)
    code = _invite(leader)
    guest = people()
    with session_scope() as db:
        for session in db.query(PlanningSession).all():
            if session.github_id == _state(guest)["profile"]["github_id"]:
                session.demo = False
        db.commit()
    _join(guest, code, expected=404)


def test_team_holds_at_most_sixteen_people(people):
    leader = people(demo=False)
    _demo(leader)
    code = _invite(leader)
    for _ in range(14):
        _join(people(), code)
    _join(people(), code, expected=409)
    assert len(_state(leader)["members"]) == 16


def test_board_is_shared_and_only_the_leader_edits_it(people):
    leader = people(demo=False)
    _demo(leader)
    assert _state(leader)["board"] == {**EMPTY, "version": 0}
    me = _state(leader)["profile"]["github_id"]
    saved = {
        "overview": "Tra cứu đơn nhanh",
        "stories": ["Là khách, tôi muốn xem đơn"],
        "roles": {"AI engineer": me},
        "links": {"deck": "https://example.com/deck"},
        "stack": [{"layer": "Giao diện", "choice": "Next.js", "reason": ""}],
        "cost": {"teams": 30, "price": 39.5},
        "revenue": "Thuê bao tháng",
    }
    _board(leader, **saved)
    guest = people()
    _join(guest, _invite(leader))
    assert _state(guest)["board"] == {**saved, "version": 1}
    _board(guest, expected=403, overview="Sửa trộm")
    _board(leader, expected=409, version=0, overview="Bản cũ")
    assert _state(leader)["board"]["overview"] == "Tra cứu đơn nhanh"
    _choose(leader, "demo-2", reset=True)
    assert _state(leader)["board"]["overview"] == "Tra cứu đơn nhanh"


@pytest.mark.parametrize(
    "bad",
    [
        {"roles": {"Giám đốc": ""}},
        {"roles": {"AI engineer": "nguoi-ngoai-doi"}},
        {"overview": "x" * 2001},
        {"stories": ["x" * 421]},
        {"stories": ["a"] * 13},
        {"links": {"deck": "javascript:alert(1)"}},
        {"links": {"la": "https://example.com"}},
        {"stack": [{"layer": "", "choice": "", "reason": ""}]},
        {"stack": [{"layer": "a", "choice": "", "reason": ""}] * 13},
        {"cost": {"teams": -1}},
        {"cost": {"khac": 1}},
        {"revenue": "x" * 1001},
    ],
)
def test_board_rejects_invalid_content(people, bad):
    leader = people(demo=False)
    _demo(leader)
    _board(leader, expected=422, **bad)
    assert _state(leader)["board"]["version"] == 0


def test_removing_a_member_revokes_access(people):
    leader = people(demo=False)
    _demo(leader)
    guest = people()
    _join(guest, _invite(leader))
    guest_id = _state(guest)["profile"]["github_id"]
    leader_id = _state(leader)["profile"]["github_id"]
    _board(leader, roles={"UX và pitching": guest_id})

    _write(guest, "DELETE", f"/members/{leader_id}", expected=403)
    _write(leader, "DELETE", f"/members/{leader_id}", expected=409)
    _write(leader, "DELETE", f"/members/{guest_id}")
    assert _state(guest)["role"] is None
    assert _state(guest)["members"] == []
    assert _state(guest)["board"] is None
    assert _state(leader)["board"]["roles"] == {}
    _write(leader, "DELETE", f"/members/{guest_id}", expected=404)


def test_member_with_tasks_stays_and_draft_naming_a_removed_member_is_dropped(people):
    leader = people(demo=False)
    _demo(leader)
    draft = _draft(leader)
    other = next(m["github_id"] for m in _state(leader)["members"] if not m["leader"])
    for sprint in draft["plan"]["sprints"]:
        for task in sprint["tasks"]:
            task["assignee_id"] = other
    _apply(leader, draft)
    assert _tasks(leader)
    _write(leader, "DELETE", f"/members/{other}", expected=409)

    fresh = people(demo=False)
    _demo(fresh)
    pending = _draft(fresh)
    assigned = pending["plan"]["sprints"][0]["tasks"][0]["assignee_id"]
    if assigned == _state(fresh)["profile"]["github_id"]:
        assigned = pending["plan"]["sprints"][0]["tasks"][1]["assignee_id"]
    _write(fresh, "DELETE", f"/members/{assigned}")
    assert _state(fresh)["draft"] is None


def test_writes_need_the_planning_header(client):
    assert client.post(BASE + "/join", json={**PROFILE, "code": "AAAAAAAA"}).status_code == 403
    assert client.post(BASE + "/join", headers=WRITE, json={**PROFILE, "code": "AAAAAAAA"}).status_code == 401


def test_task_board_can_send_a_task_back_as_state_returned_it(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    task = _tasks(leader)[0]
    other = next(m["github_id"] for m in _state(leader)["members"] if m["github_id"] != task["assignee_id"])
    fields = ("title", "description", "criteria", "deadline", "assignee_id", "status")
    body = {key: task[key] for key in fields} | {"assignee_id": other, "status": "doing"}
    version = _state(leader)["repo_version"]
    _write(leader, "PATCH", f"/tasks/{task['id']}", {"repo_version": version, "task": body})
    saved = _tasks(leader)[0]
    assert (saved["assignee_id"], saved["status"], saved["progress"]) == (other, "doing", "doing")

    guest = people()
    _join(guest, _invite(leader))
    _write(guest, "PATCH", f"/tasks/{task['id']}", {"repo_version": version, "task": body}, expected=403)


def test_log_records_each_real_progress_change_once(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    assert _state(leader)["log"] == []
    task = _tasks(leader)[0]
    for state in ("open", "open", "merged", "merged"):
        _demo_pull(leader, task, task["assignee_id"], state, number=7)
    messages = [row["message"] for row in _state(leader)["log"]]
    assert messages == [
        f"Merge PR #7: {task['code']} chuyển từ Chờ review sang Xong",
        f"PR #7 chờ review: {task['code']} chuyển từ Cần làm sang Chờ review",
    ]
    assert _state(leader)["log"][0]["at"]

    guest = people()
    _join(guest, _invite(leader))
    assert [row["message"] for row in _state(guest)["log"]] == messages
    _choose(leader, "demo-2", reset=True)
    assert _state(leader)["log"] == []


def test_log_covers_manual_links_and_keeps_the_latest_thirty(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    task = _tasks(leader)[0]
    stranger = next(m["github_id"] for m in _state(leader)["members"] if m["github_id"] != task["assignee_id"])
    _demo_pull(leader, task, stranger, "open", number=9)
    assert _state(leader)["log"] == []
    version = _state(leader)["repo_version"]
    _write(leader, "PUT", "/pulls/9/link", {"repo_version": version, "task_id": task["id"]})
    assert _state(leader)["log"][0]["message"].endswith(f"{task['code']} chuyển từ Cần làm sang Chờ review")
    for index in range(32):
        _demo_pull(leader, task, stranger, "draft" if index % 2 == 0 else "open", number=9)
    assert len(_state(leader)["log"]) == 30


def _move(client, task_id, status, expected=204):
    data = {"repo_version": _state(client)["repo_version"], "status": status}
    _write(client, "PUT", f"/tasks/{task_id}/status", data, expected=expected)


def test_manual_move_holds_until_the_pull_request_really_changes(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    task = _tasks(leader)[0]
    _demo_pull(leader, task, task["assignee_id"], "open", number=5)
    assert _tasks(leader)[0]["progress"] == "review"

    for target in ("doing", "todo", "done"):
        _move(leader, task["id"], target)
        assert _tasks(leader)[0]["progress"] == target
        # Đọc lại cùng PR (kể cả khi GitHub chỉ đổi thời điểm cập nhật) không được kéo thẻ về chỗ cũ.
        _demo_pull(leader, task, task["assignee_id"], "open", number=5)
        assert _tasks(leader)[0]["progress"] == target
    logged = len(_state(leader)["log"])

    _demo_pull(leader, task, task["assignee_id"], "draft", number=5)
    assert _tasks(leader)[0]["progress"] == "doing"
    assert len(_state(leader)["log"]) == logged + 1


def test_editing_status_in_the_task_form_also_overrides_the_pull_request(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    task = _tasks(leader)[0]
    _demo_pull(leader, task, task["assignee_id"], "open", number=5)
    fields = ("title", "description", "criteria", "deadline", "assignee_id", "status")
    body = {key: _tasks(leader)[0][key] for key in fields} | {"status": "doing"}
    _write(leader, "PATCH", f"/tasks/{task['id']}", {"repo_version": _state(leader)["repo_version"], "task": body})
    assert _tasks(leader)[0]["progress"] == "doing"


def test_only_the_leader_moves_cards_of_their_own_team(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    task_id = _tasks(leader)[0]["id"]
    guest = people()
    _join(guest, _invite(leader))
    _move(guest, task_id, "done", expected=403)
    _move(leader, task_id, "xong", expected=422)
    _move(leader, 999999, "done", expected=404)
    outsider = people(demo=False)
    _demo(outsider)
    _move(outsider, task_id, "done", expected=404)
    assert _tasks(leader)[0]["progress"] == "todo"


def _next_draft(client, days=14):
    last = max(sprint["ends_on"] for sprint in _state(client)["sprints"])
    starts = date.fromisoformat(last) + timedelta(days=1)
    brief = {
        "overview": "Làm tiếp phần báo cáo.",
        "stories": ["Xem báo cáo ngày", "Xuất báo cáo"],
        "starts_on": starts.isoformat(),
        "ends_on": (starts + timedelta(days=days - 1)).isoformat(),
    }
    data = {"repo_version": _state(client)["repo_version"], "brief": brief}
    return _write(client, "POST", "/draft", data, expected=200).json()


def test_new_sprints_continue_the_numbering(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    first = [sprint["title"] for sprint in _state(leader)["sprints"]]
    assert first == ["Sprint 1", "Sprint 2"]

    draft = _next_draft(leader)
    assert [sprint["title"] for sprint in draft["plan"]["sprints"]] == ["Sprint 3", "Sprint 4"]
    _apply(leader, draft)
    assert [sprint["title"] for sprint in _state(leader)["sprints"]] == [f"Sprint {n}" for n in range(1, 5)]
    assert _next_draft(leader, days=7)["plan"]["sprints"][0]["title"] == "Sprint 5"


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("Sprint 1", "Sprint 3"),
        ("sprint 1: Báo cáo", "Sprint 3: Báo cáo"),
        ("Hoàn thiện báo cáo", "Hoàn thiện báo cáo"),
    ],
)
def test_numbering_also_applies_to_titles_written_by_the_model(given, expected):
    sprint = ProposedSprint.model_construct(title=given)
    _number_sprints(Plan.model_construct(sprints=[sprint]), 2)
    assert sprint.title == expected


def _delete_task(client, task_id, expected=204, version=None):
    version = _state(client)["repo_version"] if version is None else version
    _write(client, "DELETE", f"/tasks/{task_id}", {"repo_version": version}, expected=expected)


def test_deleting_a_task_releases_its_pull_requests(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    first, second = _tasks(leader)[:2]
    _demo_pull(leader, first, first["assignee_id"], "open", number=1)
    _demo_pull(leader, second, second["assignee_id"], "merged", number=2)

    _delete_task(leader, first["id"])
    _delete_task(leader, second["id"])
    ids = [task["id"] for task in _tasks(leader)]
    assert first["id"] not in ids and second["id"] not in ids
    inbox = _state(leader)["inbox"]
    # PR còn mở quay về danh sách cần đối chiếu; PR đã merge của task đã xóa thì không làm phiền nữa.
    assert [(row["number"], row["task_id"]) for row in inbox] == [(1, None)]
    assert f"T-{first['id']} đã bị xóa" in inbox[0]["note"]
    _delete_task(leader, first["id"], expected=404)


def test_removing_the_last_task_removes_the_sprint_and_ids_are_not_reused(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    sprints = _state(leader)["sprints"]
    last = sprints[-1]
    highest = max(task["id"] for task in _tasks(leader))
    for task in last["tasks"]:
        _delete_task(leader, task["id"])
    assert [sprint["id"] for sprint in _state(leader)["sprints"]] == [sprint["id"] for sprint in sprints[:-1]]
    _apply(leader, _next_draft(leader))
    assert min(task["id"] for task in _state(leader)["sprints"][-1]["tasks"]) > highest


def test_only_the_leader_deletes_tasks_of_their_own_team(people):
    leader = people(demo=False)
    _demo(leader)
    _apply(leader, _draft(leader))
    task_id = _tasks(leader)[0]["id"]
    guest = people()
    _join(guest, _invite(leader))
    _delete_task(guest, task_id, expected=403)
    outsider = people(demo=False)
    _demo(outsider)
    _delete_task(outsider, task_id, expected=404)
    _delete_task(leader, task_id, expected=409, version=99)
    assert task_id in [task["id"] for task in _tasks(leader)]


def test_eight_avatar_styles_are_accepted(people):
    leader = people(demo=False)
    _demo(leader)
    guest = people()
    _join(guest, _invite(leader), expected=422, avatar=8)
    _join(guest, _invite(leader), avatar=7)
    assert 7 in [member["avatar"] for member in _state(leader)["members"]]

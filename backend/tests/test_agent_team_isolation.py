"""Cô lập Thinking/Canvas theo đội: quyền truy cập agent runs, claim session, review, cookie và handoff."""

import logging

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.agent import nodes
from app.db import session_scope
from app.planning import handoff
from app.planning.auth import COOKIE, LEGACY_COOKIE
from app.planning.models import PlanningMember, PlanningTeam, PlanningThinkingSession, PlanningWorkspace
from app.planning.workspace import backfill_thinking_sessions, thinking_owner_team_id
from tests.test_planning import BASE, _demo, _state, _write
from tests.test_planning_team import _invite, _join, people  # noqa: F401 — fixture

GO_MESSAGES = [
    "Người dùng là chị Lan, chủ shop mỹ phẩm. Tuần trước chị Lan mất 3 đơn vì trả lời trễ 2 giờ.",
    "Tuần trước chị Lan mất 3 đơn vì trả lời tin nhắn trễ 2 giờ, mất khoảng 1,5 triệu.",
    "Hiện chị Lan trả lời tay qua Zalo, hôm qua chị Lan còn ghi đơn vào Excel vì chưa có công cụ khác.",
    "Chị Lan muốn trả lời kịp khách. Hôm qua chị Lan nói thẳng: phải trả lời kịp khách ngay lúc họ hỏi.",
    "Giải pháp: làm một bot trả lời tin nhắn Zalo cho shop.",
    "AI hiểu câu hỏi tự do của khách thay vì khớp từ khoá.",
    "Bản đầu chỉ cần trả lời giá và size, chưa cần chốt đơn.",
    "Chị Lan sẵn sàng trả tiền nếu mỗi tuần giảm được 3 đơn mất.",
    "Đối thủ hiện có là Zalo OA trả lời theo từ khoá cố định; mình khác ở chỗ hiểu câu hỏi tự do của khách.",
]


@pytest.fixture(autouse=True)
def offline_llm(monkeypatch):
    def unavailable(*_args, **_kwargs):
        raise nodes.llm.LLMUnavailableError

    monkeypatch.setattr(nodes.llm, "structured", unavailable)


def _agent(client, method: str, path: str, *, same_origin: bool = True, **kwargs):
    headers = dict(kwargs.pop("headers", {}) or {})
    if same_origin:
        headers.setdefault("X-Planning-Request", "1")
    token = None
    for cookie in client.cookies.jar:
        if cookie.name == COOKIE:
            token = cookie.value
            break
    if token:
        existing = headers.get("Cookie", "")
        headers["Cookie"] = f"{existing}; {COOKIE}={token}".lstrip("; ")
    return client.request(method, f"/api/v1/agent{path}", headers=headers, **kwargs)


def _claim_thinking(client, session_id: str, expected: int = 204):
    version = _state(client)["thinking"]["version"]
    return _write(
        client,
        "PUT",
        "/thinking",
        {"version": version, "session": session_id, "msgs": []},
        expected=expected,
    )


def _reach_waiting_review(client, session_id: str) -> dict:
    run = None
    for text in GO_MESSAGES:
        res = _agent(client, "POST", "/runs", json={"request": text, "session_id": session_id})
        assert res.status_code == 201, res.text
        run = res.json()
        if run["status"] == "waiting_review":
            break
    assert run is not None and run["status"] == "waiting_review"
    return run


def test_team_b_cannot_claim_team_a_thinking_session(people):  # noqa: F811
    leader_a = people(demo=False)
    _demo(leader_a)
    _claim_thinking(leader_a, "th-team-a")
    _claim_thinking(leader_a, "th-team-a", expected=204)

    leader_b = people(demo=False)
    _demo(leader_b)
    _claim_thinking(leader_b, "th-team-a", expected=409)
    assert _state(leader_b)["thinking"]["session"] == ""


def test_team_session_blocks_outsider_member_and_other_team_on_runs_and_review(people):  # noqa: F811
    leader_a = people(demo=False)
    _demo(leader_a)
    member_a = people()
    _join(member_a, _invite(leader_a))
    _claim_thinking(leader_a, "th-alpha")

    leader_b = people(demo=False)
    _demo(leader_b)
    _claim_thinking(leader_b, "th-beta")

    outsider = people(demo=False)
    unaffiliated = people()  # đã đăng nhập demo nhưng chưa vào đội nào

    waiting = _reach_waiting_review(leader_a, "th-alpha")
    run_id = waiting["id"]

    # POST /runs: thành viên đội A được phép, người ngoài / đội khác bị chặn, thiếu same-origin bị 403
    assert _agent(member_a, "POST", "/runs", json={"request": "Hỏi thêm.", "session_id": "th-alpha"}).status_code == 201
    waiting = _reach_waiting_review(leader_a, "th-alpha")
    run_id = waiting["id"]

    assert (
        _agent(
            leader_a, "POST", "/runs", same_origin=False, json={"request": "x", "session_id": "th-alpha"}
        ).status_code
        == 403
    )
    assert _agent(outsider, "POST", "/runs", json={"request": "x", "session_id": "th-alpha"}).status_code == 401
    assert _agent(unaffiliated, "POST", "/runs", json={"request": "x", "session_id": "th-alpha"}).status_code == 403
    assert _agent(leader_b, "POST", "/runs", json={"request": "x", "session_id": "th-alpha"}).status_code == 403

    # GET /runs?session_id=... và GET /runs/{id}
    assert _agent(leader_a, "GET", "/runs", params={"session_id": "th-alpha"}).status_code == 200
    assert _agent(member_a, "GET", "/runs", params={"session_id": "th-alpha"}).status_code == 200
    assert _agent(outsider, "GET", "/runs", params={"session_id": "th-alpha"}).status_code == 401
    assert _agent(unaffiliated, "GET", "/runs", params={"session_id": "th-alpha"}).status_code == 403
    assert _agent(leader_b, "GET", "/runs", params={"session_id": "th-alpha"}).status_code == 403

    assert _agent(leader_a, "GET", f"/runs/{run_id}").status_code == 200
    assert _agent(member_a, "GET", f"/runs/{run_id}").status_code == 200
    assert _agent(outsider, "GET", f"/runs/{run_id}").status_code == 401
    assert _agent(unaffiliated, "GET", f"/runs/{run_id}").status_code == 403
    assert _agent(leader_b, "GET", f"/runs/{run_id}").status_code == 403

    # POST /runs/{id}/review: chỉ trưởng nhóm đội A + same-origin
    assert _agent(outsider, "POST", f"/runs/{run_id}/review", json={"approved": True}).status_code == 401
    assert _agent(unaffiliated, "POST", f"/runs/{run_id}/review", json={"approved": True}).status_code == 403
    assert _agent(member_a, "POST", f"/runs/{run_id}/review", json={"approved": True}).status_code == 403
    assert _agent(leader_b, "POST", f"/runs/{run_id}/review", json={"approved": True}).status_code == 403
    assert (
        _agent(leader_a, "POST", f"/runs/{run_id}/review", same_origin=False, json={"approved": True}).status_code
        == 403
    )

    reviewed = _agent(leader_a, "POST", f"/runs/{run_id}/review", json={"approved": True, "note": "OK"})
    assert reviewed.status_code == 200
    body = reviewed.json()
    assert body["status"] == "approved"
    assert body["result"]["handoff"] == "planning"


def test_list_runs_without_session_id_is_isolated_per_team(people):  # noqa: F811
    outsider = people(demo=False)
    public_res = _agent(
        outsider,
        "POST",
        "/runs",
        same_origin=False,
        json={"request": "Ý tưởng công khai, chưa hỏi ai.", "session_id": "public-session"},
    )
    assert public_res.status_code == 201
    public_run_id = public_res.json()["id"]

    leader_a = people(demo=False)
    _demo(leader_a)
    _claim_thinking(leader_a, "th-only-a")
    run_a = _agent(leader_a, "POST", "/runs", json={"request": "Ý tưởng đội A.", "session_id": "th-only-a"}).json()

    leader_b = people(demo=False)
    _demo(leader_b)
    _claim_thinking(leader_b, "th-only-b")
    run_b = _agent(leader_b, "POST", "/runs", json={"request": "Ý tưởng đội B.", "session_id": "th-only-b"}).json()

    leader_c = people(demo=False)
    _demo(leader_c)  # chưa claim session nào

    assert [r["id"] for r in _agent(leader_a, "GET", "/runs").json()] == [run_a["id"]]
    assert [r["id"] for r in _agent(leader_b, "GET", "/runs").json()] == [run_b["id"]]
    assert _agent(leader_c, "GET", "/runs").json() == []
    assert [r["id"] for r in _agent(outsider, "GET", "/runs", same_origin=False).json()] == [public_run_id]


def test_unclaimed_session_still_works_without_login(client):
    waiting = _reach_waiting_review(client, "anon-session")
    run_id = waiting["id"]

    listed = client.get("/api/v1/agent/runs", params={"session_id": "anon-session"})
    assert listed.status_code == 200
    assert any(r["id"] == run_id for r in listed.json())

    fetched = client.get(f"/api/v1/agent/runs/{run_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == run_id

    reviewed = client.post(f"/api/v1/agent/runs/{run_id}/review", json={"approved": True})
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "approved"
    assert reviewed.json()["result"]["handoff"] == "planning"


def test_handoff_ignores_runs_from_another_team(people):  # noqa: F811
    leader_a = people(demo=False)
    _demo(leader_a)
    _claim_thinking(leader_a, "th-handoff-a")
    waiting_a = _reach_waiting_review(leader_a, "th-handoff-a")
    reviewed_a = _agent(leader_a, "POST", f"/runs/{waiting_a['id']}/review", json={"approved": True})
    assert reviewed_a.status_code == 200

    # Đội A làm mới sang phiên mới; DB vẫn giữ result.team_id của đội A trên run cũ.
    _claim_thinking(leader_a, "th-handoff-a-next")

    leader_b = people(demo=False)
    _demo(leader_b)
    leader_b_gid = _state(leader_b)["profile"]["github_id"]
    with session_scope() as db:
        team_b_id = db.get(PlanningMember, leader_b_gid).team_id
        ws = db.get(PlanningWorkspace, (team_b_id, "thinking"))
        if ws:
            ws.data, ws.version = {"session": "th-handoff-a", "msgs": []}, ws.version + 1
        else:
            db.add(
                PlanningWorkspace(
                    team_id=team_b_id, section="thinking", data={"session": "th-handoff-a", "msgs": []}, version=1
                )
            )
        db.commit()

        team_b_obj = db.get(PlanningTeam, team_b_id)
        assert handoff.approved_run(db, team_b_obj) is None
    assert _state(leader_b)["auto_plan"] is False


def test_leader_first_chat_turn_claims_session_before_run(people):  # noqa: F811
    leader_a = people(demo=False)
    _demo(leader_a)
    member_a = people()
    _join(member_a, _invite(leader_a))
    leader_b = people(demo=False)
    _demo(leader_b)
    outsider = people(demo=False)

    # Thiếu X-Planning-Request khi trưởng nhóm mở phiên mới → 403, không tạo claim hoặc run.
    denied = _agent(
        leader_a, "POST", "/runs", same_origin=False, json={"request": "Ý tưởng mới", "session_id": "th-turn1"}
    )
    assert denied.status_code == 403
    with session_scope() as db:
        assert thinking_owner_team_id(db, "th-turn1") is None

    # Thành viên thường gửi vào phiên chưa có chủ không được tạo claim (giữ hành vi công khai).
    member_pub = _agent(member_a, "POST", "/runs", json={"request": "Hỏi thử công khai", "session_id": "th-member-pub"})
    assert member_pub.status_code == 201
    with session_scope() as db:
        assert thinking_owner_team_id(db, "th-member-pub") is None

    # Lượt đầu của trưởng nhóm (chưa hề PUT /planning/thinking) → claim ngay trước khi chạy agent.
    first = _agent(leader_a, "POST", "/runs", json={"request": GO_MESSAGES[0], "session_id": "th-turn1"})
    assert first.status_code == 201
    run_id = first.json()["id"]
    leader_a_gid = _state(leader_a)["profile"]["github_id"]
    with session_scope() as db:
        team_a_id = db.get(PlanningMember, leader_a_gid).team_id
        assert thinking_owner_team_id(db, "th-turn1") == team_a_id

    # Lượt đầu đã được bảo vệ khỏi người ngoài và đội khác; thành viên đội A xem được.
    assert _agent(outsider, "GET", f"/runs/{run_id}").status_code == 401
    assert _agent(leader_b, "GET", f"/runs/{run_id}").status_code == 403
    assert _agent(member_a, "GET", f"/runs/{run_id}").status_code == 200
    assert [r["id"] for r in _agent(outsider, "GET", "/runs", same_origin=False).json()] == [member_pub.json()["id"]]
    assert [r["id"] for r in _agent(leader_a, "GET", "/runs").json()] == [run_id]


def test_team_cannot_claim_public_session_with_existing_history(people):  # noqa: F811
    outsider = people(demo=False)
    pub = _agent(
        outsider, "POST", "/runs", same_origin=False, json={"request": "Ý tưởng công khai", "session_id": "pub-hist"}
    )
    assert pub.status_code == 201

    leader_a = people(demo=False)
    _demo(leader_a)
    res = _claim_thinking(leader_a, "pub-hist", expected=409)
    assert "phiên mới" in res.json()["detail"].casefold()

    # Trưởng nhóm gửi vào phiên đã có lịch sử công khai cũng không được claim.
    follow = _agent(leader_a, "POST", "/runs", json={"request": "Nối tiếp", "session_id": "pub-hist"})
    assert follow.status_code == 201
    with session_scope() as db:
        assert thinking_owner_team_id(db, "pub-hist") is None
    assert _agent(outsider, "GET", "/runs", params={"session_id": "pub-hist"}).status_code == 200


def test_duplicate_claim_integrity_error_returns_409(people, monkeypatch):  # noqa: F811
    leader_a = people(demo=False)
    _demo(leader_a)
    leader_b = people(demo=False)
    _demo(leader_b)

    real_commit = Session.commit
    failed_once = False

    def fail_on_claim_commit(self):
        nonlocal failed_once
        if not failed_once and any(isinstance(obj, PlanningThinkingSession) for obj in self.new):
            failed_once = True
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        return real_commit(self)

    monkeypatch.setattr(Session, "commit", fail_on_claim_commit)
    _claim_thinking(leader_a, "th-race", expected=409)
    assert _state(leader_a)["thinking"]["session"] == ""

    # Mô phỏng race trong POST /agent/runs khi đội khác vừa thắng giao dịch.
    _claim_thinking(leader_b, "th-race-run")
    monkeypatch.setattr("app.api.agent.thinking_owner_team_id", lambda *_args: None)
    raced = _agent(leader_a, "POST", "/runs", json={"request": "Ý tưởng", "session_id": "th-race-run"})
    assert raced.status_code == 409


def test_session_refresh_keeps_old_waiting_review_run_protected(people):  # noqa: F811
    leader_a = people(demo=False)
    _demo(leader_a)
    leader_b = people(demo=False)
    _demo(leader_b)
    outsider = people(demo=False)

    waiting = _reach_waiting_review(leader_a, "th-old-wait")
    assert waiting["result"] is None  # waiting_review không mang team_id trong result
    old_run_id = waiting["id"]

    # Trưởng nhóm "Làm mới" sang phiên khác.
    _claim_thinking(leader_a, "th-fresh-2")
    _agent(leader_a, "POST", "/runs", json={"request": "Phiên mới", "session_id": "th-fresh-2"})

    # Phiên cũ và run waiting_review cũ vẫn thuộc đội A, không lộ cho công khai hay đội B.
    assert _agent(outsider, "GET", f"/runs/{old_run_id}").status_code == 401
    assert _agent(leader_b, "GET", f"/runs/{old_run_id}").status_code == 403
    assert _agent(outsider, "GET", "/runs", params={"session_id": "th-old-wait"}).status_code == 401
    assert _agent(outsider, "GET", "/runs", same_origin=False).json() == []
    assert _claim_thinking(leader_b, "th-old-wait", expected=409).status_code == 409
    assert old_run_id in [r["id"] for r in _agent(leader_a, "GET", "/runs").json()]


def test_handoff_ignores_unclaimed_public_run(people):  # noqa: F811
    outsider = people(demo=False)
    waiting = _reach_waiting_review(outsider, "pub-unclaimed-go")
    reviewed = _agent(outsider, "POST", f"/runs/{waiting['id']}/review", same_origin=False, json={"approved": True})
    assert reviewed.status_code == 200
    assert reviewed.json()["result"]["handoff"] == "planning"

    leader_a = people(demo=False)
    _demo(leader_a)
    leader_a_gid = _state(leader_a)["profile"]["github_id"]
    with session_scope() as db:
        team_a_id = db.get(PlanningMember, leader_a_gid).team_id
        db.add(
            PlanningWorkspace(
                team_id=team_a_id, section="thinking", data={"session": "pub-unclaimed-go", "msgs": []}, version=1
            )
        )
        db.commit()
        team_a = db.get(PlanningTeam, team_a_id)
        assert handoff.approved_run(db, team_a) is None
    assert _state(leader_a)["auto_plan"] is False


def test_backfill_thinking_sessions_handles_duplicates_and_empty(client, caplog):
    with session_scope() as db:
        db.add_all(
            [
                PlanningTeam(id="team-1", demo=True),
                PlanningTeam(id="team-2", demo=True),
                PlanningTeam(id="team-3", demo=True),
            ]
        )
        db.flush()
        db.add_all(
            [
                PlanningWorkspace(
                    team_id="team-1", section="thinking", data={"session": "dup-sid", "msgs": []}, version=1
                ),
                PlanningWorkspace(
                    team_id="team-2", section="thinking", data={"session": "dup-sid", "msgs": []}, version=1
                ),
                PlanningWorkspace(team_id="team-3", section="thinking", data={"session": "", "msgs": []}, version=1),
            ]
        )
        db.commit()

        with caplog.at_level(logging.WARNING, logger="app.planning.workspace"):
            added = backfill_thinking_sessions(db)
        assert added == 1
        assert thinking_owner_team_id(db, "dup-sid") == "team-1"
        assert any("dup-sid" in rec.message for rec in caplog.records)
        assert backfill_thinking_sessions(db) == 0


def test_get_runs_empty_session_id_returns_422(client):
    assert client.get("/api/v1/agent/runs", params={"session_id": ""}).status_code == 422
    assert client.get("/api/v1/agent/runs", params={"session_id": "   "}).status_code == 422


def _parse_set_cookies(response) -> dict[str, dict[str, str]]:
    parsed: dict[str, dict[str, str]] = {}
    for header in response.headers.get_list("set-cookie"):
        parts = [part.strip() for part in header.split(";")]
        name, _, value = parts[0].partition("=")
        attrs = {"value": value}
        for attr in parts[1:]:
            k, _, v = attr.partition("=")
            attrs[k.casefold()] = v
        parsed[name] = attrs
    return parsed


def test_cookie_migration_and_no_reissue_when_new_cookie_present(people):  # noqa: F811
    client = people(demo=False)
    login = _write(client, "POST", "/auth/demo")
    login_cookies = _parse_set_cookies(login)
    assert COOKIE in login_cookies
    assert login_cookies[COOKIE]["path"] == "/api/v1"
    assert int(login_cookies[COOKIE]["max-age"]) > 0
    assert LEGACY_COOKIE in login_cookies
    assert login_cookies[LEGACY_COOKIE]["path"] == "/api/v1/planning"
    assert login_cookies[LEGACY_COOKIE]["max-age"] == "0"

    token = login_cookies[COOKIE]["value"]
    client.cookies.clear()

    # 1. Chỉ có cookie cũ → /state nhận diện được phiên, cấp cookie mới + xóa cookie cũ.
    migrated = client.get(f"{BASE}/state", headers={"Cookie": f"{LEGACY_COOKIE}={token}"})
    assert migrated.status_code == 200
    assert migrated.json()["profile"] is not None
    migrated_cookies = _parse_set_cookies(migrated)
    assert set(migrated_cookies) == {COOKIE, LEGACY_COOKIE}
    assert migrated_cookies[COOKIE]["value"] == token
    assert migrated_cookies[COOKIE]["path"] == "/api/v1"
    assert int(migrated_cookies[COOKIE]["max-age"]) > 0
    assert migrated_cookies[LEGACY_COOKIE]["path"] == "/api/v1/planning"
    assert migrated_cookies[LEGACY_COOKIE]["max-age"] == "0"

    # 2. Đã có cookie mới (kể cả gửi kèm cookie cũ) → /state không phát lại Set-Cookie.
    clean = client.get(f"{BASE}/state", headers={"Cookie": f"{COOKIE}={token}"})
    assert clean.status_code == 200
    assert clean.json()["profile"] is not None
    assert clean.headers.get_list("set-cookie") == []

    both = client.get(f"{BASE}/state", headers={"Cookie": f"{COOKIE}={token}; {LEGACY_COOKIE}={token}"})
    assert both.status_code == 200
    assert both.headers.get_list("set-cookie") == []

    # 3. Đăng xuất xóa cả cookie mới và cookie cũ.
    out = client.post(
        f"{BASE}/auth/logout",
        headers={"X-Planning-Request": "1", "Cookie": f"{COOKIE}={token}"},
    )
    assert out.status_code == 204
    out_cookies = _parse_set_cookies(out)
    assert out_cookies[COOKIE]["path"] == "/api/v1"
    assert out_cookies[COOKIE]["max-age"] == "0"
    assert out_cookies[LEGACY_COOKIE]["path"] == "/api/v1/planning"
    assert out_cookies[LEGACY_COOKIE]["max-age"] == "0"

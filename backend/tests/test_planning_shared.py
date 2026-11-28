"""Tên dự án, tiến độ, Thinking và Pitching lưu theo đội. Thinking: chỉ trưởng nhóm ghi."""

from tests.test_planning import _demo, _state, _write
from tests.test_planning_team import _invite, _join, people  # noqa: F401 — fixture

DONE = {"product": False, "planning": False, "pitching": False, "quality": False, "maintaining": False}
PROJECT = {"name": "", "done": DONE}
THINKING = {"session": "", "msgs": []}
PITCH = {"pitch": {}, "score": {}, "chat": []}
MESSAGES = [{"who": "me", "text": "Chị Lan mất 3 đơn tuần trước."}, {"who": "agent", "text": "Chị xử lý ra sao?"}]


def _save(client, section, empty, expected=204, **data):
    body = {**empty, "version": _state(client)[section]["version"]}
    return _write(client, "PUT", f"/{section}", {**body, **data}, expected=expected)


def _team(people):  # noqa: F811
    leader = people(demo=False)
    _demo(leader)
    member = people()
    _join(member, _invite(leader))
    return leader, member


def test_new_team_has_empty_shared_sections(people):  # noqa: F811
    leader = people(demo=False)
    assert [_state(leader)[key] for key in ("project", "thinking", "pitching")] == [None, None, None]
    _demo(leader)
    assert _state(leader)["project"] == {**PROJECT, "version": 0}
    assert _state(leader)["thinking"] == {**THINKING, "version": 0}
    assert _state(leader)["pitching"] == {**PITCH, "version": 0}


def test_project_name_and_progress_reach_every_member(people):  # noqa: F811
    leader, member = _team(people)
    _save(leader, "project", PROJECT, name="Chiikawa", done={**DONE, "product": True})
    assert _state(member)["project"] == {"name": "Chiikawa", "done": {**DONE, "product": True}, "version": 1}
    _save(member, "project", PROJECT, name="Chiikawa", done={**DONE, "product": True, "planning": True})
    assert _state(leader)["project"]["done"]["planning"] is True


def test_member_cannot_change_thinking_progress(people):  # noqa: F811
    leader, member = _team(people)
    _save(member, "project", PROJECT, expected=403, done={**DONE, "product": True})
    _save(leader, "project", PROJECT, done={**DONE, "product": True})
    _save(member, "project", PROJECT, expected=403, done=DONE)
    assert _state(member)["project"]["done"]["product"] is True


def test_only_leader_writes_thinking_and_members_read_it(people):  # noqa: F811
    leader, member = _team(people)
    _save(leader, "thinking", THINKING, session="th-abc12345", msgs=MESSAGES)
    saved = {"session": "th-abc12345", "msgs": MESSAGES, "version": 1}
    assert _state(member)["thinking"] == saved
    _save(member, "thinking", THINKING, expected=403, session="th-other000", msgs=[])
    assert _state(leader)["thinking"] == saved


def test_every_member_shares_the_pitching_draft(people):  # noqa: F811
    leader, member = _team(people)
    draft = {
        "pitch": {"overview": "5 trên 8 người thấy phiền", "form": [{"id": "q0", "q": "Kênh nào?"}], "deck": None},
        "score": {"persona": {"text": "Chủ shop", "score": 4}},
        "chat": [{"who": "agent", "text": "Phạm vi đã đủ hẹp."}],
    }
    _save(member, "pitching", PITCH, **draft)
    assert _state(leader)["pitching"] == {**draft, "version": 1}


def test_stale_version_does_not_overwrite_shared_sections(people):  # noqa: F811
    leader, member = _team(people)
    _save(leader, "project", PROJECT, name="Bản đầu")
    _save(member, "project", PROJECT, expected=409, name="Bản cũ", version=0)
    assert _state(leader)["project"]["name"] == "Bản đầu"


def test_invalid_or_anonymous_shared_writes_are_rejected(people):  # noqa: F811
    leader = people(demo=False)
    _demo(leader)
    _save(leader, "project", PROJECT, expected=422, name="x" * 81)
    _save(leader, "thinking", THINKING, expected=422, msgs=[{"who": "khac", "text": "?"}])
    _save(leader, "thinking", THINKING, expected=422, session="bad session!")
    _save(leader, "pitching", PITCH, expected=422, pitch={"overview": "x" * 600_000})
    outsider = people(demo=False)
    _write(outsider, "PUT", "/project", {**PROJECT, "version": 0}, expected=401)
    _write(people(), "PUT", "/pitching", {**PITCH, "version": 0}, expected=403)
    assert _state(leader)["pitching"] == {**PITCH, "version": 0}

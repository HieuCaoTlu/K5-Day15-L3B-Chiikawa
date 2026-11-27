"""Dữ liệu tab Quality và Maintaining: lưu theo đội, chống ghi đè, không có dữ liệu mẫu."""

from tests.test_planning import _demo, _state, _write
from tests.test_planning_team import _invite, _join, people  # noqa: F401 — fixture

QUALITY = {"metrics": [], "runs": [], "source": "", "nature": "other", "revenueModel": "sub", "cost": {}}
MAINTAIN = {"schedule": [], "suggest": []}
METRIC = {
    "id": "k1",
    "name": "Câu trả lời dùng được",
    "baseline": None,
    "target": 70,
    "unit": "%",
    "direction": "up",
    "kind": "ai",
    "method": "",
    "rule": "",
    "from": "tay",
}
RUN = {
    "id": "r1",
    "at": "2026-11-27T09:30",
    "model": "Model A, prompt v1",
    "values": {"k1": 48},
    "passed": 14,
    "total": 20,
    "estTok": None,
    "actTok": 49200,
    "note": "",
}
JOB = {"id": "m1", "title": "Rà bản nháp bị sửa", "every": 7, "next": "2026-12-04", "owner": "", "runs": 0}


def _save(client, section, empty, expected=204, **data):
    body = {**empty, "version": _state(client)[section]["version"]}
    return _write(client, "PUT", f"/{section}", {**body, **data}, expected=expected)


def test_new_team_starts_empty(people):  # noqa: F811
    leader = people(demo=False)
    assert _state(leader)["quality"] is None
    assert _state(leader)["maintain"] is None
    _demo(leader)
    assert _state(leader)["quality"] == {**QUALITY, "version": 0}
    assert _state(leader)["maintain"] == {**MAINTAIN, "version": 0}


def test_every_member_reads_and_writes_the_shared_data(people):  # noqa: F811
    leader = people(demo=False)
    _demo(leader)
    guest = people()
    _join(guest, _invite(leader))
    saved = {**QUALITY, "metrics": [METRIC], "runs": [RUN], "cost": {"pricePerM": 5, "apiCalls": 100}}
    _save(guest, "quality", QUALITY, **saved)
    assert _state(leader)["quality"] == {**saved, "version": 1}
    owner = _state(guest)["profile"]["github_id"]
    _save(leader, "maintain", MAINTAIN, schedule=[{**JOB, "owner": owner}])
    assert _state(guest)["maintain"] == {"schedule": [{**JOB, "owner": owner}], "suggest": [], "version": 1}


def test_stale_version_does_not_overwrite(people):  # noqa: F811
    leader = people(demo=False)
    _demo(leader)
    _save(leader, "maintain", MAINTAIN, schedule=[JOB])
    _save(leader, "maintain", MAINTAIN, expected=409, version=0)
    assert _state(leader)["maintain"]["schedule"] == [JOB]


def test_owner_outside_the_team_becomes_unassigned(people):  # noqa: F811
    leader = people(demo=False)
    _demo(leader)
    _save(leader, "maintain", MAINTAIN, schedule=[{**JOB, "owner": "nguoi-da-roi-doi"}])
    assert _state(leader)["maintain"]["schedule"][0]["owner"] == ""


def test_invalid_or_anonymous_writes_are_rejected(people):  # noqa: F811
    leader = people(demo=False)
    _demo(leader)
    _save(leader, "quality", QUALITY, expected=422, runs=[{**RUN, "passed": 21}])
    _save(leader, "quality", QUALITY, expected=422, runs=[{**RUN, "sample": True}])
    _save(leader, "maintain", MAINTAIN, expected=422, schedule=[{**JOB, "every": 0}])
    outsider = people(demo=False)
    _write(outsider, "PUT", "/quality", {**QUALITY, "version": 0}, expected=401)
    _write(people(), "PUT", "/quality", {**QUALITY, "version": 0}, expected=403)
    assert _state(leader)["quality"] == {**QUALITY, "version": 0}

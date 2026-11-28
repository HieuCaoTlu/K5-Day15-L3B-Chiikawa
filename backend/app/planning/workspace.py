"""Dữ liệu dùng chung của đội: cả đội cùng đọc, đội mới bắt đầu trống. Riêng Thinking chỉ trưởng nhóm ghi."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_session
from app.planning.access import team_for
from app.planning.auth import require_same_origin, require_session
from app.planning.models import PlanningMember, PlanningTeam, PlanningWorkspace
from app.planning.schemas import MaintainInput, PitchingInput, ProjectInput, QualityInput, ThinkingInput
from app.planning.work import members_in

router = APIRouter(dependencies=[Depends(require_same_origin)])

EMPTY = {
    "quality": {
        "metrics": [],
        "runs": [],
        "source": "",
        "nature": "other",
        "revenueModel": "sub",
        "cost": {},
        "tips": [],
    },
    "maintain": {"schedule": [], "suggest": []},
    "project": {
        "name": "",
        "done": {"product": False, "planning": False, "pitching": False, "quality": False, "maintaining": False},
    },
    "thinking": {"session": "", "msgs": []},
    "pitching": {"pitch": {}, "score": {}, "chat": []},
}


def workspace_state(db: Session, team_id: str) -> dict:
    state = {}
    for section, empty in EMPTY.items():
        row = db.get(PlanningWorkspace, (team_id, section))
        state[section] = {**empty, **(row.data if row else {}), "version": row.version if row else 0}
    return state


def _member_team(db: Session, request: Request) -> tuple[PlanningMember, PlanningTeam]:
    session = require_session(request, db)
    member = db.get(PlanningMember, session.github_id)
    if not member:
        raise HTTPException(403, "Vào đội ở tab Planning để lưu dữ liệu.")
    return member, team_for(db, member.team_id, lock=True)  # khóa đội để so phiên bản an toàn


def _save(db: Session, team: PlanningTeam, section: str, version: int, content: dict) -> None:
    row = db.get(PlanningWorkspace, (team.id, section))
    if version != (row.version if row else 0):
        raise HTTPException(409, "Dữ liệu vừa được sửa ở nơi khác. Xem bản mới rồi sửa lại.")
    if row is None:
        db.add(PlanningWorkspace(team_id=team.id, section=section, data=content, version=1))
    else:
        row.data, row.version = content, row.version + 1
    db.commit()


@router.put("/quality", status_code=204)
def save_quality(data: QualityInput, request: Request, db: Session = Depends(get_session)):
    _, team = _member_team(db, request)
    content = data.model_dump(mode="json", by_alias=True, exclude={"version"})
    content["cost"] = data.cost.model_dump(exclude_none=True)  # ô đội chưa nhập thì không có trong dữ liệu
    _save(db, team, "quality", data.version, content)


@router.put("/maintain", status_code=204)
def save_maintain(data: MaintainInput, request: Request, db: Session = Depends(get_session)):
    _, team = _member_team(db, request)
    content = data.model_dump(mode="json", exclude={"version"})
    # Người đã rời đội không còn giữ việc; không vì thế mà chặn cả lần lưu.
    known = {person.github_id for person in members_in(db, team)}
    for job in content["schedule"]:
        if job["owner"] not in known:
            job["owner"] = ""
    _save(db, team, "maintain", data.version, content)


@router.put("/project", status_code=204)
def save_project(data: ProjectInput, request: Request, db: Session = Depends(get_session)):
    member, team = _member_team(db, request)
    content = data.model_dump(mode="json", exclude={"version"})
    # Bước Thinking mở khóa khi Canvas được duyệt, nên chỉ trưởng nhóm đổi được cờ này.
    stored = workspace_state(db, team.id)["project"]["done"]["product"]
    if not member.leader and content["done"]["product"] != stored:
        raise HTTPException(403, "Chỉ trưởng nhóm đổi được tiến độ bước Thinking.")
    _save(db, team, "project", data.version, content)


@router.put("/thinking", status_code=204)
def save_thinking(data: ThinkingInput, request: Request, db: Session = Depends(get_session)):
    member, team = _member_team(db, request)
    if not member.leader:
        raise HTTPException(403, "Chỉ trưởng nhóm làm bước Thinking. Thành viên chỉ xem.")
    _save(db, team, "thinking", data.version, data.model_dump(mode="json", exclude={"version"}))


@router.put("/pitching", status_code=204)
def save_pitching(data: PitchingInput, request: Request, db: Session = Depends(get_session)):
    _, team = _member_team(db, request)
    _save(db, team, "pitching", data.version, data.model_dump(mode="json", exclude={"version"}))

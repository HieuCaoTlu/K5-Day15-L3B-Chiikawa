"""Dữ liệu dùng chung của đội: cả đội cùng đọc, đội mới bắt đầu trống. Riêng Thinking chỉ trưởng nhóm ghi."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_session, sqlite_begin_immediate
from app.models import AgentRun
from app.planning.access import team_for
from app.planning.auth import require_same_origin, require_session
from app.planning.models import PlanningMember, PlanningTeam, PlanningThinkingSession, PlanningWorkspace
from app.planning.schemas import MaintainInput, PitchingInput, ProjectInput, QualityInput, ThinkingInput
from app.planning.work import members_in

router = APIRouter(dependencies=[Depends(require_same_origin)])
logger = logging.getLogger("app.planning.workspace")

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


def thinking_owner_team_id(db: Session, session_id: str | None) -> str | None:
    """Đội sở hữu session_id Thinking theo bảng planning_thinking_sessions (nếu có)."""
    if not session_id:
        return None
    row = db.get(PlanningThinkingSession, session_id)
    return row.team_id if row else None


def has_agent_runs(db: Session, session_id: str) -> bool:
    """Kiểm tra session_id đã từng có lượt chạy agent nào chưa."""
    return db.scalar(select(AgentRun.id).where(AgentRun.session_id == session_id).limit(1)) is not None


def claim_thinking_session(db: Session, session_id: str, team_id: str) -> None:
    """Gắn quyền sở hữu session_id cho đội trước khi chạy agent; xung đột đội khác → 409."""
    sqlite_begin_immediate(db)
    existing = thinking_owner_team_id(db, session_id)
    if existing == team_id:
        return
    if existing is not None:
        raise HTTPException(409, "Phiên Thinking này đang thuộc một đội khác.")
    db.add(PlanningThinkingSession(session_id=session_id, team_id=team_id))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if thinking_owner_team_id(db, session_id) == team_id:
            return
        raise HTTPException(409, "Phiên Thinking này đang thuộc một đội khác.") from exc
    except Exception:
        db.rollback()
        raise


def backfill_thinking_sessions(db: Session) -> int:
    """Tạo claim cho các workspace thinking hiện có chưa nằm trong planning_thinking_sessions."""
    rows = db.scalars(
        select(PlanningWorkspace).where(PlanningWorkspace.section == "thinking").order_by(PlanningWorkspace.team_id)
    ).all()
    added = 0
    seen: dict[str, str] = {}
    for row in rows:
        raw = (row.data or {}).get("session")
        session_id = raw.strip() if isinstance(raw, str) else ""
        if not session_id:
            continue
        if session_id in seen:
            if seen[session_id] != row.team_id:
                logger.warning(
                    "Bỏ qua backfill Thinking session %s cho đội %s vì đã gắn cho đội %s",
                    session_id,
                    row.team_id,
                    seen[session_id],
                )
            continue
        existing = db.get(PlanningThinkingSession, session_id)
        if existing is not None:
            seen[session_id] = existing.team_id
            if existing.team_id != row.team_id:
                logger.warning(
                    "Bỏ qua backfill Thinking session %s cho đội %s vì đã thuộc đội %s",
                    session_id,
                    row.team_id,
                    existing.team_id,
                )
            continue
        try:
            with db.begin_nested():
                db.add(PlanningThinkingSession(session_id=session_id, team_id=row.team_id))
            seen[session_id] = row.team_id
            added += 1
        except IntegrityError:
            logger.warning("Bỏ qua backfill Thinking session %s cho đội %s do xung đột", session_id, row.team_id)
    if added:
        db.commit()
    return added


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
    sqlite_begin_immediate(db)
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
    row = db.get(PlanningWorkspace, (team.id, "thinking"))
    if data.version != (row.version if row else 0):
        raise HTTPException(409, "Dữ liệu vừa được sửa ở nơi khác. Xem bản mới rồi sửa lại.")
    if data.session:
        existing = db.get(PlanningThinkingSession, data.session)
        if existing is not None:
            if existing.team_id != team.id:
                raise HTTPException(409, "Phiên Thinking này đang thuộc một đội khác.")
        else:
            if has_agent_runs(db, data.session):
                raise HTTPException(409, "Phiên Thinking này đã có lịch sử công khai. Hãy bắt đầu phiên mới.")
            db.add(PlanningThinkingSession(session_id=data.session, team_id=team.id))
    content = data.model_dump(mode="json", exclude={"version"})
    if row is None:
        db.add(PlanningWorkspace(team_id=team.id, section="thinking", data=content, version=1))
    else:
        row.data, row.version = content, row.version + 1
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if data.session and thinking_owner_team_id(db, data.session) == team.id:
            sqlite_begin_immediate(db)
            team_for(db, team.id, lock=True)
            row = db.get(PlanningWorkspace, (team.id, "thinking"))
            if data.version != (row.version if row else 0):
                raise HTTPException(409, "Dữ liệu vừa được sửa ở nơi khác. Xem bản mới rồi sửa lại.") from exc
            if row is None:
                db.add(PlanningWorkspace(team_id=team.id, section="thinking", data=content, version=1))
            else:
                row.data, row.version = content, row.version + 1
            db.commit()
            return
        raise HTTPException(409, "Phiên Thinking này đang thuộc một đội khác.") from exc
    except Exception:
        db.rollback()
        raise


@router.put("/pitching", status_code=204)
def save_pitching(data: PitchingInput, request: Request, db: Session = Depends(get_session)):
    _, team = _member_team(db, request)
    _save(db, team, "pitching", data.version, data.model_dump(mode="json", exclude={"version"}))

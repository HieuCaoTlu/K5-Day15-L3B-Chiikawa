"""API của agent: tạo lượt chạy → (chờ người duyệt) → gửi quyết định."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.agent import service
from app.db import get_session
from app.models import AgentRun
from app.planning.access import leader_for
from app.planning.auth import require_same_origin, require_session, session_for
from app.planning.models import PlanningMember, PlanningThinkingSession
from app.planning.workspace import claim_thinking_session, has_agent_runs, thinking_owner_team_id
from app.schemas import ReviewIn, RunCreate, RunOut

router = APIRouter(prefix="/agent", tags=["agent"])


def _require_team_member(request: Request, db: Session, owner_team_id: str) -> PlanningMember:
    auth = require_session(request, db)
    member = db.get(PlanningMember, auth.github_id)
    if not member or member.team_id != owner_team_id:
        raise HTTPException(403, "Phiên Thinking này thuộc một đội khác.")
    return member


def _require_team_leader(request: Request, db: Session, owner_team_id: str) -> PlanningMember:
    _, member = leader_for(db, request)
    if member.team_id != owner_team_id:
        raise HTTPException(403, "Chỉ trưởng nhóm của đội này mới duyệt được Canvas.")
    return member


@router.post("/runs", response_model=RunOut, status_code=201)
def create_run(body: RunCreate, request: Request, session: Session = Depends(get_session)):
    """Chạy agent tới bước người duyệt (status=waiting_review) hoặc bị chặn (status=blocked)."""
    owner = thinking_owner_team_id(session, body.session_id)
    if owner:
        require_same_origin(request)
        _require_team_member(request, session, owner)
    elif body.session_id:
        auth = session_for(request, session)
        member = session.get(PlanningMember, auth.github_id) if auth else None
        if member and member.leader and not has_agent_runs(session, body.session_id):
            require_same_origin(request)
            claim_thinking_session(session, body.session_id, member.team_id)
    return service.start_run(session, body.request, body.session_id)


@router.get("/runs", response_model=list[RunOut])
def list_runs(
    request: Request,
    status: str | None = None,
    session_id: str | None = Query(default=None, min_length=1, max_length=64),
    has_canvas: bool = False,
    session: Session = Depends(get_session),
):
    """`?status=waiting_review` = hàng chờ duyệt. `?session_id=…` = các lượt của một phiên chat (mới nhất trước)."""
    query = select(AgentRun).order_by(AgentRun.created_at.desc(), AgentRun.id.desc()).limit(50)
    if session_id is not None:
        if not session_id.strip():
            raise HTTPException(422, "session_id không hợp lệ.")
        owner = thinking_owner_team_id(session, session_id)
        if owner:
            _require_team_member(request, session, owner)
        query = query.where(AgentRun.session_id == session_id)
    else:
        auth = session_for(request, session)
        member = session.get(PlanningMember, auth.github_id) if auth else None
        if member:
            owned = exists(
                select(1).where(
                    PlanningThinkingSession.session_id == AgentRun.session_id,
                    PlanningThinkingSession.team_id == member.team_id,
                )
            )
            query = query.where(owned)
        else:
            claimed = exists(select(1).where(PlanningThinkingSession.session_id == AgentRun.session_id))
            query = query.where(or_(AgentRun.session_id.is_(None), ~claimed))
    if status:
        query = query.where(AgentRun.status == status)
    if has_canvas:
        query = service.with_canvas(query)
    return session.scalars(query).all()


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: str, request: Request, session: Session = Depends(get_session)):
    run = session.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(404, "Không tìm thấy lượt chạy")
    owner = thinking_owner_team_id(session, run.session_id)
    if owner:
        _require_team_member(request, session, owner)
    return run


@router.post("/runs/{run_id}/review", response_model=RunOut)
def review_run(run_id: str, body: ReviewIn, request: Request, session: Session = Depends(get_session)):
    """Bước HITL: người duyệt đồng ý / từ chối đề xuất → agent chạy tiếp tới hết."""
    run = session.get(AgentRun, run_id, with_for_update=True)
    if run is None:
        raise HTTPException(404, "Không tìm thấy lượt chạy")
    owner = thinking_owner_team_id(session, run.session_id)
    if owner:
        require_same_origin(request)
        _require_team_leader(request, session, owner)
    if run.status != "waiting_review":
        raise HTTPException(409, f"Lượt chạy đang ở trạng thái {run.status}, không chờ duyệt")
    return service.review_run(session, run, body)

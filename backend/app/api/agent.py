"""API của agent: tạo lượt chạy → (chờ người duyệt) → gửi quyết định."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent import service
from app.db import get_session
from app.models import AgentRun
from app.schemas import ReviewIn, RunCreate, RunOut

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/runs", response_model=RunOut, status_code=201)
def create_run(body: RunCreate, session: Session = Depends(get_session)):
    """Chạy agent tới bước người duyệt (status=waiting_review) hoặc bị chặn (status=blocked)."""
    return service.start_run(session, body.request, body.session_id)


@router.get("/runs", response_model=list[RunOut])
def list_runs(status: str | None = None, session_id: str | None = None, session: Session = Depends(get_session)):
    """`?status=waiting_review` = hàng chờ duyệt. `?session_id=…` = các lượt của một phiên chat (mới nhất trước)."""
    query = select(AgentRun).order_by(AgentRun.created_at.desc()).limit(50)
    if status:
        query = query.where(AgentRun.status == status)
    if session_id:
        query = query.where(AgentRun.session_id == session_id)
    return session.scalars(query).all()


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: str, session: Session = Depends(get_session)):
    run = session.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(404, "Không tìm thấy lượt chạy")
    return run


@router.post("/runs/{run_id}/review", response_model=RunOut)
def review_run(run_id: str, body: ReviewIn, session: Session = Depends(get_session)):
    """Bước HITL: người duyệt đồng ý / từ chối đề xuất → agent chạy tiếp tới hết."""
    run = session.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(404, "Không tìm thấy lượt chạy")
    if run.status != "waiting_review":
        raise HTTPException(409, f"Lượt chạy đang ở trạng thái {run.status}, không chờ duyệt")
    return service.review_run(session, run, body)

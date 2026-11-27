"""Nối API ↔ graph ↔ bảng agent_runs. thread_id của LangGraph = AgentRun.id."""

import logging
from uuid import uuid4

from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.graph import get_graph
from app.models import AgentRun
from app.schemas import ReviewIn

logger = logging.getLogger("app.agent")


def _config(run_id: str) -> dict:
    return {"configurable": {"thread_id": run_id}}


def _sync(session: Session, run: AgentRun) -> AgentRun:
    """Đọc trạng thái mới nhất từ checkpointer, ghi vào bảng để FE liệt kê / lọc."""
    snapshot = get_graph().get_state(_config(run.id))
    values = snapshot.values
    run.proposal = values.get("proposal")
    run.source = values.get("source")
    if values.get("blocked"):
        run.status = "blocked"
        run.result = {"reason": values.get("block_reason", "")}
    elif "human_review" in snapshot.next:
        run.status = "waiting_review"
    else:
        run.result = values.get("result")
        run.status = (run.result or {}).get("status", "error")
    session.commit()
    return run


def _invoke(session: Session, run: AgentRun, payload) -> AgentRun:
    try:
        get_graph().invoke(payload, _config(run.id))
    except Exception as exc:
        logger.exception("Agent run %s lỗi", run.id)
        run.status = "error"
        run.result = {"error": type(exc).__name__}
        session.commit()
        return run
    return _sync(session, run)


def _previous_canvas(session: Session, session_id: str | None) -> dict:
    """Canvas của lượt gần nhất trong cùng phiên chat: mỗi tin nhắn là một lượt, canvas nối tiếp qua các lượt."""
    if not session_id:
        return {}
    rows = session.scalars(
        select(AgentRun).where(AgentRun.session_id == session_id).order_by(AgentRun.created_at.desc()).limit(10)
    ).all()
    for row in rows:
        if row.proposal and row.proposal.get("canvas"):
            return {"canvas": row.proposal["canvas"], "flags": row.proposal.get("flags") or {}}
    return {}


def start_run(session: Session, request: str, session_id: str | None = None) -> AgentRun:
    carried = _previous_canvas(session, session_id)
    run = AgentRun(id=uuid4().hex, session_id=session_id, request=request, status="running")
    session.add(run)
    session.commit()
    return _invoke(session, run, {"request": request, **carried})


def review_run(session: Session, run: AgentRun, review: ReviewIn) -> AgentRun:
    return _invoke(session, run, Command(resume=review.model_dump()))

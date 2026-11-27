"""Nối API ↔ graph ↔ bảng agent_runs. thread_id của LangGraph = AgentRun.id."""

import logging
from uuid import uuid4

from langgraph.types import Command
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.agent.graph import get_graph
from app.models import AgentRun
from app.schemas import ReviewIn

logger = logging.getLogger("app.agent")


def _config(run_id: str) -> dict:
    return {"configurable": {"thread_id": run_id}}


def _sync(session: Session, run: AgentRun, *, new_run: bool) -> AgentRun:
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
    if new_run and run.session_id and run.status in {"needs_info", "waiting_review", "approved", "rejected"}:
        _supersede_waiting(session, run)
    session.commit()
    return run


def _invoke(session: Session, run: AgentRun, payload, *, new_run: bool = False) -> AgentRun:
    try:
        get_graph().invoke(payload, _config(run.id))
    except Exception as exc:
        logger.exception("Agent run %s lỗi", run.id)
        run.status = "error"
        run.result = {"error": type(exc).__name__}
        session.commit()
        return run
    return _sync(session, run, new_run=new_run)


def with_canvas(query: Select) -> Select:
    canvas = AgentRun.proposal["canvas"].as_string()
    return query.where(canvas.is_not(None), canvas != "{}")


def _supersede_waiting(session: Session, run: AgentRun) -> None:
    in_session = select(AgentRun).where(AgentRun.session_id == run.session_id)
    # Serialize successful turns in PostgreSQL on the same session row. SQLite
    # serializes writers when the pending changes are flushed.
    with session.no_autoflush:
        session.execute(
            select(AgentRun.id)
            .where(AgentRun.session_id == run.session_id)
            .order_by(AgentRun.created_at, AgentRun.id)
            .limit(1)
            .with_for_update()
        ).first()
    session.flush()
    newest = session.scalar(
        with_canvas(in_session).order_by(AgentRun.created_at.desc(), AgentRun.id.desc()).limit(1)
    )
    if newest is None:
        return
    waiting = session.scalars(
        in_session.where(AgentRun.status == "waiting_review", AgentRun.id != newest.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    for previous in waiting:
        previous.status = "rejected"
        previous.result = {
            "status": "rejected",
            "verdict": previous.proposal["verdict"],
            "title": previous.proposal["title"],
            "steps": [],
            "note": "Đã có lượt trao đổi mới hơn",
            "handoff": None,
            "canvas": previous.proposal["canvas"],
        }


def _previous_canvas(session: Session, session_id: str | None, request: str) -> dict:
    """Đọc Canvas gần nhất và kiểm tra tin nhắn đã được xử lý trong phiên."""
    if not session_id:
        return {}
    query = with_canvas(select(AgentRun).where(AgentRun.session_id == session_id))
    latest = session.scalar(query.order_by(AgentRun.created_at.desc(), AgentRun.id.desc()).limit(1))
    if latest is None:
        return {}
    repeated = session.scalar(query.with_only_columns(AgentRun.id).where(AgentRun.request == request).limit(1))
    return {
        "canvas": latest.proposal["canvas"],
        "flags": latest.proposal.get("flags") or {},
        "source": latest.source or "fallback",
        "repeated_request": repeated is not None,
    }


def start_run(session: Session, request: str, session_id: str | None = None) -> AgentRun:
    carried = _previous_canvas(session, session_id, request)
    run = AgentRun(id=uuid4().hex, session_id=session_id, request=request, status="running")
    session.add(run)
    session.commit()
    return _invoke(session, run, {"request": request, **carried}, new_run=True)


def review_run(session: Session, run: AgentRun, review: ReviewIn) -> AgentRun:
    return _invoke(session, run, Command(resume=review.model_dump()))

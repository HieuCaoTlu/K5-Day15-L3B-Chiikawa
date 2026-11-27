"""API cho trang /admin: tổng quan, chi phí & token, phiên chat.

Hackathon: CHƯA có đăng nhập — thêm trước khi đưa link cho người ngoài (xem SECURITY.md).
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agent.llm import spent_today_usd
from app.config import get_settings
from app.db import get_session
from app.models import AgentRun, Item, LlmCall
from app.schemas import RunOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
def stats(session: Session = Depends(get_session)) -> dict:
    by_status = dict(session.execute(select(AgentRun.status, func.count()).group_by(AgentRun.status)).all())
    by_source = dict(
        session.execute(
            select(AgentRun.source, func.count()).where(AgentRun.source.is_not(None)).group_by(AgentRun.source)
        ).all()
    )
    reviewed = by_status.get("approved", 0) + by_status.get("rejected", 0)
    return {
        "runs_total": sum(by_status.values()),
        "runs_by_status": by_status,
        "runs_by_source": by_source,
        "waiting_review": by_status.get("waiting_review", 0),
        "approval_rate": round(by_status.get("approved", 0) / reviewed, 3) if reviewed else None,
        "items_total": session.scalar(select(func.count()).select_from(Item)) or 0,
        "sessions_total": session.scalar(select(func.count(func.distinct(AgentRun.session_id)))) or 0,
    }


def _totals(rows) -> dict:
    r = rows.one()
    calls = r.calls or 0
    return {
        "calls": calls,
        "errors": r.errors or 0,
        "input_tokens": int(r.tin or 0),
        "output_tokens": int(r.tout or 0),
        "cost_usd": round(float(r.cost or 0), 6),
        "avg_latency_ms": round(float(r.lat or 0)),
    }


@router.get("/usage")
def usage(days: int = Query(7, ge=1, le=90), session: Session = Depends(get_session)) -> dict:
    """Token & chi phí Gemini: tổng, theo ngày, theo model, theo node, lượt gọi gần nhất, ngân sách hôm nay."""
    settings = get_settings()
    since = datetime.now(UTC) - timedelta(days=days)
    where = LlmCall.created_at >= since
    calls = func.count(LlmCall.id)
    tokens = func.sum(LlmCall.input_tokens + LlmCall.output_tokens)
    cost = func.sum(LlmCall.cost_usd)

    total = session.execute(
        select(
            calls.label("calls"),
            func.count(LlmCall.id).filter(LlmCall.ok.is_(False)).label("errors"),
            func.sum(LlmCall.input_tokens).label("tin"),
            func.sum(LlmCall.output_tokens).label("tout"),
            cost.label("cost"),
            func.avg(LlmCall.latency_ms).label("lat"),
        ).where(where)
    )

    day = func.date(LlmCall.created_at)  # chạy được cả SQLite lẫn Postgres
    by_day = session.execute(select(day, calls, tokens, cost).where(where).group_by(day).order_by(day)).all()
    by_model = session.execute(
        select(LlmCall.model, calls, tokens, cost).where(where).group_by(LlmCall.model).order_by(cost.desc())
    ).all()
    by_node = session.execute(
        select(LlmCall.node, calls, tokens, cost).where(where).group_by(LlmCall.node).order_by(cost.desc())
    ).all()
    recent = session.scalars(select(LlmCall).order_by(LlmCall.created_at.desc()).limit(20)).all()

    def rows(data):
        return [
            {"key": str(k), "calls": c, "tokens": int(t or 0), "cost_usd": round(float(v or 0), 6)}
            for k, c, t, v in data
        ]

    return {
        "days": days,
        "totals": _totals(total),
        "by_day": rows(by_day),
        "by_model": rows(by_model),
        "by_node": rows(by_node),
        "recent": [
            {
                "id": c.id,
                "run_id": c.run_id,
                "node": c.node,
                "model": c.model,
                "input_tokens": c.input_tokens,
                "output_tokens": c.output_tokens,
                "cost_usd": round(c.cost_usd, 6),
                "latency_ms": c.latency_ms,
                "ok": c.ok,
                "error": c.error,
                "created_at": c.created_at.isoformat(),
            }
            for c in recent
        ],
        "budget": {
            "daily_usd": settings.daily_budget_usd,
            "spent_today_usd": round(spent_today_usd(), 6),
            "usd_to_vnd": settings.usd_to_vnd,
        },
        "prices": {
            settings.gemini_model_fast: [settings.price_fast_input, settings.price_fast_output],
            settings.gemini_model_pro: [settings.price_pro_input, settings.price_pro_output],
        },
    }


NO_SESSION = "(không có phiên)"


def _session_cond(session_id: str | None):
    return AgentRun.session_id.is_(None) if session_id is None else AgentRun.session_id == session_id


@router.get("/sessions")
def sessions(session: Session = Depends(get_session)) -> list[dict]:
    """Phiên chat = nhóm lượt chạy cùng session_id. Kèm token/chi phí của cả phiên."""
    # Group theo cột gốc (Postgres không gộp được hai biểu thức coalesce có tham số); NULL → NO_SESSION ở Python.
    rows = session.execute(
        select(
            AgentRun.session_id,
            func.count(AgentRun.id),
            func.min(AgentRun.created_at),
            func.max(AgentRun.created_at),
            func.count(AgentRun.id).filter(AgentRun.status == "waiting_review"),
            func.count(AgentRun.id).filter(AgentRun.status == "blocked"),
        )
        .group_by(AgentRun.session_id)
        .order_by(func.max(AgentRun.created_at).desc())
        .limit(200)
    ).all()
    usage_rows = {
        r[0]: (int(r[1] or 0), float(r[2] or 0))
        for r in session.execute(
            select(
                AgentRun.session_id, func.sum(LlmCall.input_tokens + LlmCall.output_tokens), func.sum(LlmCall.cost_usd)
            )
            .join(AgentRun, AgentRun.id == LlmCall.run_id)
            .group_by(AgentRun.session_id)
        ).all()
    }
    out = []
    for s_id, turns, first, last, waiting, blocked in rows:
        last_request = session.scalar(
            select(AgentRun.request).where(_session_cond(s_id)).order_by(AgentRun.created_at.desc()).limit(1)
        )
        tokens, cost = usage_rows.get(s_id, (0, 0.0))
        out.append(
            {
                "id": s_id or NO_SESSION,
                "turns": turns,
                "started_at": first.isoformat(),
                "last_at": last.isoformat(),
                "waiting_review": waiting,
                "blocked": blocked,
                "last_request": last_request,
                "tokens": tokens,
                "cost_usd": round(cost, 6),
            }
        )
    return out


@router.get("/sessions/{session_id}", response_model=list[RunOut])
def session_detail(session_id: str, session: Session = Depends(get_session)):
    """Toàn bộ lượt chạy của một phiên, theo thứ tự thời gian (xem lại hội thoại)."""
    sid = None if session_id == NO_SESSION else session_id
    runs = session.scalars(select(AgentRun).where(_session_cond(sid)).order_by(AgentRun.created_at)).all()
    if not runs:
        raise HTTPException(404, "Không tìm thấy phiên")
    return runs

"""Nối bước Thinking sang Planning: tìm Canvas đã duyệt, đổi thành đầu vào lập kế hoạch, nhớ Canvas đã dùng."""

import re
from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.agent.guardrails import check_input
from app.agent.service import with_canvas
from app.config import get_settings
from app.models import AgentRun
from app.planning.models import PlanningSprint, PlanningTeam, PlanningThinkingSession, PlanningWorkspace
from app.planning.schemas import Brief


def thinking_owner_team_id(db: Session, session_id: str) -> str | None:
    # Đọc thẳng bảng sở hữu: import từ workspace.py sẽ tạo vòng import (workspace → work → handoff).
    claim = db.get(PlanningThinkingSession, session_id)
    return claim.team_id if claim else None


# Một dòng trong planning_workspaces: Canvas (mã lượt chạy) đã được xử lý. Không nằm trong dữ liệu trả cho trình duyệt.
SECTION = "autoplan"
DAYS = 14


def approved_run(db: Session, team: PlanningTeam) -> AgentRun | None:
    """Lượt Thinking mới nhất của đội, chỉ khi trưởng nhóm đã duyệt cho sang Planning."""
    thinking = db.get(PlanningWorkspace, (team.id, "thinking"))
    session_id = thinking.data.get("session") if thinking else None
    if not session_id or thinking_owner_team_id(db, session_id) != team.id:
        return None
    query = with_canvas(select(AgentRun).where(AgentRun.session_id == session_id))
    run = db.scalar(query.order_by(AgentRun.created_at.desc(), AgentRun.id.desc()).limit(1))
    if run is None or run.status != "approved" or (run.result or {}).get("handoff") != "planning":
        return None
    return run


def pending(db: Session, team: PlanningTeam) -> AgentRun | None:
    """Canvas đang chờ tự lập kế hoạch. Sprint và bản nháp đội đã có thì giữ nguyên."""
    if not team.repo_id or not team.repo_access or team.draft:
        return None
    if db.scalar(select(PlanningSprint.id).where(PlanningSprint.team_id == team.id).limit(1)):
        return None
    run = approved_run(db, team)
    done = db.get(PlanningWorkspace, (team.id, SECTION))
    if run is None or (done and done.data.get("run_id") == run.id):
        return None
    return run


def mark_done(db: Session, team: PlanningTeam) -> None:
    """Ghi nhận Canvas hiện tại đã được xử lý, để xóa hết task không làm chúng tự mọc lại."""
    run = approved_run(db, team)
    if run is None:
        return
    if row := db.get(PlanningWorkspace, (team.id, SECTION)):
        row.data, row.version = {"run_id": run.id}, row.version + 1
    else:
        db.add(PlanningWorkspace(team_id=team.id, section=SECTION, data={"run_id": run.id}, version=1))


def forget(db: Session, team_id: str) -> None:
    db.execute(
        delete(PlanningWorkspace).where(PlanningWorkspace.team_id == team_id, PlanningWorkspace.section == SECTION)
    )


def brief_from_canvas(canvas: dict, today: date) -> Brief:
    limit = get_settings().max_input_chars

    def cell(name: str) -> str:
        text = str((canvas.get(name) or {}).get("content", "")).strip()
        return "" if check_input(text, limit) else text.rstrip(".")

    parts = [
        ("Giải pháp", "solution"),
        ("Phạm vi MVP", "mvp_scope"),
        ("Vấn đề", "pain_point"),
        ("Người dùng", "persona"),
        ("Vai trò của AI", "ai_leverage"),
    ]
    overview = " ".join(f"{label}: {cell(name)}." for label, name in parts if cell(name))
    persona, job, metrics = cell("persona"), cell("jtbd"), cell("metrics")
    stories = [
        f"Là {persona or 'người dùng'}, tôi muốn {job}" if job else "",
        cell("solution"),
        cell("ai_leverage"),
        *re.split(r"[;\n]+", cell("mvp_scope")),
        f"Đo chỉ số: {metrics}" if metrics else "",
    ]
    return Brief(
        overview=overview[:2000] or "Hoàn thành bản MVP theo AI MVP Canvas đã duyệt.",
        stories=[story.strip()[:420] for story in stories if story.strip()][:12],
        starts_on=today,
        ends_on=today + timedelta(days=DAYS - 1),
    )

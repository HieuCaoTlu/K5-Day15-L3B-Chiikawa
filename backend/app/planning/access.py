from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.planning.auth import require_session
from app.planning.models import PlanningMember, PlanningSession, PlanningTeam


def team_for(db: Session, team_id: str, *, lock: bool = False) -> PlanningTeam:
    query = select(PlanningTeam).where(PlanningTeam.id == team_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    team = db.scalar(query)
    if team is None:
        raise HTTPException(404, "Cần thiết lập danh sách thành viên.")
    return team


def leader_for(db: Session, request: Request) -> tuple[PlanningSession, PlanningMember]:
    session = require_session(request, db)
    member = db.get(PlanningMember, session.github_id)
    if not member or not member.leader:
        raise HTTPException(403, "Cần trưởng nhóm thực hiện thao tác này.")
    return session, member


def check_version(team: PlanningTeam, version: int) -> None:
    if team.repo_version != version:
        raise HTTPException(409, "Repo đã đổi. Tải lại Planning để tiếp tục.")


def require_repo(team: PlanningTeam, version: int) -> None:
    check_version(team, version)
    if not team.repo_id:
        raise HTTPException(409, "Kết nối repo để lập kế hoạch.")

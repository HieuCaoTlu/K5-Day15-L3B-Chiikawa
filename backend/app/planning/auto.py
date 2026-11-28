"""Lập sprint từ Canvas đã duyệt và giao task cho thành viên của đội."""

import logging
from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_session
from app.planning import github, handoff
from app.planning.access import leader_for, require_repo, team_for
from app.planning.auth import require_same_origin
from app.planning.generator import check_plan, make_plan
from app.planning.schemas import VIETNAM, RepoVersion
from app.planning.work import add_sprints, members_in

router = APIRouter(dependencies=[Depends(require_same_origin)])
logger = logging.getLogger(__name__)


def _repo_people(db: Session, team_id: str, version: int) -> tuple[list[dict], str]:
    """Người trong repo theo GitHub. Không đọc được thì vẫn lập kế hoạch cho đội hiện có."""
    team = team_for(db, team_id)
    if team.demo or not team.installation_id:
        return [], "demo"
    try:
        return github.repo_collaborators(team.repo_id, team.installation_id, team.repo_name), "ok"
    except github.GitHubError as exc:
        logger.warning("Chưa đọc được người trong repo (GitHub %s)", exc.status)
        require_repo(team, version)
        return [], "unavailable"


@router.post("/auto")
def auto_plan(data: RepoVersion, request: Request, db: Session = Depends(get_session)):
    """Gọi lặp lại được: mỗi Canvas đã duyệt chỉ tạo sprint một lần."""
    session, member = leader_for(db, request)
    team_id = member.team_id
    team = team_for(db, team_id)
    require_repo(team, data.repo_version)
    if not handoff.pending(db, team):
        return {"created": False}

    people, collaborators = _repo_people(db, team_id, data.repo_version)
    team = team_for(db, team_id, lock=True)
    require_repo(team, data.repo_version)
    run = handoff.pending(db, team)
    if not run:
        return {"created": False}
    run_id, canvas = run.id, run.proposal["canvas"]
    db.commit()

    brief = handoff.brief_from_canvas(canvas, datetime.now(VIETNAM).date())
    members = members_in(db, team_for(db, team_id))
    plan, source = make_plan(brief, members, Counter(), session.demo, everyone=True)

    # Model chạy lâu nên khóa đội rồi kiểm tra lại: lượt khác có thể vừa tạo sprint.
    team = team_for(db, team_id, lock=True)
    require_repo(team, data.repo_version)
    run = handoff.pending(db, team)
    if not run or run.id != run_id:
        return {"created": False}
    current = {item.github_id for item in members_in(db, team)}
    try:
        check_plan(plan, brief, current)
    except ValueError as exc:
        raise HTTPException(409, "Danh sách thành viên vừa thay đổi. Tải lại Planning để tiếp tục.") from exc
    demo = team.demo
    add_sprints(db, team_id, plan)
    handoff.mark_done(db, team)
    db.commit()
    tasks = [task for sprint in plan.sprints for task in sprint.tasks]
    result = {
        "created": True,
        "source": source,
        "sprints": len(plan.sprints),
        "tasks": len(tasks),
        "members": len({task.assignee_id for task in tasks}),
        "added": [],
        "skipped": [],
        "collaborators": collaborators,
    }
    if not demo:
        result["invite_suggestions"] = [person["login"] for person in people if person["github_id"] not in current]
    return result

"""Nút "Bắt đầu task" (tạo nhánh và PR nháp bằng token của người bấm) và kiểm tra quyền ghi của đội."""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.planning import auth, github, github_app
from app.planning.access import leader_for, require_repo, team_for
from app.planning.models import PlanningMember, PlanningPullRequest, PlanningSession, PlanningTask, PlanningTeam
from app.planning.pulls import Pull, record_pull
from app.planning.schemas import RepoVersion
from app.planning.work import members_in

router = APIRouter()
logger = logging.getLogger(__name__)
INTENT = re.compile(r"pr-([1-9][0-9]{0,8})-([0-9]{1,9})")
OPEN_STATES = ("draft", "open")


def can_start(team: PlanningTeam, session: PlanningSession, task: PlanningTask, pulls: list[dict]) -> bool:
    config = github_app.current()
    return bool(
        not session.demo
        and config
        and config.repos_enabled
        and team.repo_access
        and team.installation_id
        and task.assignee_id == session.github_id
        and task.progress != "done"
        and not any(pull["state"] in OPEN_STATES for pull in pulls)
    )


def _startable(db: Session, session: PlanningSession, task_id: int, version: int) -> tuple[PlanningTeam, PlanningTask]:
    """Kiểm tra lại toàn bộ điều kiện; dùng cả lúc bấm nút lẫn lúc GitHub chuyển về."""
    member = db.get(PlanningMember, session.github_id)
    task = db.get(PlanningTask, task_id)
    if not member or not task or task.team_id != member.team_id:
        raise HTTPException(404, "Task chưa có trong Planning của đội.")
    team = team_for(db, member.team_id)
    require_repo(team, version)
    if task.assignee_id != session.github_id:
        raise HTTPException(403, "Chỉ người được giao task mới bắt đầu được, vì PR phải đứng tên người đó.")
    pulls = [
        {"state": state}
        for state in db.scalars(select(PlanningPullRequest.state).where(PlanningPullRequest.task_id == task.id))
    ]
    if not can_start(team, session, task, pulls):
        raise HTTPException(409, "Task này đã xong, đã có PR đang mở hoặc repo chưa sẵn sàng.")
    return team, task


@router.post("/tasks/{task_id}/pr", dependencies=[Depends(auth.require_same_origin)])
def begin(task_id: int, data: RepoVersion, request: Request, response: Response, db: Session = Depends(get_session)):
    # Phải là POST cùng origin: một link GET có thể khiến người đã cấp quyền tạo PR ngoài ý muốn.
    session = auth.require_session(request, db)
    _startable(db, session, task_id, data.repo_version)
    response.headers["Cache-Control"] = "no-store"
    return {"url": auth.begin_oauth(response, f"pr-{task_id}-{data.repo_version}")}


def _body(task: PlanningTask) -> str:
    criteria = "\n".join(f"- [ ] {item}" for item in task.criteria)
    return f"{task.description}\n\n### Tiêu chí hoàn thành\n{criteria}\n"


def _reason(error: github.GitHubError) -> str:
    if error.status in (403, 404):
        return "pr_permission"
    if error.status == 409:
        return "pr_empty"
    if error.status == 422 and "draft pull requests are not supported" in error.detail.lower():
        return "pr_draft"
    return "pr_failed"


def finish(db: Session, session: PlanningSession, token: str, task_id: int, version: int) -> str:
    """Chạy trong callback OAuth. Token chỉ tồn tại trong lượt gọi này."""
    try:
        team, task = _startable(db, session, task_id, version)
    except HTTPException:
        return "pr_stale"
    repo_name, branch, title, body = team.repo_name, team.target_branch, task.title, _body(task)
    team_id = team.id
    db.rollback()  # không giữ giao dịch trong lúc gọi GitHub
    try:
        raw, existing = github.create_task_pr(token, repo_name, branch, task_id, title, body)
        pull = Pull.from_github(raw)
    except github.GitHubError as exc:
        logger.info("Chưa tạo được PR cho T-%s (GitHub %s)", task_id, exc.status)
        return _reason(exc)
    except (KeyError, TypeError, ValueError):
        return "pr_failed"
    team = team_for(db, team_id, lock=True)
    if team.repo_version == version and team.repo_access:
        record_pull(db, team, pull)  # thẻ đổi ngay, không đợi lượt đọc nền
        db.commit()
    return "pr_exists" if existing else "pr_created"


@router.get("/repo/access")
def repo_access(request: Request, response: Response, db: Session = Depends(get_session)):
    response.headers["Cache-Control"] = "no-store"
    session, member = leader_for(db, request)
    team = team_for(db, member.team_id)
    config = github_app.current()
    if session.demo or not config or not team.repo_access or not team.installation_id:
        return {"available": False}
    people = [(person.github_id, person.login) for person in members_in(db, team)]
    repo_id, installation_id, name = team.repo_id, team.installation_id, team.repo_name
    db.rollback()
    try:
        result = github.repo_access(repo_id, installation_id, name, [login for _, login in people])
    except github.GitHubError as exc:
        raise HTTPException(502, "Chưa đọc được quyền từ GitHub. Thử lại sau ít phút.") from exc
    return {
        "available": True,
        "app_can_write": result["app_can_write"],
        "members": [
            {"github_id": github_id, "login": login, "write": result["members"].get(login)}
            for github_id, login in people
        ],
        "settings_url": f"https://github.com/{name}/settings/access",
        "invitations_url": f"https://github.com/{name}/invitations",
        "app_url": f"https://github.com/settings/apps/{config.slug}/permissions",
    }

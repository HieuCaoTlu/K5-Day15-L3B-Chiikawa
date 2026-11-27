from hashlib import sha256
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.planning import auth, board, github, github_app, invites, push, repos, setup, start_pr, webhooks, work
from app.planning.access import team_for
from app.planning.models import (
    PlanningLog,
    PlanningMember,
    PlanningPullRequest,
    PlanningSprint,
    PlanningSubscription,
    PlanningTask,
    PlanningTeam,
)
from app.planning.schemas import Roster, utc

router = APIRouter(prefix="/planning", tags=["Planning"])
for child in (
    auth.router,
    setup.router,
    board.router,
    invites.router,
    start_pr.router,
    repos.router,
    work.router,
    webhooks.router,
    push.router,
):
    router.include_router(child)


def _member_row(member: PlanningMember) -> dict:
    return {
        "github_id": member.github_id,
        "login": member.login,
        "name": member.name,
        "experience": member.experience,
        "tags": member.tags,
        "avatar": member.avatar,
        "leader": member.leader,
    }


def _pull_row(pr: PlanningPullRequest, team: PlanningTeam) -> dict:
    return {
        "number": pr.number,
        "title": pr.title,
        "author_login": pr.author_login,
        "state": pr.state,
        "task_id": pr.task_id,
        "note": pr.note,
        "linkage": pr.linkage,
        "url": None if team.demo else f"https://github.com/{team.repo_name}/pull/{pr.number}",
    }


def _board(db: Session, team: PlanningTeam, is_leader: bool, session) -> tuple[list[dict], list[dict]]:
    sprints = db.scalars(
        select(PlanningSprint)
        .where(PlanningSprint.team_id == team.id)
        .order_by(
            PlanningSprint.starts_on,
            PlanningSprint.id,
        )
    )
    tasks = db.scalars(select(PlanningTask).where(PlanningTask.team_id == team.id).order_by(PlanningTask.id))
    task_pulls: dict[int, list[dict]] = {}
    inbox = []
    if team.repo_access:
        pulls = db.scalars(
            select(PlanningPullRequest)
            .where(
                PlanningPullRequest.team_id == team.id,
                PlanningPullRequest.linkage != "ignored",
            )
            .order_by(PlanningPullRequest.updated_at.desc(), PlanningPullRequest.number.desc())
        )
        for pr in pulls:
            data = _pull_row(pr, team)
            if is_leader and pr.linkage == "pending" and len(inbox) < 50:
                inbox.append(data)
            if pr.task_id:
                task_pulls.setdefault(pr.task_id, []).append(data)
    by_sprint: dict[int, list[dict]] = {}
    for task in tasks:
        by_sprint.setdefault(task.sprint_id, []).append(
            {
                "id": task.id,
                "code": f"T-{task.id}",
                "title": task.title,
                "description": task.description,
                "criteria": task.criteria,
                "assignee_id": task.assignee_id,
                "deadline": utc(task.deadline),
                "status": task.status,
                "progress": task.progress,
                "pulls": task_pulls.get(task.id, []),
                "can_start": start_pr.can_start(team, session, task, task_pulls.get(task.id, [])),
            }
        )
    return [
        {
            "id": sprint.id,
            "title": sprint.title,
            "goal": sprint.goal,
            "starts_on": sprint.starts_on,
            "ends_on": sprint.ends_on,
            "tasks": by_sprint.get(sprint.id, []),
        }
        for sprint in sprints
    ], inbox


def _log(db: Session, team_id: str) -> list[dict]:
    rows = db.scalars(
        select(PlanningLog).where(PlanningLog.team_id == team_id).order_by(PlanningLog.id.desc()).limit(30)
    )
    return [{"id": row.id, "at": utc(row.at), "message": row.message} for row in rows]


@router.get("/state")
def read_state(request: Request, response: Response, db: Session = Depends(get_session)):
    response.headers["Cache-Control"] = "no-store"
    settings = get_settings()
    config = github_app.current()
    state = {
        "github_enabled": config is not None,
        "setup": {"needed": config is None, "code_required": setup.code_required()},
        "webhook": bool(config and config.webhook),
        "demo_enabled": settings.planning_demo_enabled,
        "profile": None,
        "role": None,
        "members": [],
        "repo": None,
        "repo_version": 0,
        "choices": None,
        "install_url": None,
        "sprints": [],
        "inbox": [],
        "draft": None,
        "push_key": None,
        "push_registered": False,
        "board": None,
        "invite_code": None,
        "log": [],
    }
    session = auth.session_for(request, db)
    if not session:
        return state
    state["profile"] = {
        "github_id": session.github_id,
        "login": session.login,
        "name": session.name,
        "demo": session.demo,
    }
    member = db.get(PlanningMember, session.github_id)
    if not member:
        return state
    team = team_for(db, member.team_id)
    state["members"] = [_member_row(person) for person in work.members_in(db, team)]
    state["role"] = "leader" if member.leader else "member"
    state["board"] = board.board_state(db, team.id)
    state["log"] = _log(db, team.id)
    if member.leader:
        state["invite_code"] = invites.invite_code(db, team.id)
    state["repo_version"] = team.repo_version
    if team.repo_id:
        state["repo"] = {
            "id": team.repo_id,
            "name": team.repo_name,
            "branch": team.target_branch,
            "access": team.repo_access,
            "url": None if team.demo else f"https://github.com/{team.repo_name}",
        }
    if member.leader:
        state["choices"] = repos.available_repos(session)
        state["install_url"] = None if team.demo else github.install_url()
        state["draft"] = team.draft
    state["sprints"], state["inbox"] = _board(db, team, member.leader, session)
    if keys := push.vapid():
        state["push_key"] = keys.public
        state["push_registered"] = (
            db.scalar(
                select(PlanningSubscription.id)
                .where(
                    PlanningSubscription.session_id == session.id,
                )
                .limit(1)
            )
            is not None
        )
    return state


@router.put("/members", status_code=204, dependencies=[Depends(auth.require_same_origin)])
def save_members(data: Roster, request: Request, db: Session = Depends(get_session)):
    session = auth.require_session(request, db)
    actor = db.get(PlanningMember, session.github_id)
    if actor and not actor.leader:
        raise HTTPException(403, "Cần trưởng nhóm cập nhật danh sách thành viên.")
    team_id = actor.team_id if actor else uuid4().hex
    known = {person.github_id: person for person in work.members_in(db, team_for(db, team_id))} if actor else {}
    resolved = {}
    for item in data.members:
        if item.login.casefold() == session.login.casefold():
            info = {"github_id": session.github_id, "login": session.login}
        elif current := known.get(item.github_id):
            if current.login.casefold() != item.login.casefold():
                raise HTTPException(422, "Dùng tên GitHub đã xác thực của thành viên.")
            info = {"github_id": current.github_id, "login": current.login}
        elif item.github_id:
            raise HTTPException(422, "Thành viên chưa có trong đội hiện tại.")
        elif session.demo:
            demo_id = sha256(f"{team_id}:{item.login.casefold()}".encode()).hexdigest()[:32]
            info = {"github_id": "demo-" + demo_id, "login": item.login}
        else:
            try:
                info = github.find_user(item.login)
            except github.GitHubError as exc:
                if exc.status == 404:
                    raise HTTPException(422, f"Kiểm tra lại tên GitHub @{item.login}.") from exc
                raise HTTPException(502, "GitHub chưa xác nhận được thành viên. Thử lại sau ít phút.") from exc
        user_id = info["github_id"]
        if user_id in resolved:
            raise HTTPException(422, "Mỗi tài khoản GitHub chỉ có một hồ sơ trong đội.")
        resolved[user_id] = (item, info["login"])
    if session.github_id not in resolved:
        raise HTTPException(422, "Thêm hồ sơ trưởng nhóm trước khi tiếp tục.")
    if actor:
        team_for(db, team_id, lock=True)
    else:
        db.add(PlanningTeam(id=team_id, demo=session.demo))
        db.flush()
    for user_id, (item, login) in resolved.items():
        row = db.get(PlanningMember, user_id)
        if row and row.team_id != team_id:
            raise HTTPException(409, f"@{login} đã tham gia một đội Planning.")
        if row is None:
            row = PlanningMember(github_id=user_id, team_id=team_id, leader=user_id == session.github_id)
            db.add(row)
        row.login, row.name, row.experience, row.avatar = login, item.name, item.experience, item.avatar
        row.tags = list({tag.casefold(): tag for tag in item.tags}.values())
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Danh sách thành viên vừa thay đổi. Tải lại Planning để tiếp tục.") from exc

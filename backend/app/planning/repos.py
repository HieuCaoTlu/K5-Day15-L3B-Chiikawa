from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db import get_session
from app.planning import github, handoff
from app.planning.access import check_version, leader_for, require_repo, team_for
from app.planning.auth import require_same_origin
from app.planning.models import (
    PlanningLog,
    PlanningPullRequest,
    PlanningSession,
    PlanningSprint,
    PlanningTask,
    PlanningTeam,
)
from app.planning.pulls import Pull, record_pull
from app.planning.schemas import RepoSelection, RepoVersion, now, utc

router = APIRouter(dependencies=[Depends(require_same_origin)])
DEMO_REPOS = [
    {"id": "demo-1", "name": "tang-demo/san-pham", "branch": "main", "installation_id": None, "private": False},
    {"id": "demo-2", "name": "tang-demo/thu-nghiem", "branch": "main", "installation_id": None, "private": False},
]


def available_repos(session: PlanningSession) -> list[dict] | None:
    if session.demo:
        return DEMO_REPOS
    if session.choices_expires_at and utc(session.choices_expires_at) > now():
        return session.repo_choices
    return None


def _read(repo_id: str, installation_id: str | None, name: str, branch: str) -> tuple[dict, list[Pull]]:
    if not installation_id:
        return {"name": name, "branch": branch}, []
    repo, payloads = github.repo_pulls(repo_id, installation_id)
    return repo, [Pull.from_github(item) for item in payloads]


def _activate(team: PlanningTeam, repo: dict, db: Session, pulls: list[Pull]) -> None:
    if team.repo_id != repo["id"]:
        for table in (PlanningLog, PlanningPullRequest, PlanningTask, PlanningSprint):
            db.execute(delete(table).where(table.team_id == team.id))
        handoff.forget(db, team.id)
        team.repo_version += 1
        team.connected_at = now()
        team.draft = None
    team.repo_id = repo["id"]
    team.installation_id = repo["installation_id"]
    team.repo_name = repo["name"]
    team.target_branch = repo["branch"]
    team.repo_access = True
    for pull in pulls:
        record_pull(db, team, pull)


@router.put("/repo", status_code=204)
def select_repo(data: RepoSelection, request: Request, db: Session = Depends(get_session)):
    session, member = leader_for(db, request)
    team = team_for(db, member.team_id)
    check_version(team, data.repo_version)
    candidate = next((r for r in available_repos(session) or [] if r["id"] == data.repo_id), None)
    if not candidate:
        raise HTTPException(403, "Tải danh sách repo đã cấp quyền và chọn lại.")
    if team.repo_id and team.repo_id != data.repo_id and not data.reset_confirmed:
        raise HTTPException(409, "Xác nhận xóa tiến độ repo cũ trước khi đổi.")
    try:
        meta, pulls = _read(candidate["id"], candidate["installation_id"], candidate["name"], candidate["branch"])
    except github.GitHubError as exc:
        raise HTTPException(502, "Cần cấp quyền đọc pull request cho repo được chọn.") from exc
    team = team_for(db, member.team_id, lock=True)
    check_version(team, data.repo_version)
    _activate(team, {**candidate, **meta}, db, pulls)
    db.commit()


@router.post("/repo/refresh")
def refresh_repo(data: RepoVersion, request: Request, db: Session = Depends(get_session)):
    _, member = leader_for(db, request)
    team = team_for(db, member.team_id)
    require_repo(team, data.repo_version)
    if team.demo:
        return {"count": 0}
    try:
        count = pull_latest(db, member.team_id, data.repo_version)
    except github.GitHubError as exc:
        raise HTTPException(502, "Kiểm tra quyền đọc repo trên GitHub và thử lại.") from exc
    return {"count": count}


def pull_latest(db: Session, team_id: str, repo_version: int) -> int:
    """Đọc PR mới nhất của repo đang theo dõi, dùng cho nút Đọc lại PR và vòng đọc nền."""
    team = team_for(db, team_id)
    require_repo(team, repo_version)
    repo_id, installation_id = team.repo_id, team.installation_id
    try:
        meta, pulls = _read(repo_id, installation_id, team.repo_name, team.target_branch)
    except github.GitHubError as exc:
        if exc.status == 404:
            team = team_for(db, team_id, lock=True)
            check_version(team, repo_version)
            if team.installation_id == installation_id:
                team.repo_access = False
                db.commit()
        raise
    team = team_for(db, team_id, lock=True)
    check_version(team, repo_version)
    if team.installation_id != installation_id:
        raise HTTPException(409, "Kết nối đã đổi. Tải lại danh sách PR.")
    _activate(team, {**meta, "id": repo_id, "installation_id": installation_id}, db, pulls)
    db.commit()
    return len(pulls)

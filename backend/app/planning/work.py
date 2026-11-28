from collections import Counter
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.agent.guardrails import check_input
from app.config import get_settings
from app.db import get_session
from app.planning import handoff
from app.planning.access import leader_for, require_repo, team_for
from app.planning.auth import require_same_origin
from app.planning.generator import check_plan, check_task, make_plan, sprint_offset
from app.planning.models import PlanningMember, PlanningPullRequest, PlanningSprint, PlanningTask, PlanningTeam
from app.planning.pulls import Pull, association_note, by_number, confirm_link, log_progress, record_pull
from app.planning.schemas import (
    ApplyInput,
    Brief,
    DemoPR,
    DraftInput,
    DraftVersion,
    Plan,
    PRLink,
    RepoVersion,
    TaskMove,
    TaskUpdate,
    now,
    utc,
)

router = APIRouter(dependencies=[Depends(require_same_origin)])


def members_in(db: Session, team: PlanningTeam) -> list[PlanningMember]:
    return list(
        db.scalars(
            select(PlanningMember)
            .where(PlanningMember.team_id == team.id)
            .order_by(
                PlanningMember.leader.desc(),
                PlanningMember.name,
                PlanningMember.github_id,
            )
        )
    )


def _check_dates(db: Session, team: PlanningTeam, brief: Brief) -> None:
    previous = db.scalar(select(func.max(PlanningSprint.ends_on)).where(PlanningSprint.team_id == team.id))
    if previous is not None and brief.starts_on <= previous:
        raise HTTPException(409, "Sprint mới phải bắt đầu sau sprint đã áp dụng gần nhất.")


def add_sprints(db: Session, team_id: str, plan: Plan) -> None:
    for proposal in plan.sprints:
        sprint = PlanningSprint(
            team_id=team_id,
            title=proposal.title,
            goal=proposal.goal,
            starts_on=proposal.starts_on,
            ends_on=proposal.ends_on,
        )
        db.add(sprint)
        db.flush()
        db.add_all(
            [
                PlanningTask(
                    team_id=team_id,
                    sprint_id=sprint.id,
                    title=task.title,
                    description=task.description,
                    criteria=task.criteria,
                    assignee_id=task.assignee_id,
                    deadline=utc(task.deadline),
                    status=task.status,
                )
                for task in proposal.tasks
            ]
        )


@router.post("/draft")
def create_draft(data: DraftInput, request: Request, db: Session = Depends(get_session)):
    session, member = leader_for(db, request)
    team = team_for(db, member.team_id)
    require_repo(team, data.repo_version)
    _check_dates(db, team, data.brief)
    for text in (data.brief.overview, *data.brief.stories):
        if reason := check_input(text, get_settings().max_input_chars):
            raise HTTPException(422, reason)
    members = members_in(db, team)
    previous_draft = (team.draft or {}).get("id")
    counts = Counter(
        db.scalars(
            select(PlanningTask.assignee_id).where(
                PlanningTask.team_id == team.id,
                PlanningTask.status != "done",
                PlanningTask.pr_status.is_distinct_from("done"),
            )
        )
    )
    titles = list(db.scalars(select(PlanningSprint.title).where(PlanningSprint.team_id == team.id)))
    plan, source = make_plan(data.brief, members, counts, session.demo, sprint_offset(titles))
    team = team_for(db, member.team_id, lock=True)
    require_repo(team, data.repo_version)
    _check_dates(db, team, data.brief)
    if previous_draft != (team.draft or {}).get("id"):
        raise HTTPException(409, "Bản nháp đã thay đổi. Tải lại Planning trước khi tạo tiếp.")
    team.draft = {
        "id": uuid4().hex,
        "source": source,
        "brief": data.brief.model_dump(mode="json"),
        "plan": plan.model_dump(mode="json"),
    }
    db.commit()
    return team.draft


def _draft_for_write(data: DraftVersion, request: Request, db: Session) -> PlanningTeam:
    _, member = leader_for(db, request)
    team = team_for(db, member.team_id, lock=True)
    require_repo(team, data.repo_version)
    if not team.draft or team.draft["id"] != data.draft_id:
        raise HTTPException(409, "Bản nháp đã thay đổi. Tải lại Planning để xem bản đang chờ.")
    return team


@router.delete("/draft", status_code=204)
def discard_draft(data: DraftVersion, request: Request, db: Session = Depends(get_session)):
    team = _draft_for_write(data, request, db)
    team.draft = None
    db.commit()


@router.post("/apply", status_code=204)
def apply_draft(data: ApplyInput, request: Request, db: Session = Depends(get_session)):
    team = _draft_for_write(data, request, db)
    brief = Brief.model_validate(team.draft["brief"])
    _check_dates(db, team, brief)
    try:
        check_plan(data.plan, brief, {item.github_id for item in members_in(db, team)})
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    add_sprints(db, team.id, data.plan)
    team.draft = None
    db.commit()


def _task(db: Session, team: PlanningTeam, task_id: int) -> PlanningTask:
    task = db.get(PlanningTask, task_id)
    if not task or task.team_id != team.id:
        raise HTTPException(404, "Task chưa có trong Planning của đội.")
    return task


@router.patch("/tasks/{task_id}", status_code=204)
def update_task(task_id: int, data: TaskUpdate, request: Request, db: Session = Depends(get_session)):
    _, member = leader_for(db, request)
    team = team_for(db, member.team_id, lock=True)
    require_repo(team, data.repo_version)
    task = _task(db, team, task_id)
    sprint = db.get(PlanningSprint, task.sprint_id)
    try:
        check_task(data.task, sprint.starts_on, sprint.ends_on, {item.github_id for item in members_in(db, team)})
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    owner_changed = task.assignee_id != data.task.assignee_id
    deadline = utc(data.task.deadline)
    if owner_changed or utc(task.deadline) != deadline:
        task.reminders = []
    if data.task.status != task.status:
        task.pr_status = None  # người dùng chọn trạng thái: giữ đến sự kiện PR tiếp theo
    for key, value in data.task.model_dump(exclude={"deadline"}).items():
        setattr(task, key, value)
    task.deadline = deadline
    if owner_changed:
        for pr in db.scalars(
            select(PlanningPullRequest).where(
                PlanningPullRequest.task_id == task.id,
                PlanningPullRequest.linkage != "ignored",
            )
        ):
            if pr.linkage == "auto" and pr.author_id != task.assignee_id:
                pr.linkage = "pending"
                task.primary_pr = None
                task.pr_status = None
            pr.note = association_note(db, team, task, pr) or (
                "Chọn PR chính để liên kết task." if pr.linkage == "pending" else None
            )
    db.commit()


@router.put("/tasks/{task_id}/status", status_code=204)
def move_task(task_id: int, data: TaskMove, request: Request, db: Session = Depends(get_session)):
    """Kéo thẻ sang cột khác: trạng thái chọn tay được giữ cho đến khi pull request có thay đổi mới."""
    _, member = leader_for(db, request)
    team = team_for(db, member.team_id, lock=True)
    require_repo(team, data.repo_version)
    task = _task(db, team, task_id)
    task.status, task.pr_status = data.status, None
    db.commit()


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, data: RepoVersion, request: Request, db: Session = Depends(get_session)):
    """Xóa hẳn task. Mã task không dùng lại, nên PR cũ không thể trỏ nhầm sang task mới."""
    _, member = leader_for(db, request)
    team = team_for(db, member.team_id, lock=True)
    require_repo(team, data.repo_version)
    task = _task(db, team, task_id)
    for pr in db.scalars(select(PlanningPullRequest).where(PlanningPullRequest.task_id == task.id)):
        # PR còn mở có thể gắn sang task khác; PR đã kết thúc thì bỏ qua để danh sách đối chiếu không đầy lên.
        pr.task_id = None
        pr.linkage = "pending" if pr.state in ("draft", "open") and pr.linkage != "ignored" else "ignored"
        pr.note = f"T-{task.id} đã bị xóa. Chọn task khác hoặc bỏ qua." if pr.linkage == "pending" else None
    db.flush()
    sprint_id = task.sprint_id
    db.delete(task)
    db.flush()
    if not db.scalar(select(PlanningTask.id).where(PlanningTask.sprint_id == sprint_id).limit(1)):
        db.execute(delete(PlanningSprint).where(PlanningSprint.id == sprint_id))  # sprint rỗng sẽ chặn ngày
        if not db.scalar(select(PlanningSprint.id).where(PlanningSprint.team_id == team.id).limit(1)):
            handoff.mark_done(db, team)  # trưởng nhóm tự dọn bảng: Canvas đang có không tự tạo lại
    db.commit()


@router.put("/pulls/{number}/link", status_code=204)
def link_pull(number: int, data: PRLink, request: Request, db: Session = Depends(get_session)):
    _, member = leader_for(db, request)
    team = team_for(db, member.team_id, lock=True)
    require_repo(team, data.repo_version)
    pr = by_number(db, team.id, number) if team.repo_access else None
    if not pr:
        raise HTTPException(404, "PR chưa có trong repo đang theo dõi.")
    task = _task(db, team, data.task_id) if data.task_id is not None else None
    with log_progress(db, team, pr.number, pr.state):
        confirm_link(db, team, pr, task)
    db.commit()


@router.post("/demo/pull", status_code=204)
def simulate_pull(data: DemoPR, request: Request, db: Session = Depends(get_session)):
    session, member = leader_for(db, request)
    if not session.demo:
        raise HTTPException(404, "Mở đội demo để giả lập PR.")
    team = team_for(db, member.team_id, lock=True)
    require_repo(team, data.repo_version)
    author = db.get(PlanningMember, data.author_id)
    if not author or author.team_id != team.id:
        raise HTTPException(422, "Chọn tác giả PR trong đội demo.")
    record_pull(
        db,
        team,
        Pull(
            data.number,
            data.title,
            "",
            author.github_id,
            author.login,
            team.target_branch,
            data.state,
            now(),
        ),
    )
    db.commit()

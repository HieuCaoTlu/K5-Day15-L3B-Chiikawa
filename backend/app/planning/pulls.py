"""Các sự kiện PR chỉ thay đổi tiến độ do GitHub xác nhận trong Planning."""

import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.planning.models import PlanningLog, PlanningMember, PlanningPullRequest, PlanningTask, PlanningTeam
from app.planning.schemas import now, utc

TITLE_CODE = re.compile(r"(?<![\w-])T-([1-9][0-9]{0,8})(?![\w-])", re.I)
BODY_CODE = re.compile(r"\[T-([1-9][0-9]{0,8})\]", re.I)


PROGRESS_LABELS = {"todo": "Cần làm", "doing": "Đang làm", "review": "Chờ review", "done": "Xong"}
PULL_EVENTS = {"draft": "PR #{} nháp", "open": "PR #{} chờ review", "merged": "Merge PR #{}", "closed": "Đóng PR #{}"}


@dataclass(frozen=True)
class Pull:
    number: int
    title: str
    body: str
    author_id: str
    author_login: str
    base_branch: str
    state: str
    updated_at: datetime

    @classmethod
    def from_github(cls, raw: dict):
        author = raw.get("user") or {}
        if raw.get("merged") or raw.get("merged_at"):
            state = "merged"
        elif raw["state"] == "closed":
            state = "closed"
        else:
            state = "draft" if raw.get("draft") else "open"
        number = int(raw["number"])
        if not 0 < number < 2**31:
            raise ValueError("Số PR ngoài phạm vi.")
        return cls(
            number=number,
            title=raw["title"][:240],
            body=(raw.get("body") or "")[:65000],
            author_id=str(author.get("id") or "")[:48],
            author_login=str(author.get("login") or "")[:39],
            base_branch=raw["base"]["ref"][:255],
            state=state,
            updated_at=utc(datetime.fromisoformat(raw["updated_at"])),
        )


def by_number(db: Session, team_id: str, number: int) -> PlanningPullRequest | None:
    return db.scalar(
        select(PlanningPullRequest).where(
            PlanningPullRequest.team_id == team_id,
            PlanningPullRequest.number == number,
        )
    )


def _detach(db: Session, pr: PlanningPullRequest) -> None:
    if pr.task_id and (task := db.get(PlanningTask, pr.task_id)) and task.primary_pr == pr.number:
        task.primary_pr = None
        task.pr_status = None


def association_note(db: Session, team: PlanningTeam, task: PlanningTask, pr: PlanningPullRequest) -> str | None:
    if pr.author_id != task.assignee_id:
        member = db.get(PlanningMember, task.assignee_id)
        author = f"@{pr.author_login}" if pr.author_login else "tài khoản chưa xác định"
        return f"PR #{pr.number} do {author} mở, task được giao cho @{member.login}."
    if pr.state == "merged" and pr.base_branch != team.target_branch:
        return f"PR #{pr.number} đã merge vào {pr.base_branch}. Task theo dõi nhánh {team.target_branch}."
    return None


def confirm_link(
    db: Session,
    team: PlanningTeam,
    pr: PlanningPullRequest,
    task: PlanningTask | None,
    *,
    automatic: bool = False,
) -> None:
    _detach(db, pr)
    pr.task_id = task.id if task else None
    pr.linkage = ("auto" if automatic else "confirmed") if task else "ignored"
    if not task:
        pr.note = None
        return
    if task.primary_pr is not None and task.primary_pr != pr.number:
        if previous := by_number(db, team.id, task.primary_pr):
            previous.linkage = "ignored"
    task.primary_pr = pr.number
    task.pr_status = {
        "draft": "doing",
        "open": "review",
        "closed": None,
        "merged": "done" if pr.base_branch == team.target_branch else None,
    }[pr.state]
    if task.pr_status and task.status == "done":
        task.status = "todo"  # "Xong" kéo tay không được che sự kiện PR mới
    pr.note = association_note(db, team, task, pr)


@contextmanager
def log_progress(db: Session, team: PlanningTeam, number: int, state: str) -> Iterator[None]:
    """Ghi một dòng cho mỗi task thật sự đổi tiến độ sau khi áp dụng sự kiện PR."""
    tasks = list(db.scalars(select(PlanningTask).where(PlanningTask.team_id == team.id)))
    before = {task.id: task.progress for task in tasks}
    yield
    for task in tasks:
        if task.progress != before[task.id]:
            change = f"chuyển từ {PROGRESS_LABELS[before[task.id]]} sang {PROGRESS_LABELS[task.progress]}"
            message = f"{PULL_EVENTS[state].format(number)}: T-{task.id} {change}"
            db.add(PlanningLog(team_id=team.id, at=now(), message=message))


def record_pull(db: Session, team: PlanningTeam, pull: Pull) -> None:
    with log_progress(db, team, pull.number, pull.state):
        _apply_pull(db, team, pull)


def _apply_pull(db: Session, team: PlanningTeam, pull: Pull) -> None:
    row = by_number(db, team.id, pull.number)
    if row and (pull.updated_at < utc(row.updated_at) or (row.state == "merged" and pull.state != "merged")):
        return
    codes = set(TITLE_CODE.findall(pull.title)) | set(BODY_CODE.findall(pull.body))
    # PR đã liên kết mà không đổi gì đáng kể thì không áp lại, để giữ thẻ người dùng đã kéo tay.
    # GitHub đổi updated_at cả khi chỉ có bình luận hay commit mới, nên không so theo thời điểm.
    if (
        row
        and row.linkage in ("auto", "confirmed")
        and (row.state, row.base_branch, row.author_id) == (pull.state, pull.base_branch, pull.author_id)
        and (row.linkage == "confirmed" or codes == {str(row.task_id)})
    ):
        row.title, row.author_login, row.updated_at = pull.title, pull.author_login, pull.updated_at
        return
    if row is None:
        row = PlanningPullRequest(team_id=team.id, number=pull.number, linkage="pending")
        db.add(row)
    row.title = pull.title
    row.author_id = pull.author_id
    row.author_login = pull.author_login
    row.base_branch = pull.base_branch
    row.state = pull.state
    row.updated_at = pull.updated_at

    if row.linkage == "ignored":
        return
    if row.linkage == "confirmed" and row.task_id and (task := db.get(PlanningTask, row.task_id)):
        confirm_link(db, team, row, task)
        return

    _detach(db, row)
    row.linkage = "pending"
    row.task_id = None
    task = db.get(PlanningTask, int(next(iter(codes)))) if len(codes) == 1 else None
    if not task or task.team_id != team.id:
        row.note = (
            "PR có nhiều mã task. Chọn một task để liên kết."
            if len(codes) > 1
            else "Cần một mã task của repo này để liên kết PR."
        )
        return
    row.task_id = task.id
    if task.assignee_id != row.author_id:
        row.note = association_note(db, team, task, row)
        return
    if task.primary_pr is not None and task.primary_pr != row.number:
        previous = by_number(db, team.id, task.primary_pr)
        if previous and previous.state != "closed":
            row.note = f"Task đang theo dõi PR #{previous.number}. Chọn PR chính để tiếp tục."
            return
    confirm_link(db, team, row, task, automatic=True)

"""Mã mời vào đội và xóa thành viên."""

import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_session
from app.planning.access import leader_for, team_for
from app.planning.auth import require_same_origin, require_session
from app.planning.models import (
    PlanningBoard,
    PlanningInvite,
    PlanningJoinAttempt,
    PlanningMember,
    PlanningSubscription,
    PlanningTask,
    PlanningTeam,
)
from app.planning.schemas import JoinInput, now, utc
from app.planning.work import members_in

router = APIRouter(dependencies=[Depends(require_same_origin)])
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # bỏ 0 O 1 I vì dễ nhầm
CODE_LENGTH = 8
TEAM_LIMIT = 16
MAX_FAILURES = 10
WINDOW = timedelta(minutes=10)


def invite_code(db: Session, team_id: str) -> str | None:
    row = db.get(PlanningInvite, team_id)
    return row.code if row else None


@router.post("/invite", status_code=204)
def create_invite(request: Request, db: Session = Depends(get_session)):
    _, member = leader_for(db, request)
    team = team_for(db, member.team_id, lock=True)
    code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    if row := db.get(PlanningInvite, team.id):
        row.code = code
    else:
        db.add(PlanningInvite(team_id=team.id, code=code))
    db.commit()


@router.delete("/invite", status_code=204)
def disable_invite(request: Request, db: Session = Depends(get_session)):
    _, member = leader_for(db, request)
    db.execute(delete(PlanningInvite).where(PlanningInvite.team_id == member.team_id))
    db.commit()


@router.post("/join", status_code=204)
def join_team(data: JoinInput, request: Request, db: Session = Depends(get_session)):
    session = require_session(request, db)
    if db.get(PlanningMember, session.github_id):
        raise HTTPException(409, "Tài khoản này đã ở trong một đội Planning.")
    attempt = db.get(PlanningJoinAttempt, session.github_id)
    if attempt and now() - utc(attempt.window_start) >= WINDOW:
        attempt.window_start, attempt.failures = now(), 0
    if attempt and attempt.failures >= MAX_FAILURES:
        raise HTTPException(429, "Nhập sai quá nhiều lần. Thử lại sau 10 phút.")

    code = "".join(char for char in data.code.upper() if char not in " -")
    found = db.scalar(select(PlanningInvite).where(PlanningInvite.code == code))
    team = team_for(db, found.team_id, lock=True) if found else None
    # Đội dùng thử và đội thật tách riêng. Trả cùng một lỗi để không lộ mã nào tồn tại.
    if not team or team.demo != session.demo or invite_code(db, team.id) != code:
        if attempt:
            attempt.failures += 1
        else:
            db.add(PlanningJoinAttempt(github_id=session.github_id, window_start=now(), failures=1))
        db.commit()
        raise HTTPException(404, "Mã mời không đúng hoặc đã tắt. Hỏi trưởng nhóm mã mới.")

    members = members_in(db, team)
    if len(members) >= TEAM_LIMIT:
        raise HTTPException(409, f"Đội đã đủ {TEAM_LIMIT} người.")
    if session.demo and any(person.login.casefold() == session.login.casefold() for person in members):
        session.login = f"khach-{secrets.token_hex(3)}"
    db.add(
        PlanningMember(
            github_id=session.github_id,
            team_id=team.id,
            leader=False,
            login=session.login,
            name=data.name,
            experience=data.experience,
            tags=list({tag.casefold(): tag for tag in data.tags}.values()),
            avatar=data.avatar,
        )
    )
    if attempt:
        db.delete(attempt)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Tài khoản này đã ở trong một đội Planning.") from exc


def _drop_references(db: Session, team: PlanningTeam, github_id: str) -> None:
    if board := db.get(PlanningBoard, team.id):
        roles = {role: user for role, user in board.data.get("roles", {}).items() if user != github_id}
        if roles != board.data.get("roles", {}):
            board.data, board.version = {**board.data, "roles": roles}, board.version + 1
    if team.draft and any(
        task.get("assignee_id") == github_id for sprint in team.draft["plan"]["sprints"] for task in sprint["tasks"]
    ):
        team.draft = None


@router.delete("/members/{github_id}", status_code=204)
def remove_member(github_id: str, request: Request, db: Session = Depends(get_session)):
    _, actor = leader_for(db, request)
    team = team_for(db, actor.team_id, lock=True)
    member = db.get(PlanningMember, github_id)
    if not member or member.team_id != team.id:
        raise HTTPException(404, "Người này không còn trong đội.")
    if member.leader:
        raise HTTPException(409, "Không xóa được trưởng nhóm.")
    if db.scalar(select(PlanningTask.id).where(PlanningTask.assignee_id == github_id).limit(1)):
        raise HTTPException(409, f"Giao task của @{member.login} cho người khác trước khi xóa.")
    _drop_references(db, team, github_id)
    db.execute(delete(PlanningSubscription).where(PlanningSubscription.github_id == github_id))
    db.delete(member)
    db.commit()

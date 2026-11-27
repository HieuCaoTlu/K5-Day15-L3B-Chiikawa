"""Nội dung tab Planning do đội tự nhập: tổng quan, vai, user story, link file, tech stack, chi phí."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_session
from app.planning.access import leader_for, team_for
from app.planning.auth import require_same_origin
from app.planning.models import PlanningBoard
from app.planning.schemas import BoardInput
from app.planning.work import members_in

router = APIRouter(dependencies=[Depends(require_same_origin)])


def board_state(db: Session, team_id: str) -> dict:
    row = db.get(PlanningBoard, team_id)
    empty = {"overview": "", "stories": [], "roles": {}, "links": {}, "stack": [], "cost": {}, "revenue": ""}
    return {**empty, **(row.data if row else {}), "version": row.version if row else 0}


@router.put("/board", status_code=204)
def save_board(data: BoardInput, request: Request, db: Session = Depends(get_session)):
    _, member = leader_for(db, request)
    team = team_for(db, member.team_id, lock=True)  # khóa đội để so phiên bản an toàn
    row = db.get(PlanningBoard, team.id)
    if data.version != (row.version if row else 0):
        raise HTTPException(409, "Nội dung vừa được sửa ở nơi khác. Xem bản mới rồi sửa lại.")
    content = data.model_dump(exclude={"version"}, exclude_none=True)
    content["roles"] = {role: user for role, user in content["roles"].items() if user}
    if set(content["roles"].values()) - {person.github_id for person in members_in(db, team)}:
        raise HTTPException(422, "Chọn người trong đội cho từng vai.")
    if row is None:
        db.add(PlanningBoard(team_id=team.id, data=content, version=1))
    else:
        row.data, row.version = content, row.version + 1
    db.commit()

import hashlib
import hmac
import json
import re

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from app.db import session_scope
from app.planning import github_app
from app.planning.models import PlanningDelivery, PlanningTeam
from app.planning.pulls import Pull, record_pull
from app.planning.schemas import now, utc

router = APIRouter()
PULL_ACTIONS = {"opened", "closed", "reopened", "edited", "synchronize", "ready_for_review", "converted_to_draft"}
DELIVERY = re.compile(r"[A-Za-z0-9-]{1,64}")


def _process(delivery: str, event: str, payload: dict) -> None:
    action = payload["action"]
    installation = str(payload["installation"]["id"])
    pull, repo_ids = None, None
    if event == "pull_request":
        if action not in PULL_ACTIONS:
            return
        pull = Pull.from_github(payload["pull_request"])
        repo_ids = [str(payload["repository"]["id"])]
    elif event == "installation" and action in {"deleted", "suspend"}:
        pass
    elif event == "installation_repositories" and action == "removed":
        repo_ids = [str(repo["id"]) for repo in payload["repositories_removed"]]
    else:
        return

    with session_scope() as db:
        query = select(PlanningTeam).where(
            PlanningTeam.installation_id == installation,
            PlanningTeam.repo_access.is_(True),
            PlanningTeam.demo.is_(False),
        )
        if repo_ids is not None:
            query = query.where(PlanningTeam.repo_id.in_(repo_ids))
        teams = list(db.scalars(query.order_by(PlanningTeam.id).with_for_update()))
        if not teams or db.get(PlanningDelivery, delivery):
            return
        db.add(PlanningDelivery(id=delivery, received_at=now()))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            return
        for team in teams:
            if pull is None:
                team.repo_access = False
            elif team.connected_at and pull.updated_at.replace(microsecond=0) >= utc(team.connected_at).replace(
                microsecond=0
            ):
                record_pull(db, team, pull)
        db.commit()


@router.post("/github/webhook", status_code=204)
async def github_webhook(request: Request):
    config = await run_in_threadpool(github_app.current)
    secret = config.webhook_secret if config else ""
    if not secret:
        raise HTTPException(404, "Webhook GitHub chưa được cấu hình.")
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not re.fullmatch(r"sha256=[0-9a-f]{64}", signature):
        raise HTTPException(401, "Chữ ký GitHub không hợp lệ.")
    raw = bytearray()
    async for chunk in request.stream():
        if len(raw) + len(chunk) > 2 * 1024 * 1024:
            raise HTTPException(413, "Payload webhook vượt kích thước cho phép.")
        raw.extend(chunk)
    expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(401, "Chữ ký GitHub không hợp lệ.")
    event = request.headers.get("X-GitHub-Event")
    if event not in {"pull_request", "installation", "installation_repositories"}:
        return Response(status_code=204)
    delivery = request.headers.get("X-GitHub-Delivery", "")
    if not DELIVERY.fullmatch(delivery):
        raise HTTPException(422, "Webhook cần mã lượt gửi.")
    try:
        await run_in_threadpool(_process, delivery, event, json.loads(raw))
    except (TypeError, KeyError, ValueError) as exc:
        raise HTTPException(422, "Payload webhook GitHub không hợp lệ.") from exc
    return Response(status_code=204)

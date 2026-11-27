import asyncio
import base64
import hashlib
import json
import logging
import os
from datetime import timedelta
from pathlib import Path
from typing import NamedTuple
from urllib.parse import urlsplit

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Depends, HTTPException, Request
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session, session_scope
from app.planning.access import team_for
from app.planning.auth import require_same_origin, require_session
from app.planning.models import PlanningMember, PlanningSession, PlanningSubscription, PlanningTask
from app.planning.schemas import PushEndpoint, PushSubscription, now, utc

router = APIRouter(prefix="/push", dependencies=[Depends(require_same_origin)])
logger = logging.getLogger(__name__)


class Vapid(NamedTuple):
    public: str
    private: str
    subject: str


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _stored_keys(path: Path) -> dict:
    """Đọc cặp khóa đã tạo; chưa có (hoặc hỏng) thì tạo mới. File nằm trong thư mục dữ liệu, ngoài git."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data.get("public"), str) and isinstance(data.get("private"), str):
            return data
    except (OSError, ValueError, AttributeError):
        pass
    key = ec.generate_private_key(ec.SECP256R1())
    point = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    data = {"public": _b64url(point), "private": _b64url(key.private_numbers().private_value.to_bytes(32, "big"))}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as file:
        json.dump(data, file)
    return data


def vapid() -> Vapid | None:
    """Khóa gửi thông báo: lấy từ biến môi trường, nếu trống thì ProductPilot tự tạo (không cần sửa .env)."""
    settings = get_settings()
    configured = Vapid(settings.push_vapid_public_key, settings.push_vapid_private_key, settings.push_vapid_subject)
    if all(configured):
        return configured
    if not settings.planning_push_auto:
        return None
    keys = _stored_keys(Path(settings.planning_vapid_file))
    subject = settings.site_origin if settings.site_origin.startswith("https://") else "mailto:planning@example.com"
    return Vapid(keys["public"], keys["private"], subject)


def _allowed_endpoint(endpoint: str) -> bool:
    try:
        url = urlsplit(endpoint)
        host = url.hostname or ""
        return (
            url.scheme == "https"
            and url.port in (None, 443)
            and not url.username
            and not url.password
            and not url.fragment
            and bool(url.path)
            and (
                host in {"fcm.googleapis.com", "updates.push.services.mozilla.com"}
                or host.endswith((".notify.windows.com", ".push.apple.com"))
            )
        )
    except ValueError:
        return False


@router.post("/subscription", status_code=204)
def subscribe(data: PushSubscription, request: Request, db: Session = Depends(get_session)):
    session = require_session(request, db)
    if not vapid():
        raise HTTPException(409, "Máy chủ đang tắt thông báo trình duyệt.")
    if not db.get(PlanningMember, session.github_id):
        raise HTTPException(409, "Thiết lập đội trước khi bật nhắc việc.")
    if not _allowed_endpoint(data.endpoint):
        raise HTTPException(422, "Trình duyệt hiện tại chưa hỗ trợ nhắc việc cho ProductPilot.")
    try:
        key_bytes = base64.urlsafe_b64decode(data.keys.p256dh.rstrip("=") + "=")
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), key_bytes)
    except ValueError as exc:
        raise HTTPException(422, "Đăng ký thông báo hết hiệu lực. Tắt rồi bật nhắc việc để thử lại.") from exc
    key = hashlib.sha256(data.endpoint.encode()).hexdigest()
    db.merge(
        PlanningSubscription(
            id=key,
            session_id=session.id,
            github_id=session.github_id,
            data=data.model_dump(),
        )
    )
    db.commit()


@router.delete("/subscription", status_code=204)
def unsubscribe(data: PushEndpoint, request: Request, db: Session = Depends(get_session)):
    session = require_session(request, db)
    query = delete(PlanningSubscription).where(PlanningSubscription.github_id == session.github_id)
    if data.endpoint:
        key = hashlib.sha256(data.endpoint.encode()).hexdigest()
        query = query.where(PlanningSubscription.id == key)
    else:
        query = query.where(PlanningSubscription.session_id == session.id)
    db.execute(query)
    db.commit()


class _PushClient(requests.Session):
    def request(self, method, url, **kwargs):
        kwargs["allow_redirects"] = False
        return super().request(method, url, **kwargs)


def _send(subscription: PlanningSubscription, payload: dict, ttl: int) -> bool:
    keys = vapid()
    if not keys or not _allowed_endpoint(subscription.data["endpoint"]):
        return False
    # Chỉ gửi đến dịch vụ push đã kiểm tra. Client HTTP không đi theo redirect.
    with _PushClient() as client:
        webpush(
            subscription_info=subscription.data,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=keys.private,
            vapid_claims={"sub": keys.subject},
            requests_session=client,
            timeout=4,
            ttl=ttl,
        )
    return True


def _deliver(subscription: PlanningSubscription, task: PlanningTask, hours: int, ttl: int) -> bool:
    return _send(
        subscription,
        {
            "title": "Task sắp đến hạn",
            "body": f"T-{task.id} còn tối đa {hours} giờ.",
            "url": f"/planning?task={task.id}",
            "tag": f"tang-{task.id}-{hours}",
        },
        ttl,
    )


@router.post("/test", status_code=204)
def send_test(request: Request, db: Session = Depends(get_session)):
    """Gửi một thông báo thật tới trình duyệt đang đăng nhập, để người dùng biết đã nhận được."""
    session = require_session(request, db)
    rows = list(db.scalars(select(PlanningSubscription).where(PlanningSubscription.session_id == session.id)))
    if not rows:
        raise HTTPException(409, "Bật thông báo trên trình duyệt này trước khi gửi thử.")
    payload = {
        "title": "ProductPilot đã gửi được thông báo",
        "body": "Task của bạn sẽ được nhắc trước hạn 24 giờ và 1 giờ.",
        "url": "/planning",
        "tag": "tang-test",
    }
    sent = False
    for row in rows:
        try:
            if _send(row, payload, 60):
                sent = True
            else:
                db.delete(row)
        except WebPushException as exc:
            if exc.response is not None and exc.response.status_code in (404, 410):
                db.delete(row)
                continue
            logger.warning("Chưa gửi được thông báo thử (%s).", type(exc).__name__)
            raise HTTPException(502, "Dịch vụ thông báo của trình duyệt chưa nhận. Thử lại sau ít phút.") from exc
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Chưa gửi được thông báo thử (%s).", type(exc).__name__)
            raise HTTPException(502, "Máy chủ chưa gửi được thông báo. Kiểm tra mạng rồi thử lại.") from exc
    db.commit()
    if not sent:
        raise HTTPException(409, "Đăng ký thông báo đã hết hiệu lực. Tắt rồi bật lại.")


def deliver_due() -> None:
    instant = now()
    with session_scope() as db:
        jobs = list(
            db.execute(
                select(PlanningTask.id, PlanningTask.team_id, PlanningSubscription.id)
                .select_from(PlanningTask)
                .join(PlanningSubscription, PlanningSubscription.github_id == PlanningTask.assignee_id)
                .join(PlanningSession, PlanningSession.id == PlanningSubscription.session_id)
                .where(
                    PlanningTask.deadline > instant,
                    PlanningTask.deadline <= instant + timedelta(hours=24),
                    PlanningTask.status != "done",
                    PlanningTask.pr_status.is_distinct_from("done"),
                    PlanningSession.expires_at > instant,
                )
            )
        )
    for task_id, team_id, subscription_id in jobs:
        with session_scope() as db:
            team_for(db, team_id, lock=True)
            task = db.get(PlanningTask, task_id)
            subscription = db.get(PlanningSubscription, subscription_id)
            if not task or task.progress == "done" or not subscription or subscription.github_id != task.assignee_id:
                continue
            if (session := db.get(PlanningSession, subscription.session_id)) is None or utc(
                session.expires_at
            ) <= now():
                continue
            remaining = utc(task.deadline) - now()
            if not timedelta() < remaining <= timedelta(hours=24):
                continue
            hours = 1 if remaining <= timedelta(hours=1) else 24
            marker = f"{subscription.id}:{hours}"
            if marker in task.reminders:
                continue
            try:
                if _deliver(subscription, task, hours, max(1, int(remaining.total_seconds()))):
                    task.reminders = [*task.reminders, marker]
                else:
                    db.delete(subscription)
            except WebPushException as exc:
                if exc.response is not None and exc.response.status_code in (404, 410):
                    db.delete(subscription)
                else:
                    logger.warning("Chưa gửi được một lượt nhắc việc (%s).", type(exc).__name__)
            except (requests.RequestException, ValueError) as exc:
                logger.warning("Chưa gửi được một lượt nhắc việc (%s).", type(exc).__name__)
            db.commit()


async def reminder_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(deliver_due)
        except Exception:  # noqa: BLE001 — backend vẫn chạy nếu một vòng nhắc việc bị lỗi
            logger.error("Cần kiểm tra lượt quét deadline của Planning.")
        await asyncio.sleep(30)

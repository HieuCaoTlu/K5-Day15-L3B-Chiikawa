"""Tạo GitHub App bằng manifest: người cài đặt bấm một nút, ProductPilot tự nhận và lưu khóa."""

import hashlib
import json
import logging
import re
import secrets
from datetime import timedelta
from hmac import compare_digest
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.planning import github, github_app
from app.planning.auth import NO_STORE, TOKEN, require_same_origin
from app.planning.models import PlanningSetupState
from app.planning.schemas import SetupStart, now, utc

router = APIRouter(prefix="/setup")
logger = logging.getLogger(__name__)
COOKIE = "tang_planning_setup"
CODE = re.compile(r"[A-Za-z0-9_-]{1,128}")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
_setup_code: str | None = None


def code_required() -> bool:
    # Không dựa vào Host/Origin của request vì người gọi giả được.
    settings = get_settings()
    return settings.app_env == "production" or settings.site_address.strip() not in ("", ":80")


def announce_code() -> str:
    global _setup_code
    _setup_code = secrets.token_urlsafe(12)
    logger.warning("Mã cài đặt GitHub cho Planning: %s (đổi sau mỗi lần khởi động lại)", _setup_code)
    return _setup_code


def current_code() -> str:
    return _setup_code or announce_code()


def _web_origin(value: str) -> str | None:
    try:
        parts = urlsplit(value)
        host = parts.hostname
        _ = parts.port
    except ValueError:
        return None
    if not host or parts.username or parts.password or parts.path or parts.query or parts.fragment:
        return None
    if parts.scheme == "https" or (parts.scheme == "http" and host in LOCAL_HOSTS):
        return value
    return None


def _manifest(origin: str) -> dict:
    base = origin + "/api/v1/planning"
    manifest = {
        "name": f"ProductPilot Planning {secrets.token_hex(2)}",
        "url": origin,
        "redirect_url": origin + github.SETUP_CALLBACK,
        "callback_urls": [origin + github.AUTH_CALLBACK],
        "setup_url": origin + "/planning?github_setup=1",
        "setup_on_update": True,
        "public": True,
        # Quyền ghi phục vụ nút "Bắt đầu task" (tạo nhánh và PR bằng token của người bấm).
        "default_permissions": {"contents": "write", "pull_requests": "write", "metadata": "read"},
    }
    if github_app.public_https(origin):
        manifest["hook_attributes"] = {"url": base + "/github/webhook", "active": True}
        manifest["default_events"] = ["pull_request"]
    return manifest


@router.post("/start", dependencies=[Depends(require_same_origin)])
def start_setup(data: SetupStart, request: Request, response: Response, db: Session = Depends(get_session)):
    if github_app.current(db):
        raise HTTPException(409, "Máy chủ đã kết nối GitHub. Tải lại Planning để đăng nhập.")
    origin = _web_origin(request.headers.get("Origin", ""))
    if not origin:
        raise HTTPException(403, "Mở Planning bằng HTTPS hoặc localhost để kết nối GitHub.")
    if code_required() and not compare_digest((data.setup_code or "").encode(), current_code().encode()):
        raise HTTPException(403, "Mã cài đặt chưa đúng. Lấy mã mới nhất trong log của backend.")
    state = secrets.token_urlsafe(32)
    db.execute(delete(PlanningSetupState).where(PlanningSetupState.expires_at <= now()))
    db.add(
        PlanningSetupState(
            id=hashlib.sha256(state.encode()).hexdigest(),
            site_url=origin,
            expires_at=now() + timedelta(minutes=10),
        )
    )
    db.commit()
    response.set_cookie(
        COOKIE,
        state,
        max_age=600,
        path=github.SETUP_CALLBACK,
        secure=origin.startswith("https://"),
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    owner = f"organizations/{data.organization}/" if data.organization else ""
    return {
        "action": f"https://github.com/{owner}settings/apps/new?state={state}",
        "manifest": json.dumps(_manifest(origin)),
    }


def _back(status: str) -> RedirectResponse:
    response = RedirectResponse(f"/planning?github={status}", status_code=303, headers=NO_STORE)
    response.delete_cookie(COOKIE, path=github.SETUP_CALLBACK)
    return response


@router.get("/callback")
def finish_setup(request: Request, code: str = "", state: str = "", db: Session = Depends(get_session)):
    if github_app.current(db):
        return _back("configured")
    expected = request.cookies.get(COOKIE, "")
    if not TOKEN.fullmatch(state) or not compare_digest(expected.encode(), state.encode()):
        return _back("state")
    pending = db.get(PlanningSetupState, hashlib.sha256(state.encode()).hexdigest())
    if not pending or utc(pending.expires_at) <= now():
        return _back("state")
    if not CODE.fullmatch(code):
        return _back("setup_failed")
    site_url = pending.site_url
    try:
        app = github.convert_manifest(code)
    except github.GitHubError:
        logger.warning("GitHub chưa đổi được mã manifest thành cấu hình app.")
        return _back("setup_failed")
    db.execute(delete(PlanningSetupState))
    db.commit()
    github_app.save(app, site_url)
    return _back("ready")

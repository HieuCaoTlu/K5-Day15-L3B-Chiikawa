"""Phiên Planning lưu trên server. Token GitHub chỉ dùng trong lượt OAuth."""

import hashlib
import re
import secrets
from datetime import timedelta
from hmac import compare_digest
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.planning import github, github_app
from app.planning.models import PlanningMember, PlanningSession, PlanningSubscription
from app.planning.schemas import now, utc

router = APIRouter(prefix="/auth")
COOKIE = "tang_planning_session"
OAUTH_COOKIE = "tang_planning_oauth"
COOKIE_PATH = "/api/v1/planning"
SESSION_SECONDS = 60 * 60 * 24 * 14
NO_STORE = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}
TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")


def secure_cookie() -> bool:
    settings = get_settings()
    config = github_app.current()
    site_url = config.site_url if config else settings.site_origin
    return settings.app_env == "production" or site_url.startswith("https://")


def session_for(request: Request, db: Session) -> PlanningSession | None:
    value = request.cookies.get(COOKIE, "")
    if not TOKEN.fullmatch(value):
        return None
    session = db.get(PlanningSession, hashlib.sha256(value.encode()).hexdigest())
    if session and utc(session.expires_at) > now() and (not session.demo or get_settings().planning_demo_enabled):
        return session
    return None


def require_session(request: Request, db: Session) -> PlanningSession:
    result = session_for(request, db)
    if not result:
        raise HTTPException(401, "Đăng nhập để mở Planning.")
    return result


def require_same_origin(request: Request) -> None:
    settings = get_settings()
    if request.headers.get("X-Planning-Request") != "1" or request.headers.get("Sec-Fetch-Site") not in (
        None,
        "same-origin",
        "none",
    ):
        raise HTTPException(403, "Mở Planning trên đúng địa chỉ của Tầng.")
    origin = request.headers.get("Origin")
    if settings.app_env == "production" and origin and origin != settings.site_origin:
        raise HTTPException(403, "Mở Planning trên đúng địa chỉ của Tầng.")


def _clear_session(db: Session, session: PlanningSession) -> None:
    db.execute(delete(PlanningSubscription).where(PlanningSubscription.session_id == session.id))
    db.delete(session)


def _start_session(request: Request, response: Response, db: Session, profile: dict, demo: bool = False) -> None:
    previous = session_for(request, db)
    if previous:
        _clear_session(db, previous)
    token = secrets.token_urlsafe(32)
    session = PlanningSession(
        id=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=now() + timedelta(seconds=SESSION_SECONDS),
        demo=demo,
        **profile,
    )
    db.add(session)
    db.commit()
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_SECONDS,
        path=COOKIE_PATH,
        secure=secure_cookie(),
        httponly=True,
        samesite="lax",
    )


def _back(status: str = "", task: str = "") -> RedirectResponse:
    query = (f"?github={status}" if status else "") + (f"&task={task}" if task else "")
    response = RedirectResponse("/planning" + query, status_code=303, headers=NO_STORE)
    response.delete_cookie(
        OAUTH_COOKIE,
        path=github.AUTH_CALLBACK,
        secure=secure_cookie(),
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/github")
def start_github(request: Request, intent: Literal["login", "repos"] = "login", db: Session = Depends(get_session)):
    config = github_app.current()
    if intent == "repos":
        session = require_session(request, db)
        member = db.get(PlanningMember, session.github_id)
        if session.demo or not member or not member.leader or not (config and config.repos_enabled):
            return _back("repos")
    if not config:
        return _back("config")
    response = RedirectResponse("/planning", status_code=303, headers=NO_STORE)
    response.headers["location"] = begin_oauth(response, intent)
    return response


def begin_oauth(response: Response, intent: str) -> str:
    """Đặt cookie state + PKCE cho một lượt xác nhận và trả URL trang xác nhận của GitHub."""
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(32)
    response.set_cookie(
        OAUTH_COOKIE,
        f"{state}.{verifier}.{intent}",
        max_age=600,
        path=github.AUTH_CALLBACK,
        secure=secure_cookie(),
        httponly=True,
        samesite="lax",
    )
    return github.authorize_url(state, verifier)


@router.get("/github/callback")
def finish_github(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_session),
):
    if error or not code or len(code) > 512:
        return _back("denied")
    cookie = request.cookies.get(OAUTH_COOKIE, "").split(".")
    if len(cookie) != 3 or not TOKEN.fullmatch(state):
        return _back("state")
    expected, verifier, intent = cookie
    if not compare_digest(expected.encode(), state.encode()) or not TOKEN.fullmatch(verifier):
        return _back("state")
    config = github_app.current()
    if not config or (intent == "repos" and not config.repos_enabled):
        return _back("config")
    from app.planning import start_pr  # nạp muộn: start_pr dùng lại các hàm của module này

    if started := start_pr.INTENT.fullmatch(intent):
        task_id, version = started.group(1), started.group(2)
        try:
            token = github.user_token(code, verifier)
            person = github.current_user(token)
        except github.GitHubError:
            return _back("denied", task_id)
        session = session_for(request, db)
        if not session or session.demo or session.github_id != person["github_id"]:
            return _back("account", task_id)
        return _back(start_pr.finish(db, session, token, int(task_id), int(version)), task_id)
    try:
        token = github.user_token(code, verifier)
        person = github.current_user(token)
        if intent == "repos":
            session = session_for(request, db)
            member = db.get(PlanningMember, person["github_id"])
            if (
                not session
                or session.demo
                or session.github_id != person["github_id"]
                or not member
                or not member.leader
            ):
                return _back("account")
            session.repo_choices = github.accessible_repos(token)
            session.choices_expires_at = now() + timedelta(minutes=10)
            db.commit()
            return _back("discovered")
    except github.GitHubError:
        return _back("repos" if intent == "repos" else "denied")

    member = db.get(PlanningMember, person["github_id"])
    if member:
        member.login = person["login"]
    response = _back()
    _start_session(request, response, db, person)
    return response


@router.post("/demo", status_code=204, dependencies=[Depends(require_same_origin)])
def demo_login(request: Request, db: Session = Depends(get_session)):
    if not get_settings().planning_demo_enabled:
        raise HTTPException(404, "Cần cấu hình chế độ demo.")
    if session_for(request, db):
        raise HTTPException(409, "Đăng xuất phiên hiện tại để mở một đội demo.")
    response = Response(status_code=204, headers=NO_STORE)
    _start_session(
        request,
        response,
        db,
        {
            "github_id": "demo-" + secrets.token_hex(16),
            "login": "truong-nhom-demo",
            "name": "Trưởng nhóm demo",
        },
        demo=True,
    )
    return response


@router.post("/logout", status_code=204, dependencies=[Depends(require_same_origin)])
def logout(request: Request, db: Session = Depends(get_session)):
    if session := session_for(request, db):
        _clear_session(db, session)
        db.commit()
    response = Response(status_code=204, headers=NO_STORE)
    response.delete_cookie(COOKIE, path=COOKIE_PATH, secure=secure_cookie(), httponly=True, samesite="lax")
    return response

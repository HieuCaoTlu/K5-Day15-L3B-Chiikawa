"""Đọc PR nền cho máy chủ không nhận được webhook (chạy localhost): không cần ai mở Planning."""

import asyncio
import logging

from fastapi import HTTPException
from sqlalchemy import select

from app.db import session_scope
from app.planning import github, github_app
from app.planning.models import PlanningTeam
from app.planning.repos import pull_latest

logger = logging.getLogger(__name__)


def sync_pulls() -> int:
    """Đọc PR mới nhất của từng đội dùng GitHub thật. Trả số đội đọc được."""
    config = github_app.current()
    if not config or not config.repos_enabled or config.webhook:
        return 0
    with session_scope() as db:
        teams = db.execute(
            select(PlanningTeam.id, PlanningTeam.repo_version).where(
                PlanningTeam.demo.is_(False),
                PlanningTeam.repo_access.is_(True),
                PlanningTeam.installation_id.is_not(None),
            )
        ).all()
    done = 0
    for team_id, version in teams:
        try:
            with session_scope() as db:
                pull_latest(db, team_id, version)
            done += 1
        except github.GitHubError as exc:
            logger.warning("Đọc PR nền chưa được (GitHub %s)", exc.status)
        except HTTPException:
            logger.info("Bỏ qua lượt đọc nền: repo vừa đổi")
        except Exception:  # noqa: BLE001 — lỗi của một đội không được chặn các đội khác
            logger.exception("Lỗi khi đọc PR nền")
    return done


async def poll_loop(seconds: float) -> None:
    while True:
        await asyncio.sleep(seconds)
        try:
            await asyncio.to_thread(sync_pulls)
        except Exception:  # noqa: BLE001 — vòng lặp phải sống qua lỗi tạm thời
            logger.exception("Lỗi khi đọc PR nền")

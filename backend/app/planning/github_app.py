"""Nơi duy nhất trả cấu hình GitHub App: lấy từ biến môi trường, nếu trống thì từ bảng đã mã hóa."""

import base64
import ipaddress
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import session_scope
from app.planning.models import PlanningGithubApp

logger = logging.getLogger(__name__)


def public_https(url: str) -> bool:
    """GitHub chỉ gửi được webhook tới địa chỉ HTTPS công khai."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or "." not in host or host.endswith((".localhost", ".local", ".test")):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return True


@dataclass(frozen=True)
class GitHubConfig:
    source: str  # env | app
    client_id: str
    client_secret: str = field(repr=False)
    slug: str
    private_key_b64: str = field(repr=False)
    webhook_secret: str = field(repr=False)
    site_url: str

    @property
    def repos_enabled(self) -> bool:
        return bool(self.slug and self.private_key_b64)

    @property
    def webhook(self) -> bool:
        return bool(self.webhook_secret) and public_https(self.site_url)


def _fernet(*, create: bool = False) -> Fernet | None:
    path = Path(get_settings().planning_key_file)
    try:
        return Fernet(path.read_bytes().strip())
    except (OSError, ValueError):
        if not create:
            return None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)  # file hỏng thì thay bằng khóa mới
    handle = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    key = Fernet.generate_key()
    with os.fdopen(handle, "wb") as file:
        file.write(key)
    return Fernet(key)


def current(db: Session | None = None) -> GitHubConfig | None:
    settings = get_settings()
    if settings.github_client_id and settings.github_client_secret:
        return GitHubConfig(
            source="env",
            client_id=settings.github_client_id,
            client_secret=settings.github_client_secret,
            slug=settings.github_app_slug,
            private_key_b64=settings.github_app_private_key_b64,
            webhook_secret=settings.github_webhook_secret,
            site_url=settings.site_origin,
        )
    if db is not None:
        row = db.get(PlanningGithubApp, 1)
    else:
        with session_scope() as session:
            row = session.get(PlanningGithubApp, 1)
    if row is None:
        return None
    if fernet := _fernet():
        try:
            secrets = json.loads(fernet.decrypt(row.secrets.encode()))
            return GitHubConfig(
                source="app",
                client_id=row.client_id,
                slug=row.slug,
                site_url=row.site_url,
                **secrets,
            )
        except InvalidToken:
            pass
    logger.warning("Không giải mã được cấu hình GitHub đã lưu. Cần kết nối GitHub lại.")
    return None


def save(app: dict, site_url: str) -> None:
    """Lưu kết quả đổi mã manifest. Thay dòng cũ (chỉ xảy ra khi dòng cũ không còn giải mã được)."""
    secrets = {
        "client_secret": app["client_secret"],
        "private_key_b64": base64.b64encode(app["pem"].encode()).decode(),
        "webhook_secret": app.get("webhook_secret") or "",
    }
    encrypted = _fernet(create=True).encrypt(json.dumps(secrets).encode()).decode()
    with session_scope() as db:
        db.execute(delete(PlanningGithubApp))
        db.add(
            PlanningGithubApp(
                id=1,
                app_id=str(app["id"]),
                slug=app["slug"],
                client_id=app["client_id"],
                site_url=site_url,
                secrets=encrypted,
            )
        )
        db.commit()


def clear() -> None:
    with session_scope() as db:
        db.execute(delete(PlanningGithubApp))
        db.commit()

"""GitHub OAuth cho phiên đăng nhập, token cài đặt cho việc đọc PR."""

import base64
import hashlib
import json
import re
import time
from urllib.parse import quote, urlencode

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from app.planning import github_app

AUTH_CALLBACK = "/api/v1/planning/auth/github/callback"
SETUP_CALLBACK = "/api/v1/planning/setup/callback"
API = "https://api.github.com"
API_VERSION = "2022-11-28"
REPO_RE = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
LOGIN_RE = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?")
SLUG_RE = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9-]{0,99}")


class GitHubError(RuntimeError):
    def __init__(self, status: int = 502, detail: str = ""):
        self.status = status
        self.detail = detail  # lý do GitHub trả về, dùng để phân loại lỗi; không đưa ra giao diện hay log
        super().__init__("Không đọc được dữ liệu GitHub.")


def _request(url: str, method: str = "GET", **kwargs):
    try:
        response = httpx.request(method, url, timeout=8, **kwargs)
        if not response.is_success:
            raise GitHubError(response.status_code, response.text[:2000])
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise GitHubError() from exc


def _api(path: str, token: str = "", method: str = "GET", **kwargs):
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": API_VERSION}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return _request(API + path, method, headers=headers, **kwargs)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _config() -> github_app.GitHubConfig:
    config = github_app.current()
    if not config:
        raise GitHubError(404)
    return config


def convert_manifest(code: str) -> dict:
    """Đổi mã dùng một lần của luồng manifest lấy thông tin GitHub App."""
    data = _api(f"/app-manifests/{quote(code, safe='')}/conversions", method="POST")
    if (
        not isinstance(data, dict)
        or not isinstance(data.get("id"), int)
        or not all(
            isinstance(data.get(key), str) and data[key] for key in ("slug", "client_id", "client_secret", "pem")
        )
        or not SLUG_RE.fullmatch(data["slug"])
        or not isinstance(data.get("webhook_secret"), str | None)
    ):
        raise GitHubError()
    return data


def authorize_url(state: str, verifier: str) -> str:
    config = _config()
    query = urlencode(
        {
            "client_id": config.client_id,
            "redirect_uri": config.site_url + AUTH_CALLBACK,
            "state": state,
            "code_challenge": _b64url(hashlib.sha256(verifier.encode()).digest()),
            "code_challenge_method": "S256",
        }
    )
    return f"https://github.com/login/oauth/authorize?{query}"


def user_token(code: str, verifier: str) -> str:
    config = _config()
    data = _request(
        "https://github.com/login/oauth/access_token",
        "POST",
        headers={"Accept": "application/json"},
        data={
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": config.site_url + AUTH_CALLBACK,
            "code_verifier": verifier,
        },
    )
    if not isinstance(data, dict) or not isinstance(data.get("access_token"), str) or data.get("error"):
        raise GitHubError(401)
    return data["access_token"]


def _person(data: dict) -> dict:
    login = data.get("login", "")
    github_id = data.get("id")
    if (
        not isinstance(login, str)
        or not LOGIN_RE.fullmatch(login)
        or not isinstance(github_id, int)
        or github_id <= 0
        or data.get("type") != "User"
    ):
        raise GitHubError(404)
    return {
        "github_id": str(github_id),
        "login": login,
        "name": str(data.get("name") or login).strip()[:80],
    }


def current_user(token: str) -> dict:
    return _person(_api("/user", token))


def find_user(login: str) -> dict:
    if not LOGIN_RE.fullmatch(login):
        raise GitHubError(404)
    return _person(_api(f"/users/{quote(login, safe='')}"))


def install_url() -> str | None:
    config = github_app.current()
    if config and config.repos_enabled and SLUG_RE.fullmatch(config.slug):
        return f"https://github.com/apps/{config.slug}/installations/new"
    return None


def _pages(path: str, key: str, token: str):
    for page in range(1, 11):
        data = _api(path, token, params={"page": page, "per_page": 100})
        rows = data[key]
        yield from rows
        if len(rows) < 100 or data.get("total_count", page * 100 + 1) <= page * 100:
            break


def accessible_repos(token: str) -> list[dict]:
    choices = {}
    for installation in _pages("/user/installations", "installations", token):
        installation_id = str(installation["id"])
        if installation.get("suspended_at"):
            continue
        for row in _pages(f"/user/installations/{installation_id}/repositories", "repositories", token):
            name = row["full_name"]
            if REPO_RE.fullmatch(name):
                choices[str(row["id"])] = {
                    "id": str(row["id"]),
                    "name": name,
                    "installation_id": installation_id,
                    "branch": row["default_branch"],
                    "private": bool(row["private"]),
                }
    return sorted(choices.values(), key=lambda row: row["name"].casefold())


def _app_jwt() -> str:
    config = _config()
    issued_at = int(time.time())
    claims = {"iat": issued_at - 60, "exp": issued_at + 480, "iss": config.client_id}
    header = _b64url(b'{"alg":"RS256","typ":"JWT"}')
    payload = _b64url(json.dumps(claims, separators=(",", ":")).encode())
    encoded = f"{header}.{payload}"
    try:
        pem = base64.b64decode(config.private_key_b64, validate=True)
        key = serialization.load_pem_private_key(pem, password=None)
        if not isinstance(key, rsa.RSAPrivateKey):
            raise ValueError("GitHub App cần khóa RSA.")
    except (TypeError, ValueError) as exc:
        raise GitHubError() from exc
    signature = key.sign(encoded.encode(), padding.PKCS1v15(), hashes.SHA256())
    return encoded + "." + _b64url(signature)


def _repo_token(repo_id: str, installation_id: str) -> str:
    if not repo_id.isascii() or not repo_id.isdigit() or not installation_id.isascii() or not installation_id.isdigit():
        raise GitHubError(404)
    token = _api(
        f"/app/installations/{installation_id}/access_tokens",
        _app_jwt(),
        "POST",
        json={"repository_ids": [int(repo_id)], "permissions": {"pull_requests": "read"}},
    )
    return token["token"]


def repo_pulls(repo_id: str, installation_id: str) -> tuple[dict, list[dict]]:
    """Đọc tên hiện tại của repo và tối đa 50 PR cập nhật gần nhất."""
    token = _repo_token(repo_id, installation_id)
    repositories = _api("/installation/repositories", token, params={"per_page": 1})["repositories"]
    repo = next((row for row in repositories if str(row.get("id")) == repo_id), None)
    if not repo or not REPO_RE.fullmatch(repo.get("full_name", "")):
        raise GitHubError(404)
    name = repo["full_name"]
    pulls = _api(
        f"/repos/{name}/pulls",
        token,
        params={"state": "all", "sort": "updated", "direction": "desc", "per_page": 50},
    )
    if not isinstance(pulls, list):
        raise GitHubError()
    return {"name": name, "branch": repo["default_branch"]}, pulls


def _branch_sha(repo: str, branch: str, token: str) -> str | None:
    try:
        return _api(f"/repos/{repo}/git/ref/heads/{quote(branch)}", token)["object"]["sha"]
    except GitHubError as exc:
        if exc.status == 404:
            return None
        raise


def create_task_pr(token: str, repo: str, base: str, number: int, title: str, body: str) -> tuple[dict, bool]:
    """Tạo nhánh task/t-<số> và PR nháp bằng token của người bấm. Trả (PR, đã có sẵn hay chưa).

    Chỉ ghi vào nhánh của task: không đụng nhánh theo dõi, không force, không xóa.
    """
    if not REPO_RE.fullmatch(repo):
        raise GitHubError(404)
    branch = f"task/t-{number}"
    owner = repo.split("/")[0]
    opened = _api(f"/repos/{repo}/pulls", token, params={"head": f"{owner}:{branch}", "state": "open"})
    if opened:
        return opened[0], True
    base_sha = _branch_sha(repo, base, token)
    if not base_sha:
        raise GitHubError(409)  # repo trống hoặc không còn nhánh theo dõi
    head = _branch_sha(repo, branch, token)
    if not head:
        _api(f"/repos/{repo}/git/refs", token, "POST", json={"ref": f"refs/heads/{branch}", "sha": base_sha})
        head = base_sha
    ahead = 0
    if head != base_sha:
        ahead = _api(f"/repos/{repo}/compare/{quote(base)}...{quote(branch)}", token)["ahead_by"]
    if not ahead:
        # GitHub chỉ mở PR khi nhánh có commit mới. Commit rỗng giữ nguyên cây file.
        tree = _api(f"/repos/{repo}/git/commits/{head}", token)["tree"]["sha"]
        commit = _api(
            f"/repos/{repo}/git/commits",
            token,
            "POST",
            json={"message": f"chore: bắt đầu T-{number}", "tree": tree, "parents": [head]},
        )
        _api(
            f"/repos/{repo}/git/refs/heads/{quote(branch)}",
            token,
            "PATCH",
            json={"sha": commit["sha"], "force": False},
        )
    pull = _api(
        f"/repos/{repo}/pulls",
        token,
        "POST",
        json={"title": f"[T-{number}] {title}"[:240], "head": branch, "base": base, "body": body, "draft": True},
    )
    return pull, False


def repo_access(repo_id: str, installation_id: str, repo: str, logins: list[str]) -> dict:
    """Quyền ghi của app và của từng người. None nghĩa là không đọc được, không suy đoán."""
    token = _repo_token(repo_id, installation_id)
    try:
        granted = _api(f"/app/installations/{installation_id}", _app_jwt())["permissions"]
        app_can_write = all(granted.get(name) == "write" for name in ("contents", "pull_requests"))
    except (GitHubError, KeyError, TypeError):
        app_can_write = None
    members = {}
    for login in logins:
        try:
            if not LOGIN_RE.fullmatch(login):
                raise GitHubError(404)
            data = _api(f"/repos/{repo}/collaborators/{quote(login, safe='')}/permission", token)
            members[login] = data["permission"] in ("admin", "write")
        except (GitHubError, KeyError, TypeError):
            members[login] = None
    return {"app_can_write": app_can_write, "members": members}

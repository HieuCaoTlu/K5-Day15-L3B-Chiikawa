import json
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.db import session_scope
from app.main import create_app
from app.planning import github, github_app, setup
from app.planning.models import PlanningGithubApp

BASE = "/api/v1/planning"
LOCAL = "http://localhost:3000"
CONVERSION = {
    "id": 123,
    "slug": "tang-planning-ab12",
    "client_id": "Iv1.client",
    "client_secret": "plain-client-secret",
    "pem": "-----BEGIN RSA PRIVATE KEY-----\nplain-private-key\n-----END RSA PRIVATE KEY-----\n",
    "webhook_secret": "plain-webhook-secret",
}


@pytest.fixture
def make_client(set_env, tmp_path):
    clients = []

    def _make(**env):
        values = {
            "PLANNING_KEY_FILE": str(tmp_path / "planning.key"),
            "SITE_ADDRESS": "",
            "SITE_URL": LOCAL,
            "GITHUB_CLIENT_ID": "",
            "GITHUB_CLIENT_SECRET": "",
            "GITHUB_APP_SLUG": "",
            "GITHUB_APP_PRIVATE_KEY_B64": "",
            "GITHUB_WEBHOOK_SECRET": "",
        }
        set_env(**{**values, **env})
        client = TestClient(create_app(), base_url="https://testserver")
        client.__enter__()
        clients.append(client)
        return client

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


def _start(client, origin=LOCAL, **data):
    headers = {"X-Planning-Request": "1"}
    if origin:
        headers["Origin"] = origin
    return client.post(BASE + "/setup/start", headers=headers, json=data)


def _callback(client, state, code="one-time-code"):
    return client.get(BASE + "/setup/callback", params={"state": state, "code": code}, follow_redirects=False)


def _state_param(response):
    return parse_qs(urlsplit(response.json()["action"]).query)["state"][0]


def _state(client):
    return client.get(BASE + "/state").json()


def test_manifest_for_localhost_has_no_webhook(make_client):
    client = make_client()
    assert _state(client)["setup"] == {"needed": True, "code_required": False}
    result = _start(client)
    assert result.status_code == 200, result.text
    assert result.json()["action"].startswith("https://github.com/settings/apps/new?state=")
    manifest = json.loads(result.json()["manifest"])
    assert manifest["name"].startswith("Tang Planning ")
    assert len(manifest["name"]) <= 34
    assert manifest["url"] == LOCAL
    assert manifest["redirect_url"] == LOCAL + BASE + "/setup/callback"
    assert manifest["callback_urls"] == [LOCAL + BASE + "/auth/github/callback"]
    assert manifest["setup_url"] == LOCAL + "/planning?github_setup=1"
    assert manifest["setup_on_update"] is True
    assert manifest["public"] is True
    assert manifest["default_permissions"] == {"contents": "write", "pull_requests": "write", "metadata": "read"}
    assert "hook_attributes" not in manifest
    assert "default_events" not in manifest


def test_manifest_for_public_https_subscribes_pull_requests(make_client):
    client = make_client()
    result = _start(client, origin="https://tang.example.com", organization="tang-team")
    assert result.status_code == 200, result.text
    assert result.json()["action"].startswith("https://github.com/organizations/tang-team/settings/apps/new?state=")
    manifest = json.loads(result.json()["manifest"])
    assert manifest["hook_attributes"] == {"url": "https://tang.example.com" + BASE + "/github/webhook", "active": True}
    assert manifest["default_events"] == ["pull_request"]


@pytest.mark.parametrize("env", [{"APP_ENV": "production"}, {"SITE_ADDRESS": "tang.example.com"}])
def test_setup_requires_code_outside_a_personal_machine(make_client, env, caplog):
    with caplog.at_level("WARNING"):
        client = make_client(SITE_URL="https://tang.example.com", **env)
    assert _state(client)["setup"] == {"needed": True, "code_required": True}
    code = setup.current_code()
    assert code in caplog.text
    assert code not in client.get(BASE + "/state").text
    origin = "https://tang.example.com"
    assert _start(client, origin=origin).status_code == 403
    assert _start(client, origin=origin, setup_code="wrong").status_code == 403
    assert _start(client, origin=origin, setup_code=code).status_code == 200


@pytest.mark.parametrize("origin", [None, "http://tang.example.com", "null", "https://tang.example.com/path"])
def test_setup_rejects_missing_or_insecure_origin(make_client, origin):
    assert _start(make_client(), origin=origin).status_code == 403


def test_callback_stores_encrypted_secrets_once(make_client, monkeypatch):
    client = make_client()
    codes = []
    monkeypatch.setattr(github, "convert_manifest", lambda code: codes.append(code) or CONVERSION)
    state = _state_param(_start(client))
    assert _callback(client, state).headers["location"] == "/planning?github=ready"

    current = github_app.current()
    assert current.source == "app"
    assert current.client_secret == "plain-client-secret"
    assert current.webhook_secret == "plain-webhook-secret"
    assert current.site_url == LOCAL
    assert current.repos_enabled
    with session_scope() as db:
        stored = str(db.execute(text("SELECT * FROM planning_github_app")).all())
    shown = client.get(BASE + "/state")
    for secret in ("plain-client-secret", "plain-private-key", "plain-webhook-secret"):
        assert secret not in stored
        assert secret not in shown.text
    assert shown.json()["github_enabled"]
    assert shown.json()["webhook"] is False  # localhost không nhận được webhook
    assert shown.json()["setup"]["needed"] is False

    login = client.get(BASE + "/auth/github", follow_redirects=False)
    query = parse_qs(urlsplit(login.headers["location"]).query)
    assert query["client_id"] == ["Iv1.client"]
    assert query["redirect_uri"] == [LOCAL + BASE + "/auth/github/callback"]

    assert _start(client).status_code == 409
    assert _callback(client, state, "second").headers["location"] == "/planning?github=configured"
    assert codes == ["one-time-code"]


def test_public_site_reports_webhook(make_client, monkeypatch):
    client = make_client()
    monkeypatch.setattr(github, "convert_manifest", lambda _code: CONVERSION)
    _callback(client, _state_param(_start(client, origin="https://tang.example.com")))
    assert _state(client)["webhook"] is True


def test_callback_rejects_bad_state_and_incomplete_conversion(make_client, monkeypatch):
    client = make_client()
    real_convert = getattr(github, "convert_manifest", None)
    monkeypatch.setattr(github, "convert_manifest", lambda _code: pytest.fail("không được gọi GitHub"), raising=False)
    state = _state_param(_start(client))
    assert _callback(client, "x" * 43).headers["location"] == "/planning?github=state"
    client.cookies.clear()
    assert _callback(client, state).headers["location"] == "/planning?github=state"

    state = _state_param(_start(client))
    monkeypatch.setattr(github, "convert_manifest", real_convert)
    monkeypatch.setattr(github, "_api", lambda *_args, **_kwargs: {"id": 123, "slug": "tang"})
    assert _callback(client, state).headers["location"] == "/planning?github=setup_failed"
    assert github_app.current() is None
    with session_scope() as db:
        assert db.scalar(select(PlanningGithubApp)) is None


def test_env_configuration_wins_over_setup(make_client):
    client = make_client(GITHUB_CLIENT_ID="env-client", GITHUB_CLIENT_SECRET="env-secret")
    assert github_app.current().source == "env"
    assert _state(client)["setup"]["needed"] is False
    assert _start(client).status_code == 409


def test_lost_key_file_means_not_connected(make_client, monkeypatch, tmp_path):
    client = make_client()
    monkeypatch.setattr(github, "convert_manifest", lambda _code: CONVERSION)
    _callback(client, _state_param(_start(client)))
    (tmp_path / "planning.key").unlink()
    assert github_app.current() is None
    assert _state(client)["setup"]["needed"]
    assert _callback(client, _state_param(_start(client))).headers["location"] == "/planning?github=ready"
    assert github_app.current().client_id == "Iv1.client"

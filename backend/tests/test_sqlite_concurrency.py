"""Kiểm thử đồng thời trên SQLite file: không deadlock QueuePool, WAL + BEGIN IMMEDIATE, không database is locked."""

from __future__ import annotations

import asyncio
import os
import socket
import sqlite3
import threading
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
import uvicorn
import websockets
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.pool import QueuePool

from app.agent import nodes
from app.db import get_engine, session_scope
from app.main import create_app
from app.planning import push
from app.planning.auth import COOKIE, LEGACY_COOKIE
from app.planning.models import PlanningMember, PlanningSprint, PlanningTask

BASE = "/api/v1/planning"
WRITE = {"X-Planning-Request": "1"}


@pytest.fixture(autouse=True)
def offline_llm(monkeypatch):
    def unavailable(*_args, **_kwargs):
        raise nodes.llm.LLMUnavailableError

    monkeypatch.setattr(nodes.llm, "structured", unavailable)


def _sqlite_file_env(set_env, tmp_path: Path) -> Path:
    db_path = tmp_path / "concurrency.db"
    set_env(
        APP_ENV="development",
        DATABASE_URL=f"sqlite:///{db_path.as_posix()}",
        SEED_ON_START="false",
        PLANNING_PUSH_AUTO="false",
        PLANNING_POLL_SECONDS="0",
    )
    return db_path


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _setup_demo_leader(client) -> tuple[str, str]:
    res = client.post(f"{BASE}/auth/demo", headers=WRITE)
    assert res.status_code == 204, res.text
    token = client.cookies.get(COOKIE)
    assert token
    res = client.put(
        f"{BASE}/members",
        headers=WRITE,
        json={
            "members": [
                {
                    "login": "truong-nhom-demo",
                    "name": "Trưởng nhóm",
                    "experience": "5 năm Python",
                    "tags": ["BE"],
                    "avatar": 0,
                }
            ]
        },
    )
    assert res.status_code == 204, res.text
    state = client.get(f"{BASE}/state").json()
    return token, state["profile"]["github_id"]


def _seed_sprint_tasks(github_id: str, count: int = 3) -> None:
    with session_scope() as db:
        member = db.get(PlanningMember, github_id)
        assert member is not None
        sprint = PlanningSprint(
            team_id=member.team_id,
            title="Sprint 1",
            goal="Kiểm thử đồng thời",
            starts_on=date.today(),
            ends_on=date.today() + timedelta(days=7),
        )
        db.add(sprint)
        db.flush()
        for idx in range(count):
            db.add(
                PlanningTask(
                    team_id=member.team_id,
                    sprint_id=sprint.id,
                    assignee_id=github_id,
                    title=f"Task {idx + 1}",
                    description="Mô tả task",
                    criteria=["Xong"],
                    deadline=datetime.now(UTC) + timedelta(days=2),
                    status="todo",
                )
            )
        db.commit()


def _start_uvicorn(app):
    port = _free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started:
        assert time.monotonic() < deadline, "Uvicorn tạm không khởi động kịp"
        time.sleep(0.02)
    return server, thread, port


def test_state_uses_single_pool_connection_without_deadlock_with_tasks_and_legacy_cookie(set_env, tmp_path):
    _sqlite_file_env(set_env, tmp_path)
    app = create_app()
    with TestClient(app) as client:
        engine = get_engine()
        assert isinstance(engine.pool, QueuePool)
        token, github_id = _setup_demo_leader(client)
        _seed_sprint_tasks(github_id, count=3)

        lock = threading.Lock()
        checked_out = 0
        max_checked_out = 0

        def on_checkout(*_args):
            nonlocal checked_out, max_checked_out
            with lock:
                checked_out += 1
                max_checked_out = max(max_checked_out, checked_out)

        def on_checkin(*_args):
            nonlocal checked_out
            with lock:
                checked_out -= 1

        event.listen(engine, "checkout", on_checkout)
        event.listen(engine, "checkin", on_checkin)
        try:
            max_checked_out = 0
            res_new = client.get(f"{BASE}/state", headers={"Cookie": f"{COOKIE}={token}"})
            assert res_new.status_code == 200
            assert max_checked_out == 1

            max_checked_out = 0
            res_legacy = client.get(f"{BASE}/state", headers={"Cookie": f"{LEGACY_COOKIE}={token}"})
            assert res_legacy.status_code == 200
            assert max_checked_out == 1
        finally:
            event.remove(engine, "checkout", on_checkout)
            event.remove(engine, "checkin", on_checkin)

    # Bùng nổ đồng thời trên server uvicorn thật: 16 GET /state (cookie cũ) + 1 PUT /thinking + 1 POST /agent/runs + 1 WS mở.
    server, srv_thread, port = _start_uvicorn(app)
    base_url = f"http://127.0.0.1:{port}"
    ws_stop = threading.Event()
    ws_ready = threading.Event()
    ws_errors: list[str] = []

    def ws_worker():
        async def run_ws():
            async with websockets.connect(
                f"ws://127.0.0.1:{port}{BASE}/ws",
                additional_headers={"Cookie": f"{COOKIE}={token}"},
            ) as ws:
                await ws.send("ping")
                assert await ws.recv() == '{"type":"pong"}'
                ws_ready.set()
                while not ws_stop.is_set():
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=0.1)
                    except TimeoutError:
                        continue

        try:
            asyncio.run(run_ws())
        except Exception as exc:  # pragma: no cover — chỉ dùng để chẩn đoán nếu WS lỗi
            ws_errors.append(f"{type(exc).__name__}: {exc}")
            ws_ready.set()

    ws_thread = threading.Thread(target=ws_worker, daemon=True)
    clients: list[httpx.Client] = []
    try:
        ws_thread.start()
        assert ws_ready.wait(timeout=5)
        assert not ws_errors

        clients = [httpx.Client(base_url=base_url, timeout=5.0) for _ in range(18)]
        for cli in clients:
            assert cli.get("/health").status_code == 200

        ver = clients[0].get(f"{BASE}/state", headers={"Cookie": f"{COOKIE}={token}"}).json()["thinking"]["version"]
        barrier = threading.Barrier(18)
        results: list[tuple[str, int | str]] = []

        def worker(idx: int):
            cli = clients[idx]
            barrier.wait()
            try:
                if idx < 16:
                    r = cli.get(f"{BASE}/state", headers={"Cookie": f"{LEGACY_COOKIE}={token}"})
                    results.append(("GET_STATE", r.status_code))
                elif idx == 16:
                    r = cli.put(
                        f"{BASE}/thinking",
                        headers={**WRITE, "Cookie": f"{COOKIE}={token}"},
                        json={"version": ver, "session": "th-pool-burst", "msgs": []},
                    )
                    results.append(("PUT_THINKING", r.status_code))
                else:
                    r = cli.post(
                        "/api/v1/agent/runs",
                        headers={**WRITE, "Cookie": f"{COOKIE}={token}"},
                        json={"request": "Ý tưởng kiểm thử pool", "session_id": "th-pool-burst"},
                    )
                    results.append(("POST_RUN", r.status_code))
            except Exception as exc:
                results.append((f"EXC_{idx}", f"{type(exc).__name__}: {exc}"))

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(18)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert results.count(("GET_STATE", 200)) == 16, results
        assert ("PUT_THINKING", 204) in results, results
        assert ("POST_RUN", 201) in results, results
        assert get_engine().pool.checkedout() == 0
    finally:
        ws_stop.set()
        ws_thread.join(timeout=3)
        for cli in clients:
            cli.close()
        server.should_exit = True
        srv_thread.join(timeout=5)


def test_sqlite_file_wal_and_concurrent_thinking_refresh_with_websocket(set_env, tmp_path):
    _sqlite_file_env(set_env, tmp_path)
    app = create_app()
    server, srv_thread, port = _start_uvicorn(app)
    base_url = f"http://127.0.0.1:{port}"
    setup_client = httpx.Client(base_url=base_url, timeout=10.0)
    clients: list[httpx.Client] = []
    ws_stop = threading.Event()
    ws_ready = threading.Event()
    ws_refreshes: list[int] = []
    ws_errors: list[str] = []

    engine = get_engine()
    assert isinstance(engine.pool, QueuePool)
    with engine.connect() as conn:
        journal_mode = str(conn.exec_driver_sql("PRAGMA journal_mode").scalar()).lower()
        busy_timeout = int(conn.exec_driver_sql("PRAGMA busy_timeout").scalar())
    assert journal_mode == "wal"
    assert busy_timeout >= 15000

    db_locked_errors: list[str] = []

    def on_handle_error(ctx):
        msg = str(ctx.original_exception)
        if "locked" in msg.lower():
            db_locked_errors.append(msg)

    event.listen(engine, "handle_error", on_handle_error)

    try:
        token, _ = _setup_demo_leader(setup_client)
        cookie_hdr = {"Cookie": f"{COOKIE}={token}"}
        write_hdr = {**WRITE, **cookie_hdr}

        def ws_worker():
            async def run_ws():
                async with websockets.connect(
                    f"ws://127.0.0.1:{port}{BASE}/ws",
                    additional_headers=cookie_hdr,
                ) as ws:
                    await ws.send("ping")
                    assert await ws.recv() == '{"type":"pong"}'
                    ws_ready.set()
                    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as ac:
                        while not ws_stop.is_set():
                            try:
                                await asyncio.wait_for(ws.recv(), timeout=0.1)
                                state_res = await ac.get(f"{BASE}/state", headers=cookie_hdr)
                                ws_refreshes.append(state_res.status_code)
                            except TimeoutError:
                                continue
                    await ws.send("ping")
                    assert await ws.recv() == '{"type":"pong"}'

            try:
                asyncio.run(run_ws())
            except Exception as exc:  # pragma: no cover
                ws_errors.append(f"{type(exc).__name__}: {exc}")
                ws_ready.set()

        ws_thread = threading.Thread(target=ws_worker, daemon=True)
        ws_thread.start()
        assert ws_ready.wait(timeout=5)
        assert not ws_errors

        clients = [httpx.Client(base_url=base_url, timeout=10.0) for _ in range(6)]
        for cli in clients:
            assert cli.get("/health").status_code == 200

        for round_idx in range(5):
            ver = setup_client.get(f"{BASE}/state", headers=cookie_hdr).json()["thinking"]["version"]
            sid = f"th-refresh-{round_idx}"
            barrier = threading.Barrier(6)
            results: list[tuple[str, int, str]] = []

            def run_req(idx: int, label: str, method: str, path: str, body=None, barrier=barrier, results=results):
                cli = clients[idx]
                barrier.wait()
                res = cli.request(method, path, headers=write_hdr if method != "GET" else cookie_hdr, json=body)
                results.append((label, res.status_code, res.text))

            threads = [
                threading.Thread(
                    target=run_req,
                    args=(0, "PUT1", "PUT", f"{BASE}/thinking", {"version": ver, "session": sid, "msgs": []}),
                ),
                threading.Thread(
                    target=run_req,
                    args=(1, "PUT2", "PUT", f"{BASE}/thinking", {"version": ver, "session": sid, "msgs": []}),
                ),
                threading.Thread(
                    target=run_req,
                    args=(
                        2,
                        "POST_RUN",
                        "POST",
                        "/api/v1/agent/runs",
                        {"request": f"Làm mới {round_idx}", "session_id": sid},
                    ),
                ),
                threading.Thread(target=run_req, args=(3, "GET_STATE1", "GET", f"{BASE}/state")),
                threading.Thread(target=run_req, args=(4, "GET_STATE2", "GET", f"{BASE}/state")),
                threading.Thread(target=run_req, args=(5, "GET_RUNS", "GET", f"/api/v1/agent/runs?session_id={sid}")),
            ]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            by_label = {label: (code, text) for label, code, text in results}
            assert all(code != 500 for _, code, _ in results), results
            assert by_label["POST_RUN"][0] == 201, results
            assert by_label["GET_STATE1"][0] == 200, results
            assert by_label["GET_STATE2"][0] == 200, results
            assert by_label["GET_RUNS"][0] == 200, results

            put_results = [by_label["PUT1"], by_label["PUT2"]]
            put_codes = sorted(code for code, _ in put_results)
            assert put_codes == [204, 409], results
            conflict_detail = next(text for code, text in put_results if code == 409)
            assert "đội khác" not in conflict_detail.lower(), conflict_detail
            assert "bản mới" in conflict_detail.lower(), conflict_detail

        ws_stop.set()
        ws_thread.join(timeout=3)
        assert not ws_errors
        assert all(code == 200 for code in ws_refreshes)
        assert not db_locked_errors
        assert engine.pool.checkedout() == 0
    finally:
        event.remove(engine, "handle_error", on_handle_error)
        ws_stop.set()
        for cli in clients:
            cli.close()
        setup_client.close()
        server.should_exit = True
        srv_thread.join(timeout=5)
        # Dọn file WAL phụ nếu còn sau khi engine dispose được fixture gọi
        assert os.path.exists(tmp_path / "concurrency.db")


def test_sqlite_file_concurrent_reader_does_not_lock_thinking_write(set_env, tmp_path):
    db_path = _sqlite_file_env(set_env, tmp_path)
    app = create_app()
    with TestClient(app, raise_server_exceptions=False) as client:
        token, _ = _setup_demo_leader(client)
        ver = client.get(f"{BASE}/state").json()["thinking"]["version"]
        assert (
            client.put(
                f"{BASE}/thinking",
                headers=WRITE,
                json={"version": ver, "session": "th-seed-reader", "msgs": []},
            ).status_code
            == 204
        )
        ver = client.get(f"{BASE}/state").json()["thinking"]["version"]

        # Một kết nối đọc song song đang giữ snapshot đọc bảng planning_workspaces.
        reader = sqlite3.connect(db_path, timeout=0.5)
        try:
            reader.execute("BEGIN")
            rows = reader.execute("SELECT team_id, section, version FROM planning_workspaces").fetchall()
            assert len(rows) >= 1

            put_res = client.put(
                f"{BASE}/thinking",
                headers={**WRITE, "Cookie": f"{COOKIE}={token}"},
                json={"version": ver, "session": "th-under-reader", "msgs": []},
            )
            assert put_res.status_code == 204, put_res.text

            run_res = client.post(
                "/api/v1/agent/runs",
                headers={**WRITE, "Cookie": f"{COOKIE}={token}"},
                json={"request": "Chạy khi có reader", "session_id": "th-under-reader"},
            )
            assert run_res.status_code == 201, run_res.text

            assert client.get(f"{BASE}/state").status_code == 200
            assert client.get("/api/v1/agent/runs", params={"session_id": "th-under-reader"}).status_code == 200
            push.deliver_due()
        finally:
            reader.rollback()
            reader.close()

        assert get_engine().pool.checkedout() == 0

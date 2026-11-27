"""Luồng chính của bản chạy thử: agent Thinking (chốt bài toán trước khi code).

`python run.py`, `python run.py eval` và `python run.py simulate` đều gọi answer(text).

Hai chế độ, chọn bằng MODEL_PROVIDER (trong .env hoặc biến môi trường):
  - fake (mặc định) hoặc để trống: workflow ví dụ của khung mẫu với model giả, chạy offline, để luồng đi hết.
  - thinking: gọi agent Thinking THẬT ở backend (LangGraph + Gemini) qua HTTP.
        1) Chạy backend KHÔNG đặt MOCK_NODES và có GOOGLE_API_KEY:
               cd backend && uv run uvicorn app.main:app --port 8000
        2) python run.py            (PowerShell: $env:MODEL_PROVIDER="thinking"; python run.py)
           BACKEND_URL mặc định http://127.0.0.1:8000
  Mỗi câu thử là một phiên riêng (không mang Canvas sang câu khác). Backend ở chế độ mock hoặc không có
  GOOGLE_API_KEY sẽ bị từ chối, để không đo nhầm dữ liệu mẫu hay luật dự phòng.

Hợp đồng:
    answer(text: str) -> dict có khoá "output" (str): kết quả đưa cho người dùng.
    Token, tên model, số lần gọi model / công cụ: khung tự đếm qua @model_call — không cần trả.
    Với chế độ thinking, token lấy từ GET /api/v1/agent/runs/{id}/usage của backend (cộng từ llm_calls).

Hình dạng: workflow cố định (spec.md §4): guard_input → update_canvas → mark_evidence → ask_next | verdict.
Agent không có vòng lặp tự chọn bước, nên không cần MAX_STEPS. Trưởng nhóm duyệt Canvas ở giao diện; khi đo,
bộ chạy dừng ở kết luận (GO / NOT YET / NO) của agent, chưa qua bước duyệt.
"""
import json
import os
import urllib.error
import urllib.request
import uuid

import ai  # noqa: F401  (nạp .env trước khi đọc biến môi trường bên dưới)
from ai import call_model
from tools import search_example
from tracing import model_call, note

SYSTEM = ""  # chế độ fake: hướng dẫn hệ thống cho model giả

STATUS_VI = {"evidence": "CÓ BẰNG CHỨNG", "assumption": "GIẢ ĐỊNH", "empty": "TRỐNG"}
LABELS = {
    "persona": "Persona", "jtbd": "Job-to-be-done", "pain_point": "Pain Point",
    "current_workaround": "Current Workaround", "solution": "Solution", "ai_leverage": "AI Leverage",
    "mvp_scope": "MVP Scope", "metrics": "Metrics", "prior_art": "Prior Art & Edge",
}


def _provider():
    return (os.environ.get("MODEL_PROVIDER") or "fake").strip().lower()


def _backend():
    return (os.environ.get("BACKEND_URL") or "http://127.0.0.1:8000").rstrip("/")


def _http(method, path, body=None, timeout=120):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(_backend() + path, data=data, method=method,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError("backend trả %s cho %s %s: %s" % (e.code, method, path, e.read().decode("utf-8", "replace")[:200]))
    except urllib.error.URLError as e:
        raise RuntimeError("không nối được backend %s (%s). Đã chạy backend chưa? Xem hướng dẫn đầu file agent.py"
                           % (_backend(), e.reason))


def _describe(run):
    """Biến kết quả của backend thành văn bản đủ để chấm: kết luận, câu agent nói, trạng thái từng ô."""
    if run["status"] == "blocked":
        return "BỊ CHẶN: %s" % ((run.get("result") or {}).get("reason") or "guard_input")
    p = run["proposal"]
    cells = []
    for key, label in LABELS.items():
        c = p["canvas"].get(key) or {}
        status = STATUS_VI.get(c.get("status", "empty"), "TRỐNG")
        who = " (%s · %s)" % (c.get("who"), c.get("when")) if c.get("status") == "evidence" else ""
        cells.append("%s=%s%s" % (label, status, who))
    flags = [k for k, v in (p.get("flags") or {}).items() if v]
    lines = [
        "KẾT LUẬN: %s" % p["verdict"],
        "Agent: %s" % p["reply"],
        "Ô Canvas: %s" % "; ".join(cells),
        "Ô cần hỏi tiếp: %s" % (p.get("next_cell") or "không"),
        "Cờ: %s" % (", ".join(flags) or "không"),
        "Trạng thái: %s · nguồn: %s" % (run["status"], run.get("source") or "-"),
    ]
    return "\n".join(lines)


@model_call
def _thinking_turn(text):
    health = _http("GET", "/health", timeout=15)
    if health.get("mock_nodes") or health.get("llm") != "gemini":
        raise RuntimeError(
            "backend đang chạy chế độ mock hoặc chưa có GOOGLE_API_KEY (health=%s). Khởi động lại backend không đặt "
            "MOCK_NODES để đo agent thật." % json.dumps(health, ensure_ascii=False))
    run = _http("POST", "/api/v1/agent/runs", {"request": text, "session_id": "runpy-" + uuid.uuid4().hex[:12]})
    usage = _http("GET", "/api/v1/agent/runs/%s/usage" % run["id"], timeout=15)
    p = run.get("proposal") or {}
    note("verdict=%s next_cell=%s source=%s status=%s" % (p.get("verdict"), p.get("next_cell"), run.get("source"), run["status"]))
    return {
        "text": _describe(run),
        "model": ", ".join(usage["models"]) or "none",
        "tokens_in": int(usage["input_tokens"]),
        "tokens_out": int(usage["output_tokens"]),
    }


def answer(text: str) -> dict:
    if _provider() == "thinking":
        return {"output": _thinking_turn(text)["text"]}
    # Chế độ fake: workflow ví dụ của khung mẫu (chạy offline)
    found = search_example(text)
    context = "\n".join("[%s] %s" % (p["code"], p["text"]) for p in found)
    reply = call_model(SYSTEM, "Căn cứ:\n%s\n\nĐầu vào của người dùng:\n%s" % (context, text))
    return {"output": reply["text"]}

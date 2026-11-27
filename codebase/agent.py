"""Luồng chính của bản chạy thử — nối trực tiếp Thinking agent của backend.

`python run.py`, `python run.py eval` và `python run.py simulate` đều gọi answer(text).
"""

import os
import sys
from uuid import uuid4

from tracing import model_call

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT, "backend")

_STATUS_LABELS = {
    "evidence": "CÓ BẰNG CHỨNG",
    "assumption": "GIẢ ĐỊNH",
    "empty": "TRỐNG",
}

_initialized = False
_backend_db = None
_backend_service = None
_backend_state = None


@model_call
def _trace_llm_call(node: str, event: dict) -> dict:
    """Chuyển tiếp lượt gọi LLM từ backend sang khung trace để đếm số lần gọi và token."""
    return {
        "text": str(event.get("text") or ""),
        "model": str(event.get("model") or ""),
        "tokens_in": max(0, int(event.get("tokens_in") or 0)),
        "tokens_out": max(0, int(event.get("tokens_out") or 0)),
    }


def _on_llm_call(event: dict) -> None:
    _trace_llm_call(str(event.get("node") or "llm"), event)


def _ensure_backend() -> None:
    """Khởi tạo backend DB trong RAM và đăng ký listener ghi token cho bộ đánh giá."""
    global _initialized, _backend_db, _backend_service, _backend_state
    if _initialized:
        return

    # Đặt backend/ lên đầu sys.path trước khi import app.* để tránh trùng tên với codebase/app.py.
    if BACKEND_DIR in sys.path:
        sys.path.remove(BACKEND_DIR)
    sys.path.insert(0, BACKEND_DIR)

    # Dùng SQLite tạm trong RAM cho mỗi tiến trình eval, không chạm DB thật trong .env.
    os.environ["DATABASE_URL"] = "sqlite://"

    from app import db
    from app.agent import llm, service, state
    from app.config import get_settings

    get_settings.cache_clear()
    db.reset_engine()
    db.init_db()

    if _on_llm_call not in llm.CALL_LISTENERS:
        llm.CALL_LISTENERS.append(_on_llm_call)

    _backend_db = db
    _backend_service = service
    _backend_state = state
    _initialized = True


def _format_run(run) -> str:
    if run.status == "blocked":
        reason = (run.result or {}).get("reason") or "Đầu vào bị chặn bởi guard_input"
        return f"Bị chặn: {reason}"

    if not run.proposal:
        err = (run.result or {}).get("error") or run.status
        return f"Lỗi: {err}"

    proposal = run.proposal
    verdict = proposal.get("verdict") or "NOT YET"
    next_cell = proposal.get("next_cell") or "-"
    canvas = proposal.get("canvas") or {}
    flags = proposal.get("flags") or {}
    reasons = proposal.get("reasons") or []
    reply = proposal.get("reply") or ""

    lines = [
        f"Verdict: {verdict}",
        f"Next cell: {next_cell}",
    ]
    for cell in _backend_state.CELLS:
        data = canvas.get(cell) or {}
        status_vi = _STATUS_LABELS.get(data.get("status", "empty"), "TRỐNG")
        content = (data.get("content") or "").strip() or "-"
        quote = (data.get("quote") or "").strip()
        quote_part = f"  [quote: {quote}]" if quote else ""
        lines.append(f"{cell}: {status_vi} — {content}{quote_part}")

    no_ai = str(bool(flags.get("no_ai_needed", False))).lower()
    solved = str(bool(flags.get("solved_elsewhere", False))).lower()
    lines.append(f"Flags: no_ai_needed={no_ai}, solved_elsewhere={solved}")
    lines.append("Reasons: " + ("; ".join(str(r) for r in reasons) if reasons else "-"))
    lines.append(f"Reply: {reply}")
    return "\n".join(lines)


def answer(text: str) -> dict:
    """Chạy một câu thử qua Thinking graph thật như một phiên trò chuyện mới."""
    _ensure_backend()
    session_id = f"eval-{uuid4().hex}"
    with _backend_db.session_scope() as session:
        run = _backend_service.start_run(session, text, session_id=session_id)
    return {"output": _format_run(run)}

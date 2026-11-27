"""Các node của graph Thinking. Mỗi node: nhận state, trả về PHẦN state nó cập nhật. Không gọi DB/HTTP trực tiếp ở đây
ngoài qua llm.py / service riêng, để test được bằng mock data.

guard_input (code) → update_canvas (LLM, structured output) → mark_evidence (code)
   → còn ô lõi thiếu: ask_next (code) → END, chờ tin nhắn tiếp theo
   → đủ 4 ô lõi (hoặc NO): verdict (code) → human_review (HITL, interrupt) → finalize (code)

Luật GO / NOT YET / NO và việc đánh dấu "có bằng chứng" nằm ở app/agent/canvas.py (code thuần).
"""

import json
import logging
from pathlib import Path

from langgraph.types import interrupt

from app.agent import llm
from app.agent.canvas import (
    REFUSALS,
    apply_update,
    build_proposal,
    decide,
    empty_canvas,
    heuristic_update,
    normalize,
    question_for,
    recompute,
)
from app.agent.guardrails import check_input, clean_proposal
from app.agent.mocks import mockable
from app.agent.prompts import render
from app.agent.state import CELL_LABELS, CELLS, AgentState, CanvasUpdate, Proposal, Review
from app.config import get_settings

logger = logging.getLogger("app.agent")

DEMO_CACHE = Path(__file__).resolve().parent / "demo_cache.json"


def demo_lookup(request: str) -> CanvasUpdate | None:
    cache = json.loads(DEMO_CACHE.read_text(encoding="utf-8"))
    hit = cache.get(normalize(request))
    return CanvasUpdate.model_validate(hit) if hit else None


def _canvas_summary(canvas: dict) -> str:
    lines = []
    for cell in CELLS:
        data = canvas.get(cell, {})
        status = data.get("status", "empty")
        label = {"evidence": "có bằng chứng", "assumption": "giả định", "empty": "trống"}[status]
        lines.append(f"- {cell} [{label}]: {data.get('content', '') or '(trống)'}")
    return "\n".join(lines)


@mockable("guard_input")
def guard_input(state: AgentState) -> dict:
    reason = check_input(state.get("request", ""), get_settings().max_input_chars)
    return {"blocked": reason is not None, "block_reason": reason or ""}


@mockable("update_canvas")
def update_canvas(state: AgentState) -> dict:
    request = state["request"]
    prev = recompute(state.get("canvas") or empty_canvas())
    flags = state.get("flags") or {}
    if state.get("repeated_request"):
        return {"canvas": prev, "flags": flags, "intent": "answer", "source": state.get("source", "fallback")}
    try:
        upd = llm.structured(
            CanvasUpdate,
            render("update_canvas", request=request, canvas=_canvas_summary(prev)),
            node="update_canvas",
        )
        source = "llm"
    except llm.LLMUnavailableError:
        upd = None
    except Exception as exc:  # noqa: BLE001 — LLM lỗi/timeout/sai schema: không làm sập lượt chạy
        logger.warning("update_canvas: LLM lỗi (%s), dùng dự phòng", type(exc).__name__)
        upd = None
    if upd is None:
        upd = demo_lookup(request)
        source = "demo_cache"
        if upd is None:
            upd, source = heuristic_update(request, prev), "fallback"
    canvas, new_flags = apply_update(prev, upd, request, flags)
    return {"canvas": canvas, "flags": new_flags, "intent": upd.intent, "source": source}


@mockable("mark_evidence")
def mark_evidence(state: AgentState) -> dict:
    """Gán lại trạng thái từng ô bằng code: evidence chỉ khi có người + lần cụ thể + trích dẫn có thật."""
    return {"canvas": recompute(state.get("canvas") or empty_canvas())}


def _refusal(intent: str) -> str:
    return REFUSALS.get(intent, "")


@mockable("ask_next")
def ask_next(state: AgentState) -> dict:
    canvas, flags = state["canvas"], state.get("flags") or {}
    verdict, reasons, next_cell = decide(canvas, flags)
    parts = [p for p in (_refusal(state.get("intent", "answer")), question_for(canvas, next_cell)) if p]
    reply = " ".join(parts) or "Bạn kể thêm về người dùng và vấn đề của họ nhé."
    proposal = clean_proposal(build_proposal(canvas, flags, verdict, reasons, next_cell, reply))
    return {
        "proposal": proposal.model_dump(),
        "result": {"status": "needs_info", "verdict": verdict, "next_cell": next_cell},
    }


@mockable("verdict")
def verdict(state: AgentState) -> dict:
    canvas, flags = state["canvas"], state.get("flags") or {}
    result, reasons, next_cell = decide(canvas, flags)
    if result == "GO":
        body = "GO. Cả 4 ô lõi đều có chuyện thật. Bạn xem Canvas rồi duyệt để sang Planning."
    elif result == "NO":
        body = f"NO. {reasons[0]} Bạn quyết định có đồng ý kết luận này không."
    else:  # NOT YET chỉ tới đây khi graph bị ép rẽ nhánh; vẫn trả đúng schema
        body = "NOT YET. Còn ô lõi chưa có chuyện thật."
    reply = " ".join(p for p in (_refusal(state.get("intent", "answer")), body) if p)
    proposal = clean_proposal(build_proposal(canvas, flags, result, reasons, next_cell, reply))
    return {"proposal": proposal.model_dump()}


@mockable("human_review")
def human_review(state: AgentState) -> dict:
    # Graph dừng tại đây; API /runs/{id}/review gửi Command(resume={...}) để chạy tiếp.
    decision = interrupt({"type": "approve_canvas", "proposal": state["proposal"]})
    return {"review": Review.model_validate(decision).model_dump()}


@mockable("finalize")
def finalize(state: AgentState) -> dict:
    proposal = Proposal.model_validate(state["proposal"])
    review = Review.model_validate(state["review"])
    approved = review.approved
    return {
        "result": {
            "status": "approved" if approved else "rejected",
            "verdict": proposal.verdict,
            "title": proposal.title,
            "steps": proposal.steps if approved else [],
            "note": review.note,
            "handoff": "planning" if approved and proposal.verdict == "GO" else None,
            "canvas": proposal.canvas,
        }
    }


__all__ = [
    "CELL_LABELS",
    "ask_next",
    "demo_lookup",
    "finalize",
    "guard_input",
    "human_review",
    "mark_evidence",
    "update_canvas",
    "verdict",
]

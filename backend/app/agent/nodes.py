"""Các node của graph Thinking. Mỗi node: nhận state, trả về PHẦN state nó cập nhật. Không gọi DB/HTTP trực tiếp ở đây
ngoài qua llm.py / service riêng, để test được bằng mock data.

guard_input (code) → update_canvas (LLM, structured output) → mark_evidence (code)
   → chưa đủ 9 ô, hoặc ô lõi chưa có chuyện thật: ask_next (code) → END, chờ tin nhắn tiếp theo
   → đủ 9 ô và 4 ô lõi có bằng chứng (hoặc NO): verdict (code) → human_review (HITL, interrupt) → finalize (code)

Luật GO / NOT YET / NO và việc đánh dấu "có bằng chứng" nằm ở app/agent/canvas.py (code thuần).
"""

import json
import logging
from pathlib import Path

from langgraph.types import interrupt

from app.agent import llm
from app.agent.canvas import (
    AGENT_FILLED,
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


def _gate_agent_prior_art(canvas: dict) -> dict:
    """Agent chưa được tự điền đối thủ khi chưa có Solution và AI Leverage: bỏ phần LLM điền sớm."""
    cell = canvas[AGENT_FILLED]
    if cell.get("who") == "Agent" and (
        canvas["solution"]["status"] == "empty" or canvas["ai_leverage"]["status"] == "empty"
    ):
        canvas[AGENT_FILLED] = empty_canvas()[AGENT_FILLED]
    return canvas


def _canvas_summary(canvas: dict) -> str:
    lines = []
    for cell in CELLS:
        data = canvas.get(cell, {})
        status = data.get("status", "empty")
        label = {"evidence": "có bằng chứng", "assumption": "giả định", "empty": "trống"}[status]
        meta = [f"{k}={str(data[k]).strip()}" for k in ("who", "when") if str(data.get(k, "")).strip()]
        suffix = f" ({', '.join(meta)})" if meta else ""
        lines.append(f"- {cell} [{label}]: {data.get('content', '') or '(trống)'}{suffix}")
    return "\n".join(lines)


def _flags_summary(flags: dict) -> str:
    return "\n".join(
        f"- {flag}: {'true (đang bật)' if flags.get(flag) else 'false'}"
        for flag in ("no_ai_needed", "solved_elsewhere")
    )


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
        return {
            "canvas": prev,
            "flags": flags,
            "intent": "answer",
            "source": state.get("source", "fallback"),
            "changed_cells": [],
        }
    asked_cell = state.get("asked_cell")
    asked_cell_text = (
        f"{asked_cell} ({CELL_LABELS[asked_cell]})" if asked_cell in CELL_LABELS else (asked_cell or "(chưa hỏi ô nào)")
    )
    last_question_text = (state.get("last_question") or "").strip() or "(chưa có câu hỏi trước đó)"
    try:
        upd = llm.structured(
            CanvasUpdate,
            render(
                "update_canvas",
                request=request,
                canvas=_canvas_summary(prev),
                flags=_flags_summary(flags),
                asked_cell=asked_cell_text,
                last_question=last_question_text,
            ),
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
    canvas = recompute(_gate_agent_prior_art(canvas))
    changed_cells = [cell for cell in CELLS if canvas[cell] != prev[cell]]
    return {
        "canvas": canvas,
        "flags": new_flags,
        "intent": upd.intent,
        "source": source,
        "changed_cells": changed_cells,
    }


@mockable("mark_evidence")
def mark_evidence(state: AgentState) -> dict:
    """Gán lại trạng thái từng ô bằng code: evidence chỉ khi có người + lần cụ thể + trích dẫn có thật."""
    return {"canvas": recompute(state.get("canvas") or empty_canvas())}


def _refusal(intent: str) -> str:
    return REFUSALS.get(intent, "")


def _ack_updated(changed_cells: list[str], *, skip_cell: str | None = None) -> str:
    cells = [c for c in changed_cells if c in CELL_LABELS and c != skip_cell]
    if not cells:
        return ""
    return f"Mình đã cập nhật {', '.join(CELL_LABELS[c] for c in cells)}."


@mockable("ask_next")
def ask_next(state: AgentState) -> dict:
    canvas, flags = state["canvas"], state.get("flags") or {}
    verdict, reasons, next_cell = decide(canvas, flags)
    question = question_for(canvas, next_cell)
    last_question = (state.get("last_question") or "").strip()
    if (
        next_cell
        and state.get("asked_cell") == next_cell
        and last_question
        and question
        and (normalize(question) == normalize(last_question) or normalize(last_question).endswith(normalize(question)))
    ):
        question = question_for(canvas, next_cell, repeated=True)
    skip_cell = next_cell if question.startswith("Mình ghi nhận") else None
    ack = _ack_updated(state.get("changed_cells") or [], skip_cell=skip_cell)
    parts = [p for p in (_refusal(state.get("intent", "answer")), ack, question) if p]
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
        body = "GO. Canvas đã đủ 9 ô và 4 ô lõi đều có chuyện thật. Bạn xem Canvas rồi duyệt để sang Planning."
    elif result == "NO":
        body = f"NO. {reasons[0]} Bạn quyết định có đồng ý kết luận này không."
    else:  # NOT YET chỉ tới đây khi graph bị ép rẽ nhánh; vẫn trả đúng schema
        body = "NOT YET. Canvas chưa đủ 9 ô hoặc còn ô lõi chưa có chuyện thật."
    ack = _ack_updated(state.get("changed_cells") or [])
    reply = " ".join(p for p in (_refusal(state.get("intent", "answer")), ack, body) if p)
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

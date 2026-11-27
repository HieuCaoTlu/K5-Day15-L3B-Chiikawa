"""Các node của graph. Mỗi node: nhận state, trả về PHẦN state nó cập nhật. Không gọi DB/HTTP trực tiếp ở đây
ngoài qua llm.py / service riêng, để test được bằng mock data.

guard_input (code) → draft (LLM, structured output) → human_review (HITL, interrupt) → finalize (code)
"""

import json
import logging
from pathlib import Path

from langgraph.types import interrupt

from app.agent import llm
from app.agent.guardrails import check_input, clean_proposal
from app.agent.mocks import mockable
from app.agent.prompts import render
from app.agent.state import AgentState, Proposal, Review
from app.config import get_settings

logger = logging.getLogger("app.agent")

DEMO_CACHE = Path(__file__).resolve().parent / "demo_cache.json"


def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def demo_lookup(request: str) -> Proposal | None:
    cache = json.loads(DEMO_CACHE.read_text(encoding="utf-8"))
    hit = cache.get(_normalize(request))
    return Proposal.model_validate(hit) if hit else None


def rule_based(request: str) -> Proposal:
    """Luật dự phòng khi không có LLM: luôn trả đúng schema, để demo không bao giờ trắng màn hình."""
    topic = request.strip().rstrip(".?!")
    return Proposal(
        title=topic[:80] or "Đề xuất",
        summary=f"Đề xuất mẫu (chưa dùng LLM) cho yêu cầu: {topic[:200]}",
        steps=["Làm rõ mục tiêu và người dùng", "Chia việc thành các bước nhỏ", "Kiểm tra kết quả với người duyệt"],
        confidence=0.3,
    )


@mockable("guard_input")
def guard_input(state: AgentState) -> dict:
    reason = check_input(state.get("request", ""), get_settings().max_input_chars)
    return {"blocked": reason is not None, "block_reason": reason or ""}


@mockable("draft")
def draft(state: AgentState) -> dict:
    request = state["request"]
    settings = get_settings()
    if settings.demo_mode and (cached := demo_lookup(request)):
        return {"proposal": cached.model_dump(), "source": "demo_cache"}
    try:
        proposal = llm.structured(Proposal, render("draft", request=request), node="draft")
        return {"proposal": clean_proposal(proposal).model_dump(), "source": "llm"}
    except llm.LLMUnavailableError:
        pass
    except Exception as exc:  # noqa: BLE001 — LLM lỗi/timeout/sai schema: không làm sập lượt chạy
        logger.warning("draft: LLM lỗi (%s), dùng dự phòng", type(exc).__name__)
        if cached := demo_lookup(request):
            return {"proposal": cached.model_dump(), "source": "demo_cache"}
    return {"proposal": rule_based(request).model_dump(), "source": "fallback"}


@mockable("human_review")
def human_review(state: AgentState) -> dict:
    # Graph dừng tại đây; API /runs/{id}/review gửi Command(resume={...}) để chạy tiếp.
    decision = interrupt({"type": "approve_proposal", "proposal": state["proposal"]})
    return {"review": Review.model_validate(decision).model_dump()}


@mockable("finalize")
def finalize(state: AgentState) -> dict:
    proposal = Proposal.model_validate(state["proposal"])
    review = Review.model_validate(state["review"])
    if review.approved:
        result = {"status": "approved", "title": proposal.title, "steps": proposal.steps, "note": review.note}
    else:
        result = {"status": "rejected", "title": proposal.title, "steps": [], "note": review.note}
    return {"result": result}

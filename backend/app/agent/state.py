"""State của graph + schema Pydantic cho MỌI output LLM / quyết định của người.

Thêm node → thêm field vào AgentState, thêm mocks/<node>.json, thêm test. Xem CLAUDE.md mục "Thêm agent node".
"""

from typing import TypedDict

from pydantic import BaseModel, Field


class Proposal(BaseModel):
    """Output có cấu trúc của node draft (Gemini trả đúng schema này)."""

    title: str = Field(min_length=1, max_length=120, description="Tên ngắn của đề xuất")
    summary: str = Field(min_length=1, max_length=800, description="Tóm tắt 1–3 câu")
    steps: list[str] = Field(min_length=1, max_length=7, description="Các bước cụ thể, 3–7 bước")
    confidence: float = Field(ge=0, le=1, description="Độ tự tin 0–1")


class Review(BaseModel):
    """Quyết định của người duyệt ở node human_review."""

    approved: bool
    note: str = Field(default="", max_length=500)


class AgentState(TypedDict, total=False):
    request: str  # input của người dùng
    blocked: bool  # guard_input
    block_reason: str  # guard_input
    proposal: dict  # draft → Proposal.model_dump()
    source: str  # draft: llm | demo_cache | fallback | mock
    review: dict  # human_review → Review.model_dump()
    result: dict  # finalize

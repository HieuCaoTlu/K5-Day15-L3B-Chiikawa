"""State của graph + schema Pydantic cho MỌI output LLM / quyết định của người.

Bước Thinking: engineer trao đổi với agent, agent điền dần AI MVP Canvas (9 ô), đánh dấu ô nào có chuyện thật,
ô nào mới là giả định, rồi đề xuất GO / NOT YET / NO. Trưởng nhóm là người duyệt.

Thêm node → thêm field vào AgentState, thêm mocks/<node>.json, thêm test. Xem CLAUDE.md mục "Thêm agent node".
"""

from typing import Literal, TypedDict

from pydantic import BaseModel, Field

# Thứ tự 9 ô của AI MVP Canvas và nhãn hiển thị
CELLS: tuple[str, ...] = (
    "persona",
    "jtbd",
    "pain_point",
    "current_workaround",
    "solution",
    "ai_leverage",
    "mvp_scope",
    "metrics",
    "prior_art",
)
CELL_LABELS: dict[str, str] = {
    "persona": "Persona",
    "jtbd": "Job-to-be-done",
    "pain_point": "Pain Point",
    "current_workaround": "Current Workaround",
    "solution": "Solution",
    "ai_leverage": "AI Leverage",
    "mvp_scope": "MVP Scope",
    "metrics": "Metrics",
    "prior_art": "Prior Art & Edge",
}
# 4 ô lõi: phải có chuyện thật (một người cụ thể, một lần cụ thể) thì mới được GO
CORE: tuple[str, ...] = ("persona", "pain_point", "current_workaround", "jtbd")

Intent = Literal["answer", "out_of_scope", "fabricate", "force_verdict"]
Verdict = Literal["GO", "NOT YET", "NO"]


class CellUpdate(BaseModel):
    """Phần LLM trích ra cho một ô từ tin nhắn mới nhất. Để trống nếu tin nhắn không nói gì về ô đó."""

    content: str = Field(default="", max_length=400, description="Nội dung ô, viết lại ngắn gọn từ lời người dùng")
    who: str = Field(default="", max_length=80, description="Người cụ thể được nhắc tới (tên hoặc vai cụ thể)")
    when: str = Field(default="", max_length=80, description="Lần cụ thể đã xảy ra (vd: tuần trước, hôm qua)")
    quote: str = Field(default="", max_length=300, description="Đoạn chép NGUYÊN VĂN từ tin nhắn làm bằng chứng")


class CanvasUpdate(BaseModel):
    """Output có cấu trúc của node update_canvas (Gemini trả đúng schema này)."""

    intent: Intent = Field(default="answer", description="Ý định của tin nhắn")
    persona: CellUpdate = Field(default_factory=CellUpdate)
    jtbd: CellUpdate = Field(default_factory=CellUpdate)
    pain_point: CellUpdate = Field(default_factory=CellUpdate)
    current_workaround: CellUpdate = Field(default_factory=CellUpdate)
    solution: CellUpdate = Field(default_factory=CellUpdate)
    ai_leverage: CellUpdate = Field(default_factory=CellUpdate)
    mvp_scope: CellUpdate = Field(default_factory=CellUpdate)
    metrics: CellUpdate = Field(default_factory=CellUpdate)
    prior_art: CellUpdate = Field(default_factory=CellUpdate)
    persona_changed: bool = Field(default=False, description="Người dùng đổi persona sang người khác")
    no_ai_needed: bool = Field(default=False, description="Bài toán rõ ràng giải được mà không cần AI")
    solved_elsewhere: bool = Field(
        default=False, description="Đã có sản phẩm giải quyết và người dùng không nêu được khác biệt"
    )


class Proposal(BaseModel):
    """Đề xuất của agent sau mỗi lượt. Các field title/summary/steps/confidence giữ để trang /chat và /admin cũ vẫn đọc được."""

    verdict: Verdict
    reply: str = Field(min_length=1, max_length=1200, description="Câu agent nói với trưởng nhóm")
    next_cell: str | None = Field(default=None, description="Ô lõi cần hỏi tiếp, nếu còn thiếu")
    reasons: list[str] = Field(default_factory=list, max_length=9)
    canvas: dict
    flags: dict = Field(default_factory=dict)
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=800)
    steps: list[str] = Field(default_factory=list, max_length=9)
    confidence: float = Field(ge=0, le=1)


class Review(BaseModel):
    """Quyết định của trưởng nhóm ở node human_review."""

    approved: bool
    note: str = Field(default="", max_length=500)


class AgentState(TypedDict, total=False):
    request: str  # tin nhắn mới nhất của người dùng
    repeated_request: bool  # tin nhắn đã được xử lý trong phiên này
    canvas: dict  # 9 ô: {content, who, when, quote, grounded, status}
    flags: dict  # no_ai_needed, solved_elsewhere
    intent: str  # update_canvas
    blocked: bool  # guard_input
    block_reason: str  # guard_input
    proposal: dict  # ask_next | verdict → Proposal.model_dump()
    source: str  # update_canvas: llm | demo_cache | fallback | mock
    review: dict  # human_review → Review.model_dump()
    result: dict  # ask_next (needs_info) | finalize

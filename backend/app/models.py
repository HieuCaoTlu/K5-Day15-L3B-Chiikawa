"""Bảng DB. Đổi schema → cập nhật mục "Schema DB" trong README.md (hợp đồng chung của nhóm)."""

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(UTC)


class Item(Base):
    """Bảng mẫu cho lát cắt dọc UI → API → DB. Đổi tên/thêm cột theo đề tài."""

    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="todo")  # todo | doing | done
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AgentRun(Base):
    """Một lượt chạy agent (một câu hỏi trong chat). Trạng thái đầy đủ nằm trong checkpointer (thread_id = id)."""

    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    session_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)  # phiên chat phía FE
    request: Mapped[str] = mapped_column(Text)
    # running | blocked | needs_info | waiting_review | approved | rejected | error
    status: Mapped[str] = mapped_column(String(20), default="running", index=True)
    source: Mapped[str | None] = mapped_column(String(20), nullable=True)  # llm | demo_cache | fallback | mock
    proposal: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class LlmCall(Base):
    """Mỗi lượt gọi Gemini: token, chi phí ước tính, độ trễ. Ghi ở app/agent/llm.py — nguồn số liệu trang Chi phí."""

    __tablename__ = "llm_calls"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    node: Mapped[str] = mapped_column(String(50), default="")
    model: Mapped[str] = mapped_column(String(80))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    error: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class PitchSurvey(Base):
    """Form khảo sát được sinh theo bài toán của nhóm và publish qua link công khai."""

    __tablename__ = "pitch_surveys"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    project_name: Mapped[str] = mapped_column(String(200))
    problem_context: Mapped[dict] = mapped_column(JSON, default=dict)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    questions: Mapped[list] = mapped_column(JSON, default=list)
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class PitchSurveyResponse(Base):
    """Phản hồi của người dùng gửi qua link khảo sát đã publish."""

    __tablename__ = "pitch_survey_responses"

    id: Mapped[int] = mapped_column(primary_key=True)
    survey_id: Mapped[str] = mapped_column(String(32), index=True)
    respondent_role: Mapped[str] = mapped_column(String(120), default="")
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class PitchDeck(Base):
    """Bộ slide Pitching HTML (tối đa 10 slide), kịch bản nói và bài quảng cáo đã lưu."""

    __tablename__ = "pitch_decks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    project_name: Mapped[str] = mapped_column(String(200))
    survey_slug: Mapped[str] = mapped_column(String(64), default="")
    title: Mapped[str] = mapped_column(String(200))
    slides: Mapped[list] = mapped_column(JSON, default=list)
    script: Mapped[str] = mapped_column(Text, default="")
    ads: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

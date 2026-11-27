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
    # running | blocked | waiting_review | approved | rejected | error
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

"""Cổng duy nhất gọi LLM (Gemini). Node KHÔNG import thẳng langchain_google_genai.

- `structured(Schema, prompt, node=...)` → luôn trả object Pydantic (structured output / JSON schema).
- `pro=True` chỉ cho bước suy luận khó; còn lại dùng Flash.
- Mỗi lượt gọi được ghi vào bảng llm_calls (token, chi phí, độ trễ) → trang /admin/usage.
- Không có GOOGLE_API_KEY hoặc đã tiêu hết DAILY_BUDGET_USD → raise LLMUnavailableError để node dùng dự phòng.
"""

import logging
import time
from datetime import UTC, datetime

from pydantic import BaseModel
from sqlalchemy import func, select

from app.config import get_settings
from app.db import session_scope
from app.models import LlmCall

logger = logging.getLogger("app.llm")


class LLMUnavailableError(RuntimeError):
    pass


def price_per_million(model: str) -> tuple[float, float]:
    """(giá input, giá output) USD / 1 triệu token. Sửa giá ở .env khi Google đổi bảng giá."""
    s = get_settings()
    if model == s.gemini_model_pro:
        return s.price_pro_input, s.price_pro_output
    return s.price_fast_input, s.price_fast_output


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    price_in, price_out = price_per_million(model)
    return (input_tokens * price_in + output_tokens * price_out) / 1_000_000


def spent_today_usd() -> float:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    with session_scope() as session:
        return float(
            session.scalar(select(func.coalesce(func.sum(LlmCall.cost_usd), 0)).where(LlmCall.created_at >= start))
        )


def _current_run_id() -> str | None:
    try:
        from langgraph.config import get_config

        return get_config().get("configurable", {}).get("thread_id")
    except Exception:  # noqa: BLE001 — gọi ngoài graph (eval, script)
        return None


def _record(**row) -> None:
    try:
        with session_scope() as session:
            session.add(LlmCall(**row))
            session.commit()
    except Exception as exc:  # noqa: BLE001 — ghi số liệu lỗi không được làm hỏng câu trả lời
        logger.warning("FAILED record llm_call: %s", type(exc).__name__)


def chat(*, pro: bool = False):
    settings = get_settings()
    if not settings.google_api_key:
        raise LLMUnavailableError("Chưa đặt GOOGLE_API_KEY")
    if settings.daily_budget_usd > 0 and spent_today_usd() >= settings.daily_budget_usd:
        raise LLMUnavailableError(f"Đã dùng hết ngân sách ngày {settings.daily_budget_usd} USD")
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=settings.gemini_model_pro if pro else settings.gemini_model_fast,
        google_api_key=settings.google_api_key,
        temperature=0.2,
        timeout=settings.llm_timeout_seconds,
        max_retries=1,
    )


def structured[T: BaseModel](schema: type[T], prompt: str, *, node: str = "", pro: bool = False) -> T:
    model = chat(pro=pro)
    model_name = get_settings().gemini_model_pro if pro else get_settings().gemini_model_fast
    started = time.perf_counter()
    usage: dict = {}
    try:
        out = model.with_structured_output(schema, include_raw=True).invoke(prompt)
        usage = getattr(out.get("raw"), "usage_metadata", None) or {}
        if out.get("parsing_error") or out.get("parsed") is None:
            raise ValueError(f"LLM trả sai schema: {out.get('parsing_error')}")
        parsed = out["parsed"]
        result = parsed if isinstance(parsed, schema) else schema.model_validate(parsed)
        error = None
        return result
    except Exception as exc:
        error = type(exc).__name__
        raise
    finally:
        tokens_in, tokens_out = int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0))
        _record(
            run_id=_current_run_id(),
            node=node,
            model=model_name,
            input_tokens=tokens_in,
            output_tokens=tokens_out,
            cost_usd=cost_usd(model_name, tokens_in, tokens_out),
            latency_ms=round((time.perf_counter() - started) * 1000),
            ok=error is None,
            error=error,
        )

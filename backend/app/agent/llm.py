"""Cổng duy nhất gọi LLM (Gemini hoặc OpenRouter). Node KHÔNG import thẳng SDK model.

- `structured(Schema, prompt, node=...)` → luôn trả object Pydantic (structured output / JSON schema).
- `pro=True` chỉ cho bước suy luận khó; còn lại dùng Flash.
- Mỗi lượt gọi được ghi vào bảng llm_calls (token, chi phí, độ trễ) → trang /admin/usage.
- Thiếu API key hoặc đã tiêu hết DAILY_BUDGET_USD → raise LLMUnavailableError để node dùng dự phòng.
"""

import copy
import json
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import httpx
from pydantic import BaseModel
from sqlalchemy import func, select

from app.config import get_settings
from app.db import session_scope
from app.models import LlmCall

logger = logging.getLogger("app.llm")

# Hook quan sát mỗi lượt gọi LLM (vd eval harness đếm token); mọi ngoại lệ của listener đều bị bỏ qua.
CALL_LISTENERS: list[Callable[[dict[str, Any]], Any]] = []


class LLMUnavailableError(RuntimeError):
    pass


def _notify_listeners(payload: dict[str, Any]) -> None:
    for listener in list(CALL_LISTENERS):
        try:
            listener(payload)
        except Exception:  # noqa: BLE001 — listener lỗi không được làm hỏng lượt gọi LLM
            pass


def price_per_million(model: str) -> tuple[float, float]:
    """(giá input, giá output) USD / 1 triệu token. Sửa giá ở .env khi đổi bảng giá."""
    s = get_settings()
    if model in (s.gemini_model_pro, s.openrouter_model_pro):
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


def _check_budget(settings) -> None:
    if settings.daily_budget_usd > 0 and spent_today_usd() >= settings.daily_budget_usd:
        raise LLMUnavailableError(f"Đã dùng hết ngân sách ngày {settings.daily_budget_usd} USD")


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


def _strict_json_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Chuyển JSON Schema của Pydantic sang strict mode cho OpenAI/OpenRouter."""

    def _transform(node: Any) -> Any:
        if isinstance(node, list):
            return [_transform(item) for item in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            return {"$ref": node["$ref"]}
        out: dict[str, Any] = {}
        for key, value in node.items():
            if key in ("$defs", "definitions", "properties") and isinstance(value, dict):
                out[key] = {k: _transform(v) for k, v in value.items()}
            elif key in ("items", "additionalProperties") and isinstance(value, (dict, list)):
                out[key] = _transform(value)
            elif key in ("anyOf", "oneOf", "allOf", "prefixItems") and isinstance(value, list):
                out[key] = [_transform(v) for v in value]
            else:
                out[key] = copy.deepcopy(value)
        if out.get("type") == "object" or "properties" in out:
            out["additionalProperties"] = False
            props = out.get("properties")
            if isinstance(props, dict):
                out["required"] = list(props.keys())
        return out

    return _transform(copy.deepcopy(schema))


def _strip_json_fences(text: str) -> str:
    s = text.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        if len(lines) >= 2 and lines[-1].strip() == "```":
            return "\n".join(lines[1:-1]).strip()
        if len(lines) >= 2:
            return "\n".join(lines[1:]).strip()
    return s


def chat(*, pro: bool = False):
    settings = get_settings()
    provider = settings.active_llm_provider
    if provider != "gemini":
        raise LLMUnavailableError(
            f"llm.chat() chỉ hỗ trợ LLM_PROVIDER=gemini (đang cấu hình {provider}); dùng llm.structured()"
        )
    if not settings.google_api_key:
        raise LLMUnavailableError("Chưa đặt GOOGLE_API_KEY")
    _check_budget(settings)
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=settings.gemini_model_pro if pro else settings.gemini_model_fast,
        google_api_key=settings.google_api_key,
        temperature=0.2,
        timeout=settings.llm_timeout_seconds,
        max_retries=1,
    )


def _structured_openrouter[T: BaseModel](schema: type[T], prompt: str, *, node: str = "", pro: bool = False) -> T:
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise LLMUnavailableError("Chưa đặt OPENROUTER_API_KEY")
    _check_budget(settings)

    model_name = settings.openrouter_model_pro if pro else settings.openrouter_model_fast
    url = f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    if settings.site_url:
        headers["HTTP-Referer"] = settings.site_url
    if settings.app_name:
        headers["X-Title"] = settings.app_name

    raw_schema = schema.model_json_schema()
    body = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": schema.__name__,
                "strict": True,
                "schema": _strict_json_schema(raw_schema),
            },
        },
    }

    started = time.perf_counter()
    tokens_in, tokens_out = 0, 0
    raw_text = ""
    error: str | None = None
    try:
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            resp = client.post(url, headers=headers, json=body)
            if resp.status_code == 400 and (
                "response_format" in resp.text.lower() or "json_schema" in resp.text.lower()
            ):
                fallback_prompt = (
                    prompt
                    + "\n\nChỉ trả về một đối tượng JSON hợp lệ khớp đúng JSON Schema sau "
                    "(không thêm chữ giải thích hay markdown):\n"
                    + json.dumps(raw_schema, ensure_ascii=False)
                )
                fallback_body = {
                    "model": model_name,
                    "messages": [{"role": "user", "content": fallback_prompt}],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                }
                resp = client.post(url, headers=headers, json=fallback_body)
            resp.raise_for_status()
            data = resp.json()

        usage = data.get("usage") or {}
        tokens_in = int(usage.get("prompt_tokens") or 0)
        tokens_out = int(usage.get("completion_tokens") or 0)
        choices = data.get("choices") or []
        if not choices:
            raise ValueError("OpenRouter không trả về choices")
        content = (choices[0].get("message") or {}).get("content")
        if isinstance(content, list):
            raw_text = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        elif isinstance(content, str):
            raw_text = content
        else:
            raise ValueError(f"OpenRouter trả content không hợp lệ: {type(content).__name__}")
        return schema.model_validate_json(_strip_json_fences(raw_text))
    except Exception as exc:
        error = type(exc).__name__
        raise
    finally:
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
        _notify_listeners(
            {
                "text": raw_text,
                "model": model_name,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "node": node,
                "ok": error is None,
            }
        )


def structured[T: BaseModel](schema: type[T], prompt: str, *, node: str = "", pro: bool = False) -> T:
    settings = get_settings()
    provider = settings.active_llm_provider
    if provider == "openrouter":
        return _structured_openrouter(schema, prompt, node=node, pro=pro)
    if provider != "gemini":
        raise LLMUnavailableError(f"Nhà cung cấp LLM không hỗ trợ: {provider}")

    model = chat(pro=pro)
    model_name = settings.gemini_model_pro if pro else settings.gemini_model_fast
    started = time.perf_counter()
    usage: dict = {}
    raw_text = ""
    error: str | None = None
    try:
        out = model.with_structured_output(schema, include_raw=True).invoke(prompt)
        raw_msg = out.get("raw")
        usage = getattr(raw_msg, "usage_metadata", None) or {}
        if out.get("parsing_error") or out.get("parsed") is None:
            raise ValueError(f"LLM trả sai schema: {out.get('parsing_error')}")
        parsed = out["parsed"]
        result = parsed if isinstance(parsed, schema) else schema.model_validate(parsed)
        raw_content = getattr(raw_msg, "content", "")
        raw_text = raw_content if isinstance(raw_content, str) and raw_content else result.model_dump_json()
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
        _notify_listeners(
            {
                "text": raw_text,
                "model": model_name,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "node": node,
                "ok": error is None,
            }
        )

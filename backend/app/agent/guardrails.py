"""Guardrail đơn giản, chạy bằng code (không tin LLM tự giữ luật).

- Đầu vào: giới hạn độ dài + regex prompt injection cơ bản.
- Đầu ra: validate lại bằng schema Pydantic + cắt khoảng trắng / bước rỗng.
"""

import re

from app.agent.state import Proposal

INJECTION = re.compile(
    r"(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)"
    r"|bỏ\s+qua\s+(mọi|tất\s+cả|các|những)?\s*(hướng\s+dẫn|chỉ\s+dẫn|quy\s+tắc|lệnh)"
    r"|system\s+prompt|you\s+are\s+now|jailbreak|developer\s+mode|\bDAN\b"
    r"|<\s*/?\s*(system|assistant)\s*>",
    re.IGNORECASE,
)


def check_input(text: str, max_chars: int) -> str | None:
    """Trả về lý do chặn, hoặc None nếu cho qua."""
    stripped = text.strip()
    if not stripped:
        return "Yêu cầu trống"
    if len(stripped) > max_chars:
        return f"Yêu cầu dài quá {max_chars} ký tự"
    if INJECTION.search(stripped):
        return "Yêu cầu có dấu hiệu prompt injection"
    return None


def clean_proposal(proposal: Proposal | dict) -> Proposal:
    data = proposal.model_dump() if isinstance(proposal, Proposal) else dict(proposal)
    data["title"] = str(data.get("title", "")).strip()[:120]
    data["summary"] = str(data.get("summary", "")).strip()[:800]
    data["steps"] = [s.strip()[:300] for s in data.get("steps", []) if str(s).strip()][:7]
    return Proposal.model_validate(data)

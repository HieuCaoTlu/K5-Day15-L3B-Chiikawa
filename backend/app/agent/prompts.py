"""Đọc prompt và thay {{placeholder}}.

Phần lớn prompt nằm ở backend/prompts/<name>.md. Ngoại lệ: prompt của node update_canvas đặt trong code
(app/agent/prompt_update_canvas.py) theo yêu cầu PO.
"""

from functools import lru_cache
from pathlib import Path

from app.agent.prompt_update_canvas import UPDATE_CANVAS

PROMPT_DIR = Path(__file__).resolve().parents[2] / "prompts"
INLINE_PROMPTS = {"update_canvas": UPDATE_CANVAS}


@lru_cache
def _load(name: str) -> str:
    if name in INLINE_PROMPTS:
        return INLINE_PROMPTS[name]
    return (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")


def render(name: str, **values: str) -> str:
    text = _load(name)
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text

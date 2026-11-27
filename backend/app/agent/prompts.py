"""Đọc prompt từ backend/prompts/<name>.md và thay {{placeholder}}. Không viết prompt dài trong code Python."""

from functools import lru_cache
from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parents[2] / "prompts"


@lru_cache
def _load(name: str) -> str:
    return (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")


def render(name: str, **values: str) -> str:
    text = _load(name)
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text

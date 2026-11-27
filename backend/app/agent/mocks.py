"""Mock data cho từng agent node — để các thành viên làm song song.

Mỗi node có một file `mocks/<node>.json`:
    {"node": "...", "description": "...", "input": {<state vào node>}, "output": {<phần state node trả ra>}}

Dùng ở 3 chỗ:
1. Chạy app với MOCK_NODES=draft (hoặc all): node trả thẳng "output" → người làm UI/node khác không phải chờ.
2. Test node: chạy node thật với "input", so với "output" (tests/agent/test_nodes.py).
3. Hợp đồng giữa các node: đổi shape output → sửa file mock trước, báo nhóm.
"""

import json
from collections.abc import Callable
from functools import wraps
from pathlib import Path

from app.agent.state import AgentState
from app.config import get_settings

MOCK_DIR = Path(__file__).resolve().parent / "mocks"

Node = Callable[[AgentState], dict]


def load_mock(node: str) -> dict:
    return json.loads((MOCK_DIR / f"{node}.json").read_text(encoding="utf-8"))


def mockable(node: str) -> Callable[[Node], Node]:
    def decorator(fn: Node) -> Node:
        @wraps(fn)
        def wrapper(state: AgentState) -> dict:
            if get_settings().is_mocked(node):
                return load_mock(node)["output"]
            return fn(state)

        return wrapper

    return decorator

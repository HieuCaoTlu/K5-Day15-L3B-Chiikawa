"""Nạp từng module trong một tiến trình Python mới, đúng thứ tự uvicorn làm khi khởi động.

Trong pytest các module đã được nạp sẵn theo thứ tự khác, nên lỗi import vòng có thể lọt qua mọi test khác
nhưng làm server sập ngay khi chạy thật.
"""

import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize(
    "module", ["app.main", "app.api.agent", "app.api.planning", "app.planning.handoff", "app.planning.workspace"]
)
def test_module_imports_in_fresh_process(module):
    result = subprocess.run(
        [sys.executable, "-c", f"import {module}"], cwd=BACKEND, capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, result.stderr[-2000:]

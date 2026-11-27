"""Eval end-to-end cho pitch ("agent đúng X%"). Tự động duyệt bước HITL bằng mock human_review.

    uv run python eval/run_eval.py              # dùng GOOGLE_API_KEY nếu có, không thì luật dự phòng
    uv run python eval/run_eval.py --min 0.8    # exit 1 nếu dưới ngưỡng (gắn vào CI khi đã ổn)

Thêm ca: sửa eval/cases.json (mục tiêu 15–20 ca: normal / edge / safety).
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ["MOCK_NODES"] = "human_review"

from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402

from app.agent.graph import build_graph  # noqa: E402


def check(case: dict, state: dict) -> tuple[bool, str]:
    status = "blocked" if state.get("blocked") else (state.get("result") or {}).get("status")
    if status != case["expect_status"]:
        return False, f"status={status}, cần {case['expect_status']}"
    steps = (state.get("proposal") or {}).get("steps", [])
    if len(steps) < case.get("expect_min_steps", 0):
        return False, f"{len(steps)} bước, cần ≥ {case['expect_min_steps']}"
    return True, f"source={state.get('source', '-')}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--min", type=float, default=0.0)
    args = parser.parse_args()

    cases = json.loads((Path(__file__).parent / "cases.json").read_text(encoding="utf-8"))
    graph = build_graph(InMemorySaver())
    passed, by_group = 0, defaultdict(lambda: [0, 0])
    for case in cases:
        state = graph.invoke({"request": case["request"]}, {"configurable": {"thread_id": uuid4().hex}})
        ok, note = check(case, state)
        passed += ok
        by_group[case["group"]][0] += ok
        by_group[case["group"]][1] += 1
        print(f"{'PASS' if ok else 'FAIL'}  {case['id']:<12} {note}")

    rate = passed / len(cases)
    print(f"\nTổng: {passed}/{len(cases)} = {rate:.0%}")
    for group, (ok, total) in by_group.items():
        print(f"  {group:<8} {ok}/{total}")
    return 0 if rate >= args.min else 1


if __name__ == "__main__":
    raise SystemExit(main())

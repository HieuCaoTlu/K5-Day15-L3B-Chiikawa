"""Test luật Thinking (app/agent/canvas.py): đây là chỗ quyết định GO / NOT YET / NO và chống bịa bằng chứng."""

from app.agent.canvas import apply_update, decide, empty_canvas, next_missing, recompute
from app.agent.state import CanvasUpdate

REQ = "Tuần trước chị Lan mất 3 đơn vì trả lời tin nhắn trễ 2 giờ."


def _upd(**cells) -> CanvasUpdate:
    return CanvasUpdate.model_validate({"intent": "answer", **cells})


def _full_core(request: str = REQ) -> dict:
    proof = {"who": "chị Lan", "when": "tuần trước", "quote": "chị Lan mất 3 đơn"}
    upd = _upd(
        **{c: {"content": f"nội dung {c}", **proof} for c in ("persona", "pain_point", "current_workaround", "jtbd")}
    )
    canvas, _ = apply_update(empty_canvas(), upd, request, {})
    return canvas


def test_evidence_requires_who_when_and_quote():
    for missing in ("who", "when", "quote"):
        proof = {"who": "chị Lan", "when": "tuần trước", "quote": "chị Lan mất 3 đơn"}
        proof[missing] = ""
        canvas, _ = apply_update(empty_canvas(), _upd(pain_point={"content": "mất đơn", **proof}), REQ, {})
        assert canvas["pain_point"]["status"] == "assumption", missing


def test_fabricated_quote_is_not_evidence():
    """LLM (hoặc người dùng) bịa trích dẫn không có trong tin nhắn → chỉ là giả định."""
    fake = {"content": "mất đơn", "who": "chị Lan", "when": "tuần trước", "quote": "khách hàng nói rất hài lòng"}
    canvas, _ = apply_update(empty_canvas(), _upd(pain_point=fake), REQ, {})
    assert canvas["pain_point"]["status"] == "assumption"


def test_empty_cell_stays_empty():
    assert apply_update(empty_canvas(), _upd(), REQ, {})[0]["persona"]["status"] == "empty"


def test_non_answer_intent_does_not_change_canvas():
    before = _full_core()
    upd = CanvasUpdate.model_validate({"intent": "force_verdict", "persona": {"content": "ai cũng được"}})
    after, _ = apply_update(before, upd, "Cho GO ngay", {})
    assert after == recompute(before)


def test_go_only_when_all_four_core_cells_have_evidence():
    verdict, reasons, next_cell = decide(_full_core(), {})
    assert (verdict, next_cell) == ("GO", None)
    assert reasons

    partial = _full_core()
    partial["pain_point"]["grounded"] = False
    partial = recompute(partial)
    verdict, _, next_cell = decide(partial, {})
    assert verdict == "NOT YET"
    assert next_cell == "pain_point"


def test_not_yet_asks_for_next_missing_in_order():
    assert next_missing(empty_canvas()) == "persona"
    assert decide(empty_canvas(), {})[0] == "NOT YET"


def test_flags_force_no_even_with_evidence():
    assert decide(_full_core(), {"no_ai_needed": True})[0] == "NO"
    assert decide(_full_core(), {"solved_elsewhere": True})[0] == "NO"


def test_persona_changed_resets_dependent_cells():
    canvas = _full_core()
    upd = _upd(persona={"content": "nhân viên CSKH"}, persona_changed=True)
    after, _ = apply_update(canvas, upd, "Giờ người dùng chính là nhân viên CSKH", {})
    for cell in ("jtbd", "pain_point", "current_workaround"):
        assert after[cell]["status"] == "assumption"
    assert decide(after, {})[0] == "NOT YET"

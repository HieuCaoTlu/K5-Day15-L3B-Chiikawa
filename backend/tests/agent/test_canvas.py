"""Test luật Thinking (app/agent/canvas.py): đây là chỗ quyết định GO / NOT YET / NO và chống bịa bằng chứng."""

import unicodedata

import pytest

from app.agent.canvas import apply_update, decide, empty_canvas, next_missing, recompute
from app.agent.state import CanvasUpdate

REQ = "Tuần trước chị Lan mất 3 đơn vì trả lời tin nhắn trễ 2 giờ."


def _upd(**cells) -> CanvasUpdate:
    return CanvasUpdate.model_validate({"intent": "answer", **cells})


def _full_core() -> dict:
    facts = {
        "persona": "chị Lan, chủ shop",
        "pain_point": "mất 3 đơn",
        "current_workaround": "ghi đơn vào Excel",
        "jtbd": "muốn trả lời kịp khách",
    }
    upd = _upd(
        **{
            cell: {"content": fact, "who": "chị Lan", "when": "tuần trước", "quote": fact}
            for cell, fact in facts.items()
        }
    )
    canvas, _ = apply_update(empty_canvas(), upd, "Tuần trước " + ", ".join(facts.values()), {})
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


def test_one_quote_can_support_several_cells_in_the_same_turn():
    # Một câu của người thật có thể vừa là Persona vừa là Pain Point (benchmark B13, B15).
    quote = "tuần trước chị Hoa bên shop quần áo kể chị trả lời 200 tin một ngày mà vẫn sót"
    proof = {"who": "chị Hoa", "when": "tuần trước", "quote": quote}
    canvas, _ = apply_update(
        None,
        _upd(
            persona={"content": "nhân viên chăm sóc khách", **proof},
            pain_point={"content": "trả lời 200 tin một ngày mà vẫn sót", **proof},
        ),
        "nghĩ lại chắc là nhân viên chăm sóc khách hơn, " + quote,
        {},
    )
    assert canvas["persona"]["status"] == canvas["pain_point"]["status"] == "evidence"


def test_stored_quote_cannot_be_reused_to_fill_another_cell():
    proof = {"content": "mất 3 đơn", "who": "chị Lan", "when": "tuần trước", "quote": "chị Lan mất 3 đơn"}
    before, _ = apply_update(None, _upd(pain_point=proof), REQ, {})
    reuse = {**proof, "content": "muốn bán thêm", "quote": "CHỊ  LAN MẤT 3 ĐƠN"}
    after, _ = apply_update(before, _upd(jtbd=reuse), REQ + " Chị muốn bán thêm.", {})
    assert after == before


def test_content_without_new_proof_preserves_evidence_and_new_proof_can_replace_it():
    before = _full_core()
    update = _upd(pain_point={"content": "đã mất 5 đơn", "who": "chị Lan", "when": "hôm qua", "quote": "mất 5 đơn"})
    after, _ = apply_update(before, update, "Chị Lan nói số đơn sụt giảm.", {})
    assert after == before

    after, _ = apply_update(before, update, "Hôm qua chị Lan mất 5 đơn.", {})
    assert after["pain_point"]["quote"] == "mất 5 đơn"
    assert after["pain_point"]["status"] == "evidence"


def test_no_flags_persist_across_later_turns():
    # Lượt sau không nhắc tới thì cờ NO không bị tự xóa (trước đây mỗi lượt ghi lại false).
    before = _full_core()
    flags = {"no_ai_needed": True, "solved_elsewhere": False}
    _, carried = apply_update(before, _upd(), REQ, flags)
    assert carried == flags
    assert decide(before, carried)[0] == "NO"

    _, raised = apply_update(before, _upd(solved_elsewhere=True), REQ, carried)
    assert raised == {"no_ai_needed": True, "solved_elsewhere": True}


@pytest.mark.parametrize("form", ["NFC", "NFD"])
def test_vietnamese_quote_matching_normalizes_both_sides(form):
    request = unicodedata.normalize(form, REQ)
    other_form = "NFD" if form == "NFC" else "NFC"
    proof = {
        "content": "mất đơn",
        "who": "chị Lan",
        "when": "tuần trước",
        "quote": unicodedata.normalize(other_form, "CHỊ LAN   MẤT 3 ĐƠN"),
    }
    canvas, _ = apply_update(None, _upd(pain_point=proof), request, {})
    assert canvas["pain_point"]["status"] == "evidence"

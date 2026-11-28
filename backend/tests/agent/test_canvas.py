"""Test luật Thinking (app/agent/canvas.py): đây là chỗ quyết định GO / NOT YET / NO và chống bịa bằng chứng."""

import unicodedata

import pytest

from app.agent.canvas import apply_update, can_self_fill_prior_art, decide, empty_canvas, next_missing, recompute
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


def _full() -> dict:
    """Đủ 9 ô: 4 ô lõi có bằng chứng, 4 ô sau có nội dung, đối thủ do agent tự điền."""
    canvas = _full_core()
    extra = {
        "solution": "bot trả lời giá và size trên Zalo",
        "ai_leverage": "AI hiểu câu hỏi tự do của khách",
        "mvp_scope": "bản đầu chỉ trả lời giá và size",
        "metrics": "mỗi tuần mất không quá 1 đơn",
        "prior_art": "Zalo OA trả lời theo từ khoá; mình hiểu câu hỏi tự do",
    }
    upd = _upd(
        **{cell: {"content": text, "who": "Agent" if cell == "prior_art" else ""} for cell, text in extra.items()}
    )
    canvas, _ = apply_update(canvas, upd, "tin nhắn bất kỳ", {})
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


def test_go_only_when_all_nine_cells_filled_and_core_has_evidence():
    verdict, reasons, next_cell = decide(_full(), {})
    assert (verdict, next_cell) == ("GO", None)
    assert reasons
    # Ô không lõi chỉ là giả định nên GO nhắc kiểm chứng ở Planning
    assert any("Planning" in r for r in reasons)

    partial = _full()
    partial["pain_point"]["grounded"] = False
    partial = recompute(partial)
    verdict, _, next_cell = decide(partial, {})
    assert verdict == "NOT YET"
    assert next_cell == "pain_point"


def test_not_yet_asks_for_next_missing_in_order():
    assert next_missing(empty_canvas()) == "persona"
    assert decide(empty_canvas(), {})[0] == "NOT YET"


def test_four_core_cells_alone_are_not_enough_to_evaluate():
    """Đủ 4 ô lõi mà còn ô trống thì chưa được đánh giá; agent hỏi tiếp ô trống theo thứ tự."""
    verdict, reasons, next_cell = decide(_full_core(), {})
    assert verdict == "NOT YET"
    assert next_cell == "solution"
    assert any("AI Leverage còn trống" in r for r in reasons)


def test_each_non_core_cell_gets_asked_in_order():
    canvas = _full()
    for cell in ("metrics", "mvp_scope", "ai_leverage", "solution"):
        canvas[cell].update(content="", status="empty")
        assert next_missing(recompute(canvas)) == next(
            c for c in ("solution", "ai_leverage", "mvp_scope", "metrics") if recompute(canvas)[c]["status"] == "empty"
        )


def test_prior_art_is_agent_filled_once_solution_and_ai_leverage_exist():
    canvas = _full_core()
    assert not can_self_fill_prior_art(canvas)
    canvas, _ = apply_update(canvas, _upd(solution={"content": "bot Zalo"}), "bot Zalo", {})
    assert not can_self_fill_prior_art(canvas)
    canvas, _ = apply_update(canvas, _upd(ai_leverage={"content": "hiểu câu hỏi tự do"}), "x", {})
    assert can_self_fill_prior_art(canvas)
    # Agent tự điền thì chỉ là giả định, không bao giờ là bằng chứng
    canvas, _ = apply_update(canvas, _upd(prior_art={"content": "Zalo OA", "who": "Agent"}), "x", {})
    assert canvas["prior_art"]["status"] == "assumption"
    assert not can_self_fill_prior_art(canvas)


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


def _status(cell: str, quote: str, request: str) -> str:
    fact = {"content": quote, "who": "chị Mai", "when": "hôm qua", "quote": quote}
    canvas, _ = apply_update(empty_canvas(), _upd(**{cell: fact}), request, {})
    return canvas[cell]["status"]


def test_jtbd_quote_that_only_tells_the_pain_is_not_evidence():
    """Câu kể nỗi đau có thật trong tin nhắn nhưng không phải điều người đó nói muốn đạt."""
    request = "Hôm qua chị Mai mất cả buổi sáng đối chiếu hóa đơn."
    assert _status("jtbd", "chị Mai mất cả buổi sáng đối chiếu hóa đơn", request) == "assumption"


def test_jtbd_quote_that_is_a_guess_or_hearsay_is_not_evidence():
    request = "Hôm qua chị Mai đối chiếu hóa đơn. Nghe bạn chị kể là chị ấy chắc muốn làm nhanh hơn, mình đoán vậy."
    quote = "Nghe bạn chị kể là chị ấy chắc muốn làm nhanh hơn, mình đoán vậy"
    assert _status("jtbd", quote, request) == "assumption"


def test_jtbd_quote_in_the_users_own_words_is_evidence():
    request = "Hôm qua chị Mai nói thẳng: chị chỉ muốn đối chiếu xong trong 10 phút."
    assert _status("jtbd", "chị chỉ muốn đối chiếu xong trong 10 phút", request) == "evidence"


def test_workaround_quote_must_describe_what_they_do_today():
    request = "Hôm qua chị Mai mất cả buổi sáng đối chiếu hóa đơn."
    assert _status("current_workaround", "chị Mai mất cả buổi sáng đối chiếu hóa đơn", request) == "assumption"
    request = "Hôm qua chị Mai đang làm tay trên Excel."
    assert _status("current_workaround", "chị Mai đang làm tay trên Excel", request) == "evidence"

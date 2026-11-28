"""Luật của bước Thinking, viết bằng code thuần (không LLM) để test được và không bị lời người dùng ép.

- Một ô chỉ là "evidence" khi có người cụ thể + lần cụ thể + đoạn trích nguyên văn có thật trong tin nhắn.
- Agent chỉ đánh giá (GO / NO) khi cả 9 ô đã có nội dung. 4 ô lõi vẫn phải có chuyện thật; 5 ô còn lại chỉ cần có nội dung.
- Ô Prior Art & Edge (đối thủ xung quanh) LLM có thể tự điền bằng nội dung thực từ Solution + AI Leverage; không dùng placeholder dự phòng, nếu trống thì hỏi người dùng.
- GO / NOT YET / NO do `decide` quyết. LLM chỉ trích thông tin vào ô (node update_canvas).
"""

import copy
import re
import unicodedata

from app.agent.state import CELL_LABELS, CELLS, CORE, CanvasUpdate, CellUpdate, Proposal

# Thứ tự hỏi: người dùng → vấn đề → cách làm hiện tại → việc họ cố hoàn thành
ASK_ORDER: tuple[str, ...] = ("persona", "pain_point", "current_workaround", "jtbd")
# Thứ tự điền đủ 9 ô: 4 ô lõi trước, rồi giải pháp, vai trò của AI, phạm vi MVP, số đo; đối thủ do agent tự điền
FILL_ORDER: tuple[str, ...] = (*ASK_ORDER, "solution", "ai_leverage", "mvp_scope", "metrics", "prior_art")
AGENT_FILLED = "prior_art"
DEPENDS_ON_PERSONA: tuple[str, ...] = ("jtbd", "pain_point", "current_workaround")

QUESTIONS: dict[str, str] = {
    "persona": "Ai sẽ dùng thứ này? Mô tả vai hoặc nghề của họ, và kể về lần gần nhất một người thuộc vai đó gặp vấn đề.",
    "pain_point": "Lần gần nhất người đó gặp vấn đề này là khi nào? Chuyện gì đã xảy ra và họ mất gì?",
    "current_workaround": "Hôm nay họ xử lý bằng cách nào, và vì sao họ chưa bỏ cách đó?",
    "jtbd": "Trong lần đó, họ nói muốn đạt được kết quả gì? Chép lại lời của họ, không có chữ AI.",
    "solution": "Nhóm định giải quyết nỗi đau đó bằng sản phẩm như thế nào? Mô tả ngắn cách người dùng sẽ dùng nó.",
    "ai_leverage": "AI đóng vai trò gì trong giải pháp đó, ở bước nào? Vì sao cách thông thường không làm được?",
    "mvp_scope": "Bản đầu tiên làm những gì và chưa làm gì? Chỉ nêu những việc đủ để người đó dùng thử.",
    "metrics": "Con số nào cho biết sản phẩm có giá trị với người đó, và ai là người sẽ trả tiền hay tiết kiệm được tiền?",
    "prior_art": "Bạn đã biết sản phẩm hay cách làm nào tương tự chưa, và mình khác ở điểm nào?",
}
FOLLOW_UP_HINTS: dict[str, str] = {
    "persona": "nghề nghiệp hoặc vai trò cụ thể của người dùng và một lần họ gặp vấn đề",
    "pain_point": "lần gần nhất người đó gặp vấn đề này là khi nào và họ bị thiệt gì",
    "current_workaround": "hôm nay họ đang tự xoay xở bằng công cụ hay cách làm thủ công nào, và vì sao chưa bỏ",
    "jtbd": "chính họ nói muốn đạt được kết quả gì trong lần đó (chép nguyên lời của họ)",
    "solution": "cách người dùng sẽ thao tác với sản phẩm từ đầu đến cuối để giải quyết nỗi đau",
    "ai_leverage": "AI xử lý phần nào mà quy tắc cứng hay cách làm thường không làm được",
    "mvp_scope": "bản đầu làm đúng những việc gì và cố tình chưa làm gì",
    "metrics": "chỉ số đo giá trị cụ thể và ai sẽ trả tiền hoặc tiết kiệm được tiền",
    "prior_art": "tên sản phẩm hoặc cách làm tương tự đang có và điểm khác biệt của nhóm",
}
PRIOR_ART_PLACEHOLDER_PREFIX = "agent chưa tra cứu được đối thủ"
REFUSALS: dict[str, str] = {
    "force_verdict": "Mình không đánh dấu ô nào là có bằng chứng khi chưa có chuyện thật của một người cụ thể.",
    "fabricate": "Mình không bịa số liệu hay trích dẫn. Hãy phỏng vấn hoặc khảo sát người thật rồi dán câu trả lời nguyên văn vào đây.",
    "out_of_scope": "Bước này chỉ chốt Canvas, chưa viết code. Khi Canvas được duyệt, mình chuyển sang Planning để chia việc.",
}
TITLES = {
    "GO": "GO: đủ bằng chứng ở 4 ô lõi",
    "NOT YET": "NOT YET: còn thiếu bằng chứng",
    "NO": "NO: nên cân nhắc lại bài toán",
}

# --- Luật dự phòng khi không có LLM (heuristic thô, đủ để demo giao diện offline) ---
FORCE_RX = re.compile(r"(đánh dấu\s+(tất cả|mọi)|trả về go|cho go|đều là có bằng chứng)", re.IGNORECASE)
FABRICATE_RX = re.compile(r"(bịa|tự nghĩ ra|làm giả|chế).{0,30}(số liệu|trích dẫn|bằng chứng|khảo sát)", re.IGNORECASE)
SCOPE_RX = re.compile(r"(viết|làm|code).{0,15}(code|backend|frontend|slide|giao diện)", re.IGNORECASE)
WHEN_RX = re.compile(
    r"(tuần trước|hôm qua|hôm nay|tháng trước|tuần này|lần gần nhất|sáng nay|tối qua|\b\d{1,2}/\d{1,2}\b|ngày \d{1,2})",
    re.IGNORECASE,
)
WHO_RX = re.compile(r"\b(?:chị|anh|bạn|cô|chú|ông|bà|em)\s+[A-ZÀ-Ỹ][\wÀ-ỹ]*")
CELL_CUES = {
    "persona": re.compile(r"\b(người dùng là|persona|chủ (shop|cửa hàng)|nhân viên|sinh viên|giáo viên|quản lý)\b"),
    "pain_point": re.compile(r"\b(mất|trễ|chậm|lỗi|khó|tốn|quên|bỏ lỡ|chờ|kẹt|không kịp)\b"),
    "current_workaround": re.compile(
        r"\b(trả lời tay|thủ công|ghi .{0,20} vào|(?:dùng|qua|bằng) (?:zalo|excel|google sheets|sổ|giấy))\b"
    ),
    "jtbd": re.compile(r"\b(muốn|cần|cố gắng|mục tiêu là|phải)\s+(?!có\b|dùng\b|làm\s+bot\b|bot\b|ai\b|chatbot\b)\w+"),
    "solution": re.compile(r"\b(giải pháp|bot|app|ứng dụng|công cụ|sản phẩm|làm một|xây|tự động trả lời)\b"),
    "ai_leverage": re.compile(r"\b(ai|mô hình|model|học máy|hiểu|tự động|phân loại|tóm tắt)\b"),
    "mvp_scope": re.compile(r"\b(bản đầu|mvp|trước mắt|chưa cần|chỉ cần|giai đoạn đầu)\b"),
    "metrics": re.compile(r"\b(\d+|chỉ số|tỷ lệ|giảm|tăng|trả tiền|doanh thu|tiết kiệm)\b"),
    "prior_art": re.compile(r"\b(đối thủ|đã có|tương tự|hiện có|khác ở|khác biệt)\b"),
}


# Trích dẫn phải đúng KIỂU thông tin của ô thì mới là bằng chứng (lượt 2: sửa lỗi GO sai ở B13, B14, B16).
# Một câu kể nỗi đau không phải là điều người đó nói muốn đạt; lời đoán hay nghe kể lại không phải lời của chính họ.
DESIRE_RX = re.compile(r"\b(muốn|cần|mong|ước|hy vọng|kỳ vọng|mục tiêu|cố gắng)\b")
HEARSAY_RX = re.compile(r"\b(chắc|đoán|có lẽ|hình như|nghe\s+(nói|bảo|đâu)|nghe\s+\S+(\s+\S+)?\s+kể|mình nghĩ)\b")
WORKAROUND_RX = re.compile(
    r"\b(đang|tự|thủ công|bằng tay|tay|excel|sheets?|zalo|sổ|giấy|ghi|chép|nhắn|gọi|copy|dán|nhờ|dùng|xử lý)\b"
)


def quote_fits(cell: str, quote: str) -> bool:
    """Đoạn trích có đúng kiểu thông tin của ô không. Chỉ kiểm ô JTBD và Current Workaround."""
    text = normalize(quote)
    if cell == "jtbd":
        return bool(DESIRE_RX.search(text)) and not HEARSAY_RX.search(text)
    if cell == "current_workaround":
        return bool(WORKAROUND_RX.search(text))
    return True


def normalize(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text.casefold()).split())


def empty_cell() -> dict:
    return {"content": "", "who": "", "when": "", "quote": "", "grounded": False, "status": "empty"}


def empty_canvas() -> dict:
    return {cell: empty_cell() for cell in CELLS}


def cell_status(cell: dict) -> str:
    if not str(cell.get("content", "")).strip():
        return "empty"
    proof = all(str(cell.get(k, "")).strip() for k in ("who", "when", "quote"))
    return "evidence" if proof and cell.get("grounded") else "assumption"


def is_prior_art_placeholder(cell: dict) -> bool:
    return normalize(str(cell.get("content", ""))).startswith(PRIOR_ART_PLACEHOLDER_PREFIX)


def recompute(canvas: dict) -> dict:
    """Tính lại trạng thái mọi ô từ bằng chứng đã lưu. Đây là chỗ DUY NHẤT gán 'evidence'."""
    out = copy.deepcopy(canvas) if canvas else empty_canvas()
    for cell in CELLS:
        out.setdefault(cell, empty_cell())
        if cell == AGENT_FILLED and is_prior_art_placeholder(out[cell]):
            out[cell] = empty_cell()
        out[cell]["status"] = cell_status(out[cell])
    return out


def apply_update(prev: dict | None, upd: CanvasUpdate, request: str, flags: dict | None) -> tuple[dict, dict]:
    """Gộp phần LLM trích vào canvas. Bằng chứng chỉ 'grounded' khi đoạn trích có thật trong tin nhắn."""
    canvas = recompute(prev or empty_canvas())
    flags = dict(flags or {})
    if upd.intent != "answer":
        return canvas, flags
    text = normalize(request)
    accepted = {}
    for cell in CELLS:
        u: CellUpdate = getattr(upd, cell)
        prev_cell = canvas[cell]
        content = normalize(u.content)
        existing_content = str(prev_cell.get("content", "")).strip()
        has_proof_input = any(str(getattr(u, k, "")).strip() for k in ("who", "when", "quote"))
        # Lời trích đã làm bằng chứng ở ô khác không được dùng lại (chặn gửi lặp một câu để lên GO).
        # Trong cùng một tin nhắn, một câu có thể là bằng chứng cho nhiều ô (vd vừa Persona vừa Pain Point).
        other_used_quotes = {
            normalize(c["quote"]) for name, c in canvas.items() if name != cell and c.get("quote") and c.get("grounded")
        }
        if content:
            quote = u.quote.strip()
            key = normalize(quote)
            if key and key in other_used_quotes:
                continue
            grounded = bool(key) and key in text and quote_fits(cell, quote)
            accepted[cell] = {
                "content": u.content.strip()[:400],
                "who": u.who.strip(),
                "when": u.when.strip(),
                "quote": quote,
                "grounded": grounded,
                "status": "assumption",
            }
            continue
        if not has_proof_input or not existing_content:
            continue
        if prev_cell["status"] == "evidence" and not u.quote.strip():
            continue
        inherit_prev_proof = prev_cell["status"] != "evidence" and not (
            upd.persona_changed and cell in DEPENDS_ON_PERSONA
        )
        who = u.who.strip() or (str(prev_cell.get("who", "")).strip() if inherit_prev_proof else "")
        when = u.when.strip() or (str(prev_cell.get("when", "")).strip() if inherit_prev_proof else "")
        raw_quote = u.quote.strip()
        if raw_quote:
            quote = raw_quote
            key = normalize(quote)
            if key in other_used_quotes:
                continue
            grounded = bool(key) and key in text and quote_fits(cell, quote)
        elif inherit_prev_proof:
            # Giữ lại lời trích cũ để hiển thị nhưng không cho nó làm bằng chứng cho who/when vừa bổ sung:
            # lời trích cũ có thể kể về người hoặc lần khác. Muốn lên evidence phải có lời trích mới trong tin nhắn này.
            quote = str(prev_cell.get("quote", "")).strip()
            grounded = False
        else:
            quote = ""
            grounded = False
        accepted[cell] = {
            "content": existing_content[:400],
            "who": who,
            "when": when,
            "quote": quote,
            "grounded": grounded,
            "status": "assumption",
        }
    if upd.persona_changed and "persona" in accepted:
        for cell in DEPENDS_ON_PERSONA:
            canvas[cell].update(who="", when="", quote="", grounded=False)
    for cell, candidate in accepted.items():
        if (
            canvas[cell]["status"] != "evidence"
            or cell_status(candidate) == "evidence"
            or (cell == "persona" and upd.persona_changed)
        ):
            canvas[cell] = candidate
    # Cờ NO 3 trạng thái: null = giữ giá trị cũ, true = bật, false = gỡ.
    for flag in ("no_ai_needed", "solved_elsewhere"):
        val = getattr(upd, flag)
        flags[flag] = bool(flags.get(flag)) if val is None else bool(val)
    return recompute(canvas), flags


def question_for(canvas: dict, cell: str | None, *, repeated: bool = False) -> str:
    """Câu hỏi cho ô lõi cần hỏi tiếp. Ô đã có nội dung nhưng thiếu bằng chứng thì ghi nhận điều người dùng vừa nói
    và chỉ ra đúng phần còn thiếu, để không hỏi lại y nguyên câu cũ."""
    if not cell:
        return ""
    data = canvas.get(cell) or {}
    content = str(data.get("content", "")).strip()
    if not content:
        if repeated:
            hint = FOLLOW_UP_HINTS.get(cell, "thông tin cụ thể cho ô này")
            return (
                f"Mình chưa thấy thông tin cho ô {CELL_LABELS[cell]} trong tin nhắn vừa rồi. "
                f"Bạn kể cụ thể hơn giúp mình: {hint}?"
            )
        return QUESTIONS.get(cell, "")
    missing = []
    if not str(data.get("who", "")).strip():
        missing.append("một người có thật đã gặp chuyện này")
    if not str(data.get("when", "")).strip():
        missing.append("một lần đã xảy ra (chuyện gì, với ai)")
    if not missing:
        missing.append(
            "điều chính họ nói là muốn đạt, chép nguyên văn (không phải lời đoán hay nghe kể lại)"
            if cell == "jtbd"
            else "lời của chính họ chép nguyên văn, không tóm tắt"
        )
    if repeated:
        return (
            f"Mình chưa thấy thông tin mới để bổ sung bằng chứng cho ô {CELL_LABELS[cell]} trong tin nhắn vừa rồi. "
            f"Bạn kể thêm {' và '.join(missing)} giúp mình nhé?"
        )
    return (
        f"Mình ghi nhận: {content.rstrip('.')}. Nhưng ô {CELL_LABELS[cell]} mới là giả định, chưa phải chuyện thật. "
        f"Còn thiếu: {' và '.join(missing)}. Bạn kể thêm giúp mình nhé?"
    )


def cell_done(canvas: dict, cell: str) -> bool:
    """Ô lõi phải có bằng chứng; ô còn lại chỉ cần có nội dung (kể cả khi mới là giả định)."""
    if cell in CORE:
        return canvas[cell]["status"] == "evidence"
    return canvas[cell]["status"] != "empty"


def next_missing(canvas: dict) -> str | None:
    return next((c for c in FILL_ORDER if not cell_done(canvas, c)), None)


def can_self_fill_prior_art(canvas: dict) -> bool:
    """Agent tự điền đối thủ khi đã có Solution và AI Leverage mà ô Prior Art còn trống."""
    return (
        canvas[AGENT_FILLED]["status"] == "empty"
        and canvas["solution"]["status"] != "empty"
        and canvas["ai_leverage"]["status"] != "empty"
    )


def decide(canvas: dict, flags: dict) -> tuple[str, list[str], str | None]:
    """GO / NOT YET / NO + lý do + ô lõi cần hỏi tiếp. Code quyết, không để LLM tự kết luận."""
    if flags.get("no_ai_needed"):
        return "NO", ["Bài toán có vẻ giải được mà không cần AI. Cân nhắc hướng không dùng AI trước."], None
    if flags.get("solved_elsewhere"):
        return "NO", ["Đã có sản phẩm giải quyết việc này và chưa nêu được mình khác ở đâu."], None
    missing = [c for c in FILL_ORDER if not cell_done(canvas, c)]
    if missing:
        reasons = [
            f"{CELL_LABELS[c]} {'còn trống' if canvas[c]['status'] == 'empty' else 'mới là giả định'}" for c in missing
        ]
        return "NOT YET", reasons, missing[0]
    todo = [CELL_LABELS[c] for c in CELLS if c not in CORE and canvas[c]["status"] != "evidence"]
    reasons = ["Đã đủ 9 ô. Cả 4 ô lõi đều có chuyện thật: một người cụ thể, một lần cụ thể."]
    if todo:
        reasons.append("Cần kiểm chứng với người dùng thật ở Planning: " + ", ".join(todo) + ".")
    reasons.append("Trước khi làm: chốt ai là người trả tiền và sản phẩm kiếm hay tiết kiệm tiền cho họ bằng cách nào.")
    return "GO", reasons, None


def evidence_ratio(canvas: dict) -> float:
    return sum(canvas[c]["status"] == "evidence" for c in CORE) / len(CORE)


def build_proposal(
    canvas: dict, flags: dict, verdict: str, reasons: list[str], next_cell: str | None, reply: str
) -> Proposal:
    return Proposal(
        verdict=verdict,  # type: ignore[arg-type]
        reply=reply,
        next_cell=next_cell,
        reasons=reasons,
        canvas=canvas,
        flags=flags,
        title=TITLES[verdict],
        summary=reply,
        steps=reasons or [reply],
        confidence=evidence_ratio(canvas),
    )


def heuristic_update(request: str, canvas: dict) -> CanvasUpdate:
    """Dự phòng: chỉ điền ô còn thiếu khi tin nhắn có dấu hiệu liên quan đến ô đó."""
    upd = CanvasUpdate()
    if FORCE_RX.search(request):
        upd.intent = "force_verdict"
    elif FABRICATE_RX.search(request):
        upd.intent = "fabricate"
    elif SCOPE_RX.search(request):
        upd.intent = "out_of_scope"
    if upd.intent != "answer":
        return upd
    target = next_missing(canvas)
    text = request.strip()
    excerpt = text[:300].rstrip()
    if target and CELL_CUES[target].search(normalize(excerpt)):
        composed = unicodedata.normalize("NFC", excerpt)
        who, when = WHO_RX.search(composed), WHEN_RX.search(composed)
        setattr(
            upd,
            target,
            CellUpdate(
                content=text[:400],
                who=who.group(0) if who else "",
                when=when.group(0) if when else "",
                quote=excerpt if who and when else "",
            ),
        )
    return upd

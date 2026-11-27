"""Luật của bước Thinking, viết bằng code thuần (không LLM) để test được và không bị lời người dùng ép.

- Một ô chỉ là "evidence" khi có người cụ thể + lần cụ thể + đoạn trích nguyên văn có thật trong tin nhắn.
- GO / NOT YET / NO do `decide` quyết. LLM chỉ trích thông tin vào ô (node update_canvas).
"""

import copy
import re

from app.agent.state import CELL_LABELS, CELLS, CORE, CanvasUpdate, CellUpdate, Proposal

# Thứ tự hỏi: người dùng → vấn đề → cách làm hiện tại → việc họ cố hoàn thành
ASK_ORDER: tuple[str, ...] = ("persona", "pain_point", "current_workaround", "jtbd")
DEPENDS_ON_PERSONA: tuple[str, ...] = ("jtbd", "pain_point", "current_workaround")

QUESTIONS: dict[str, str] = {
    "persona": "Một người cụ thể sẽ dùng thứ này là ai? Cho mình tên hoặc vai của họ và một lần gần nhất họ gặp vấn đề.",
    "pain_point": "Lần gần nhất người đó gặp vấn đề này là khi nào? Chuyện gì đã xảy ra và họ mất gì?",
    "current_workaround": "Hôm nay họ xử lý bằng cách nào, và vì sao họ chưa bỏ cách đó?",
    "jtbd": "Họ đang cố hoàn thành việc gì? Viết một câu gồm động từ, đối tượng và bối cảnh, không có chữ AI.",
}
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


def normalize(text: str) -> str:
    return " ".join(text.lower().split())


def empty_cell() -> dict:
    return {"content": "", "who": "", "when": "", "quote": "", "grounded": False, "status": "empty"}


def empty_canvas() -> dict:
    return {cell: empty_cell() for cell in CELLS}


def cell_status(cell: dict) -> str:
    if not str(cell.get("content", "")).strip():
        return "empty"
    proof = all(str(cell.get(k, "")).strip() for k in ("who", "when", "quote"))
    return "evidence" if proof and cell.get("grounded") else "assumption"


def recompute(canvas: dict) -> dict:
    """Tính lại trạng thái mọi ô từ bằng chứng đã lưu. Đây là chỗ DUY NHẤT gán 'evidence'."""
    out = copy.deepcopy(canvas) if canvas else empty_canvas()
    for cell in CELLS:
        out.setdefault(cell, empty_cell())
        out[cell]["status"] = cell_status(out[cell])
    return out


def apply_update(prev: dict | None, upd: CanvasUpdate, request: str, flags: dict | None) -> tuple[dict, dict]:
    """Gộp phần LLM trích vào canvas. Bằng chứng chỉ 'grounded' khi đoạn trích có thật trong tin nhắn."""
    canvas = recompute(prev or empty_canvas())
    flags = dict(flags or {})
    if upd.intent != "answer":
        return canvas, flags
    if upd.persona_changed:
        for cell in DEPENDS_ON_PERSONA:
            canvas[cell].update(who="", when="", quote="", grounded=False)
    text = normalize(request)
    for cell in CELLS:
        u: CellUpdate = getattr(upd, cell)
        if not u.content.strip():
            continue
        quote = u.quote.strip()
        canvas[cell] = {
            "content": u.content.strip()[:400],
            "who": u.who.strip(),
            "when": u.when.strip(),
            "quote": quote,
            "grounded": bool(quote) and normalize(quote) in text,
            "status": "assumption",
        }
    flags = {"no_ai_needed": upd.no_ai_needed, "solved_elsewhere": upd.solved_elsewhere}
    return recompute(canvas), flags


def next_missing(canvas: dict) -> str | None:
    return next((c for c in ASK_ORDER if canvas[c]["status"] != "evidence"), None)


def decide(canvas: dict, flags: dict) -> tuple[str, list[str], str | None]:
    """GO / NOT YET / NO + lý do + ô lõi cần hỏi tiếp. Code quyết, không để LLM tự kết luận."""
    if flags.get("no_ai_needed"):
        return "NO", ["Bài toán có vẻ giải được mà không cần AI. Cân nhắc hướng không dùng AI trước."], None
    if flags.get("solved_elsewhere"):
        return "NO", ["Đã có sản phẩm giải quyết việc này và chưa nêu được mình khác ở đâu."], None
    missing = [c for c in ASK_ORDER if canvas[c]["status"] != "evidence"]
    if missing:
        reasons = [
            f"{CELL_LABELS[c]} {'còn trống' if canvas[c]['status'] == 'empty' else 'mới là giả định'}" for c in missing
        ]
        return "NOT YET", reasons, missing[0]
    todo = [CELL_LABELS[c] for c in CELLS if c not in CORE and canvas[c]["status"] != "evidence"]
    reasons = ["Cả 4 ô lõi đều có chuyện thật: một người cụ thể, một lần cụ thể."]
    if todo:
        reasons.append("Còn cần làm rõ ở Planning: " + ", ".join(todo) + ".")
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
    """Dự phòng khi không có Gemini: đoán intent bằng regex, gán tin nhắn cho ô lõi còn thiếu tiếp theo."""
    upd = CanvasUpdate()
    if FORCE_RX.search(request):
        upd.intent = "force_verdict"
    elif FABRICATE_RX.search(request):
        upd.intent = "fabricate"
    elif SCOPE_RX.search(request):
        upd.intent = "out_of_scope"
    if upd.intent != "answer":
        return upd
    target = next_missing(recompute(canvas))
    if target:
        who, when = WHO_RX.search(request), WHEN_RX.search(request)
        text = request.strip()
        setattr(
            upd,
            target,
            CellUpdate(
                content=text[:400],
                who=who.group(0) if who else "",
                when=when.group(0) if when else "",
                quote=text[:300] if who and when else "",
            ),
        )
    return upd

"""Sinh form khảo sát theo nguyên tắc 1 Form = 1 Vai chính, qua cổng LLM chung hoặc luật dự phòng."""

import logging
import re
import unicodedata

from pydantic import BaseModel, Field

from app.agent import llm
from app.agent.prompts import render
from app.schemas import (
    PitchAdPost,
    PitchAssetsOut,
    PitchDeckDraftOut,
    PitchOverviewOut,
    PitchSlide,
    ProblemContextIn,
    SurveyDraftOut,
    SurveyQuestion,
    SurveySection,
    SurveyStatsOut,
)

logger = logging.getLogger("app.pitching")


class _GeneratedSurvey(BaseModel):
    """Schema structured output trả về từ LLM khi sinh form khảo sát."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=600)
    sections: list[SurveySection] = Field(default_factory=list, max_length=8)
    questions: list[SurveyQuestion] = Field(min_length=3, max_length=8)


def _default_sections() -> list[SurveySection]:
    return [
        SurveySection(
            id="s0",
            title="Phần 1 · Bối cảnh & tần suất",
            description="Tần suất gặp vấn đề và cách xử lý hiện tại",
        ),
        SurveySection(
            id="s1",
            title="Phần 2 · Mức độ ảnh hưởng & kỳ vọng",
            description="Độ gián đoạn thực tế và điều kiện sẵn sàng dùng",
        ),
    ]


def _clip(text: str, limit: int, default: str) -> str:
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return default
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


def _clean_questions(questions: list[SurveyQuestion]) -> list[SurveyQuestion]:
    cleaned: list[SurveyQuestion] = []
    for idx, q in enumerate(questions[:8]):
        opts = [o.strip()[:120] for o in q.options if o.strip()][:6]
        q_type = q.type
        if q_type in ("choice", "multi") and len(opts) < 2:
            opts = ["Thường xuyên", "Thỉnh thoảng", "Hiếm khi"]
        elif q_type not in ("choice", "multi"):
            opts = []
        cleaned.append(
            SurveyQuestion(
                id=f"q{idx}",
                section_id=q.section_id.strip()[:24],
                type=q_type,
                q=q.q.strip()[:300],
                options=opts,
                required=q.required,
            )
        )
    return cleaned


def _assign_sections(
    raw_sections: list[SurveySection], questions: list[SurveyQuestion]
) -> tuple[list[SurveySection], list[SurveyQuestion]]:
    """Chuẩn hóa section và gán mọi câu hỏi về section hợp lệ để UI & form công khai nhóm rõ ràng."""
    cleaned_secs: list[SurveySection] = []
    seen: set[str] = set()
    for idx, sec in enumerate(raw_sections[:8]):
        title = sec.title.strip()[:140]
        if not title:
            continue
        sec_id = (sec.id.strip() or f"s{idx}")[:24]
        if sec_id in seen:
            continue
        seen.add(sec_id)
        cleaned_secs.append(SurveySection(id=sec_id, title=title, description=sec.description.strip()[:400]))

    if not cleaned_secs:
        cleaned_secs = _default_sections()
        sec_ids = [s.id for s in cleaned_secs]
        assigned = [
            q.model_copy(update={"section_id": sec_ids[0] if i < 3 or len(sec_ids) < 2 else sec_ids[1]})
            for i, q in enumerate(questions)
        ]
        return cleaned_secs, assigned

    valid_ids = {s.id for s in cleaned_secs}
    fallback_id = cleaned_secs[0].id
    assigned = [
        q.model_copy(update={"section_id": q.section_id if q.section_id in valid_ids else fallback_id})
        for q in questions
    ]
    return cleaned_secs, assigned


def _resolve_target_role(ctx: ProblemContextIn) -> str:
    explicit = _clip(ctx.target_role, 80, "")
    if explicit:
        return explicit
    text = f"{ctx.persona} {ctx.project_name} {ctx.problem}".lower()
    if any(k in text for k in ("trợ giảng", "lab coach", "ta ")):
        return "Trợ giảng / Lab coach"
    if any(k in text for k in ("học viên", "sinh viên", "người học")):
        return "Học viên"
    if any(k in text for k in ("giảng viên", "mentor", "giáo viên")):
        return "Giảng viên / Mentor"
    if any(k in text for k in ("chủ shop", "quản lý")):
        return "Chủ shop / Quản lý"
    if any(k in text for k in ("cskh", "chăm sóc khách hàng", "nhân viên")):
        return "Nhân viên CSKH"
    if any(k in text for k in ("kỹ sư", "engineer", "developer", "product", "đội sản phẩm")):
        return "Kỹ sư / Đội sản phẩm"
    return _clip(ctx.persona, 60, "Người dùng mục tiêu")


def _extract_topic(ctx: ProblemContextIn) -> str:
    """Rút trích cụm chủ đề ngắn gọn từ tên ý tưởng/sản phẩm (tránh trích nguyên văn đoạn dài)."""
    raw = " ".join(ctx.project_name.strip().split())
    if not raw:
        raw = " ".join(ctx.problem.strip().split())
    if not raw:
        return "nhu cầu này"
    for sep in (":", " - ", " — ", "("):
        if sep in raw:
            head = raw.split(sep, 1)[0].strip()
            if 4 <= len(head) <= 50:
                raw = head
                break
    words = raw.split()
    if len(words) > 9:
        raw = " ".join(words[:9]).rstrip(".,;:") + "…"
    return raw


def _role_profile(role_label: str, ctx: ProblemContextIn) -> dict:
    low = role_label.lower()
    domain = f"{ctx.project_name} {ctx.problem} {ctx.leverage} {ctx.scope} {ctx.overview}".lower()
    topic = _extract_topic(ctx)

    is_edtech = any(k in domain for k in ("lớp", "pre-class", "nộp bài", "slide", "cài đặt", "trợ giảng", "học viên"))
    is_cskh = any(k in domain for k in ("shop", "đơn hàng", "đổi trả", "tin nhắn khách", "cskh", "chốt đơn"))
    is_tang = any(k in domain for k in ("scorecard", "hackathon", "pitch", "khảo sát kiểm chứng"))

    if is_edtech and any(k in low for k in ("học viên", "sinh viên", "người học")):
        return {
            "q0": "Trong 2 tuần qua, bạn gặp vướng mắc khi học hoặc làm bài tập bao nhiêu lần?",
            "q1": "Mỗi lần gặp vướng mắc lúc làm bài, bạn thường mất bao lâu để tìm được câu trả lời?",
            "q2": "Lần gần nhất bị kẹt khi học hoặc cài đặt, bạn đã xoay xở bằng cách nào?",
            "q2_opts": [
                "Tự tìm lại trong slide, ghi chú hoặc chat lớp",
                "Nhắn hỏi bạn học hoặc hỏi trực tiếp Trợ giảng / TA",
                "Tự hỏi ChatGPT hoặc công cụ AI rời rạc",
                "Bỏ qua hoặc để tới buổi học sau mới hỏi",
            ],
            "q3": "Việc phải tự tìm hoặc chờ giải đáp khi đang học làm bạn gián đoạn ở mức nào? (1–5)",
            "q4": "Điều gì khiến bạn khó chịu nhất khi tìm tài liệu hoặc hỏi bài hiện nay?",
        }
    if is_edtech and any(k in low for k in ("trợ giảng", "lab coach", "giảng viên", "mentor", "ta")):
        return {
            "q0": "Trong 2 tuần qua, bạn phải trả lời các câu hỏi lặp lại của học viên bao nhiêu lần?",
            "q1": "Mỗi lượt tra tài liệu và soạn câu trả lời cho học viên, bạn thường mất khoảng bao lâu?",
            "q2": "Lần gần nhất nhận câu hỏi lặp lại về bài học hay cài đặt, bạn xử lý bằng cách nào?",
            "q2_opts": [
                "Tìm lại tin nhắn cũ rồi copy sửa lại",
                "Mở lại slide / tài liệu khóa để kiểm tra từng mục",
                "Nhờ AI bên ngoài soạn nháp rồi tự chỉnh sửa",
                "Gõ trả lời thủ công hoàn toàn từ đầu",
            ],
            "q3": "Việc xử lý lặp lại các câu hỏi này gây tốn thời gian cho bạn ở mức nào? (1–5)",
            "q4": "Điều kiện nào quan trọng nhất để bạn dám duyệt dùng bản nháp trả lời do AI soạn?",
        }
    if is_cskh and any(k in low for k in ("cskh", "chăm sóc", "nhân viên", "chủ shop", "bán hàng")):
        return {
            "q0": "Trong 2 tuần qua, bạn gặp tin nhắn khách hỏi lặp lại (đơn, size, đổi trả) bao nhiêu lần?",
            "q1": "Mỗi lượt kiểm tra thông tin và nhắn trả lời khách thường mất khoảng bao lâu?",
            "q2": "Vào giờ cao điểm nhiều tin nhắn, bạn thường xử lý câu hỏi lặp lại thế nào?",
            "q2_opts": [
                "Tự gõ lại hoặc copy mẫu tin nhắn có sẵn",
                "Tra bảng tính / hệ thống đơn rồi trả lời tay",
                "Dùng AI rời rạc soạn giúp rồi sửa lại",
                "Trả lời chậm hoặc để dồn cuối ngày",
            ],
            "q3": "Áp lực trả lời nhanh tin nhắn lặp lại làm bạn mệt hoặc dễ sai sót ở mức nào? (1–5)",
            "q4": "Bạn lo ngại điều gì nhất nếu dùng AI soạn sẵn câu trả lời để bạn duyệt trước khi gửi?",
        }
    if is_tang and any(k in low for k in ("kỹ sư", "engineer", "dev", "product", "sản phẩm")):
        return {
            "q0": "Trong 2 tuần qua, bạn phải rà lại scope, bằng chứng người dùng hoặc tài liệu pitch mấy lần?",
            "q1": "Mỗi lần tổng hợp dữ liệu, khảo sát và làm slide trình bày, bạn mất khoảng bao lâu?",
            "q2": "Lần gần nhất chuẩn bị ý tưởng và kiểm chứng người dùng, nhóm bạn làm bằng cách nào?",
            "q2_opts": [
                "Tự viết form Google Forms và tổng hợp tay bằng trang tính",
                "Bàn trực tiếp trên chat nhóm rồi làm slide thủ công",
                "Dùng ChatGPT/Claude rời rạc để gợi ý từng phần",
                "Bỏ qua bước khảo sát, code tính năng trước",
            ],
            "q3": "Việc ghép nối từ ý tưởng → khảo sát → số liệu → slide gây mất thời gian ở mức nào? (1–5)",
            "q4": "Khâu nào tốn công nhất khi bạn cần biến ý tưởng kỹ thuật thành bài pitch có số liệu?",
        }

    return {
        "q0": f"Trong 2 tuần qua, {role_label} gặp tình huống liên quan tới {topic} bao nhiêu lần?",
        "q1": f"Mỗi lần tự xử lý vấn đề liên quan tới {topic}, bạn thường mất khoảng bao lâu?",
        "q2": f"Lần gần nhất gặp khó khăn ở phần {topic}, bạn đã xoay xở bằng cách nào?",
        "q2_opts": [
            "Tự làm thủ công hoặc tự ghi chú, nhắc việc lại",
            "Tìm tài liệu / hỏi người có kinh nghiệm xung quanh",
            "Dùng ChatGPT hoặc công cụ rời rạc hỗ trợ tạm",
            "Bỏ qua hoặc trì hoãn vì tốn công xử lý",
        ],
        "q3": f"Việc tự xử lý cách hiện tại (khi chưa có {topic}) gây bất tiện cho {role_label} ở mức nào? (1–5)",
        "q4": f"Nếu có {topic}, điều kiện quan trọng nhất để {role_label} tin dùng hoặc điều khiến bạn ngại nhất là gì?",
    }


def rule_based_survey(ctx: ProblemContextIn) -> SurveyDraftOut:
    """Luật dự phòng chuẩn Mom Test theo đúng 1 vai mục tiêu và bám chủ đề ý tưởng nhóm."""
    project = _clip(ctx.project_name, 70, "Sản phẩm mới")
    role_label = _resolve_target_role(ctx)
    prof = _role_profile(role_label, ctx)

    sections = _default_sections()
    questions = [
        SurveyQuestion(
            id="q0",
            section_id="s0",
            type="choice",
            q=prof["q0"],
            options=["Chưa gặp lần nào", "1–2 lần", "3–5 lần", "Gần như mỗi ngày"],
            required=True,
        ),
        SurveyQuestion(
            id="q1",
            section_id="s0",
            type="choice",
            q=prof["q1"],
            options=["Dưới 5 phút", "5–15 phút", "15–30 phút", "Trên 30 phút"],
            required=True,
        ),
        SurveyQuestion(id="q2", section_id="s0", type="multi", q=prof["q2"], options=prof["q2_opts"], required=True),
        SurveyQuestion(id="q3", section_id="s1", type="scale", q=prof["q3"], options=[], required=True),
        SurveyQuestion(id="q4", section_id="s1", type="text", q=prof["q4"], options=[], required=True),
    ]
    return SurveyDraftOut(
        title=f"Khảo sát ({role_label}): {project}",
        description=f"Khảo sát nhanh 1 phút dành riêng cho {role_label} (không thu thông tin cá nhân).",
        target_role=role_label,
        sections=sections,
        questions=questions,
        source="fallback",
    )


def generate_survey(ctx: ProblemContextIn) -> SurveyDraftOut:
    """Sinh bộ câu hỏi khảo sát theo đúng 1 vai mục tiêu qua cổng LLM, có fallback an toàn."""
    role_label = _resolve_target_role(ctx)
    prompt = render(
        "survey_generate",
        project_name=ctx.project_name.strip(),
        target_role=role_label,
        persona=ctx.persona.strip() or role_label,
        problem=ctx.problem.strip() or "(chưa nêu)",
        leverage=ctx.leverage.strip() or "(chưa nêu)",
        scope=ctx.scope.strip() or "(chưa nêu)",
        metric=ctx.metric.strip() or "(chưa nêu)",
        overview=ctx.overview.strip() or "(chưa nêu)",
    )
    try:
        generated = llm.structured(_GeneratedSurvey, prompt, node="survey_generate")
        cleaned = _clean_questions(generated.questions)
        if len(cleaned) >= 3:
            sections, assigned = _assign_sections(generated.sections, cleaned)
            return SurveyDraftOut(
                title=generated.title.strip()[:200],
                description=generated.description.strip()[:600],
                target_role=role_label,
                sections=sections,
                questions=assigned,
                source="llm",
            )
    except llm.LLMUnavailableError:
        pass
    except Exception as exc:  # noqa: BLE001 — fallback theo đúng vai mục tiêu, không làm gián đoạn
        logger.warning("survey_generate: LLM lỗi (%s), dùng luật dự phòng", type(exc).__name__)
    return rule_based_survey(ctx)


class _GeneratedDeck(BaseModel):
    """Schema structured output cho bộ slide pitching (<= 10 slide)."""

    title: str = Field(min_length=1, max_length=200)
    slides: list[PitchSlide] = Field(min_length=3, max_length=10)


class _GeneratedAssets(BaseModel):
    """Schema structured output cho bài quảng cáo chung kèm placeholder."""

    ads: list[PitchAdPost] = Field(min_length=1, max_length=3)


class _GeneratedOverview(BaseModel):
    """Schema structured output cho AI overview từ số liệu khảo sát."""

    overview: str = Field(min_length=20, max_length=4000)


def _format_stats_summary(stats: SurveyStatsOut | None) -> tuple[str, list[str]]:
    if not stats or not stats.total_responses:
        return "Chưa có dữ liệu khảo sát (trình bày theo giả định Product thinking).", []
    lines: list[str] = []
    for q in stats.questions[:6]:
        if q.type == "text":
            if q.texts:
                lines.append(f"- {q.q}: {'; '.join(q.texts[:2])}")
            continue
        if q.type == "scale" and q.avg is not None:
            lines.append(f"- {q.q}: trung bình {q.avg:.1f}/5 ({q.answered} lượt).")
            continue
        top = max(q.options, key=lambda o: o.count, default=None)
        if top and top.count > 0:
            lines.append(f'- {q.q}: nhiều nhất "{top.label}" ({top.count}/{q.answered} · {top.pct}%).')
    note = (
        f"{stats.total_responses} phản hồi "
        f'({stats.real_responses} thật, {stats.sample_responses} mẫu) từ "{stats.title}".'
    )
    return note + ("\n" + "\n".join(lines) if lines else ""), lines


def _fmt_pct(value: float) -> str:
    return f"{value:.0f}%" if float(value).is_integer() else f"{value:.1f}%"


def _survey_facts(stats: SurveyStatsOut | None) -> list[str]:
    """Dữ kiện khảo sát tính sẵn bằng Python. Slide chỉ được trích các con số có ở đây, LLM không tự tính."""
    if not stats or not stats.total_responses:
        return []
    facts = [
        f"Quy mô: {stats.total_responses} phản hồi ({stats.real_responses} thật, {stats.sample_responses} mẫu)",
    ]
    for q in stats.questions[:8]:
        if not q.answered:
            continue
        if q.type == "text":
            quotes = "; ".join(f'"{_clip(t, 90, "")}"' for t in q.texts[:3] if t.strip())
            if quotes:
                facts.append(f'Câu mở "{q.q}" (lời người thật): {quotes}')
            continue
        if q.type == "scale" and q.avg is not None:
            high = sum(o.count for o in q.options if o.label in ("4", "5"))
            facts.append(
                f'"{q.q}": điểm trung bình {q.avg:.1f}/5; {high}/{q.answered} người '
                f"({_fmt_pct(round(high / q.answered * 100, 1))}) chọn mức 4–5"
            )
            continue
        ranked = sorted((o for o in q.options if o.count > 0), key=lambda o: o.count, reverse=True)[:2]
        if ranked:
            parts = "; ".join(f'"{o.label}" {o.count}/{q.answered} ({_fmt_pct(o.pct)})' for o in ranked)
            facts.append(f'"{q.q}": {parts}')
    return facts


def _facts_block(stats: SurveyStatsOut | None) -> str:
    facts = _survey_facts(stats)
    if not facts:
        return (
            "Chưa có phản hồi khảo sát. Slide bằng chứng phải nói rõ là chưa có số liệu và nêu mục tiêu thu phản hồi. "
            "KHÔNG đưa bất kỳ con số khảo sát nào."
        )
    note = ""
    if stats and stats.sample_responses:
        note = (
            f"\nLưu ý: {stats.sample_responses}/{stats.total_responses} phản hồi là dữ liệu mẫu, "
            "các tỉ lệ trên gồm cả phản hồi mẫu."
        )
    return "\n".join(f"- {f}" for f in facts) + note


def _prompt_ctx_fields(ctx: ProblemContextIn, stats: SurveyStatsOut | None) -> dict[str, str]:
    role_label = _resolve_target_role(ctx)
    return {
        "project_name": ctx.project_name.strip() or "Sản phẩm AI mới",
        "target_role": role_label,
        "persona": ctx.persona.strip() or role_label,
        "problem": ctx.problem.strip() or "(chưa điền trong Product thinking)",
        "leverage": ctx.leverage.strip() or "(chưa điền vai trò của AI)",
        "scope": ctx.scope.strip() or "(MVP thử nghiệm 4 tuần cho 1 luồng chính)",
        "metric": ctx.metric.strip() or "(thời gian tiết kiệm & tỉ lệ người dùng hài lòng)",
        "overview": ctx.overview.strip() or "(chưa có mô tả tổng quan)",
        "survey_facts": _facts_block(stats),
    }


_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")
_EVIDENCE_RE = re.compile(r"bằng chứng|khảo sát|tín hiệu|số liệu", re.IGNORECASE)
_BULLET_RE = re.compile(r"^\s*(?:[-•*]|\d+[.)])\s+")


def _numbers(text: str) -> set[str]:
    return {n.replace(",", ".") for n in _NUM_RE.findall(text)}


def _unverified(text: str, allowed: set[str]) -> bool:
    """Có con số không nằm trong dữ liệu đầu vào. Số nguyên nhỏ (Bước 1, 2 tuần, 4 tuần) được phép."""
    return any(n not in allowed and ("." in n or int(n) > 10) for n in _numbers(text))


def _allowed_numbers(ctx: ProblemContextIn | None, stats: SurveyStatsOut | None) -> set[str]:
    """Các con số có trong đầu vào (bài toán + dữ kiện khảo sát tính sẵn). Ngoài tập này là số bịa."""
    source = " ".join(_survey_facts(stats))
    if stats:
        source += f" {stats.total_responses} {stats.real_responses} {stats.sample_responses}"
    if ctx:
        source += " " + " ".join(ctx.model_dump().values())
    return _numbers(source)


def _drop_unverified_sentences(text: str, allowed: set[str]) -> str:
    """Bỏ từng câu có con số không nằm trong dữ liệu, giữ nguyên xuống dòng của văn bản."""
    lines = []
    for line in text.splitlines():
        sentences = re.split(r"(?<=[.!?])\s+", line)
        kept = [s for s in sentences if not _unverified(s, allowed)]
        if kept or not line.strip():
            lines.append(" ".join(kept))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _bullets(body: str) -> list[str]:
    return [ln for ln in body.splitlines() if _BULLET_RE.match(ln)]


def _fix_layout(slide: PitchSlide, idx: int, stats: SurveyStatsOut | None) -> PitchSlide:
    """Ép layout khớp với nội dung để slide không vỡ khi hiển thị."""
    layout, highlight = slide.layout, slide.highlight
    n_items = len(_bullets(slide.body))
    if idx == 0:
        layout = "hero"
    elif layout == "compare" and n_items != 2:
        layout = "cards" if n_items >= 3 else "split"
    elif layout in ("cards", "steps") and n_items < 2:
        layout = "split"
    elif layout == "metric" and not re.search(r"\d", highlight):
        if stats and stats.total_responses and _EVIDENCE_RE.search(f"{slide.kicker} {slide.title}"):
            highlight = f"{stats.total_responses} phản hồi · {stats.real_responses} thật"
        else:
            layout = "split"
    elif layout == "metric" and stats and not re.search(r"[^\W\d_]", highlight):
        highlight = _label_bare_number(highlight, stats)
    return slide.model_copy(update={"layout": layout, "highlight": highlight})


def _label_bare_number(highlight: str, stats: SurveyStatsOut) -> str:
    """Số trần như "6/10" không cho người xem biết đó là gì: ghép nhãn phương án khảo sát tương ứng."""
    value = highlight.strip().replace(",", ".")
    labels = [
        o.label
        for q in stats.questions
        if q.type in ("choice", "multi")
        for o in q.options
        if value in (f"{o.count}/{q.answered}", _fmt_pct(o.pct))
    ]
    if len(labels) == 1:  # trùng nhiều phương án thì không đoán, giữ nguyên
        return _clip(f'{value} chọn "{labels[0]}"', 140, value)
    return highlight


def _clean_slides(
    raw_slides: list[PitchSlide],
    limit: int = 10,
    ctx: ProblemContextIn | None = None,
    stats: SurveyStatsOut | None = None,
) -> list[PitchSlide]:
    """Guardrail sau LLM: bỏ số liệu không có trong đầu vào, sửa layout, ghi rõ phản hồi mẫu."""
    capped = min(max(limit, 3), 10)
    allowed = _allowed_numbers(ctx, stats)

    cleaned: list[PitchSlide] = []
    for idx, slide in enumerate(raw_slides[:capped]):
        lines = [ln.strip() for ln in slide.body.strip().splitlines() if ln.strip()]
        kept = [ln for ln in lines if not _unverified(ln, allowed)]
        if lines and not kept:
            kept = ["- Cần bổ sung nội dung có số liệu kiểm chứng."]
        elif len(kept) < len(lines):
            renumbered, step = [], 0
            for ln in kept:
                if re.match(r"^- Bước \d+:", ln):
                    step += 1
                    ln = re.sub(r"^- Bước \d+:", f"- Bước {step}:", ln)
                renumbered.append(ln)
            kept = renumbered
        title = slide.title.strip()
        if _unverified(title, allowed):
            title = _NUM_RE.sub("[?]", title)
        highlight = "" if _unverified(slide.highlight, allowed) else slide.highlight
        draft = PitchSlide(
            id=f"s{idx}",
            kicker=_clip(slide.kicker, 80, f"Slide {idx + 1}"),
            title=_clip(title, 140, f"Nội dung {idx + 1}"),
            body="\n".join(kept)[:800] or "Cần bổ sung nội dung.",
            highlight=_clip(highlight, 140, ""),
            layout=slide.layout,
        )
        cleaned.append(_fix_layout(draft, idx, stats))

    if stats and stats.sample_responses and cleaned:
        if not any("mẫu" in f"{s.body} {s.highlight}".lower() for s in cleaned):
            target = next(
                (i for i, s in enumerate(cleaned) if _EVIDENCE_RE.search(f"{s.kicker} {s.title}")),
                None,
            )
            if target is not None:
                s = cleaned[target]
                note = (
                    f"- Lưu ý: {stats.sample_responses}/{stats.total_responses} phản hồi là dữ liệu mẫu, "
                    "chưa dùng làm kết luận."
                )
                cleaned[target] = _fix_layout(s.model_copy(update={"body": f"{s.body}\n{note}"[:800]}), target, stats)
    return cleaned


def _rule_based_deck(ctx: ProblemContextIn, stats: SurveyStatsOut | None, slide_count: int) -> PitchDeckDraftOut:
    project = _clip(ctx.project_name, 90, "Sản phẩm AI")
    role_label = _resolve_target_role(ctx)
    persona_line = _clip(ctx.persona, 160, f"{role_label} gặp tác vụ lặp lại hằng ngày.")
    problem_line = _clip(ctx.problem, 200, f"{role_label} tốn nhiều thời gian xử lý thủ công lặp lại.")
    leverage_line = _clip(
        ctx.leverage, 200, "AI tóm tắt ngữ cảnh, gợi ý bản nháp có nguồn dẫn để con người duyệt cuối."
    )
    scope_line = _clip(ctx.scope, 180, "Tập trung đúng 1 luồng đau nhất cho 1 nhóm vai trò cốt lõi.")
    metric_line = _clip(ctx.metric, 180, "Thời gian hoàn thành tác vụ & tỉ lệ bản nháp được dùng lại.")
    overview_line = _clip(ctx.overview, 180, f"Giúp {role_label} xử lý nhanh và chuẩn hơn ngay từ bản đầu.")

    facts = _survey_facts(stats)
    if stats and facts:
        evidence_body = "\n".join(f"- {_clip(f, 190, '')}" for f in facts[:4])
        evidence_highlight = f"{stats.total_responses} phản hồi · {stats.real_responses} thật"
    else:
        evidence_body = (
            f"- Đối tượng mục tiêu: {role_label}\n"
            "- Chưa có phản hồi khảo sát đã thu để làm bằng chứng định lượng\n"
            "- Mục tiêu trước khi pitch: thu ít nhất 5–10 phản hồi thật ngoài nhóm quen"
        )
        evidence_highlight = "0 phản hồi · Cần thu thật"

    slides = [
        PitchSlide(
            id="s0",
            kicker="Tổng quan",
            title=project,
            body=f"- Đối tượng: {role_label}\n- Giá trị cốt lõi: {overview_line}\n- Phạm vi: {scope_line}",
            highlight=f"Dành cho {role_label}",
            layout="hero",
        ),
        PitchSlide(
            id="s1",
            kicker="Vấn đề thật",
            title=f"Vì sao {role_label} đang bị quá tải",
            body=f"- Chân dung: {persona_line}\n- Điểm nghẽn: {problem_line}\n- Hệ quả: tốn thời gian lặp lại và dễ sai sót khi cao điểm",
            highlight="Từ Product thinking",
            layout="split",
        ),
        PitchSlide(
            id="s2",
            kicker="Đòn bẩy AI",
            title="AI xử lý phần nặng, người chốt phần cuối",
            body=f"- Cơ chế AI: {leverage_line}\n- Kiểm soát rủi ro: hiển thị căn cứ rõ ràng trước khi gửi\n- Giới hạn an toàn: không tự gửi ở các bước nhạy cảm",
            highlight="Con người duyệt cuối",
            layout="cards",
        ),
        PitchSlide(
            id="s3",
            kicker="Bằng chứng",
            title="Tín hiệu từ khảo sát người dùng",
            body=evidence_body[:800],
            highlight=evidence_highlight,
            layout="metric",
        ),
        PitchSlide(
            id="s4",
            kicker="MVP 4 tuần",
            title="Làm gọn một luồng để kiểm chứng nhanh",
            body=f"- Trong phạm vi v1: {scope_line}\n- Ngoài phạm vi v1: chưa mở rộng đa kênh hay tùy biến phức tạp",
            highlight="1 luồng · 4 tuần",
            layout="compare",
        ),
        PitchSlide(
            id="s5",
            kicker="Đo lường",
            title="Thước đo giá trị và chất lượng AI",
            body=f"- Chỉ số chính: {metric_line}\n- Cách kiểm tra: đối chiếu trước & sau khi dùng bản nháp AI\n- Kỷ luật eval: chấm bộ câu hỏi thực tế trước khi mở rộng",
            highlight="Đo trước & sau dùng",
            layout="cards",
        ),
        PitchSlide(
            id="s6",
            kicker="Bước tiếp theo",
            title="Kế hoạch thử nghiệm trong 2 tuần tới",
            body=f"- Bước 1: Mời 5–10 {role_label} dùng thử bản MVP trên tình huống thật\n- Bước 2: Thu thập lỗi sai để siết prompt & bộ đánh giá\n- Bước 3: Chốt giữ lại hay chỉnh hướng dựa trên số liệu đo",
            highlight="Pilot 5–10 người",
            layout="steps",
        ),
    ]
    return PitchDeckDraftOut(
        title=f"Pitching: {project}",
        survey_slug=stats.slug if stats else "",
        slides=_clean_slides(slides, slide_count, ctx, stats),
        source="fallback",
    )


def generate_pitch_deck(
    ctx: ProblemContextIn, stats: SurveyStatsOut | None = None, slide_count: int = 7
) -> PitchDeckDraftOut:
    """Sinh bộ slide Pitching (<= 10 slide) qua LLM hoặc luật dự phòng bám sát ngữ cảnh."""
    fields = _prompt_ctx_fields(ctx, stats)
    fields["slide_count"] = str(min(max(slide_count, 3), 10))
    prompt = render("pitch_deck", **fields)
    try:
        generated = llm.structured(_GeneratedDeck, prompt, node="pitch_deck")
        cleaned = _clean_slides(generated.slides, slide_count, ctx, stats)
        if len(cleaned) >= 3:
            return PitchDeckDraftOut(
                title=_clip(generated.title, 180, f"Pitching: {fields['project_name']}"),
                survey_slug=stats.slug if stats else "",
                slides=cleaned,
                source="llm",
            )
    except llm.LLMUnavailableError:
        pass
    except Exception as exc:  # noqa: BLE001 — dùng bản dự phòng bám bài toán, không làm gián đoạn UI
        logger.warning("pitch_deck: LLM lỗi (%s), dùng luật dự phòng", type(exc).__name__)
    return _rule_based_deck(ctx, stats, slide_count)


def _rule_based_assets(ctx: ProblemContextIn, stats: SurveyStatsOut | None) -> PitchAssetsOut:
    project = _clip(ctx.project_name, 80, "Sản phẩm AI")
    role_label = _resolve_target_role(ctx)
    problem = _clip(ctx.problem, 180, f"xử lý công việc lặp lại hằng ngày cho {role_label}")
    leverage = _clip(ctx.leverage, 180, "AI soạn nháp dựa trên đúng tài liệu ngữ cảnh và để người dùng kiểm duyệt")
    metric = _clip(ctx.metric, 140, "giảm thời gian chờ và hạn chế sai sót")
    note, _ = _format_stats_summary(stats)

    survey_hint = f"/survey?slug={stats.slug}" if stats and stats.slug else "[Điền link khảo sát / dùng thử]"
    ads = [
        PitchAdPost(
            id="ad0",
            channel="Bài đăng chung",
            hook=f"{role_label} có đang mất nhiều thời gian vì {problem}?",
            body=(
                f"Nhóm mình đang thử nghiệm {project}: {leverage}.\n"
                f"Phạm vi bản đầu: {ctx.scope or 'gọn nhẹ cho 1 luồng chính'}, tập trung {metric}.\n"
                f"Tín hiệu hiện tại: {note}\n"
                f"Đang mời [Số lượng: 5–10] bạn thuộc nhóm {role_label} góp ý và dùng thử trước [Mốc thời gian]."
            ),
            cta=f"Xem chi tiết hoặc để lại góp ý 1 phút tại: {survey_hint}",
            placeholders=[survey_hint, "[Số lượng: 5–10]", "[Mốc thời gian]"],
        )
    ]
    return PitchAssetsOut(script="", ads=ads, source="fallback")


def _fill_ad_placeholders(text: str, project: str, role_label: str) -> str:
    text = re.sub(r"\[(?:tên|ten)\s+(?:sản|san)\s+(?:phẩm|pham)\]", project, text, flags=re.IGNORECASE)
    return re.sub(
        r"\[(?:đối|doi)\s+(?:tượng|tuong)(?:\s+(?:mục|muc)\s+(?:tiêu|tieu))?\]",
        role_label,
        text,
        flags=re.IGNORECASE,
    )


_DIACRITICS_REMINDER = (
    "\n\nLần trả lời trước bị mất dấu tiếng Việt. Viết lại toàn bộ bằng tiếng Việt CÓ ĐẦY ĐỦ DẤU, "
    "kể cả khi dữ liệu trong <bai_toan> được gõ không dấu."
)


def _lacks_diacritics(text: str) -> bool:
    """Tiếng Việt viết đúng có dấu ở phần lớn từ. Bỏ qua phần [...] vì model chép nguyên từ prompt."""
    words = re.findall(r"[^\W\d_]+", unicodedata.normalize("NFC", re.sub(r"\[[^\]]*\]", " ", text)))
    return bool(words) and sum(not w.isascii() for w in words) / len(words) < 0.3


def _generate_accented_assets(prompt: str) -> _GeneratedAssets:
    """Gọi LLM, thử lại một lần nếu bài trả về không dấu; vẫn sai thì báo lỗi để dùng luật dự phòng."""
    for attempt_prompt in (prompt, prompt + _DIACRITICS_REMINDER):
        generated = llm.structured(_GeneratedAssets, attempt_prompt, node="pitch_assets")
        ad = generated.ads[0]
        if not _lacks_diacritics(f"{ad.hook} {ad.body} {ad.cta}"):
            return generated
    raise ValueError("LLM trả tiếng Việt không dấu")


def generate_pitch_assets(ctx: ProblemContextIn, stats: SurveyStatsOut | None = None) -> PitchAssetsOut:
    """Sinh bài quảng cáo chung kèm placeholder qua LLM hoặc luật dự phòng."""
    project = _clip(ctx.project_name, 80, "Sản phẩm AI")
    role_label = _resolve_target_role(ctx)
    prompt = render("pitch_assets", **_prompt_ctx_fields(ctx, stats))
    try:
        generated = _generate_accented_assets(prompt)
        allowed = _allowed_numbers(ctx, stats)

        def tidy(text: str, limit: int) -> str:
            return _drop_unverified_sentences(_fill_ad_placeholders(text.strip(), project, role_label), allowed)[:limit]

        ads = [
            PitchAdPost(
                id="ad0",
                channel=_clip(ad.channel, 60, "Bài đăng chung"),
                hook=tidy(ad.hook, 300),
                body=tidy(ad.body, 1600),
                cta=tidy(ad.cta, 240),
                placeholders=[
                    p.strip()[:60]
                    for p in ad.placeholders
                    if p.strip()
                    and not re.search(
                        r"\[(?:tên|ten)\s+(?:sản|san)\s+(?:phẩm|pham)\]|\[(?:đối|doi)\s+(?:tượng|tuong)",
                        p,
                        flags=re.IGNORECASE,
                    )
                ][:6],
            )
            for ad in generated.ads[:1]
        ]
        return PitchAssetsOut(script="", ads=ads, source="llm")
    except llm.LLMUnavailableError:
        pass
    except Exception as exc:  # noqa: BLE001 — fallback an toàn theo bài toán
        logger.warning("pitch_assets: LLM lỗi (%s), dùng luật dự phòng", type(exc).__name__)
    return _rule_based_assets(ctx, stats)


def _rule_based_overview(stats: SurveyStatsOut | None) -> PitchOverviewOut:
    if not stats or not stats.total_responses:
        return PitchOverviewOut(
            overview="Chưa có phản hồi nào cho khảo sát này. Hãy chia sẻ link khảo sát hoặc thêm 8 phản hồi mẫu để kiểm thử dashboard.",
            total_responses=0,
            real_responses=0,
            sample_responses=0,
            source="fallback",
        )
    note, lines = _format_stats_summary(stats)
    caution = (
        "Toàn bộ phản hồi hiện là dữ liệu mẫu nên CHƯA dùng làm bằng chứng kết luận thị trường."
        if stats.sample_responses == stats.total_responses
        else f"Mới có {stats.real_responses} phản hồi thật (và {stats.sample_responses} mẫu), cần thu thêm mẫu ngoài nhóm quen."
    )
    overview = (
        f"Bản tóm tắt từ số liệu thực tế ({note.splitlines()[0]}).\n{caution}\n\n"
        + ("\n".join(lines) + "\n\n" if lines else "")
        + "Nên làm tiếp:\n"
        "1. Thu thêm tối thiểu 15–20 phản hồi từ người dùng mục tiêu thật.\n"
        "2. Phỏng vấn nhanh 3 người nêu rào cản rõ nhất ở câu hỏi mở.\n"
        "3. Chạy thử bản MVP gọn cho đúng phương án đau nhất đang chiếm tỉ lệ cao."
    )
    return PitchOverviewOut(
        overview=overview,
        total_responses=stats.total_responses,
        real_responses=stats.real_responses,
        sample_responses=stats.sample_responses,
        source="fallback",
    )


def generate_pitch_overview(ctx: ProblemContextIn, stats: SurveyStatsOut | None = None) -> PitchOverviewOut:
    """Phân tích tín hiệu khảo sát qua LLM dựa trên thống kê đã tính bằng Python."""
    if not stats or not stats.total_responses:
        return _rule_based_overview(stats)
    fields = _prompt_ctx_fields(ctx, stats)
    prompt = render("pitch_overview", **fields)
    try:
        generated = llm.structured(_GeneratedOverview, prompt, node="pitch_overview")
        overview = _drop_unverified_sentences(generated.overview, _allowed_numbers(ctx, stats))
        if len(overview) < 20:
            return _rule_based_overview(stats)
        return PitchOverviewOut(
            overview=overview[:4000],
            total_responses=stats.total_responses,
            real_responses=stats.real_responses,
            sample_responses=stats.sample_responses,
            source="llm",
        )
    except llm.LLMUnavailableError:
        pass
    except Exception as exc:  # noqa: BLE001 — fallback tính từ số liệu Python
        logger.warning("pitch_overview: LLM lỗi (%s), dùng luật dự phòng", type(exc).__name__)
    return _rule_based_overview(stats)

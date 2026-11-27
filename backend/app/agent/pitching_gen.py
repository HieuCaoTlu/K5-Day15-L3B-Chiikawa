"""Sinh form khảo sát theo nguyên tắc 1 Form = 1 Vai chính, qua cổng LLM chung hoặc luật dự phòng."""

import logging

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
    """Schema structured output cho kịch bản nói và bài quảng cáo chung kèm placeholder."""

    script: str = Field(min_length=20, max_length=5000)
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


def _prompt_ctx_fields(ctx: ProblemContextIn, stats: SurveyStatsOut | None) -> dict[str, str]:
    role_label = _resolve_target_role(ctx)
    stats_json = stats.model_dump_json() if stats else "Chưa chọn khảo sát hoặc chưa có phản hồi."
    return {
        "project_name": ctx.project_name.strip() or "Sản phẩm AI mới",
        "target_role": role_label,
        "persona": ctx.persona.strip() or role_label,
        "problem": ctx.problem.strip() or "(chưa điền trong Product thinking)",
        "leverage": ctx.leverage.strip() or "(chưa điền vai trò của AI)",
        "scope": ctx.scope.strip() or "(MVP thử nghiệm 4 tuần cho 1 luồng chính)",
        "metric": ctx.metric.strip() or "(thời gian tiết kiệm & tỉ lệ người dùng hài lòng)",
        "overview": ctx.overview.strip() or "(chưa có mô tả tổng quan)",
        "survey_stats": stats_json,
    }


def _clean_slides(raw_slides: list[PitchSlide], limit: int = 10) -> list[PitchSlide]:
    capped = min(max(limit, 3), 10)
    cleaned: list[PitchSlide] = []
    for idx, slide in enumerate(raw_slides[:capped]):
        cleaned.append(
            PitchSlide(
                id=f"s{idx}",
                kicker=_clip(slide.kicker, 80, f"Slide {idx + 1}"),
                title=_clip(slide.title, 140, f"Nội dung {idx + 1}"),
                body=slide.body.strip()[:800] or "Cần bổ sung nội dung.",
                highlight=_clip(slide.highlight, 140, ""),
            )
        )
    return cleaned


def _rule_based_deck(ctx: ProblemContextIn, stats: SurveyStatsOut | None, slide_count: int) -> PitchDeckDraftOut:
    project = _clip(ctx.project_name, 90, "Sản phẩm AI")
    role_label = _resolve_target_role(ctx)
    note, lines = _format_stats_summary(stats)
    evidence_body = (
        note + ("\n" + "\n".join(lines[:2]) if lines else "")
        if stats and stats.total_responses
        else "Chưa có dữ liệu khảo sát. Cần thu phản hồi thực tế trước khi chốt đầu tư."
    )
    evidence_highlight = (
        f"{stats.real_responses} thật · {stats.sample_responses} mẫu"
        if stats and stats.total_responses
        else "Cần thu khảo sát thật"
    )
    slides = [
        PitchSlide(
            id="s0",
            kicker="Tổng quan",
            title=project,
            body=_clip(ctx.overview or ctx.problem, 220, f"Giải pháp AI hỗ trợ {role_label} xử lý công việc cốt lõi."),
            highlight=f"Đối tượng: {role_label}",
        ),
        PitchSlide(
            id="s1",
            kicker="Nỗi đau thật",
            title=f"{role_label} đang gặp vấn đề gì",
            body=_clip(ctx.problem, 240, f"{role_label} mất nhiều thời gian tra cứu và xử lý thủ công lặp lại."),
            highlight="Từ Product thinking",
        ),
        PitchSlide(
            id="s2",
            kicker="Đòn bẩy AI",
            title="AI giúp ở khâu nào",
            body=_clip(
                ctx.leverage, 240, "AI tóm tắt ngữ cảnh, gợi ý bản nháp có căn cứ để con người kiểm soát và duyệt."
            ),
            highlight="Con người luôn duyệt cuối",
        ),
        PitchSlide(
            id="s3",
            kicker="Bằng chứng khảo sát",
            title="Tín hiệu từ người dùng",
            body=_clip(evidence_body, 280, note),
            highlight=evidence_highlight,
        ),
        PitchSlide(
            id="s4",
            kicker="Phạm vi MVP",
            title="Thử nghiệm gọn trong 4 tuần",
            body=_clip(ctx.scope, 240, "Tập trung đúng một luồng đau nhất cho một nhóm người dùng mục tiêu."),
            highlight="MVP 1 luồng cốt lõi",
        ),
        PitchSlide(
            id="s5",
            kicker="Đo thành công",
            title="Chỉ số đánh giá hiệu quả",
            body=_clip(ctx.metric, 240, "Theo dõi thời gian hoàn thành công việc và tỉ lệ bản nháp được dùng lại."),
            highlight="Đo trước & sau dùng thử",
        ),
        PitchSlide(
            id="s6",
            kicker="Bước tiếp theo",
            title="Thử nghiệm thực tế cùng nhóm đầu tiên",
            body=f"Mời 5–10 {role_label} dùng thử bản MVP trong 2 tuần và thu phản hồi thật để tinh chỉnh.",
            highlight="Kế hoạch tuần tới",
        ),
    ]
    return PitchDeckDraftOut(
        title=f"Pitching: {project}",
        survey_slug=stats.slug if stats else "",
        slides=slides[: min(max(slide_count, 3), 10)],
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
        cleaned = _clean_slides(generated.slides, slide_count)
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

    script = (
        f"0:00 Mở đầu\n"
        f"Hãy tưởng tượng một {role_label} đang kẹt giữa lúc cao điểm và gặp vấn đề: {problem}\n\n"
        f"0:30 Vấn đề thật\n"
        f"Hiện tại họ phải xoay xở thủ công, mất thời gian và dễ bỏ sót.\n\n"
        f"1:10 Giải pháp & đòn bẩy AI — {project}\n"
        f"{leverage}. Demo trực tiếp 1 luồng gọn trong phạm vi: {ctx.scope or 'MVP 1 vai chính'}.\n\n"
        f"1:55 Bằng chứng & cách đo\n"
        f"{note}\nChỉ số theo dõi: {metric}.\n\n"
        f"2:30 Lời mời\n"
        f"Nhóm đang tìm 5–10 {role_label} thử nghiệm bản đầu tiên trong 2 tuần tới."
    )
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
    return PitchAssetsOut(script=script, ads=ads, source="fallback")


def generate_pitch_assets(ctx: ProblemContextIn, stats: SurveyStatsOut | None = None) -> PitchAssetsOut:
    """Sinh kịch bản nói 3 phút & bài quảng cáo chung kèm placeholder qua LLM hoặc luật dự phòng."""
    prompt = render("pitch_assets", **_prompt_ctx_fields(ctx, stats))
    try:
        generated = llm.structured(_GeneratedAssets, prompt, node="pitch_assets")
        ads = [
            PitchAdPost(
                id="ad0",
                channel=_clip(ad.channel, 60, "Bài đăng chung"),
                hook=ad.hook.strip()[:300],
                body=ad.body.strip()[:1600],
                cta=ad.cta.strip()[:240],
                placeholders=[p.strip()[:60] for p in ad.placeholders if p.strip()][:6],
            )
            for ad in generated.ads[:1]
        ]
        return PitchAssetsOut(script=generated.script.strip()[:5000], ads=ads, source="llm")
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
        return PitchOverviewOut(
            overview=generated.overview.strip()[:4000],
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

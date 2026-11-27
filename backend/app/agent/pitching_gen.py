"""Sinh form khảo sát theo nguyên tắc 1 Form = 1 Vai chính, qua cổng LLM chung hoặc luật dự phòng."""

import logging

from pydantic import BaseModel, Field

from app.agent import llm
from app.agent.prompts import render
from app.schemas import ProblemContextIn, SurveyDraftOut, SurveyQuestion

logger = logging.getLogger("app.pitching")


class _GeneratedSurvey(BaseModel):
    """Schema structured output trả về từ LLM khi sinh form khảo sát."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=600)
    questions: list[SurveyQuestion] = Field(min_length=3, max_length=8)


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
                type=q_type,
                q=q.q.strip()[:300],
                options=opts,
                required=q.required,
            )
        )
    return cleaned


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

    questions = [
        SurveyQuestion(
            id="q0",
            type="choice",
            q=prof["q0"],
            options=["Chưa gặp lần nào", "1–2 lần", "3–5 lần", "Gần như mỗi ngày"],
            required=True,
        ),
        SurveyQuestion(
            id="q1",
            type="choice",
            q=prof["q1"],
            options=["Dưới 5 phút", "5–15 phút", "15–30 phút", "Trên 30 phút"],
            required=True,
        ),
        SurveyQuestion(id="q2", type="multi", q=prof["q2"], options=prof["q2_opts"], required=True),
        SurveyQuestion(id="q3", type="scale", q=prof["q3"], options=[], required=True),
        SurveyQuestion(id="q4", type="text", q=prof["q4"], options=[], required=True),
    ]
    return SurveyDraftOut(
        title=f"Khảo sát ({role_label}): {project}",
        description=f"Khảo sát nhanh 1 phút dành riêng cho {role_label} (không thu thông tin cá nhân).",
        target_role=role_label,
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
            return SurveyDraftOut(
                title=generated.title.strip()[:200],
                description=generated.description.strip()[:600],
                target_role=role_label,
                questions=cleaned,
                source="llm",
            )
    except llm.LLMUnavailableError:
        pass
    except Exception as exc:  # noqa: BLE001 — fallback theo đúng vai mục tiêu, không làm gián đoạn
        logger.warning("survey_generate: LLM lỗi (%s), dùng luật dự phòng", type(exc).__name__)
    return rule_based_survey(ctx)

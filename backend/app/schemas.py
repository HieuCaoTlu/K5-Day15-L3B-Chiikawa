"""Schema request/response của API (Pydantic). FE đọc qua /docs (OpenAPI) — đây là hợp đồng API."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ItemIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    status: Literal["todo", "doing", "done"] = "todo"


class ItemOut(ItemIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class RunCreate(BaseModel):
    request: str = Field(min_length=1, max_length=2000)
    session_id: str | None = Field(default=None, max_length=64, description="Phiên chat (FE tự sinh, lưu localStorage)")


class ReviewIn(BaseModel):
    approved: bool
    note: str = Field(default="", max_length=500)


RunStatus = Literal["running", "blocked", "needs_info", "waiting_review", "approved", "rejected", "error"]


class RunUsageOut(BaseModel):
    """Token và chi phí của một lượt chạy (cộng từ bảng llm_calls). Khung `python run.py` dùng để đo."""

    calls: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    models: list[str]


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str | None = None
    request: str
    status: RunStatus
    source: str | None = None
    proposal: dict | None = None
    result: dict | None = None
    created_at: datetime
    updated_at: datetime


class ProblemContextIn(BaseModel):
    """Ngữ cảnh bài toán đang làm để sinh form khảo sát."""

    project_name: str = Field(min_length=1, max_length=200)
    target_role: str = Field(default="", max_length=120)
    persona: str = Field(default="", max_length=500)
    problem: str = Field(default="", max_length=1000)
    leverage: str = Field(default="", max_length=1000)
    scope: str = Field(default="", max_length=1000)
    metric: str = Field(default="", max_length=500)
    overview: str = Field(default="", max_length=1500)


class SurveySection(BaseModel):
    """Một phần (section) gom nhóm câu hỏi trong form khảo sát."""

    id: str = Field(min_length=1, max_length=24)
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=400)


class SurveyQuestion(BaseModel):
    """Một câu hỏi trong form khảo sát (thang 1–5, trắc nghiệm 1/nhiều lựa chọn hoặc mở)."""

    id: str = Field(min_length=1, max_length=20)
    section_id: str = Field(default="", max_length=24)
    type: Literal["scale", "choice", "multi", "text"]
    q: str = Field(min_length=3, max_length=300)
    options: list[str] = Field(default_factory=list, max_length=6)
    required: bool = True


class SurveyDraftOut(BaseModel):
    """Bản nháp form khảo sát do AI hoặc luật dự phòng sinh theo bài toán."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=600)
    target_role: str = Field(default="", max_length=120)
    sections: list[SurveySection] = Field(default_factory=list, max_length=8)
    questions: list[SurveyQuestion] = Field(min_length=3, max_length=8)
    source: Literal["llm", "fallback"]


class SurveyPublishIn(BaseModel):
    """Dữ liệu nhóm chỉnh/duyệt để publish thành link khảo sát công khai."""

    project_name: str = Field(min_length=1, max_length=200)
    target_role: str = Field(default="", max_length=120)
    problem_context: dict = Field(default_factory=dict)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=600)
    sections: list[SurveySection] = Field(default_factory=list, max_length=8)
    questions: list[SurveyQuestion] = Field(min_length=1, max_length=10)


class SurveyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    project_name: str
    target_role: str = ""
    problem_context: dict
    title: str
    description: str
    sections: list[SurveySection] = Field(default_factory=list)
    questions: list[SurveyQuestion]
    published: bool
    response_count: int = 0
    created_at: datetime
    updated_at: datetime


class SurveyResponseIn(BaseModel):
    respondent_role: str = Field(default="", max_length=120)
    answers: dict[str, str | list[str]] = Field(default_factory=dict)
    is_sample: bool = False


class SurveyResponseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    survey_id: str
    respondent_role: str
    answers: dict[str, str | list[str]]
    is_sample: bool
    created_at: datetime


class SurveyOptionStat(BaseModel):
    """Thống kê từng phương án của một câu hỏi khảo sát."""

    label: str
    count: int
    pct: float


class SurveyQuestionStat(BaseModel):
    """Thống kê tổng hợp theo từng câu hỏi (tính bằng Python, không dùng LLM)."""

    id: str
    type: Literal["scale", "choice", "multi", "text"]
    q: str
    answered: int
    avg: float | None = None
    options: list[SurveyOptionStat] = Field(default_factory=list)
    texts: list[str] = Field(default_factory=list)


class SurveyStatsOut(BaseModel):
    """Dữ liệu dashboard khảo sát tự động cập nhật theo slug."""

    survey_id: str
    slug: str
    title: str
    target_role: str = ""
    total_responses: int
    real_responses: int
    sample_responses: int
    last_response_at: datetime | None = None
    questions: list[SurveyQuestionStat]


class PitchSlide(BaseModel):
    """Một slide trong bộ Pitching HTML (giới hạn tối đa 10 slide mỗi bộ)."""

    id: str = Field(default="s0", min_length=1, max_length=24)
    kicker: str = Field(default="", max_length=80)
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=800)
    highlight: str = Field(default="", max_length=140)


class PitchAdPost(BaseModel):
    """Một bài quảng cáo mẫu có sẵn placeholder để nhóm điền link/chi tiết trước khi đăng."""

    id: str = Field(default="ad0", min_length=1, max_length=24)
    channel: str = Field(min_length=1, max_length=60)
    hook: str = Field(default="", max_length=300)
    body: str = Field(min_length=1, max_length=1600)
    cta: str = Field(default="", max_length=240)
    placeholders: list[str] = Field(default_factory=list, max_length=8)


class PitchDeckGenerateIn(BaseModel):
    """Ngữ cảnh tạo nháp bộ slide thuyết trình (<= 10 slide) từ ý tưởng & khảo sát."""

    context: ProblemContextIn
    survey_slug: str = Field(default="", max_length=64)
    slide_count: int = Field(default=7, ge=3, le=10)


class PitchDeckDraftOut(BaseModel):
    """Bản nháp bộ slide Pitching do Gemini hoặc luật dự phòng tổng hợp."""

    title: str = Field(min_length=1, max_length=200)
    survey_slug: str = ""
    slides: list[PitchSlide] = Field(min_length=1, max_length=10)
    source: Literal["llm", "fallback"]


class PitchDeckPublishIn(BaseModel):
    """Dữ liệu nhóm lưu/cập nhật để publish link trình chiếu Pitching HTML công khai."""

    project_name: str = Field(min_length=1, max_length=200)
    survey_slug: str = Field(default="", max_length=64)
    title: str = Field(min_length=1, max_length=200)
    slides: list[PitchSlide] = Field(min_length=1, max_length=10)
    script: str = Field(default="", max_length=5000)
    ads: list[PitchAdPost] = Field(default_factory=list, max_length=6)


class PitchDeckOut(BaseModel):
    """Bộ slide & tài sản pitching đã lưu, truy cập công khai tại /pitch?slug=..."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    project_name: str
    survey_slug: str = ""
    title: str
    slides: list[PitchSlide]
    script: str = ""
    ads: list[PitchAdPost] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PitchAssetsGenerateIn(BaseModel):
    """Ngữ cảnh sinh bài quảng cáo chung kèm placeholder."""

    context: ProblemContextIn
    survey_slug: str = Field(default="", max_length=64)


class PitchAssetsOut(BaseModel):
    """Bài quảng cáo chung có placeholder."""

    script: str = ""
    ads: list[PitchAdPost] = Field(min_length=1, max_length=6)
    source: Literal["llm", "fallback"]


class PitchOverviewIn(BaseModel):
    """Ngữ cảnh tạo AI overview từ thống kê khảo sát."""

    context: ProblemContextIn
    survey_slug: str = Field(default="", max_length=64)


class PitchOverviewOut(BaseModel):
    """Tóm tắt tín hiệu khảo sát và 3 việc nên làm tiếp."""

    overview: str
    total_responses: int = 0
    real_responses: int = 0
    sample_responses: int = 0
    source: Literal["llm", "fallback"]

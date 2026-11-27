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


RunStatus = Literal["running", "blocked", "waiting_review", "approved", "rejected", "error"]


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


class SurveyQuestion(BaseModel):
    """Một câu hỏi trong form khảo sát (thang 1–5, trắc nghiệm 1/nhiều lựa chọn hoặc mở)."""

    id: str = Field(min_length=1, max_length=20)
    type: Literal["scale", "choice", "multi", "text"]
    q: str = Field(min_length=3, max_length=300)
    options: list[str] = Field(default_factory=list, max_length=6)
    required: bool = True


class SurveyDraftOut(BaseModel):
    """Bản nháp form khảo sát do AI hoặc luật dự phòng sinh theo bài toán."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=600)
    target_role: str = Field(default="", max_length=120)
    questions: list[SurveyQuestion] = Field(min_length=3, max_length=8)
    source: Literal["llm", "fallback"]


class SurveyPublishIn(BaseModel):
    """Dữ liệu nhóm chỉnh/duyệt để publish thành link khảo sát công khai."""

    project_name: str = Field(min_length=1, max_length=200)
    target_role: str = Field(default="", max_length=120)
    problem_context: dict = Field(default_factory=dict)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=600)
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

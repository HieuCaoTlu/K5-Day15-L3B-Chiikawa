import json
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Annotated, Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

VIETNAM = timezone(timedelta(hours=7))
Status = Literal["todo", "doing", "review", "done"]
Login = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=25)]
Criterion = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=360)]
Story = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=420)]


def now() -> datetime:
    return datetime.now(UTC)


def utc(value: datetime) -> datetime:
    # SQLite trả datetime không kèm múi giờ. Các timestamp lưu trong DB đều là UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Input(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class MemberInput(Input):
    github_id: str | None = Field(default=None, max_length=48)
    login: Login
    name: str = Field(min_length=1, max_length=80)
    experience: str = Field(min_length=1, max_length=700)
    tags: list[Tag] = Field(max_length=10)
    avatar: int = Field(ge=0, le=7)


class Roster(Input):
    members: list[MemberInput] = Field(min_length=1, max_length=16)


class SetupStart(Input):
    setup_code: str | None = Field(default=None, max_length=64)
    organization: Login | None = None


class JoinInput(Input):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=80)
    experience: str = Field(min_length=1, max_length=700)
    tags: list[Tag] = Field(max_length=10)
    avatar: int = Field(ge=0, le=7)


Role = Literal["Product owner", "AI engineer", "Full-stack", "UX và pitching"]
FileKind = Literal["deck", "yc", "video", "onepager", "evidence"]
HttpsLink = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^https://\S+$", max_length=500)]
Amount = Annotated[float, Field(ge=0, le=1e9, allow_inf_nan=False)]


class StackRow(Input):
    layer: str = Field(min_length=1, max_length=60)
    choice: str = Field(max_length=200)
    reason: str = Field(max_length=300)


class Cost(Input):
    teams: Amount | None = None
    tickets: Amount | None = None
    inTok: Amount | None = None  # noqa: N815
    outTok: Amount | None = None  # noqa: N815
    priceIn: Amount | None = None  # noqa: N815
    priceOut: Amount | None = None  # noqa: N815
    infra: Amount | None = None
    price: Amount | None = None


class BoardInput(Input):
    version: int = Field(ge=0)
    overview: str = Field(max_length=2000)
    stories: list[Story] = Field(max_length=12)
    roles: dict[Role, Annotated[str, StringConstraints(max_length=48)]]
    links: dict[FileKind, HttpsLink]
    stack: list[StackRow] = Field(max_length=12)
    cost: Cost
    revenue: str = Field(max_length=1000)


ItemId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,40}$")]
Measure = Annotated[float, Field(ge=-1e12, le=1e12, allow_inf_nan=False)]
Count = Annotated[int, Field(ge=0, le=1_000_000_000)]


class Metric(Input):
    id: ItemId
    name: str = Field(max_length=60)
    baseline: Measure | None = None
    target: Measure
    unit: str = Field(max_length=12)
    direction: Literal["up", "down"]
    kind: Literal["value", "ai", "feasibility"]
    method: str = Field(default="", max_length=200)
    rule: str = Field(default="", max_length=200)
    origin: Literal["agent", "tu", "tay"] = Field(default="tay", alias="from")


class QualityRun(Input):
    id: ItemId
    at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
    model: str = Field(min_length=1, max_length=80)
    values: dict[ItemId, Measure] = Field(max_length=20)
    passed: Count | None = None
    total: Count | None = None
    estTok: Count | None = None  # noqa: N815
    actTok: Count | None = None  # noqa: N815
    note: str = Field(default="", max_length=300)

    @model_validator(mode="after")
    def passed_within_total(self):
        if self.passed is not None and self.total is not None and self.passed > self.total:
            raise ValueError("Số test pass không được lớn hơn tổng số test.")
        return self


class QualityCost(Input):
    pricePerM: Amount | None = None  # noqa: N815
    apiCalls: Amount | None = None  # noqa: N815
    infra: Amount | None = None
    price: Amount | None = None
    teams: Amount | None = None
    pricePerCall: Amount | None = None  # noqa: N815
    setupFee: Amount | None = None  # noqa: N815
    newCustomers: Amount | None = None  # noqa: N815


class MoneyTip(Input):
    id: ItemId
    title: str = Field(min_length=1, max_length=120)
    how: str = Field(min_length=1, max_length=400)
    why: str = Field(default="", max_length=240)


class QualityInput(Input):
    version: int = Field(ge=0)
    metrics: list[Metric] = Field(max_length=20)
    runs: list[QualityRun] = Field(max_length=200)
    source: str = Field(max_length=2000)
    nature: Literal["behavior", "productivity", "other"]
    revenueModel: Literal["sub", "usage", "setup"]  # noqa: N815
    cost: QualityCost
    tips: list[MoneyTip] = Field(default_factory=list, max_length=8)


class MaintenanceJob(Input):
    id: ItemId
    title: str = Field(min_length=1, max_length=120)
    every: int = Field(ge=1, le=365)
    next: date
    owner: str = Field(default="", max_length=48)
    runs: Count = 0


class MaintenanceSuggestion(Input):
    id: ItemId
    title: str = Field(min_length=1, max_length=120)
    every: int = Field(ge=1, le=365)
    why: str = Field(max_length=240)


class MaintainInput(Input):
    version: int = Field(ge=0)
    schedule: list[MaintenanceJob] = Field(max_length=100)
    suggest: list[MaintenanceSuggestion] = Field(max_length=10)


class ProjectDone(Input):
    product: bool
    planning: bool
    pitching: bool
    quality: bool
    maintaining: bool


class ProjectInput(Input):
    version: int = Field(ge=0)
    name: str = Field(max_length=80)
    done: ProjectDone


class ThinkingMessage(Input):
    who: Literal["me", "agent"]
    text: str = Field(max_length=4000)


class ThinkingInput(Input):
    version: int = Field(ge=0)
    session: str = Field(pattern=r"^[A-Za-z0-9_-]{0,64}$")
    msgs: list[ThinkingMessage] = Field(max_length=60)


class ScoreItem(Input):
    text: str = Field(max_length=4000)
    score: int = Field(ge=0, le=5)


class ChatMessage(Input):
    who: str = Field(max_length=48)
    text: str = Field(max_length=4000)


class PitchingInput(Input):
    version: int = Field(ge=0)
    # Bản nháp Pitching do giao diện quản lý (form, slide, bài đăng) nên chỉ giới hạn kích thước.
    pitch: dict[str, Any]
    score: dict[Annotated[str, StringConstraints(max_length=40)], ScoreItem] = Field(max_length=20)
    chat: list[ChatMessage] = Field(max_length=60)

    @model_validator(mode="after")
    def draft_size(self):
        if len(json.dumps(self.pitch, ensure_ascii=False).encode()) > 500_000:
            raise ValueError("Bản nháp Pitching quá lớn.")
        return self


class RepoVersion(Input):
    repo_version: int = Field(ge=0)


class RepoSelection(RepoVersion):
    repo_id: str = Field(min_length=1, max_length=48)
    reset_confirmed: bool = False


class Brief(Input):
    overview: str = Field(min_length=5, max_length=2000)
    stories: list[Story] = Field(default_factory=list, max_length=12)
    starts_on: date
    ends_on: date

    @model_validator(mode="after")
    def valid_window(self):
        if not 0 <= (self.ends_on - self.starts_on).days < 84:
            raise ValueError("Chọn thời gian dự án từ 1 đến 84 ngày.")
        return self


class TaskFields(Input):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=1400)
    criteria: list[Criterion] = Field(min_length=1, max_length=6)
    deadline: AwareDatetime
    assignee_id: str | None = Field(default=None, max_length=48)
    status: Status = "todo"


class ProposedTask(TaskFields):
    skills: list[Tag] = Field(default_factory=list, max_length=6)


class ProposedSprint(Input):
    title: str = Field(min_length=1, max_length=120)
    goal: str = Field(min_length=1, max_length=500)
    starts_on: date
    ends_on: date
    tasks: list[ProposedTask] = Field(min_length=1, max_length=18)


class Plan(Input):
    sprints: list[ProposedSprint] = Field(min_length=1, max_length=12)


class DraftInput(RepoVersion):
    brief: Brief


class DraftVersion(RepoVersion):
    draft_id: str = Field(min_length=32, max_length=32)


class ApplyInput(DraftVersion):
    plan: Plan


class TaskUpdate(RepoVersion):
    task: TaskFields


class TaskMove(RepoVersion):
    status: Status


class PRLink(RepoVersion):
    task_id: int | None = Field(ge=1)


class DemoPR(RepoVersion):
    number: int = Field(ge=1, le=99999)
    title: str = Field(min_length=1, max_length=240)
    author_id: str = Field(min_length=1, max_length=48)
    state: Literal["draft", "open", "merged", "closed"]


class PushKeys(Input):
    p256dh: str = Field(pattern=r"^[A-Za-z0-9_-]{87}=?$")
    auth: str = Field(pattern=r"^[A-Za-z0-9_-]{22}(==)?$")


class PushSubscription(Input):
    endpoint: str = Field(min_length=1, max_length=2048)
    keys: PushKeys


class PushEndpoint(Input):
    endpoint: str | None = Field(default=None, min_length=1, max_length=2048)

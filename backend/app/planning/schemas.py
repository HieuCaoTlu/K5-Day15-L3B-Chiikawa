from datetime import UTC, date, datetime, timedelta, timezone
from typing import Annotated, Literal

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


class ApplyInput(RepoVersion):
    draft_id: str = Field(min_length=32, max_length=32)
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

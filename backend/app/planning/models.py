"""Dữ liệu riêng của Planning. Các bảng được tạo qua app.db.init_db."""

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PlanningGithubApp(Base):
    """GitHub App tạo từ manifest. Chỉ có một dòng (id=1); cột secrets đã mã hóa."""

    __tablename__ = "planning_github_app"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    app_id: Mapped[str] = mapped_column(String(32))
    slug: Mapped[str] = mapped_column(String(100))
    client_id: Mapped[str] = mapped_column(String(100))
    site_url: Mapped[str] = mapped_column(String(300))
    secrets: Mapped[str] = mapped_column(Text)


class PlanningSetupState(Base):
    __tablename__ = "planning_setup_states"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    site_url: Mapped[str] = mapped_column(String(300))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PlanningBoard(Base):
    """Nội dung tab Planning do trưởng nhóm nhập; version chống ghi đè bản mới."""

    __tablename__ = "planning_boards"

    team_id: Mapped[str] = mapped_column(ForeignKey("planning_teams.id"), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)
    version: Mapped[int]


class PlanningInvite(Base):
    __tablename__ = "planning_invites"

    team_id: Mapped[str] = mapped_column(ForeignKey("planning_teams.id"), primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True)


class PlanningJoinAttempt(Base):
    __tablename__ = "planning_join_attempts"

    github_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    failures: Mapped[int]


class PlanningLog(Base):
    """Nhật ký task đổi tiến độ do pull request."""

    __tablename__ = "planning_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("planning_teams.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    message: Mapped[str] = mapped_column(String(300))


class PlanningTeam(Base):
    __tablename__ = "planning_teams"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    repo_id: Mapped[str | None] = mapped_column(String(48), index=True)
    installation_id: Mapped[str | None] = mapped_column(String(32))
    repo_name: Mapped[str | None] = mapped_column(String(240))
    target_branch: Mapped[str | None] = mapped_column(String(255))
    repo_access: Mapped[bool] = mapped_column(Boolean, default=False)
    repo_version: Mapped[int] = mapped_column(default=0)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    draft: Mapped[dict | None] = mapped_column(JSON)


class PlanningMember(Base):
    __tablename__ = "planning_members"

    github_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("planning_teams.id"), index=True)
    login: Mapped[str] = mapped_column(String(39))
    name: Mapped[str] = mapped_column(String(80))
    experience: Mapped[str] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(JSON)
    avatar: Mapped[int]
    leader: Mapped[bool] = mapped_column(Boolean, default=False)


class PlanningSession(Base):
    __tablename__ = "planning_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    github_id: Mapped[str] = mapped_column(String(48), index=True)
    name: Mapped[str] = mapped_column(String(80))
    login: Mapped[str] = mapped_column(String(39))
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    repo_choices: Mapped[list[dict] | None] = mapped_column(JSON)
    choices_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PlanningSprint(Base):
    __tablename__ = "planning_sprints"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("planning_teams.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    goal: Mapped[str] = mapped_column(Text)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)


class PlanningTask(Base):
    __tablename__ = "planning_tasks"
    # Mã task có thể xuất hiện trong PR cũ, nên không được tái sử dụng sau khi đổi repo.
    __table_args__ = {"sqlite_autoincrement": True}

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("planning_teams.id"), index=True)
    sprint_id: Mapped[int] = mapped_column(ForeignKey("planning_sprints.id"), index=True)
    assignee_id: Mapped[str] = mapped_column(ForeignKey("planning_members.github_id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    criteria: Mapped[list[str]] = mapped_column(JSON)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(12), default="todo")
    pr_status: Mapped[str | None] = mapped_column(String(12))
    primary_pr: Mapped[int | None]
    reminders: Mapped[list[str]] = mapped_column(JSON, default=list)

    @property
    def progress(self) -> str:
        return "done" if self.status == "done" else self.pr_status or self.status


class PlanningPullRequest(Base):
    __tablename__ = "planning_pull_requests"
    __table_args__ = (UniqueConstraint("team_id", "number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("planning_teams.id"), index=True)
    number: Mapped[int]
    task_id: Mapped[int | None] = mapped_column(ForeignKey("planning_tasks.id"), index=True)
    author_id: Mapped[str] = mapped_column(String(48))
    author_login: Mapped[str] = mapped_column(String(39))
    title: Mapped[str] = mapped_column(String(240))
    base_branch: Mapped[str] = mapped_column(String(255))
    state: Mapped[str] = mapped_column(String(12))  # draft | open | merged | closed
    linkage: Mapped[str] = mapped_column(String(12), default="pending")  # pending | auto | confirmed | ignored
    note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PlanningDelivery(Base):
    __tablename__ = "planning_deliveries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class PlanningSubscription(Base):
    __tablename__ = "planning_subscriptions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    github_id: Mapped[str] = mapped_column(String(48), index=True)
    data: Mapped[dict] = mapped_column(JSON)

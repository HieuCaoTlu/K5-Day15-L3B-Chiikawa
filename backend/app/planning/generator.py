"""Tạo sprint nháp và phân công bằng thẻ kỹ năng cùng số task đang mở."""

import json
import logging
import re
from collections import Counter
from datetime import date, datetime, time, timedelta

from app.agent import llm
from app.agent.guardrails import check_input
from app.agent.prompts import render
from app.config import get_settings
from app.planning.models import PlanningMember
from app.planning.schemas import VIETNAM, Brief, Plan, ProposedSprint, ProposedTask, TaskFields

logger = logging.getLogger(__name__)


def check_task(task: TaskFields, starts_on: date, ends_on: date, member_ids: set[str]) -> None:
    if task.assignee_id not in member_ids:
        raise ValueError("Chọn người phụ trách trong đội cho từng task.")
    if not starts_on <= task.deadline.astimezone(VIETNAM).date() <= ends_on:
        raise ValueError("Deadline của task phải nằm trong thời gian sprint.")


def check_plan(plan: Plan, brief: Brief, member_ids: set[str]) -> None:
    last_end = None
    for sprint in plan.sprints:
        inside_window = brief.starts_on <= sprint.starts_on <= sprint.ends_on <= brief.ends_on
        if not inside_window or (last_end is not None and sprint.starts_on <= last_end):
            raise ValueError("Các sprint phải theo thứ tự, nằm trong thời gian dự án và không chồng ngày.")
        for task in sprint.tasks:
            check_task(task, sprint.starts_on, sprint.ends_on, member_ids)
        last_end = sprint.ends_on


def _story_title(story: str) -> str:
    requested = re.split(r",\s*tôi muốn\s+", story, maxsplit=1, flags=re.I)[-1]
    title = re.split(r"\s+để\s+", requested, maxsplit=1, flags=re.I)[0].strip()[:160]
    return title[0].upper() + title[1:] if title else "Triển khai yêu cầu"


def _fallback(brief: Brief, skills: list[str]) -> Plan:
    stories = brief.stories or [brief.overview]
    work = [
        (
            "Chốt phạm vi thực hiện",
            f"Xác định phần cần hoàn thành để đạt mục tiêu: {brief.overview[:1200]}",
            ["Liệt kê các luồng cần có và kết quả mong đợi của từng luồng."],
        ),
        *[
            (
                _story_title(story).rstrip(".") or "Triển khai yêu cầu",
                f"Tạo một luồng dùng được cho yêu cầu: {story[:1150]}",
                ["Minh họa luồng từ đầu đến kết quả bằng dữ liệu mẫu.", "Ghi bước để người duyệt kiểm tra lại."],
            )
            for story in stories
        ],
        (
            "Kiểm tra và bàn giao",
            "Chạy qua từng luồng đã chọn, ghi lỗi còn lại và chuẩn bị hướng dẫn chạy.",
            ["Có hướng dẫn chạy và kết quả kiểm tra cho từng luồng đã triển khai."],
        ),
    ]
    days = (brief.ends_on - brief.starts_on).days + 1
    sprint_count = min(len(work), (days + 6) // 7)
    sprints = []
    for i in range(sprint_count):
        start = brief.starts_on + timedelta(days=days * i // sprint_count)
        end = brief.starts_on + timedelta(days=days * (i + 1) // sprint_count - 1)
        group = work[len(work) * i // sprint_count : len(work) * (i + 1) // sprint_count]
        sprint_days = (end - start).days + 1
        tasks = [
            ProposedTask(
                title=title,
                description=description,
                criteria=criteria,
                deadline=datetime.combine(
                    start + timedelta(days=(sprint_days * position - 1) // len(group)),
                    time(17),
                    VIETNAM,
                ),
                skills=[tag for tag in skills if re.search(r"(?<!\w)" + re.escape(tag) + r"(?!\w)", description, re.I)][
                    :6
                ],
            )
            for position, (title, description, criteria) in enumerate(group, start=1)
        ]
        sprints.append(
            ProposedSprint(title=f"Sprint {i + 1}", goal=group[-1][0], starts_on=start, ends_on=end, tasks=tasks)
        )
    return Plan(sprints=sprints)


NUMBERED = re.compile(r"^Sprint\s+\d+", re.I)


def sprint_offset(titles: list[str]) -> int:
    """Số sprint đã dùng: lấy số lớn hơn giữa số lượng sprint và số lớn nhất trong tên."""
    numbers = [int(found.group().split()[-1]) for title in titles if (found := NUMBERED.match(title))]
    return max([len(titles), *numbers])


def _number_sprints(plan: Plan, previous: int) -> None:
    """Bản nháp luôn đếm từ 1 (cả luật dự phòng lẫn model), nên đánh số tiếp theo sprint đã giao."""
    for position, sprint in enumerate(plan.sprints, start=previous + 1):
        sprint.title = NUMBERED.sub(f"Sprint {position}", sprint.title)[:120]


def _assign(plan: Plan, members: list[PlanningMember], open_tasks: Counter[str]) -> None:
    member_tags = {m.github_id: {tag.casefold() for tag in m.tags} for m in members}
    for sprint in plan.sprints:
        for task in sprint.tasks:
            tags = {tag.casefold() for tag in task.skills}
            member = min(
                members,
                key=lambda m: (
                    -len(tags & member_tags[m.github_id]),
                    open_tasks[m.github_id],
                    m.login.casefold(),
                ),
            )
            task.assignee_id = member.github_id
            task.status = "todo"
            open_tasks[member.github_id] += 1


def make_plan(
    brief: Brief, members: list[PlanningMember], open_tasks: Counter[str], demo: bool, previous: int = 0
) -> tuple[Plan, str]:
    settings = get_settings()
    skills = sorted(
        {tag for member in members for tag in member.tags if not check_input(tag, 25)},
        key=str.casefold,
    )
    member_ids = {m.github_id for m in members}
    if not (demo or settings.demo_mode or settings.is_mocked("planning") or not settings.google_api_key):
        try:
            prompt = render("planning", brief=brief.model_dump_json(), skills=json.dumps(skills, ensure_ascii=False))
            plan = llm.structured(Plan, prompt, node="planning")
            _assign(plan, members, open_tasks.copy())
            check_plan(plan, brief, member_ids)
            _number_sprints(plan, previous)
            return plan, "llm"
        except Exception as exc:  # noqa: BLE001 — dùng luật dự phòng nếu model lỗi hoặc trả sai ngày
            logger.info("Kế hoạch dùng luật dự phòng (%s)", type(exc).__name__)
    plan = _fallback(brief, skills)
    _assign(plan, members, open_tasks)
    check_plan(plan, brief, member_ids)
    _number_sprints(plan, previous)
    return plan, "fallback"

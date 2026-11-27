"""Dữ liệu mẫu, chạy lúc khởi động khi bảng còn rỗng (SEED_ON_START=true). Idempotent."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Item

SEED_ITEMS = [
    {"title": "Chốt đề tài và user flow", "description": "Vote 3–5 ý tưởng, không quá 45 phút", "status": "done"},
    {"title": "Luồng chính chạy end-to-end", "description": "UI → API → agent → DB, xấu cũng được", "status": "doing"},
    {
        "title": "Bước HITL: người duyệt đề xuất của AI",
        "description": "interrupt() ở node human_review",
        "status": "todo",
    },
    {"title": "Eval 15–20 ca vàng", "description": "Số liệu 'agent đúng X%' cho pitch", "status": "todo"},
]


def seed(session: Session) -> int:
    if session.scalar(select(func.count()).select_from(Item)):
        return 0
    session.add_all(Item(**row) for row in SEED_ITEMS)
    session.commit()
    return len(SEED_ITEMS)

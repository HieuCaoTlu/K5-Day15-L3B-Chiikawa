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

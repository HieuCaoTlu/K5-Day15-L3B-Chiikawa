"""Cấu hình đọc từ biến môi trường / file .env (ở backend/ hoặc thư mục gốc repo)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_name: str = "Hackathon App"
    app_env: str = "development"  # development | test | production (production ẩn /docs)
    database_url: str = "sqlite:///./data/app.db"  # docker compose ghi đè sang Postgres
    cors_origins: str = "http://localhost:3000"
    seed_on_start: bool = True

    # Gemini: Flash cho hầu hết bước, Pro chỉ cho bước suy luận khó. Trống key → luật dự phòng (mock-first).
    google_api_key: str = ""
    gemini_model_fast: str = "gemini-2.5-flash"
    gemini_model_pro: str = "gemini-2.5-pro"
    llm_timeout_seconds: float = 30

    # Chi phí: giá USD / 1 triệu token (kiểm tra lại bảng giá Gemini trước khi pitch số liệu).
    price_fast_input: float = 0.30
    price_fast_output: float = 2.50
    price_pro_input: float = 1.25
    price_pro_output: float = 10.0
    daily_budget_usd: float = 5.0  # tiêu hết trong ngày (UTC) → agent dùng luật dự phòng; 0 = không giới hạn
    usd_to_vnd: float = 26000

    # Agent
    demo_mode: bool = False  # true → ưu tiên kết quả mẫu trong app/agent/demo_cache.json (demo không phụ thuộc mạng)
    mock_nodes: str = ""  # "all" hoặc "draft,human_review": node trả thẳng output trong app/agent/mocks/<node>.json
    max_input_chars: int = 2000

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    def is_mocked(self, node: str) -> bool:
        names = {n.strip() for n in self.mock_nodes.split(",") if n.strip()}
        return "all" in names or node in names


@lru_cache
def get_settings() -> Settings:
    return Settings()

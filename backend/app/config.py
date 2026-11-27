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

    # Planning: GitHub App và Web Push. Trống → có thể mở đội demo ở môi trường phát triển.
    # Biến GITHUB_* là tùy chọn: để trống thì kết nối bằng nút trong Planning, khóa lưu mã hóa trong DB.
    site_url: str = "http://localhost:3000"
    site_address: str = ""  # địa chỉ Caddy; khác ":80" thì tạo kết nối GitHub cần mã cài đặt
    planning_key_file: str = "data/planning.key"  # khóa mã hóa, nằm trong volume appdata
    planning_poll_seconds: int = 60  # không có webhook thì backend tự đọc PR theo chu kỳ này; 0 = tắt
    github_client_id: str = ""
    github_client_secret: str = ""
    github_app_slug: str = ""
    github_app_private_key_b64: str = ""
    github_webhook_secret: str = ""
    push_vapid_public_key: str = ""
    push_vapid_private_key: str = ""
    push_vapid_subject: str = ""
    planning_push_auto: bool = True  # trống khóa VAPID ở trên thì ProductPilot tự tạo; false = tắt thông báo
    planning_vapid_file: str = "data/planning-vapid.json"

    @property
    def site_origin(self) -> str:
        return self.site_url.rstrip("/")

    @property
    def planning_demo_enabled(self) -> bool:
        return self.app_env != "production" or self.demo_mode

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    def is_mocked(self, node: str) -> bool:
        names = {n.strip() for n in self.mock_nodes.split(",") if n.strip()}
        return "all" in names or node in names


@lru_cache
def get_settings() -> Settings:
    return Settings()

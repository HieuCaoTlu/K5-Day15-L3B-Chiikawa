# Planning GitHub một nút — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (làm trong phiên này). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Kết nối GitHub thật cho Planning ngay trên giao diện, không sửa `.env`.

**Architecture:** `app/planning/github_app.py` là nơi duy nhất trả cấu hình GitHub (từ `.env`, nếu trống thì từ bảng đã mã hóa). `app/planning/setup.py` chạy luồng manifest. Giao diện thêm hướng dẫn 3 bước.

**Tech Stack:** FastAPI, SQLAlchemy, cryptography (Fernet), Next.js.

**Spec:** `docs/superpowers/specs/2026-11-27-planning-github-connect-design.md`

## Global Constraints

- Không thêm dependency. Không commit (người dùng chưa yêu cầu). Không đọc hay sửa `.env`.
- Bí mật không trả qua API, không ghi log. Mã cài đặt là ngoại lệ có chủ ý trong log.
- UI tiếng Việt ngắn, theo DESIGN.md, dùng `components/kit/` và token CSS.
- Quyền app: `pull_requests: read`, `metadata: read`. Tên: `Tang Planning <4 hex>`.
- Cần mã cài đặt khi `APP_ENV=production` hoặc `SITE_ADDRESS` khác `""` và `":80"`.

## Review Focus

- Mất hoặc hỏng file khóa → coi như chưa kết nối và kết nối lại được, không lỗi 500.
- Callback gọi lại lần hai hoặc cookie hết hạn → không ghi đè cấu hình.
- `Origin` thiếu hoặc là `http` không phải localhost → từ chối.
- GitHub trả thiếu trường khi đổi `code` → báo thử lại, không lưu dở.
- `.env` đã cấu hình → không cho tạo kết nối mới.

---

### Task 1: Cấu hình GitHub, lưu khóa và luồng manifest

**Files:** Create `backend/app/planning/github_app.py`, `backend/app/planning/setup.py`, `backend/app/planning/reset_github.py`, `backend/tests/test_planning_setup.py`. Modify `config.py`, `planning/{models,github,auth,webhooks,schemas}.py`, `api/planning.py`, `main.py`, `tests/conftest.py`.

**Interfaces (Produces):**
- `Settings.site_address: str = ""`, `Settings.planning_key_file: str = "data/planning.key"`.
- `github_app.GitHubConfig(source, client_id, client_secret, slug, private_key_b64, webhook_secret, site_url)` với `repos_enabled: bool` (không đòi webhook secret).
- `github_app.current() -> GitHubConfig | None`, `github_app.save(...)`, `github_app.clear() -> None`.
- Bảng `PlanningGithubApp` (id=1) và `PlanningSetupState(id=sha256(state), site_url, expires_at)`.
- `github.convert_manifest(code: str) -> dict`.
- `POST /planning/setup/start` `{setup_code?, organization?}` → `{action, manifest}`; `GET /planning/setup/callback` → 303 `/planning?github=ready|setup_failed|state|configured`.
- `setup.code_required() -> bool`, `setup.announce_code() -> None`.
- `GET /state` thêm `setup: {needed, code_required}`, `webhook: bool`.

- [ ] Viết test (đỏ):
  - `test_manifest_for_localhost_has_no_webhook` / `test_manifest_for_public_https_subscribes_pull_requests`
  - `test_setup_requires_code_outside_a_personal_machine`
  - `test_setup_rejects_missing_or_insecure_origin`
  - `test_callback_stores_encrypted_secrets_once` (bí mật không nằm trong DB dạng rõ và không có trong `/state`; gọi lại không ghi đè)
  - `test_callback_rejects_bad_state_and_incomplete_conversion`
  - `test_env_configuration_wins_over_setup`
  - `test_lost_key_file_means_not_connected`
- [ ] `uv run pytest tests/test_planning_setup.py` → FAIL
- [ ] Cài đặt; thay mọi chỗ đọc `settings.github_*` ngoài `github_app` bằng `current()`; mở rộng bộ lọc log cho callback mới.
- [ ] `uv run pytest` → PASS toàn bộ, kể cả test cũ.

### Task 2: Giao diện 3 bước

**Files:** Create `frontend/components/planning/Connect.tsx`. Modify `Planning.tsx`, `Integrations.tsx`, `lib/planning.ts`, `app/planning/planning.css`.

**Interfaces:** `Steps({current: 1|2|3})`, `ConnectGitHub({codeRequired, busy, mutate})`; `planning.setupStart(setup_code, organization)`.

- [ ] Màn hình chưa đăng nhập: bước 1 (form kết nối, ô tổ chức và mã cài đặt) hoặc bước 2 (đăng nhập). `TeamForm` hiện bước 2; chưa có repo hiện bước 3.
- [ ] Gửi manifest bằng form `POST`, `target="_top"`.
- [ ] Quay về từ trang cài app (`github_setup`/`setup_action`) và là trưởng nhóm thật → tự mở `planning.discover` ở cửa sổ chính.
- [ ] `webhook=false`, repo thật, trưởng nhóm, tab đang hiện → gọi `refreshRepo` mỗi 60 giây; thẻ repo ghi rõ.
- [ ] `npm run typecheck` → sạch.

### Task 3: Tài liệu

- [ ] README (hướng dẫn Planning, hợp đồng API, bảng DB), ARCHITECTURE.md, `.env.example` (`GITHUB_*` là tùy chọn), `deploy/README.md` (lấy mã cài đặt).

### Task 4: Kiểm tra

- [ ] `make` không có trên máy này: chạy `ruff check`, `ruff format --check`, `pytest`, `eval/run_eval.py`, `npm run typecheck`.
- [ ] Chạy backend + frontend, xem thẻ kết nối ở desktop và 375px, thử bàn phím. Không bấm tạo app trên GitHub (người dùng tự làm).

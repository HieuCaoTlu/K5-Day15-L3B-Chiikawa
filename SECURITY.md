# Bảo mật

## Key và bí mật

- Không commit `.env`, key, token, mật khẩu (pre-commit chặn `.env`; `.gitignore` đã loại). Lộ key → thu hồi ngay ở
  Google AI Studio rồi tạo key mới.
- Mỗi người một key Gemini dev; bản demo/VPS dùng key riêng. Đặt **giới hạn chi tiêu** ở Google, ngoài
  `DAILY_BUDGET_USD` của app.
- `.env` trên VPS: chủ `deploy`, quyền `600`. Đổi `POSTGRES_PASSWORD` khỏi giá trị mặc định.

## Bề mặt tấn công

- Chỉ Caddy (80/443) mở ra Internet. Backend và Postgres chỉ nghe `127.0.0.1`.
- `APP_ENV=production` ẩn `/docs` và `/openapi.json`.
- **`/admin` và `/api/v1/admin/*` CHƯA có đăng nhập.** Trước khi đưa link cho người ngoài: thêm xác thực (tối thiểu
  một token admin trong header) hoặc chặn bằng Cloudflare Access / Caddy `basic_auth`.
- Runner self-hosted không chạy PR từ fork (điều kiện `if` trong workflow). Repo nên để private.
- Key SSH dự phòng của Actions luôn có `command="…/deploy.sh"` trong `authorized_keys` — lộ cũng chỉ bấm được deploy.

## Agent

- Đầu vào: giới hạn độ dài + lọc prompt injection bằng regex (`guardrails.py`) trước khi tới LLM.
- Prompt coi nội dung người dùng là dữ liệu (`<yeu_cau>…</yeu_cau>`).
- Đầu ra: luôn qua schema Pydantic; số liệu quan trọng do code tính, không để LLM tự bịa.
- Mọi đề xuất của AI đi qua bước người duyệt trước khi áp dụng.

## Báo lỗi

Nhắn trưởng nhóm trực tiếp, không mở issue công khai với chi tiết khai thác.

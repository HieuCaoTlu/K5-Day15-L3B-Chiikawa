# ARCHITECTURE.md

## Hệ thống

```
Trình duyệt
   │ HTTPS (Caddy tự cấp chứng chỉ)
   ▼
web — Caddy ─┬─ /, /chat, /admin/*        → file tĩnh từ frontend (build sẵn trong image, VPS không chạy Node)
             └─ /api/*, /health, /docs    → backend:8000
                                              │
backend — FastAPI ── LangGraph agent ── Gemini (Flash / Pro) qua agent/llm.py
             │                │
             ▼                ▼
db — Postgres 16: items · agent_runs · llm_calls · checkpoint LangGraph (bước chờ duyệt sống qua restart)
```

| Service | Image | Cổng | Ghi chú |
|---|---|---|---|
| `web` | build `frontend/Dockerfile` (Node build → Caddy) | 80, 443 | Cổng vào duy nhất từ Internet |
| `backend` | build `backend/Dockerfile` (uv) | 127.0.0.1:8000 | Healthcheck `/health` (DB lỗi → 503) |
| `db` | `postgres:16-alpine` | 127.0.0.1:5432 | Volume `pgdata` |

Không có Redis: thêm khi thật cần queue/cache. Cloudflare: bật proxy là đủ chống bot cơ bản.

## Agent (LangGraph, kiểu Workflow)

```
START → guard_input ──blocked──→ END
             │
             ▼
           draft ──→ human_review ──→ finalize → END
       (Gemini, JSON)  (interrupt: người duyệt)
```

| Node | Loại | Vào | Ra | Mock |
|---|---|---|---|---|
| `guard_input` | code | `request` | `blocked`, `block_reason` | `mocks/guard_input.json` |
| `draft` | LLM (Flash, structured output) → demo_cache → luật dự phòng | `request` | `proposal` (Proposal), `source` | `mocks/draft.json` |
| `human_review` | HITL `interrupt()` | `proposal` | `review` (Review) | `mocks/human_review.json` (= tự duyệt) |
| `finalize` | code | `proposal`, `review` | `result` | `mocks/finalize.json` |

- **Vì sao Workflow**: thứ tự bước biết trước → rẻ, test được, tái lập được. Không loop trừ khi thật cần.
- **HITL**: `POST /agent/runs` chạy tới `human_review` rồi dừng (`status=waiting_review`). `POST /agent/runs/{id}/review`
  gửi `Command(resume={approved, note})` → chạy tiếp. Checkpointer: Postgres (`PostgresSaver`) khi `DATABASE_URL` là
  Postgres, còn lại bộ nhớ (dev/test).
- **Guardrail**: code trước LLM (độ dài, regex injection), schema Pydantic + làm sạch sau LLM. Prompt coi input là dữ liệu.
- **Đường lui**: không key / hết ngân sách → `LLMUnavailableError` → dự phòng. LLM lỗi/timeout/sai schema → demo_cache →
  luật dự phòng. `DEMO_MODE=true` → ưu tiên demo_cache (demo không phụ thuộc mạng).
- **Chi phí**: mỗi lượt gọi ghi `llm_calls` (token vào/ra, chi phí theo giá trong `.env`, độ trễ, run_id lấy từ
  `thread_id`). `DAILY_BUDGET_USD` chặn chi tiêu trong ngày.
- **Làm song song**: `MOCK_NODES=draft` (hoặc `all`) → node trả mock data; người làm UI / node sau không phải chờ.

## Dữ liệu

| Bảng | Cột chính | Ghi |
|---|---|---|
| `items` | id, title, description, status, created_at | Bảng mẫu CRUD — đổi theo đề tài |
| `agent_runs` | id (= thread_id), session_id, request, status, source, proposal, result | Một câu hỏi trong chat |
| `llm_calls` | run_id, node, model, input_tokens, output_tokens, cost_usd, latency_ms, ok | Trang Chi phí & token |
| `checkpoint*` | (LangGraph tự tạo) | Trạng thái graph |

Tạo bảng bằng `create_all` khi khởi động (không Alembic). Đổi cột → xoá volume khi dev (`docker compose down -v`) hoặc
`ALTER TABLE` tay trên VPS.

## Frontend

- Next.js App Router, **xuất HTML tĩnh** (`output: 'export'`): chat và admin gọi API cùng domain từ trình duyệt.
  Không dùng Server Actions / route handler / SSR động.
- `/` phục vụ `frontend/public/index.html`, trang giới thiệu và workstation Tầng. CSS và JavaScript nằm trong `frontend/public/tang/`.
- Dev: `npm run dev` chuyển `/api`, `/health`, `/docs` sang `API_URL` (mặc định `127.0.0.1:8000`).
- Trang: `/` landing · `/chat` khung chat nối agent · `/admin` tổng quan · `/admin/usage` chi phí & token ·
  `/admin/sessions` phiên chat · `/admin/review` hàng chờ duyệt · `/admin/runs` lượt chạy · `/admin/items` CRUD mẫu.
- Giao diện: [DESIGN.md](DESIGN.md).

## CI/CD

`.github/workflows/ci-cd.yml` — PR: backend (ruff, pytest, eval) ‖ frontend (typecheck) trên máy GitHub (`ubuntu-latest`).
Push `main`: như trên → job `deploy` SSH vào VPS → `deploy/deploy.sh` → `docker compose up -d --build --wait`.
Chi tiết: [deploy/README.md](deploy/README.md).

## Quyết định

| Quyết định | Chọn | Lý do |
|---|---|---|
| Kiểu agent | Workflow + 1 HITL | Bước biết trước, demo ổn định, chấm điểm được |
| LLM | Gemini Flash, Pro cho bước khó | Rẻ, nhanh; structured output |
| Frontend | Next.js export tĩnh + Caddy | VPS nhỏ không cần chạy Node; HTTPS tự động |
| UI | Bộ component riêng (từ P-020), không UI kit | Một phong cách duy nhất, ít phụ thuộc |
| Python | uv | Cài nhanh, lockfile chắc chắn, cache tốt trong Docker và CI |
| Deploy | GitHub Actions → SSH vào VPS | Không phải cài/duy trì runner; build vẫn dùng cache Docker trên VPS |
| Bảng | create_all | Hackathon 36h, không cần migration |

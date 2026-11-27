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

## Agent Thinking (LangGraph, kiểu Workflow)

Bước Thinking: engineer trao đổi với agent, agent điền dần AI MVP Canvas (9 ô), đánh dấu ô nào có chuyện thật, ô nào mới là
giả định, rồi đề xuất GO / NOT YET / NO. Trưởng nhóm duyệt. Sơ đồ: [docs/agent-architecture.mmd](docs/agent-architecture.mmd).

```
START → guard_input ──blocked──→ END
             │
             ▼
        update_canvas ──→ mark_evidence ──┬─ còn ô lõi thiếu ──→ ask_next → END (chờ tin nhắn tiếp theo)
        (Gemini, JSON)    (code)          └─ đủ 4 ô lõi / NO ──→ verdict → human_review → finalize → END
                                                                          (interrupt: trưởng nhóm duyệt)
```

| Node | Loại | Vào | Ra | Mock |
|---|---|---|---|---|
| `guard_input` | code | `request` | `blocked`, `block_reason` | `mocks/guard_input.json` |
| `update_canvas` | LLM (Flash, structured output) → demo_cache → heuristic dự phòng | `request`, `canvas`, `flags` | `canvas`, `flags`, `intent`, `source` | `mocks/update_canvas.json` |
| `mark_evidence` | code | `canvas` | `canvas` (gán lại `status` từng ô) | `mocks/mark_evidence.json` |
| `ask_next` | code | `canvas`, `flags`, `intent` | `proposal` (NOT YET + 1 câu hỏi), `result.status=needs_info` | `mocks/ask_next.json` |
| `verdict` | code | `canvas`, `flags`, `intent` | `proposal` (GO hoặc NO) | `mocks/verdict.json` |
| `human_review` | HITL `interrupt()` | `proposal` | `review` | `mocks/human_review.json` (= tự duyệt) |
| `finalize` | code | `proposal`, `review` | `result` (`handoff=planning` khi GO được duyệt) | `mocks/finalize.json` |

- **Một lượt = một tin nhắn.** Canvas nối tiếp giữa các lượt trong cùng `session_id` (`service._previous_canvas`), nên agent
  hỏi từng câu một. Hỏi tiếp kết thúc lượt ở `ask_next` (status `needs_info`); chỉ khi đủ bằng chứng mới tới `human_review`.
- **Luật bằng code, không bằng LLM** (`app/agent/canvas.py`): một ô chỉ là `evidence` khi có người cụ thể + lần cụ thể + đoạn
  trích **có thật trong tin nhắn**. LLM bịa trích dẫn → ô chỉ là `assumption`. `decide()` quyết GO / NOT YET / NO.
- **4 ô lõi** (Persona, Pain Point, Current Workaround, JTBD) phải có chuyện thật mới được GO. Cờ `no_ai_needed` hoặc
  `solved_elsewhere` → NO.
- **HITL**: `POST /agent/runs` chạy tới `human_review` rồi dừng (`status=waiting_review`). `POST /agent/runs/{id}/review`
  gửi `Command(resume={approved, note})` → chạy tiếp. Checkpointer: Postgres (`PostgresSaver`) khi `DATABASE_URL` là
  Postgres, còn lại bộ nhớ (dev/test).
- **Guardrail**: code trước LLM (độ dài, regex injection), kiểm bằng chứng bằng code sau LLM, schema Pydantic. Prompt coi input là dữ liệu.
- **Đường lui**: không key / hết ngân sách → `LLMUnavailableError` → heuristic dự phòng. LLM lỗi/timeout/sai schema → demo_cache →
  heuristic. `DEMO_MODE=true` → ưu tiên demo_cache.
- **Chi phí**: một lượt gọi LLM (node `update_canvas`); `ask_next`, `verdict` là template, không tốn token. Mỗi lượt gọi ghi `llm_calls`.
- **Làm song song**: `MOCK_NODES=update_canvas` (hoặc `all`) → node trả mock data. Lưu ý `MOCK_NODES=all` luôn ra GO vì mock là
  canvas đã đủ bằng chứng; muốn thử luồng thật thì để trống `MOCK_NODES`.

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

## Planning

Tab Planning nằm ở `/workstation#planning`. Máy tính hiển thị mô hình 3D bên trái và nội dung ở bên phải: `tang/app.js` đọc `GET /state` để vẽ bảng Task, còn đội, sprint và PR nằm trong khung cùng origin (`/planning?embed=workstation`) mở từ bên phải. Khung báo `tang:planning-changed` khi phiên, đội hoặc task đổi; Workstation báo `tang:planning-reload` sau khi lưu. Người mới vào đội bằng mã mời (`planning/invites.py`). Nút Bắt đầu task (`planning/start_pr.py`) dùng token OAuth của người bấm để tạo nhánh và PR nháp trong đúng một lượt callback; việc đọc PR vẫn dùng token cài đặt chỉ đọc. Link `/planning` mở tab tương ứng của Workstation. FastAPI giữ phiên GitHub và phân quyền trưởng nhóm theo GitHub user ID. GitHub App dùng token cài đặt ngắn hạn để đọc PR của repo đã chọn. Token OAuth chỉ dùng ở callback để xác minh hồ sơ hoặc đọc danh sách repo được phép.

Cấu hình GitHub App chỉ đọc qua `planning/github_app.py`: ưu tiên biến `GITHUB_*`, nếu trống thì đọc bảng `planning_github_app`. Bảng này do luồng manifest (`planning/setup.py`) ghi; bí mật được mã hóa bằng khóa trong volume `appdata`. Ngoài máy cá nhân, tạo kết nối cần mã in trong log backend. Địa chỉ không công khai thì không có webhook, `planning/sync.py` chạy nền trong backend để đọc PR định kỳ (một tiến trình uvicorn).

Planning lưu đội, sprint, task và metadata PR vào các bảng `planning_*` trong Postgres. Mỗi đội có một repo đang hoạt động. Khi đổi repo, một giao dịch xóa sprint, task, liên kết PR và bản nháp cũ, đồng thời tăng phiên bản kết nối. Hồ sơ thành viên gắn với đội. Mã task tăng theo bảng và dùng được trong tiêu đề PR.

Workflow tạo kế hoạch chạy qua gateway Gemini và kiểm tra schema, mốc thời gian cùng người phụ trách. Bản nháp có một bước trưởng nhóm duyệt trước khi tạo task. Webhook dùng GitHub ID của người mở PR và quy tắc liên kết để tính trạng thái từ PR đã xác minh. Với Web Push được cấu hình, backend quét task gần hạn trong Postgres, gửi cho thiết bị đã đăng ký và ghi lại mốc đã gửi.

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

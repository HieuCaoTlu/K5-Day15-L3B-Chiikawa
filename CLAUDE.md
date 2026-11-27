# CLAUDE.md — mục lục cho agent code

Đọc file này trước. Đây là **mục lục và quy ước bắt buộc**. Đối chiếu hành vi với code hiện tại và đối chiếu giao diện với Claude Artifact Tầng trong [DESIGN.md](DESIGN.md).

## Đọc nhanh (≤ 60 giây)

- **Là gì**: khung hackathon — Next.js (HTML tĩnh) + FastAPI + LangGraph (Gemini) + Postgres, chạy bằng `docker compose`,
  tự deploy lên VPS khi merge `main`.
- **Mock-first**: không có `GOOGLE_API_KEY` vẫn chạy (luật dự phòng). `MOCK_NODES=all` → mọi node trả mock data.
- **Nhóm làm song song**, mỗi người một tính năng trọn (UI → API → agent node → test). `main` lúc nào cũng phải chạy.

## Mục lục — cần gì thì đọc đâu

| Cần | Đọc |
|---|---|
| Làm giao diện (màu, chữ, khoảng cách, component) | **[DESIGN.md](DESIGN.md)** — BẮT BUỘC, xem "Luật thiết kế" bên dưới |
| Luồng hệ thống, agent graph, bảng DB, thư mục | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Hợp đồng API + schema DB (FE ↔ BE) | [README.md](README.md#hợp-đồng-api) · OpenAPI ở `/docs` |
| Thêm/sửa agent node | `backend/app/agent/` + mục "Thêm agent node" bên dưới |
| Prompt | `backend/prompts/*.md` (`{{placeholder}}`) — KHÔNG viết prompt dài trong Python |
| Deploy, VPS | [deploy/README.md](deploy/README.md) |
| Biến môi trường | [.env.example](.env.example) (mọi biến có chú thích) |
| Quy trình nhánh / PR | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Bảo mật, key | [SECURITY.md](SECURITY.md) |

## Bản đồ code

```
backend/app/
  main.py              tạo app, router, seed khi khởi động
  config.py            mọi biến môi trường (Settings)
  models.py            bảng: items, agent_runs, llm_calls
  schemas.py           schema request/response = hợp đồng API
  api/                 health · items (CRUD mẫu) · agent (run + review) · admin (stats, usage, sessions)
  agent/
    graph.py           LangGraph: guard_input → update_canvas → mark_evidence → ask_next | (verdict → human_review (HITL) → finalize)
    canvas.py          luật Thinking bằng code: ô nào có bằng chứng, GO / NOT YET / NO
    nodes.py           code từng node (@mockable)
    state.py           AgentState + schema Pydantic cho output LLM
    llm.py             cổng DUY NHẤT gọi Gemini: structured output, ghi token/chi phí, ngân sách ngày
    guardrails.py      chặn injection / độ dài, làm sạch output
    mocks/<node>.json  mock data từng node (input → output)
    demo_cache.json    kết quả mẫu cho DEMO_MODE
backend/tests/         test_api.py · agent/test_nodes.py · agent/test_flow.py
backend/eval/          cases.json + run_eval.py (số liệu "agent đúng X%")
frontend/public/index.html   / (landing và Workstation Claude Artifact Tầng)
frontend/public/tang/        tokens.css (token dùng chung) · style.css (mẫu UI) · data.js (màu khu vực) · app.js · scene.js
frontend/app/                /planning · /chat · /admin
frontend/components/         planning/ · kit/ (ui.tsx, Shell, ProposalCard) · chat/ · landing/ · motion/
frontend/app/globals.css     token và kiểu toàn cục cho các route Next.js
frontend/app/components.css  lớp d-* và nền tảng component Next.js
```

## Luật thiết kế (STRICT)

**Dùng design pattern của Claude Artifact Tầng** trên [estatesmart.site](https://estatesmart.site/). Đọc [DESIGN.md](DESIGN.md) trước khi sửa UI. Mẫu tham chiếu trong repo là Workstation ở `frontend/public/index.html`, `frontend/public/tang/tokens.css`, `frontend/public/tang/style.css` và `frontend/public/tang/data.js`.

1. Dùng **Be Vietnam Pro**, nội dung 15px, tiêu đề weight 500. Thanh đầu và nền chính trắng. Panel bo 20px, viền mảnh và bóng nhẹ. Khoảng cách giữa các panel khoảng 18px.
2. Giữ màu theo khu vực của Workstation. **Planning dùng xanh lá `#14b86a`**. Dùng token CSS cho chấm màu, chip, thẻ tiến độ và mục đang chọn. Dùng indigo cho liên kết và focus.
3. Nút dạng pill, CTA chính nền `--ink` hoặc tone khu vực đủ tương phản. Ô nhập nền `--soft`, bo 10px. Trạng thái có nhãn chữ và hướng xử lý khi cần.
4. Trên các route Next.js, dùng lại hành vi form, tab, trạng thái và hộp thoại từ `components/kit/`. Áp hình thức Artifact bằng CSS có phạm vi trang. Giữ nhất quán với mẫu Workstation trước khi thêm component hoặc thư viện giao diện.
5. Giữ mô hình 3D của Workstation bên trái trên desktop. Đặt chức năng Planning trong tab Planning của Workstation.
6. Viết UI tiếng Việt ngắn. Kiểm tra dùng bàn phím, `prefers-reduced-motion`, bố cục ở 375px và checklist trong DESIGN.md.

## Kiến trúc agent (tóm tắt)

- **Workflow**, không ReAct/loop: các bước biết trước, chỉ rẽ nhánh khi bị chặn. Chỉ thêm loop khi thật cần.
- **Một bước HITL**: `human_review` dùng `interrupt()`; API `POST /api/v1/agent/runs/{id}/review` gửi `Command(resume=…)`.
  Checkpointer Postgres → lượt đang chờ duyệt sống qua restart.
- **LLM chỉ qua `agent/llm.py`**, luôn `structured(Schema, prompt, node=…)` (JSON schema Pydantic). Flash mặc định,
  `pro=True` chỉ cho bước suy luận khó. Mọi lượt gọi được ghi token + chi phí; vượt `DAILY_BUDGET_USD` → dự phòng.
- **Node có LLM phải có đường lui**: LLM lỗi/timeout/sai schema → demo_cache → luật dự phòng. Không để lượt chạy sập.
- **Guardrail bằng code**: `guard_input` (độ dài, injection) trước LLM; `canvas.apply_update` (đoạn trích phải có thật trong tin nhắn) + `clean_proposal` + schema sau LLM.

## Thêm agent node (làm song song không giẫm chân nhau)

1. Thêm field vào `AgentState` (`state.py`); output LLM → thêm schema Pydantic.
2. Viết **`agent/mocks/<node>.json` TRƯỚC** (`input` = state vào, `output` = phần state trả ra). Đây là hợp đồng giữa
   các node — người làm node sau/UI dùng `MOCK_NODES=<node>` để chạy mà không chờ bạn.
3. Viết node trong `nodes.py`, bọc `@mockable("<node>")`; prompt ở `backend/prompts/<node>.md`.
4. Nối vào `graph.py`; nếu node hiện ra UI thì sửa `AGENT_STEPS` trong `frontend/components/chat/gemini.tsx`.
5. Test trong `backend/tests/agent/test_nodes.py`: chạy node thật với `mock["input"]`, so với `mock["output"]`
   (node có LLM: kiểm tra schema + nhánh dự phòng). `test_every_node_has_mock` sẽ đỏ nếu thiếu mock.
6. Thêm 1–3 ca vào `backend/eval/cases.json`.

Đổi shape output của một node có sẵn → sửa mock trước, báo nhóm (người khác đang dựa vào nó).

## Trước khi commit — LUÔN nhắc người dùng

Khi người dùng sắp commit/mở PR (hoặc bạn vừa xong một tính năng), **chủ động đề xuất**:

1. **Unit test** cho API mới/đổi (`backend/tests/test_*.py`, copy mẫu `test_api.py`).
2. **Test agent**: node mới/đổi có mock + test node; luồng đổi → thêm ca vào `tests/agent/test_flow.py` và `eval/cases.json`.
3. Chạy `make check` (lint + test + typecheck + eval). Đỏ thì không commit.

Hỏi người dùng trước khi tự viết/chạy test nếu họ chưa yêu cầu. Gợi ý bật hook: `make hooks`.

## Không được

- Commit `.env`, key, token. Không in key ra log.
- Gọi Gemini ngoài `agent/llm.py`; để LLM tự tính số liệu/điểm mà code tính được.
- Thêm node mà không có mock + test; đổi API mà không cập nhật README "Hợp đồng API".
- Sửa tay trên VPS (lần deploy sau ghi đè). Quay lại bản cũ = `git revert`.
- `--no-verify`, force-push lên `main`.

## Lệnh hay dùng

```bash
make setup         # cài dependency + tạo .env
make up            # docker compose → http://localhost (landing / chat / admin / docs)
make dev-backend   # FastAPI :8000 hot reload      make dev-frontend  # Next.js :3000
make mock          # backend với MOCK_NODES=all    make demo          # DEMO_MODE=true
make check         # lint + test + typecheck + eval (trước khi PR)
```

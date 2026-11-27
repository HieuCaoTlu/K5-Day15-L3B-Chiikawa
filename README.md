# Tầng

> Không gian làm việc cho đội xây sản phẩm AI, từ bàn ý tưởng đến vận hành.

Dùng thử: <https://estatesmart.site/> · Nhóm: [thành viên](#thành-viên)

## Thành viên

| Họ và tên | MSSV |
|---|---|
| Lê Phạm Thành Đạt | 2A202604027 |
| Trần Đức Duy | 2A202604071 |
| Cao Trung Hiếu | 2A202603993 |
| Cao Phạm Thành Đạt | 2A202603970 |

## Chạy ngay

Không cần API key (chế độ mock). Cần Docker.

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
docker compose up -d --build --wait
```

| Trang | Địa chỉ |
|---|---|
| Trang giới thiệu và workstation Tầng | http://localhost |
| Chat (agent + duyệt đề xuất) | http://localhost/chat |
| Admin (tổng quan, chi phí & token, phiên chat, hàng chờ duyệt) | http://localhost/admin |
| API docs (OpenAPI) | http://localhost/docs |

Muốn dùng Gemini thật: điền `GOOGLE_API_KEY` trong `.env` rồi `docker compose up -d` lại. Cổng 80 bận: đặt `HTTP_PORT=8088`.

### Dev có hot reload

Cần [uv](https://docs.astral.sh/uv/) và Node 22.

```bash
make setup                    # uv sync + npm ci + tạo .env
make dev-backend              # http://localhost:8000/docs   (SQLite, không cần Docker)
make dev-frontend             # http://localhost:3000        (/api tự chuyển sang :8000)
```

Không có `make` (Windows): xem lệnh tương ứng trong `Makefile`. Windows nên đặt `PYTHONUTF8=1`.

| Chế độ | Lệnh | Khi nào |
|---|---|---|
| Mock toàn bộ node | `make mock` (`MOCK_NODES=all`) | Làm UI, chưa cần agent thật |
| Mock vài node | `MOCK_NODES=update_canvas` | Node của người khác chưa xong |
| Demo | `make demo` (`DEMO_MODE=true`) | Quay video / demo live, không phụ thuộc mạng |

## Hợp đồng API

Chốt trước khi code, sửa ở đây khi đổi (FE đọc chi tiết ở `/docs`). Kiểu dữ liệu: `backend/app/schemas.py` ↔ `frontend/lib/api.ts`.

| Method | Đường dẫn | Vào | Ra |
|---|---|---|---|
| GET | `/health` | — | `{status, env, db, llm, demo_mode, mock_nodes}` (DB lỗi → 503) |
| GET | `/api/v1/items` | — | `Item[]` |
| POST | `/api/v1/items` | `{title, description?, status?}` | `Item` (201) |
| GET / DELETE | `/api/v1/items/{id}` | — | `Item` / 204 |
| POST | `/api/v1/agent/runs` | `{request, session_id?}` | `Run` — `status`: `waiting_review` \| `blocked` \| `error` |
| GET | `/api/v1/agent/runs?status=` | — | `Run[]` (50 mới nhất) |
| GET | `/api/v1/agent/runs/{id}` | — | `Run` |
| GET | `/api/v1/agent/runs/{id}/usage` | — | `{calls, input_tokens, output_tokens, cost_usd, models[]}` (cộng từ `llm_calls`; khung `python run.py` dùng để đo token) |
| POST | `/api/v1/agent/runs/{id}/review` | `{approved, note?}` | `Run` — `approved` \| `rejected`; không chờ duyệt → 409 |
| GET | `/api/v1/admin/stats` | — | số lượt chạy theo trạng thái/nguồn, tỉ lệ duyệt, số phiên |
| GET | `/api/v1/admin/usage?days=7` | — | token, chi phí theo ngày/model/node, lượt gọi gần nhất, ngân sách hôm nay |
| GET | `/api/v1/admin/sessions` | — | phiên chat (số lượt, token, chi phí) |
| GET | `/api/v1/admin/sessions/{id}` | — | `Run[]` của phiên |
| POST | `/api/v1/pitching/surveys/generate` | `ProblemContext` | `{title, description, target_role, sections[], questions[], source}` |
| POST | `/api/v1/pitching/surveys` | `{project_name, target_role?, problem_context, title, description, sections?, questions[]}` | `Survey` (201, kèm `slug`) |
| GET | `/api/v1/pitching/surveys` | — | `Survey[]` |
| GET / PUT / DELETE | `/api/v1/pitching/surveys/{slug}` | `SurveyPublishIn?` | `Survey` / 204 |
| POST | `/api/v1/pitching/surveys/{slug}/responses` | `{respondent_role?, answers, is_sample?}` | `SurveyResponse` (201) |
| GET | `/api/v1/pitching/surveys/{slug}/responses` | — | `SurveyResponse[]` |
| GET | `/api/v1/pitching/surveys/{slug}/stats` | — | `SurveyStats` (đếm, `%`, TB thang điểm, thật vs mẫu) |
| POST | `/api/v1/pitching/surveys/{slug}/samples` | — | `SurveyStats` (thêm 8 phản hồi mẫu `is_sample=true`) |
| POST | `/api/v1/pitching/decks/generate` | `{context, survey_slug?, slide_count?}` | `{title, survey_slug, slides[] (<=10), source}` |
| POST / GET | `/api/v1/pitching/decks` | `PitchDeckPublishIn` / — | `PitchDeck` (`slug` cho `/pitch?slug=...`) / `PitchDeck[]` |
| GET / PUT / DELETE | `/api/v1/pitching/decks/{slug}` | `PitchDeckPublishIn?` | `PitchDeck` / 204 |
| POST | `/api/v1/pitching/assets/generate` | `{context, survey_slug?}` | `{ads[], source}` (bài quảng cáo chung có placeholder) |
| POST | `/api/v1/pitching/overview` | `{context, survey_slug?}` | `{overview, total_responses, real_responses, sample_responses, source}` |

`Run = {id, session_id, request, status, source, proposal: Proposal | null, result, created_at, updated_at}`

`status` ∈ `running | blocked | needs_info | waiting_review | approved | rejected | error`. `needs_info`: agent còn hỏi tiếp (chưa đủ bằng chứng).

`Proposal = {verdict: "GO" | "NOT YET" | "NO", reply, next_cell, reasons[], canvas, flags, title, summary, steps[], confidence}`.
`canvas` gồm 9 ô `persona, jtbd, pain_point, current_workaround, solution, ai_leverage, mvp_scope, metrics, prior_art`, mỗi ô
`{content, who, when, quote, grounded, status: "evidence" | "assumption" | "empty"}`. `title/summary/steps/confidence` giữ cho trang `/chat` và `/admin` cũ.
`GET /api/v1/agent/runs?session_id=…` lấy các lượt của một phiên (canvas nối tiếp giữa các lượt cùng `session_id`).

## Schema DB

| Bảng | Cột |
|---|---|
| `items` | id, title, description, status (todo/doing/done), created_at |
| `agent_runs` | id, session_id, request, status, source, proposal (JSON), result (JSON), created_at, updated_at |
| `llm_calls` | id, run_id, node, model, input_tokens, output_tokens, cost_usd, latency_ms, ok, error, created_at |
| `pitch_surveys` | id, slug, project_name, problem_context (JSON), title, description, questions (JSON), published, created_at, updated_at |
| `pitch_survey_responses` | id, survey_id, respondent_role, answers (JSON), is_sample, created_at |
| `pitch_decks` | id, slug, project_name, survey_slug, title, slides (JSON), script, ads (JSON), created_at, updated_at |

## Kiểm tra chất lượng

```bash
make check        # ruff + pytest + typecheck + eval — chạy trước mỗi PR
make hooks        # bật pre-commit: lint + test phần bị đổi
make eval         # backend/eval/cases.json → "agent đúng X%"
```

## Cấu trúc

```
backend/     FastAPI + LangGraph (app/agent: graph, nodes, mocks, llm, guardrails) · tests · eval · prompts
frontend/    public/ (trang giới thiệu và workstation Tầng) · Next.js (chat, admin) · components/kit (bộ component nhóm) · globals.css (token)
deploy/      Caddyfile · deploy.sh · bootstrap-vps.sh · README (hướng dẫn VPS + secrets cho GitHub Actions)
.github/     workflows/ci-cd.yml · PR template
```

## Tài liệu

[CLAUDE.md](CLAUDE.md) (mục lục cho agent code) · [DESIGN.md](DESIGN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) ·
[deploy/README.md](deploy/README.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) ·
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

---

# Phần nộp hackathon

## Lệnh

| Lệnh | Làm gì |
|---|---|
| `python run.py` | Chạy bản chạy thử (gõ đầu vào, nhận kết quả, kèm số lần gọi model / token) |
| `python run.py check` | Kiểm `eval/benchmark.csv` (6 cột, số câu, `kho` / `tu_choi`, mã `source`, ô trống, dòng mẫu) `eval/metric_spec.yaml` (≥3 metric điền đủ) và `TEAMS.md` (đúng format để BTC quét). Chỉ cảnh báo, không sửa file |
| `python run.py eval --try` | **Thử nối model:** chạy 3 câu đầu (`--try 5` = 5 câu) → `eval/run-try.csv`. Thấy "Nối model được" là xong. Không tính là một lượt |
| `python run.py eval` | Chạy cả bộ qua `codebase/agent.py` → `eval/run-1.csv` (lần sau `run-2.csv`…) + `traces/run-1.jsonl`. Mỗi dòng có run ID, model, số lần gọi model / công cụ, token. Model còn giả → chỉ ghi `run-mock.csv`; mọi câu lỗi → `run-error.csv`; Ctrl+C → `run-stopped.csv` — đều **không** được đánh số |
| `python run.py eval --fake` | Thử riêng bộ chạy, không gọi agent → `eval/run-fake.csv` |
| `python run.py score eval/run-1.csv` | Sau khi điền cột `pass` (1 / 0): in % đạt tổng và theo `type`. Còn ô trống → "CHƯA CHẤM XONG", không in % |
| `python run.py simulate --try` | Thử mô phỏng chi phí 10 phiên (làm trước CP3) → `cost/simulate-try.csv` |
| `python run.py simulate` | Mô phỏng chi phí khi dùng thật theo `cost/personas.yaml` (≥50 phiên) → `cost/simulate-N.csv` + `cost/simulate-N-summary.md` |
| `python run.py simulate --rate-from eval/run-2.csv` | Như trên, lấy tỉ lệ đạt từ đúng lượt chỉ định. Không ghi thì khung lấy lượt `run-N` mới nhất đã chấm, cùng model, và ghi rõ đã lấy lượt nào trong bản tóm tắt |

Gói miễn phí báo hết lượt: thêm `--wait 4` sau `eval` hoặc `simulate` (nghỉ 4 giây giữa hai lượt gọi). Sửa CSV bằng Excel: *File → Save As → CSV UTF-8*; Google Sheets: *Tệp → Tải xuống → CSV*.

**Lượt có lỗi kỹ thuật** (cột `error` có chữ): không sửa tay file đó, chạy lại thành lượt mới và ghi vào bảng các lượt ở `eval/README.md`. Không xoá file lượt nào.

Nhóm dùng stack khác (Node, Streamlit, notebook…): sửa hàm `run_app()` trong `run.py` để `python run.py` vẫn chạy được bản chạy thử, và giữ `answer()` trong `codebase/agent.py` để `eval`, `simulate` chạy được.

## Bản chạy thử — viết ở đâu

| File | Viết gì | Bước guide |
|---|---|---|
| `codebase/agent.py` | `answer(text)` — luồng chính, đúng hình dạng ở `spec.md` §4. Khung có sẵn một workflow 2 bước *ví dụ* | 3.2 |
| `codebase/tools.py` | Công cụ của bài toán, mỗi công cụ một hàm có `@tool` | 2.2, 3.2 |
| `codebase/ai.py` | `call_model(system, user)` — chỗ duy nhất gọi model. Chưa điền `.env` thì chạy **chế độ giả** | 3.3 |

- **Trước CP2:** để chế độ giả, công cụ trả dữ liệu giả — `python run.py` đi hết luồng là đủ.
- **Trước CP3:** nối model thật theo [docs/connect-model.md](docs/connect-model.md), `eval --try` thấy token > 0 rồi mới `eval`.
- Bộ chạy gửi **nguyên ô `input`** của câu thử vào `answer(text)`. Dữ liệu nền (bài học, thông báo, lịch…) để trong `data/`, đọc qua công cụ.

## Phần nào thật, phần nào giả

| Thành phần | Thật / Giả | Ghi chú |
|---|---|---|
| Lời gọi AI ở quyết định trung tâm | **Thật** (bắt buộc từ CP3) | Model: ____ |
|  |  |  |

## Dùng AI vào việc gì

2–3 dòng (bắt buộc): nhóm dùng công cụ AI nào để làm gì, người kiểm lại phần nào. Chi tiết: [docs/ai-usage.md](docs/ai-usage.md). Coding agent đọc [AGENTS.md](AGENTS.md).

____

## File mẫu — điền ở bước nào

| File | Điền ở bước guide | Mốc |
|---|---|---|
| `TEAMS.md` | 1.0 | CP1 · **đúng format**, BTC quét khi chấm |
| `canvas.md` | 1.4 | CP1, cập nhật CP2 |
| `evidence/hypothesis.md` | 1.1 | trước khi tìm bằng chứng |
| `evidence/data-mining.md` · `evidence/interviews/TEMPLATE.md` → `P1.md`… · `evidence/survey/TEMPLATE.md` | 1.2 | bắt đầu sau Zoom, xong CP3 |
| `evidence/summary.md` | 1.2 | CP3 |
| `spec.md` | §0–§2: 1.1–1.3 · §3–§5: 2.1–2.3 · §7: 2.4 · §8: 4.2 · §10: suốt | §7 chốt CP2 · §0–§7 CP3 · đủ CP4 |
| `data/DATA_CARD.md` | 2.4 | bản đầu CP2 |
| `eval/benchmark.csv` · `eval/metric_spec.yaml` | 2.4 | ≥10 câu + metric chốt CP2 · 20–30 câu CP3 |
| `codebase/` | 3.2, 3.3 | khung CP2 · AI thật CP3 |
| `eval/report.md` · `eval/README.md` | 4.1 (README mục 1–4 từ 2.4) | CP4 |
| `cost/personas.yaml` · `cost/cost-estimate.md` | 4.2 | thử 10 phiên CP3 · đủ CP4 |
| `validation/log.md` *(bonus)* | 4.3 | CP4 |
| `slides/outline.md` → `demo-slides.pdf` | 5.1 | CP4 |
| `reflection/TEMPLATE.md` → `reflection/<ten>.md` | 5.3 | 23:59 Thứ Bảy 28/11 |
| `AGENTS.md` · `docs/ai-usage.md` | khi dùng coding agent / AI | suốt |

## Bảy hạng mục bắt buộc — nằm ở file nào

| # | Hạng mục | File |
|---|---|---|
| 1 | Bằng chứng pain | `evidence/` (tổng hợp ở `evidence/summary.md`) |
| 2 | Impact có số | `spec.md` §2 |
| 3 | Thiết kế giải pháp | `spec.md` §4 |
| 4 | Bản chạy thử làm trọn lát cắt | `codebase/` · lệnh ở mục "Lệnh" |
| 5 | Định nghĩa "tốt" + bộ câu thử | `data/DATA_CARD.md` · `eval/` |
| 6 | Mô phỏng chi phí khi dùng thật | `cost/` |
| 7 | Slide + demo + video dự phòng | slide trong repo (PDF, PPTX, HTML…) hoặc link slide ở form CP4 · link video: ____ |
| + | *Bonus:* người dùng thử | `validation/log.md` |

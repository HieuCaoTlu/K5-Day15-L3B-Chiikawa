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
| Planning (thành viên, sprint, PR, nhắc hạn) | http://localhost/planning |
| Admin (tổng quan, chi phí & token, phiên chat, hàng chờ duyệt) | http://localhost/admin |
| API docs (OpenAPI) | http://localhost/docs |

Muốn dùng Gemini thật: điền `GOOGLE_API_KEY` trong `.env` rồi `docker compose up -d` lại. Cổng 80 bận: đặt `HTTP_PORT=8088`.

### Planning

Mở **Planning → Đội, sprint và PR** trong Workstation hoặc vào `/?tab=planning`. Mô hình tiến độ 3D nằm bên trái trên desktop. Khi chạy dev, chọn **Dùng thử với dữ liệu mẫu** để thiết lập đội, kết nối repo mẫu, duyệt sprint và giả lập PR từ tab **Pull request**. Mỗi phiên demo có dữ liệu riêng.

### Kết nối GitHub thật

Không cần sửa `.env`. Làm ngay trong tab Planning:

1. **Tạo kết nối** (một lần cho cả máy chủ). Bấm **Kết nối GitHub** rồi xác nhận tạo app trên GitHub. Repo thuộc tổ chức thì mở mục chọn tổ chức trước khi bấm. Tầng tự nhận và lưu khóa. Trên VPS (`APP_ENV=production` hoặc `SITE_ADDRESS` khác `:80`), Tầng hỏi thêm **mã cài đặt**: lấy mã mới nhất bằng `docker compose logs backend`.
2. **Đăng nhập bằng GitHub** và lưu đội. Người tạo đội là trưởng nhóm.
3. **Chọn repo.** Bấm **Cấp quyền trên GitHub**, chọn repo. Khi quay về, Tầng tự tải danh sách. Chọn repo và bấm **Kết nối repo đã chọn**.

**Bắt đầu task bằng một nút:** người được giao mở chi tiết task, bấm **Bắt đầu task** và xác nhận trên GitHub. Tầng tạo nhánh `task/t-<số>` (thêm một commit rỗng) và PR nháp `[T-<số>] …` đứng tên người đó, bằng token của họ; token dùng một lượt rồi bỏ. Cần: GitHub App có quyền **Contents** và **Pull requests: Read and write** (app tạo trước đây phải tự sửa quyền rồi chấp nhận quyền mới ở trang app đã cài; kết nối mới xin sẵn), và người bấm có quyền ghi vào repo.

**Thêm thành viên vào repo:** mã mời của Tầng không cấp quyền trên GitHub. Tab **Thành viên → Quyền trên GitHub** cho trưởng nhóm biết ai chưa có quyền ghi và hướng dẫn: thêm ở `github.com/<repo>/settings/access`, rồi người được mời tự chấp nhận tại `github.com/<repo>/invitations`. Tầng không tự gửi lời mời vì việc đó cần quyền quản trị repo.

Tầng lấy 50 PR cập nhật gần nhất khi kết nối hoặc khi bấm **Đọc lại PR**. Trong mỗi PR, đặt mã như `[T-23]` ở tiêu đề hoặc mô tả. Trưởng nhóm xem các PR cần đối chiếu trong tab **Pull request**.

GitHub chỉ gửi webhook tới địa chỉ HTTPS công khai. Trên localhost, backend tự đọc PR sau mỗi `PLANNING_POLL_SECONDS` giây (mặc định 60, `0` = tắt), kể cả khi không ai mở trang; backend phải đang chạy. Webhook được chọn theo địa chỉ lúc tạo kết nối, nên máy chủ thật cần tạo kết nối riêng trên đúng tên miền của nó.

Khóa bí mật được mã hóa trong database. Khóa giải mã nằm ở `data/planning.key` (volume `appdata`). Muốn kết nối lại: chạy `docker compose exec backend python -m app.planning.reset_github` (khi chạy dev: `uv run python -m app.planning.reset_github` trong `backend/`), rồi xóa app cũ trên GitHub.

Đã có GitHub App cấu hình bằng biến `GITHUB_*` thì vẫn dùng được: khi có `GITHUB_CLIENT_ID` và `GITHUB_CLIENT_SECRET`, Tầng ưu tiên các biến này.

**Mời người vào đội:** trưởng nhóm mở tab **Thành viên**, bấm **Tạo mã mời** và gửi mã. Người nhận đăng nhập bằng tài khoản của họ, chọn **Nhập mã để vào đội**, điền hồ sơ và vào ngay với quyền thành viên. Trưởng nhóm có thể đổi mã, tắt mã hoặc xóa thành viên (người còn đứng tên task phải được giao lại trước). Mã mời không cấp quyền trên GitHub. Thử trên một máy: mở cửa sổ ẩn danh, chọn dùng thử rồi nhập mã của đội dùng thử.

**Tab Planning:** gồm bảng Task kiểu GitHub Projects. Đầu trang có nút logo GitHub (repo đang theo dõi, đổi repo, đọc lại PR) và nút chuông (thông báo). Khi đã có đội, phần đội, sprint và pull request ẩn sẵn, bấm **Đội, sprint và PR** để mở thành card bên phải (đóng bằng nút Đóng, bấm ra ngoài hoặc Esc); chưa đăng nhập hoặc chưa có đội thì phần này hiện sẵn. Bảng Task lấy từ sprint đã áp dụng, có 3 cột Cần làm, Chờ review, Xong (task đang làm, như PR nháp, nằm ở Cần làm); mỗi sprint một màu. Thẻ hiện avatar 3D mà người làm chọn trong hồ sơ, PR liên kết và hạn. Trưởng nhóm kéo thẻ giữa các cột, hoặc bấm vòng tròn trạng thái trên thẻ (bàn phím, cảm ứng); bấm ảnh đại diện để đổi người làm. Vị trí đổi tay được giữ cho đến khi pull request liên kết đổi trạng thái, nhánh đích hoặc mã task. API `PUT /planning/board` (tổng quan, phân vai, user story, file, tech stack, chi phí) vẫn còn nhưng giao diện hiện không dùng.

Bản nháp sprint dùng Gemini qua LLM gateway nếu đã đặt `GOOGLE_API_KEY`. Chế độ demo và cấu hình thiếu key sẽ tạo bản nháp từ luật dự phòng. Mỗi tài khoản tham gia một đội Planning, còn mỗi đội theo dõi một repo. Đổi repo sẽ xóa tiến độ và giữ hồ sơ thuộc đội.

**Thông báo trình duyệt:** bấm nút chuông trên đầu tab Planning, chọn **Bật thông báo** và **Cho phép**, rồi **Gửi thử**. Mỗi người được nhắc khi task của mình còn tối đa 24 giờ và 1 giờ, kể cả khi đã đóng tab (trình duyệt và máy chủ phải đang chạy; mở bằng HTTPS hoặc localhost). Không cần sửa `.env`: Tầng tự tạo cặp khóa VAPID ở `data/planning-vapid.json`. Đã có khóa riêng thì điền đủ ba biến `PUSH_VAPID_*`; `PLANNING_PUSH_AUTO=false` để tắt.

Nguồn cấu hình [GitHub App từ manifest](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest) · [Sự kiện PR](https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request) · [Khóa VAPID](https://github.com/web-push-libs/vapid) · [Web Push](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)

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
| Mock vài node | `MOCK_NODES=draft` | Node của người khác chưa xong |
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
| POST | `/api/v1/agent/runs/{id}/review` | `{approved, note?}` | `Run` — `approved` \| `rejected`; không chờ duyệt → 409 |
| GET | `/api/v1/admin/stats` | — | số lượt chạy theo trạng thái/nguồn, tỉ lệ duyệt, số phiên |
| GET | `/api/v1/admin/usage?days=7` | — | token, chi phí theo ngày/model/node, lượt gọi gần nhất, ngân sách hôm nay |
| GET | `/api/v1/admin/sessions` | — | phiên chat (số lượt, token, chi phí) |
| GET | `/api/v1/admin/sessions/{id}` | — | `Run[]` của phiên |
| GET | `/api/v1/planning/state` | Cookie phiên, nếu có | Hồ sơ, đội, repo, sprint, PR theo vai trò, `setup:{needed,code_required}`, `webhook` |
| POST | `/api/v1/planning/setup/start` | `{setup_code?,organization?}` + header `Origin` | `{action,manifest}` để gửi form sang GitHub; 403 sai mã, 409 đã kết nối |
| GET | `/api/v1/planning/setup/callback` | `code`, `state` từ GitHub + cookie | 303 về `/planning?github=ready\|setup_failed\|state\|configured` |
| GET | `/api/v1/planning/auth/github[?intent=repos]` · `/api/v1/planning/auth/github/callback` | OAuth state + PKCE | Chuyển hướng OAuth hoặc về Planning |
| POST | `/api/v1/planning/auth/demo` · `/api/v1/planning/auth/logout` | — | Tạo phiên demo hoặc kết thúc phiên (204) |
| PUT | `/api/v1/planning/members` | `{members:[{github_id?,login,name,experience,tags,avatar}]}` | Lưu đội (204) |
| PUT | `/api/v1/planning/board` | `{version,overview,stories,roles,links,stack,cost,revenue}` | Lưu nội dung tab (204); trưởng nhóm; 409 nếu `version` cũ. `GET /state` trả `board` và `invite_code` (chỉ trưởng nhóm) |
| POST / DELETE | `/api/v1/planning/invite` | — | Tạo hoặc đổi mã, tắt mã (204); trưởng nhóm |
| POST | `/api/v1/planning/join` | `{code,name,experience,tags,avatar}` | Vào đội (204); 404 sai mã, 409 đã có đội hoặc đội đủ 16 người, 429 sai 10 lần/10 phút |
| DELETE | `/api/v1/planning/members/{github_id}` | — | Xóa thành viên (204); 409 nếu là trưởng nhóm hoặc còn task |
| PUT | `/api/v1/planning/repo` | `{repo_id,repo_version,reset_confirmed?}` | Kết nối hoặc đổi repo (204) |
| POST | `/api/v1/planning/repo/refresh` | `{repo_version}` | `{count}` PR vừa đọc |
| POST | `/api/v1/planning/draft` · `/api/v1/planning/apply` | Lần lượt `{repo_version,brief}` · `{repo_version,draft_id,plan}` | Bản nháp `{id,source,brief,plan}` hoặc áp dụng (204) |
| PATCH | `/api/v1/planning/tasks/{id}` | `{repo_version,task}` | Cập nhật task (204) |
| POST | `/api/v1/planning/tasks/{id}/pr` | `{repo_version}` | `{url}` trang xác nhận GitHub; chỉ người được giao; callback tạo nhánh + PR nháp rồi về `/planning?github=pr_created\|pr_exists\|pr_permission\|pr_empty\|pr_draft\|pr_failed\|pr_stale&task=…`. `/state` trả `can_start` cho từng task |
| GET | `/api/v1/planning/repo/access` | Trưởng nhóm | `{available,app_can_write,members:[{login,write}],settings_url,invitations_url,app_url}`; `null` = chưa rõ |
| DELETE | `/api/v1/planning/tasks/{id}` | `{repo_version}` | Xóa hẳn task (204); trưởng nhóm; PR còn mở quay về danh sách cần đối chiếu, sprint hết task cũng bị xóa |
| PUT | `/api/v1/planning/tasks/{id}/status` | `{repo_version,status}` | Đổi cột thủ công, thay trạng thái đang theo PR (204); trưởng nhóm |
| PUT | `/api/v1/planning/pulls/{number}/link` | `{repo_version,task_id}`, `null` để bỏ qua | Áp dụng liên kết PR (204) |
| POST | `/api/v1/planning/github/webhook` | Payload có chữ ký GitHub | Tiếp nhận sự kiện (204) |
| POST | `/api/v1/planning/demo/pull` | `{repo_version,number,title,author_id,state}` | Ghi PR mẫu (204) |
| POST | `/api/v1/planning/push/test` | — | Gửi thông báo thử tới trình duyệt đang đăng nhập (204); 409 chưa bật, 502 gửi chưa được |
| POST / DELETE | `/api/v1/planning/push/subscription` | Đăng ký `{endpoint,keys}` hoặc tắt `{endpoint}` | Cập nhật thiết bị nhận nhắc hạn (204) |
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

Các yêu cầu ghi Planning từ trình duyệt gửi header `X-Planning-Request: 1`. `repo_version` đến từ `GET /state` để thao tác chỉ áp dụng vào repo đang xem.

`Run = {id, session_id, request, status, source, proposal: {title, summary, steps[], confidence} | null, result, created_at, updated_at}`

## Schema DB

| Bảng | Cột |
|---|---|
| `items` | id, title, description, status (todo/doing/done), created_at |
| `agent_runs` | id, session_id, request, status, source, proposal (JSON), result (JSON), created_at, updated_at |
| `llm_calls` | id, run_id, node, model, input_tokens, output_tokens, cost_usd, latency_ms, ok, error, created_at |
| `planning_teams`, `planning_members` | Repo đang theo dõi, bản nháp, thành viên theo GitHub ID, kỹ năng và avatar |
| `planning_sessions` | Mã phiên băm, hồ sơ, hạn phiên và danh sách repo đã kiểm tra quyền |
| `planning_sprints`, `planning_tasks` | Sprint đã duyệt, người phụ trách, deadline UTC, trạng thái và lượt nhắc |
| `planning_pull_requests`, `planning_deliveries` | Metadata PR, liên kết task, ghi chú và mã lượt gửi webhook |
| `planning_subscriptions` | Đăng ký Web Push của trình duyệt theo phiên |
| `planning_boards` | Nội dung tab Planning (JSON) và phiên bản của từng đội |
| `planning_logs` | Nhật ký task đổi tiến độ do pull request; `GET /state` trả `log` |
| `planning_invites`, `planning_join_attempts` | Mã mời của đội, số lần nhập sai theo tài khoản |
| `planning_github_app`, `planning_setup_states` | GitHub App tạo từ manifest (bí mật đã mã hóa), lượt tạo kết nối đang chờ |
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

# Cách làm việc chung

## Chia việc

- **Chia theo tính năng (lát dọc)**, không theo tầng: một người làm trọn UI → API → agent node → test của tính năng đó.
- Chốt **hợp đồng API + schema DB** trước khi code, ghi vào [README.md](README.md#hợp-đồng-api).
- Phần của người khác chưa xong → dùng mock: `MOCK_NODES=<node>` (agent), dữ liệu mẫu trong `seed.py` (DB).

## Nhánh và PR

1. `git switch -c feat/<ten-tinh-nang>` từ `main`.
2. Code + test (xem bên dưới). `make check` xanh.
3. Push, mở PR vào `main`, điền checklist trong template. CI phải xanh.
4. Merge **mỗi 2–3 tiếng**, đừng giữ nhánh lâu. `main` lúc nào cũng chạy được; merge vào `main` = tự deploy.
5. Sau giờ thứ 20: chỉ sửa lỗi / polish, không thêm tính năng mới trừ khi luồng chính đã ổn. Giờ 30: code freeze.

## Test trước khi commit

| Đổi gì | Cần có |
|---|---|
| API | Test trong `backend/tests/` (copy `test_api.py`): đường đúng + validate + 404 |
| Agent node | `app/agent/mocks/<node>.json` + test trong `tests/agent/test_nodes.py` |
| Luồng agent | Ca trong `tests/agent/test_flow.py` + 1–3 ca trong `eval/cases.json` |
| UI | `npm run typecheck`; tự soát checklist cuối [DESIGN.md](DESIGN.md) |

`make hooks` để git tự chạy lint + test phần bị đổi trước mỗi commit.

## Commit

```
feat: thêm node phân loại ticket
fix: chat không cuộn xuống khi có đề xuất mới
test: thêm ca eval cho yêu cầu mơ hồ
docs: cập nhật hợp đồng API /tickets
```

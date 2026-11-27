## Tính năng / sửa gì

<!-- Một lát cắt dọc: UI → API → agent node. Ghi rõ route, endpoint, node bị đổi. -->

## Checklist

- [ ] Có unit test cho API mới/đổi (`backend/tests/`)
- [ ] Node agent mới/đổi: có `mocks/<node>.json` + test trong `backend/tests/agent/`
- [ ] Đổi hợp đồng API / schema DB → đã sửa mục tương ứng trong README.md và báo nhóm
- [ ] UI theo DESIGN.md (token màu, class `d-*`, không thêm mã hex mới)
- [ ] `make check` xanh ở máy
- [ ] Không có key / token / `.env` trong diff

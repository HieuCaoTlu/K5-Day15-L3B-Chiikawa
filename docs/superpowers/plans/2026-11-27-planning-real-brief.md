# Planning: mã mời và ba khối thật — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (làm trong phiên này).

**Goal:** Mời người vào đội bằng mã; Tổng quan, Phân vai, User story dùng dữ liệu thật.

**Architecture:** Router mới `planning/invites.py` và `planning/board.py`. Khung Planning gửi `{userId, role, members, board}` cho `app.js` qua `tang:planning-team`; `app.js` tự `PUT /board` rồi gửi `tang:planning-reload`.

**Spec:** `docs/superpowers/specs/2026-11-27-planning-real-brief-design.md`

## Global Constraints

Không thêm dependency. Không commit. Mọi thao tác ghi qua `require_same_origin`. Mã 8 ký tự, bảng chữ bỏ `0 O 1 I`; sai 10 lần/10 phút → 429; tối đa 16 người; tổng quan 2000, story 420, 12 story.

## Review Focus

- Đang gõ mà có bản mới: bản lưu cũ bị 409, không ghi đè.
- Đổi tài khoản trên cùng trình duyệt: không giữ dữ liệu đội trước.
- Người bị xóa: mất quyền ngay, bản nháp có tên họ bị bỏ.
- Phiên demo thứ hai không trùng tên đăng nhập người tạo đội.
- Đoán mã: bị giới hạn, kể cả mã của đội khác loại (demo/thật).

- [ ] Task 1 — `tests/test_planning_team.py` (đỏ), rồi `models.py`, `schemas.py`, `invites.py`, `board.py`, `api/planning.py` (`board`, `invite_code` trong `/state`) → xanh toàn bộ.
- [ ] Task 2 — `lib/planning.ts`, `Team.tsx` (`JoinForm`, `InviteCard`, nút xóa), `Planning.tsx` (chọn tạo/vào đội, gửi `tang:planning-team`, nhận `tang:planning-reload`, `PlanForm context={state.board}`) → typecheck sạch.
- [ ] Task 3 — `public/tang/app.js`: ba khối theo vai, tự lưu, gợi ý chia vai bằng code, tiến độ dùng vai thật; bỏ `tang:planning-brief` → `node --check`.
- [ ] Task 4 — README, ARCHITECTURE.md.
- [ ] Task 5 — ruff, pytest, eval, typecheck; thử bằng hai phiên demo.

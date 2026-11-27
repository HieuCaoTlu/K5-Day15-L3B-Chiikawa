# Nút "Bắt đầu task" và hướng dẫn quyền repo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (làm trong phiên này).

**Goal:** Người được giao task tạo nhánh và PR nháp bằng một nút; trưởng nhóm thấy ai chưa có quyền ghi.

**Spec:** `docs/superpowers/specs/2026-11-27-planning-start-task-pr-design.md`

## Global Constraints

Token người dùng chỉ sống trong callback, không lưu, không log. Không ghi vào nhánh theo dõi, không force, không xóa. Bắt đầu bằng POST cùng origin. Không commit. Đọc PR vẫn dùng token `pull_requests: read`.

## Review Focus

- Link GET không khởi tạo được việc ghi.
- Người xác nhận trên GitHub khác tài khoản đang đăng nhập → không tạo gì.
- Giữa lúc xác nhận, task đổi người, bị xóa hoặc đổi repo → không tạo gì.
- Bấm hai lần → không tạo hai PR.
- Không đọc được quyền thành viên → hiện "chưa rõ", không đoán.

- [ ] Task 1 — `tests/test_planning_pr.py` (đỏ). `github.create_task_pr(token, repo, base, number, title, body) -> dict`, `github.repo_access(repo_id, installation_id, repo, logins) -> {app_can_write, members}`; `planning/start_pr.py` (`POST /tasks/{id}/pr`, `GET /repo/access`, `finish(...)`); `auth.finish_github` nhận `intent=pr-<task>-<version>`; `/state` thêm `can_start` mỗi task; manifest xin quyền ghi.
- [ ] Task 2 — nút ở hộp chi tiết (`app.js`) và `TaskDetail`; thông báo khi quay về; lệnh git để chép; `RepoAccess` trong tab Thành viên.
- [ ] Task 3 — README, ARCHITECTURE.md.
- [ ] Task 4 — ruff, pytest, eval, typecheck; thử giao diện; đọc thử quyền thật (chỉ đọc). Tạo PR thật do người dùng bấm.

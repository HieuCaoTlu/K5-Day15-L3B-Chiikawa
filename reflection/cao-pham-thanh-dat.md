# Reflection — Cao Phạm Thành Đạt

1. Vai trò + phần mình làm (trỏ tới file / commit):
   Thành viên, phụ trách module Quality và Maintaining trong Workstation (`frontend/public/tang/app.js`, `health.js`, `style.css`).
   Dựng tab Quality (chỉ số, lịch sử chạy, chi phí token) và mở rộng Maintaining (lịch bảo trì, gợi ý cập nhật): PR #2 (`db38155`), PR #5 (`fe852de`), sửa bố cục 375px và thẻ chỉ số (`292cd07`, `fb03396`).
   Sửa agent Thinking, thêm OpenRouter, nối benchmark vào agent thật: PR #10 (`23fc5b4`, `cb44761`, `b63c6e2`).
   Thay khối số doanh thu ở Quality bằng nút để agent gợi ý cách kiếm tiền: API `POST /api/v1/quality/money-tips` (`backend/app/agent/money_tips.py`, `backend/app/api/quality.py`, `backend/prompts/money_tips.md`), lưu theo đội trong `quality.tips`, kèm test `backend/tests/test_quality_money_tips.py`.

2. AI hỗ trợ mình thế nào (việc gì, công cụ gì, chỗ nào phải sửa lại output AI):
   Dùng Claude Code để đọc code, sửa, chạy test và thử trên trình duyệt; Codex để review và đối chiếu với yêu cầu; Antigravity cho việc dài.
   Phải sửa lại: Antigravity báo hết thời gian nhưng vẫn chạy ngầm và ghi chồng lên file đang sửa (khai báo `MoneyTip` hai lần), nên bỏ bản đó và áp lại bản sạch.
   Bản đầu của nút gợi ý chỉ gọi được agent khi trang chạy trong Claude Artifact, trên site thật luôn rơi về gợi ý mẫu; phải thêm API backend gọi LLM qua `llm.py`.
   Codex chỉ ra lỗi bấm hai lần chạy hai lượt cùng lúc, cắt chuỗi làm vỡ ký tự Unicode và agent có thể trả ít hơn 3 gợi ý; đã sửa cả ba và thêm test.
   Một thay đổi prompt Thinking do AI viết làm kết quả kém đi nên đã revert (`fc23d57`).

3. Một câu thử trượt của nhóm và mình học được gì từ nó:
   Ở lượt đánh giá 1, agent Thinking trả GO cho B13, B14, B16 dù ô lõi chưa có bằng chứng thật: chỉ cần trích dẫn có trong tin nhắn là được tính, kể cả câu kể nỗi đau hay lời đoán.
   Lượt 2 thêm luật bằng code `quote_fits` thì hết GO sai, nhưng quy tắc `no_ai_needed` mới lại làm hỏng B03, B04 (trả NO thay vì NOT YET).
   Bài học: luật quan trọng nên kiểm bằng code thay vì chỉ dặn trong prompt, và mỗi lần sửa phải chạy lại cả bộ câu để thấy câu nào tốt lên, câu nào tệ đi.

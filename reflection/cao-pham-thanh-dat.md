# Reflection — Cao Phạm Thành Đạt

1. **Vai trò + phần mình làm:** Thành viên, phụ trách module **Quality** và **Maintaining** trong Workstation (`frontend/public/tang/app.js`, `health.js`, `style.css`).
   Dựng tab Quality (chỉ số cần đạt, lịch sử các lần chạy, chi phí token) và mở rộng Maintaining (lịch bảo trì, gợi ý cập nhật): PR #2 (`db38155`), PR #5 (`fe852de`); sửa bố cục ở 375px và thẻ chỉ số (`292cd07`, `fb03396`).
   Sửa lỗi agent Thinking, thêm OpenRouter, nối benchmark vào agent thật: PR #10 (`23fc5b4`, `cb44761`, `b63c6e2`).
   Thay khối số doanh thu ở tab Quality bằng nút để agent gợi ý cách kiếm tiền: API `POST /api/v1/quality/money-tips` (`backend/app/agent/money_tips.py`, `backend/app/api/quality.py`, `backend/prompts/money_tips.md`), lưu theo đội trong `quality.tips`, test ở `backend/tests/test_quality_money_tips.py`.

2. **AI hỗ trợ mình thế nào:** Dùng Claude Code để đọc code, sửa, chạy test và thử trên trình duyệt; Codex để review code và đối chiếu với yêu cầu của PO; Antigravity cho việc dài.
   Phải sửa lại: Antigravity báo hết thời gian nhưng vẫn chạy ngầm và ghi chồng lên file đang sửa (khai báo `MoneyTip` hai lần), nên bỏ bản đó và áp lại bản sạch.
   Bản đầu của nút gợi ý chỉ gọi được agent khi trang chạy trong Claude Artifact, trên site thật luôn rơi về gợi ý mẫu; phải thêm API backend gọi LLM qua `llm.py`.
   Codex chỉ ra lỗi bấm hai lần chạy hai lượt cùng lúc, cắt chuỗi làm vỡ ký tự Unicode và agent có thể trả ít hơn 3 gợi ý; đã sửa cả ba và thêm test.
   Một thay đổi prompt Thinking do AI viết làm kết quả kém đi nên đã revert (`fc23d57`).

3. **Một câu thử trượt của nhóm và mình học được gì:** B04: "tụi mình định làm app nhắc học vì sinh viên bây giờ lười lắm, tối nào cũng lướt TikTok thay vì học". Đáp án là NOT YET và hỏi tiếp Persona, vì đây mới là triệu chứng chung chung, chưa có người cụ thể hay lần cụ thể.
   Lượt 1 qua, nhưng từ lượt 2 sang lượt 3 agent trả NO và bật `no_ai_needed`: quy tắc "nguyên nhân là thói quen thì không cần AI" thêm ở lượt 2 bị áp quá rộng, chưa có bằng chứng đã kết luận.
   Bài học: một quy tắc thêm để sửa vài câu có thể làm hỏng câu đang đúng, nên mỗi lần sửa phải chạy lại cả bộ câu và so từng câu với lượt trước. Kết luận NO cũng cần đủ bằng chứng như GO, chứ không chỉ dựa vào cảm giác "nghe như thói quen".

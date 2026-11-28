# Reflection — Cao Trung Hiếu

1. **Vai trò + phần mình làm:** Đội trưởng. Mình làm module **Thinking** (module chính của nhóm), ghép nối các module và landing page.
   - **Agent Thinking** (`backend/app/agent/`): workflow cố định `guard_input → update_canvas (Gemini) → mark_evidence → ask_next | verdict → human_review → finalize`. Mỗi tin nhắn chỉ gọi LLM đúng 1 lần, các node còn lại là code. GO / NOT YET / NO do code quyết (`canvas.py`, hàm `decide`), không để LLM tự kết luận.
   - **Luật bằng chứng:** một thẻ chỉ là "có bằng chứng" khi có người cụ thể, một lần cụ thể và câu trích nguyên văn có thật trong tin nhắn; thêm `quote_fits` để câu trích của JTBD và Workaround đúng kiểu thông tin (cải tiến cho lượt 2).
   - **Luật 9 thẻ (sau CP2):** agent chỉ đánh giá khi đủ 9 thẻ; 4 thẻ lõi phải có chuyện thật, 5 thẻ còn lại chỉ cần có nội dung; thẻ Prior Art do agent tự điền từ Solution và AI Leverage, có chốt chặn bằng code (`nodes.py`: `_gate_agent_prior_art`).
   - **Đánh giá và chi phí:** chạy ba lượt trên bộ 23 câu (`eval/run-1.csv`, `run-2.csv`, `run-3.csv`), viết `eval/README.md`, `eval/report.md`; chạy mô phỏng chi phí với 2 mức giá model (`cost/`, `cost/cost-estimate.md`).
   - **Tài liệu và slide:** `spec.md`, changelog §10, `demo-slides.pdf` (nguồn `slides/demo-slides.html`), `docs/ai-usage.md`.
   - **Ghép nối và landing:** nối agent với giao diện Workstation, trang landing `frontend/public/index.html`, kiểm tra cấu hình model trên VPS qua `/health`.

2. **AI hỗ trợ mình thế nào:** Mình dùng **Claude Code** để viết code agent, test, giao diện, slide và cập nhật tài liệu; **Gemini** là model chạy trong sản phẩm (không dùng AI để chấm: `eval/grade.py` chấm bằng code). Chỗ mình phải sửa lại output của AI:
   - Agent đòi tên thật của người được nhắc và đòi mốc thời gian, nên chuyện "khách A muốn vay nóng, chị tôi xử lý chậm nên A bỏ đi" bị coi là giả định. Mình yêu cầu sửa prompt để chỉ cần một người có thật và một sự việc đã xảy ra.
   - Persona bị điền thành một người ("Chị Lan xem tin nhắn khách hỏi áo"). Mình yêu cầu persona là một lớp vai (nghề, bối cảnh), người cụ thể đặt vào `who`.
   - Câu hỏi cho người dùng không được ghi sẵn "bạn tôi, chị tôi là được"; mình yêu cầu đưa phần đó vào system prompt chứ không vào câu hỏi.
   - Slide bản đầu quá dài và chữ nhỏ; mình yêu cầu viết lại ngắn, chữ to, theo cấu trúc Why, Who, How, What và bỏ những câu mình không nói.
   - Mình cũng giữ nguyên bộ câu thử và các lượt cũ, không cho sửa đáp án hay xóa run để điểm đẹp lên.

3. **Một câu thử trượt và bài học:**
   - **B02 và B15** (kỳ vọng GO từ một tin nhắn) trượt sau khi nhóm đổi luật thành "đủ 9 thẻ mới đánh giá": luật mới trả NOT YET. Điểm tụt từ 87% (lượt 2) xuống 74% (lượt 3), thuong + kho còn 68,4%, dưới chuẩn 75%. Bài học: đổi nghiệp vụ thì đáp án kỳ vọng của một số câu thử cũng bị ảnh hưởng. Mình ghi thẳng ở `spec.md` §10 và `eval/report.md` rằng điểm giảm vì đổi nghiệp vụ, không sửa đáp án cho khớp.
   - **B05** (người dùng kể lại chuyện nghe được): mình thử nới luật để persona lên bằng chứng không cần "lần cụ thể" thì B05 trượt, nên hoàn nguyên và chỉ sửa phần prompt. Bài học: một luật nhỏ có thể làm hỏng một câu thử ở chỗ không ngờ tới, nên sau mỗi thay đổi phải chạy lại cả bộ câu thử trước khi giữ.
   - Cùng một đoạn code đã từng ra 16/23 rồi 19/23 giữa hai lần chạy, nên một con số đơn lẻ chưa đủ chắc; mình ghi vào phần "việc làm nếu có thêm một tuần": chạy mỗi lượt ít nhất 3 lần và báo khoảng dao động.

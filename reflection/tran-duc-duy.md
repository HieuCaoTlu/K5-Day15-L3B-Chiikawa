# Reflection — Trần Đức Duy

1. **Vai trò + phần mình làm:** Thành viên. Mình làm module **Pitching** (biến Canvas đã duyệt thành khảo sát, slide và bài quảng cáo).
   - **Form khảo sát** (`backend/prompts/survey_generate.md`, `backend/app/api/pitching.py`): agent soạn form theo đúng một vai người dùng, có chia phần; người dùng sửa câu hỏi rồi bấm Lưu thì mới phát hành và tự copy link `/survey` (`frontend/app/survey/page.tsx`). Commit `a22533b`, `44a71d5`.
   - **Dashboard và AI overview:** số liệu (đếm, %, điểm trung bình) tính bằng Python; phản hồi thật và phản hồi mẫu đếm riêng; AI overview chỉ tóm tắt trên số đã tính.
   - **Pitching HTML:** bộ slide 6 kiểu bố cục (bìa, 2 cột, thẻ, đối chiếu, số liệu lớn, lộ trình), sửa từng trang, xem toàn màn hình, xuất HTML, publish link `/pitch` (`frontend/app/pitch/page.tsx`). Commit `2200cf9`.
   - **Bài quảng cáo:** một bài đăng chung giữ chỗ trống `[...]` để người duyệt tự điền trước khi đăng; có nút chèn link khảo sát, sao chép, xóa.
   - **Chốt chặn số liệu cho agent** (`backend/app/agent/pitching_gen.py`, PR #16, commit `7f02c5e`): slide, overview, quảng cáo chỉ được dùng số do code tính sẵn; câu có số không có trong dữ liệu bị code xóa; ép bố cục khớp nội dung; có phản hồi mẫu thì slide ghi rõ. Thêm 6 test ở `backend/tests/test_pitching.py`.

2. **AI hỗ trợ mình thế nào:** Mình dùng **Claude Code** để viết code Pitching, viết test và chạy thử end-to-end trên trình duyệt; **Gemini** là model chạy trong sản phẩm để soạn form, slide, overview và bài quảng cáo. Chỗ mình phải sửa lại output của AI:
   - Agent soạn slide (Gemini) tự tính ra "86.4%" bằng cách gộp cả phản hồi mẫu, và slide đối chiếu 2 vế bị vỡ khi có 3 ý. Mình đổi sang cho code tính số, LLM chỉ chép lại, và code tự sửa bố cục.
   - Phản hồi mẫu (dùng để thử biểu đồ) có câu trả lời mở viết sẵn, lọt lên slide như lời người dùng thật. Mình yêu cầu chỉ đưa câu trả lời của người thật vào agent.
   - Claude Code ghép nhãn cho số trần trên slide mà không xét trường hợp hai phương án trùng số; mình yêu cầu chỉ ghép khi khớp duy nhất một phương án, trùng thì giữ nguyên.
   - Form tạo mới tự hiện câu hỏi cũ còn sót từ lần trước; mình yêu cầu form luôn trống, chỉ có câu hỏi khi người dùng bấm tạo.
   - Mình tự quyết các thay đổi giao diện (form mỗi câu một ô trắng, nút Lưu kiêm copy link, bỏ chữ thừa ở chân slide), đọc lại diff và chạy test trước mỗi commit.

3. **Một câu thử trượt và bài học:**
   - **B10** (lượt 3, `eval/run-3.csv`): "cô giáo cần nhắc phụ huynh nộp học phí đúng ngày 5 mỗi tháng, mình định dùng AI làm bot nhắc luôn cho hiện đại". Kỳ vọng NO vì một lịch nhắc là đủ, nhưng agent trả NOT YET và còn điền AI Leverage. Bài học: không phải chỗ nào cũng cần AI. Mình áp dụng ngay ở Pitching: đếm, tính %, vẽ biểu đồ, kiểm số trên slide đều làm bằng code; Gemini chỉ làm phần cần hiểu và viết ngôn ngữ.
   - Khi test end-to-end kịch bản chị Lan, mình thấy một tin nhắn ở Thinking ghi đè ô Pain Point, và slide Pitching lấy luôn vấn đề sai đó. Bài học: module sau phụ thuộc chất lượng module trước, nên phải test cả luồng chứ không chỉ test riêng phần mình.

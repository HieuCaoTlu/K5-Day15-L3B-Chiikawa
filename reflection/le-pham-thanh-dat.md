# Reflection — Lê Phạm Thành Đạt

1. **Vai trò + phần mình làm:** Thành viên, phụ trách kết nối hệ thống với GitHub và module **Planning** (`backend/app/planning/`, `backend/app/api/planning.py`).
   Làm lại tab Planning và nối GitHub thật (`1a41f3e`): kết nối bằng một nút không cần sửa `.env`, mã mời vào đội, bảng Task kéo thả, nút "Bắt đầu task" tạo nhánh và PR nháp, tự cập nhật task theo PR, thông báo trình duyệt nhắc hạn.
   Đồng bộ dữ liệu theo đội, thêm WebSocket để báo thay đổi (`ac9ccee`, `34928d9`); thêm nút từ Thinking sang Planning (`e4e2d47`).
   Tự lập sprint từ Canvas đã duyệt và giao task cho cả đội, LLM lỗi hoặc thiếu việc thì dùng luật (`93603a4`); cho mô hình 3D sáng theo tiến độ thật của từng bước (`d8b60e5`).
   Ngoài ra: sửa lỗi chuyển tab bị trắng trang (`933d959`), nối Quality và Maintaining vào dữ liệu thật của đội (`143ebbf`), thiết kế lại trang giới thiệu (`00bba4e`, `6f35f83`), sửa bài quảng cáo Pitching bị mất dấu (`ab38121`).

2. **AI hỗ trợ mình thế nào:** Mình dùng **Claude Code** để viết code, chạy test, thử trên trình duyệt, gỡ lỗi và tạo PR. Những chỗ mình phải yêu cầu sửa:
   Planning còn nhiều phần mock, mình yêu cầu nối thật và để người dùng kết nối GitHub bằng một nút. Task đổi trạng thái tự động theo PR nhưng vẫn phải kéo thả tay được; tạo sprint mới thì luôn ra số 1.
   Sau khi AI gộp code, chuyển tab bị trắng trang, F5 mới hiện. AI đã kiểm tra chữ được vẽ và lỗi JavaScript nhưng không kiểm tra tab có thật sự hiện ra, nên để lọt lỗi.
   Hai người cùng đội thấy dữ liệu khác nhau vì một số phần chỉ lưu trong trình duyệt. Mình yêu cầu đồng bộ theo đội, Thinking chỉ trưởng nhóm sửa, thành viên chỉ xem, rồi đổi sang WebSocket.
   Trang giới thiệu bản đầu bị "AI slop", lời văn giống máy viết, nên mình yêu cầu bỏ bớt màu mè và viết lại; hình Chiikawa có rủi ro bản quyền nên mình yêu cầu thay.

3. **Một câu thử trượt của nhóm và mình học được gì:** B10: cô giáo cần nhắc phụ huynh nộp học phí ngày 5 hằng tháng và định làm bot AI "cho hiện đại". Đáp án là NO vì một lịch nhắc là đủ, nhưng cả ba lượt agent đều trả NOT YET, không bật `no_ai_needed` và hỏi tiếp Persona.
   Agent lo điền cho đủ thẻ trước mà chưa nhận ra ngay từ câu đầu rằng bài toán có đầu vào ổn định, quy tắc rõ ràng. Sửa prompt ở lượt 2 vẫn không làm câu này qua.
   Bài học: trước khi dùng AI phải hỏi một quy tắc code thường có giải quyết được không. Việc như nhắc đúng ngày nên làm bằng lịch và code vì rẻ hơn và kết quả đoán trước được; khi một điều chỉ nhờ prompt mà vẫn không ổn, nên cân nhắc thêm luật bằng code và chạy lại cả bộ câu thử.

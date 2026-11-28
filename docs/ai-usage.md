# Khai báo dùng AI

README của nhóm có mục "Dùng AI vào việc gì" (2–3 dòng, bắt buộc). Ghi chi tiết vào bảng dưới đây.

> Luật của đề: dùng AI để làm bài thoải mái, nhưng **ai không giải thích được phần có tên mình thì phần đó nhận 0 điểm**. Khai thiếu không bị trừ; giấu mới bị.

| Việc | Công cụ AI | AI làm gì | Người kiểm/sửa gì | Ai phụ trách |
|---|---|---|---|---|
| Code bản chạy thử | Claude Code | Viết agent Thinking ở `backend/app/agent/` (graph, luật `canvas.py`, các node, mock), test, giao diện landing và Workstation | Chạy test và bộ câu thử, thử tay luồng 9 tin nhắn trên giao diện, đọc lại luật code | Cao Trung Hiếu (Thinking, ghép nối, landing); các module khác: người phụ trách module đó |
| Prompt / thiết kế lời gọi mô hình | Claude Code | Soạn và sửa prompt `update_canvas` (tư duy sản phẩm, cách tính người và lần cụ thể, persona là lớp vai) | Đọc prompt, thử với tin nhắn thật trên Gemini, đo bằng benchmark và sửa theo góp ý (ví dụ không đòi tên thật của người được nhắc) | Cao Trung Hiếu |
| Đào data (viết script đếm, gợi ý nhãn) | *(nhóm điền: công cụ nào, hoặc "không dùng")* | *(nhóm điền)* | Kiểm tay __ dòng, khớp __ | Trần Đức Duy (khảo sát và bằng chứng) |
| Rà câu hỏi phỏng vấn / khảo sát | *(nhóm điền)* | Chỉ rà câu dẫn dắt | *(nhóm điền)* | Trần Đức Duy |
| Viết câu thử (benchmark) | Không dùng AI sinh | Không có: 23 câu do nhóm tự viết (`data/DATA_CARD.md`: "tự viết, không sinh bằng LLM") | Mỗi câu có `source` trong `eval/benchmark.csv`: nguoi_dung 4 · data_that 4 · tu_viet 15; câu tự viết đều dán nhãn `synthetic` | Cao Phạm Thành Đạt (bộ câu thử) |
| Sinh data `synthetic` (nếu có) | Không dùng AI | Không có: viết tay, không sinh bằng prompt hay script | Không có seed; nhóm tự đọc lại, chưa có người ngoài nhóm kiểm | Cao Phạm Thành Đạt |
| Chấm cột `pass` bằng LLM (nếu có) | Không dùng LLM | Không có: chấm bằng code `eval/grade.py` | Số lượt đã chạy giữ nguyên: `eval/run-1.csv`, `run-2.csv`, `run-3.csv` | Cao Trung Hiếu |
| Slide, văn bản | Claude Code | Dựng slide HTML rồi xuất PDF (`slides/demo-slides.html`, `demo-slides.pdf`); cập nhật `spec.md`, `eval/README.md`, `eval/report.md`, `cost/cost-estimate.md` theo số đã chạy | Đọc lại từng trang slide, sửa lời cho đúng ý, đối chiếu số với `run-*.csv` và `cost/` trước khi nộp | Cao Trung Hiếu |

**Không dùng AI để:** tạo người được phỏng vấn, trích dẫn, câu trả lời khảo sát; sửa kết quả các lượt đã chạy (`eval/run-*.csv`, `cost/simulate-*.csv`, `traces/`).

**Gemini** (`gemini-3.5-flash-lite`) là model chạy trong sản phẩm và trong lúc đo; token và chi phí ghi trong `cost/`. Các ô *(nhóm điền)* ở trên là việc người phụ trách phải tự ghi đúng sự thật.

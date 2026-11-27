# Data card — dữ liệu bản chạy thử dùng

> Điền ở guide bước 2.4 (bản đầu ở CP2, đủ ở CP3). Ôn lại: ngày 6 · lab ngày 6. Chấm ở rubric R4.
> Một trang. Mỗi dataset một mục. Dữ liệu chạy thử (bài mẫu, thông báo mẫu, đoạn transcript…) để trong thư mục `data/` này.
> Không commit nguyên tài liệu khoá, dữ liệu cá nhân thật hay nguyên file data BTC cấp — chỉ đoạn trích ngắn, bản viết lại, hoặc số đã tổng hợp.

## Dataset 1 · Khảo sát học viên AI20K (Google Form)

| | |
|---|---|
| Dùng để làm gì | đào bằng chứng pain (`canvas.md` dòng 4); lấy 8 trong 23 câu của bộ câu thử (cột `source` = `nguoi_dung` hoặc `data_that`) |
| Từ đâu | nhóm tự thu qua Google Form, học viên AI20K Level 3–4 Khóa 5 (ngoài nhóm) |
| Xử lý những bước gì | lọc: chưa lọc · làm sạch: không · ẩn danh: không thu tên · chia: không |
| Số dòng / số đoạn | 22 phản hồi; 7 câu trả lời mở |
| Phiên bản / ngày lấy | bản chụp ngày 27/11/2026 |
| Nhãn | thật |
| Giới hạn | mẫu nhỏ (n=22), chỉ học viên cùng khoá nên lệch về người đã học Day 2; khảo sát chỉ cho biết người ta **làm gì**, chưa cho biết **vì sao**; chưa có phỏng vấn để kiểm lại |

## Dataset 2 · Bộ câu thử Thinking (`eval/benchmark.csv`)

| | |
|---|---|
| Dùng để làm gì | đo agent Thinking (kết luận GO / NOT YET / NO, đánh dấu bằng chứng, từ chối) |
| Từ đâu | nhóm tự viết: 8 câu dựa trên lời người dùng hoặc số liệu khảo sát (Dataset 1), 15 câu viết theo tài liệu Day 2 |
| Xử lý những bước gì | không dùng dữ liệu của người thật; tên trong câu thử (chị Lan, chị Hà…) là nhân vật giả; viết như tin nhắn thật (không dấu, viết tắt, áp lực, lệnh chèn) |
| Số dòng / số đoạn | 23 câu: thuong 3 · kho 16 · tu_choi 4 |
| Phiên bản / ngày lấy | v3, 27/11/2026 |
| Nhãn | `synthetic` (tự viết, không sinh bằng LLM) |
| Giới hạn | mỗi câu là một tin nhắn đơn, chưa kiểm được hội thoại nhiều lượt; mới có một người viết nên có thể lệch; chưa có phần giữ riêng (held-out) |

## Dataset 3 · Dữ liệu mẫu cho demo và mock

| | |
|---|---|
| Dùng để làm gì | demo Workstation và chế độ `MOCK_NODES` khi không có API key |
| Từ đâu | nhóm tự viết: bài toán "Đáp Nhanh" (trợ lý CSKH) trong `frontend/public/tang/data.js`; Canvas mẫu "chị Lan" trong `backend/app/agent/mocks/` |
| Xử lý những bước gì | không dùng dữ liệu người thật |
| Số dòng / số đoạn | 1 Canvas mẫu, 12 task mẫu, 8 phản hồi khảo sát mẫu, 7 slide mẫu |
| Phiên bản / ngày lấy | 27/11/2026 |
| Nhãn | `synthetic` |
| Giới hạn | chỉ để demo, **không dùng làm bằng chứng pain** và không đưa vào số liệu đánh giá |

**Data `synthetic` (nhóm tự sinh):** viết tay, không sinh bằng prompt hay script, không có seed. Người kiểm: nhóm tự đọc lại; chưa có người ngoài nhóm kiểm.

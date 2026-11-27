# Tổng hợp bằng chứng pain

> Nhóm Chiikawa · Track A · nộp CP3 (10:00 Thứ Bảy 28/11). Số liệu lấy từ khảo sát Google Form, chạy lại được bằng `python evidence/count.py "<file csv>"`.
> File csv gốc có mã sinh viên nên **không commit**; repo chỉ giữ số đã tổng hợp và vài câu trả lời mở đã bỏ danh tính.

## 1. Nguồn đã dùng

| Nguồn | Đạt ngưỡng? | File |
|---|---|---|
| Đào data (x/N, %, cách đếm chạy lại được, ≥5 ví dụ) | ☐ Không dùng | Dữ liệu pre-class của BTC chưa khai thác; `evidence/data-mining.md` vẫn là mẫu trống |
| Phỏng vấn (≥3 người ngoài nhóm, đúng người dùng) | ☐ Không dùng ở mốc này (khảo sát đã đủ ngưỡng; phỏng vấn để kiểm chéo sau) | `evidence/interviews/` trống |
| Khảo sát (≥20 người ngoài nhóm, đúng người dùng) | ☑ **Đạt**: n = 22 | `evidence/count.py` (cách đếm) · mục 2 và 3 dưới đây |

Khảo sát: Google Form, 22 phản hồi, học viên AI20K Level 3–4 Khóa 5 (ngoài nhóm, cùng vai với người dùng chính là Engineer được giao làm giải pháp AI). Thu ngày 27/11/2026 từ 15:10 đến 19:22. Ẩn danh: file gốc có hỏi mã sinh viên để tặng quà nhưng không dùng trong phân tích.

## 2. Số chính

Mẫu số mọi phép đếm là **22 phản hồi** (một dòng = một người).

**Khi được gặp khách hàng 5 phút, bạn hỏi câu nào? (chọn 2; đếm theo người có chọn câu đó)**

| Câu hỏi | Số người chọn |
|---|---|
| "Anh/chị muốn sản phẩm có những tính năng gì?" | **16/22 (72,7%)** |
| "Quy trình này có thể tự động hóa được, anh chị muốn triển khai không?" | 10/22 (45,5%) |
| "Dữ liệu hiện có lưu ở đâu, định dạng gì?" | 10/22 (45,5%) |
| "Lần gần nhất anh/chị gặp vấn đề này là khi nào?" | 9/22 (40,9%) |
| "Anh/chị sẵn sàng trả bao nhiêu?" | 8/22 (36,4%) |

Chỉ hỏi chuyện đã xảy ra mà không hỏi tính năng nào: **5/22 (22,7%)**.

**Kể một lần build xong nhưng không giải quyết đúng vấn đề (câu mở, không bắt buộc):** 7/22 (31,8%) có trả lời. Trong 7 câu, 6 nói về làm sai bài toán, không ai cần, hoặc đã có sản phẩm khác; 3 câu nói thẳng "không ai dùng" hoặc "để không". Một câu là lỗi kỹ thuật ("build bài lab nhưng không chạy được"), không phải sai bài toán.

**Điều nghĩ đến đầu tiên khi giảng viên nhắc chủ đề "Chăm sóc khách hàng cho shop online":**

| Câu trả lời | Số người |
|---|---|
| Khách hàng đang gặp vấn đề gì | 8/22 (36,4%) |
| Dùng công nghệ gì để build (RAG, chatbot, LangGraph...) | 7/22 (31,8%) |
| Dữ liệu lấy ở đâu | 3/22 (13,6%) |
| Kiến trúc hệ thống và cách deploy | 2/22 (9,1%) |
| Đã có sản phẩm nào tương tự trên thị trường chưa | 2/22 (9,1%) |

Nghĩ về công nghệ, dữ liệu hoặc kiến trúc trước, tức không nghĩ về khách hàng: 12/22 (54,5%).

**Bước khó nhất khi làm sản phẩm:** "Xác định đúng vấn đề và người dùng" 6/22 (27,3%) và "Chốt phạm vi MVP" 6/22 (27,3%) đứng đầu; tiếp theo là "Chọn metric đo thành công" 4/22 (18,2%), "Đánh giá tính khả thi về dữ liệu" 3/22 (13,6%).

**Tự hỏi "vấn đề thật đằng sau chủ đề là gì?" (thang 1–5):** mức 1–2 có 8/22 (36,4%), mức 3 có 7/22 (31,8%), mức 4–5 có 7/22 (31,8%).

Số lần mỗi tháng và số phút mất mỗi lần: **chưa đo**, khảo sát không hỏi. Các con số impact ở `spec.md` §2 vì vậy vẫn là tự ước tính.

## 3. ≥5 trích dẫn nguyên văn (có nguồn, bỏ tên)

Nguồn là số thứ tự dòng trong file khảo sát (dòng 1 là phản hồi đầu tiên theo thời gian). Giữ nguyên chính tả, chỉ bỏ emoji.

1. "Build 1 web đặt lịch sân bóng xong ko ai dùng" — phiếu khảo sát 1
2. "app quản lý chi tiêu, nhưng vấn đề của mình là lười note nên app để không không dùng" — phiếu khảo sát 4
3. "Build chatbox hỗ trợ nhưng không ai dùng" — phiếu khảo sát 10
4. "quá nhiều tính năng không cần thiết cho dự án." — phiếu khảo sát 16
5. "Làm 1 website giới thiệu du lịch Hà Nội nhưng nhận ra đã có HanoiGo vào đầu tháng 11 và nó giải quyết triệt để những gì sản phẩm của tôi đã làm" — phiếu khảo sát 18
6. "build xong 1 đề tài AIoT liên quan đến kinh doanh Billiard nhưng khi xong thì mới nhận ra là không cần thiết" — phiếu khảo sát 21

Bốn trong sáu câu (phiếu 1, 4, 10, 16) cũng được dùng làm câu thử ở `eval/benchmark.csv` (B03, B11, B01, B12, cột nguồn `nguoi_dung`).

## 4. Các nguồn có khớp nhau không

Hiện chỉ có **một** nguồn (khảo sát), chưa có data hay phỏng vấn để kiểm chéo. Bên trong khảo sát thì các câu hỏi nhất quán với nhau theo hướng giả thuyết: người trả lời biết khách hàng quan trọng (36,4% nghĩ tới "khách hàng gặp vấn đề gì" đầu tiên, và đó là đáp án phổ biến nhất của câu đó), nhưng khi giả định được gặp khách thật thì 72,7% vẫn chọn hỏi về tính năng và chỉ 40,9% hỏi về lần gần nhất họ gặp vấn đề. Lệch giữa "biết" và "làm" này là điều Thinking cần xử lý.

## 5. Kết luận

Giả thuyết ở `evidence/hypothesis.md`: **đúng một phần**.

- **Đúng:** khi cần hỏi khách, đa số hướng về tính năng (16/22) hơn về chuyện đã xảy ra (9/22). Cả 6 câu kể lại việc làm sai bài toán đều là kiểu "xây xong rồi mới thấy" (không ai dùng, không cần thiết, đã có sản phẩm khác), khớp với kết cục mà `canvas.md` dự đoán.
- **Chưa đủ để khẳng định:** (a) mẫu nhỏ (n = 22), chỉ gồm học viên cùng khoá đã học Day 2, nên có thể lệch; (b) câu kể lại chỉ có 7 người trả lời và câu mở không bắt buộc, người có chuyện để kể mới điền; (c) "Nghĩ đến công nghệ trước" chỉ 7/22 (31,8%), tức không phải đa số. Lưu ý `canvas.md` (CP2) ghi "7/7 đều kể được" là hơi mạnh: trong 7 câu có 1 câu là lỗi kỹ thuật, nên con số đúng là 6/7 về sai bài toán.

**Điều vẫn chưa biết:** vì sao họ chọn hỏi tính năng (thói quen, hay chưa biết cách hỏi khác); mỗi lần như vậy tốn bao nhiêu thời gian và công sức; và liệu một agent hỏi lại từng câu có đổi được hành vi này không. Hai việc kiểm tiếp: phỏng vấn ≥3 trưởng nhóm Engineer về lần gần nhất họ chốt sai đề tài, và đo số lần/tháng ở khảo sát vòng hai.

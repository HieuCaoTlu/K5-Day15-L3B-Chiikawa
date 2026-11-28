# Báo cáo đánh giá — lượt 1 → một cải tiến → lượt 2

> Điền ở guide bước 4.1. Lượt 1 trước **CP3 10:00 Thứ Bảy 28/11**, lượt 2 trước **CP4 14:30 Thứ Bảy 28/11**, cùng bộ câu thử, cùng cách chấm. Chấm ở rubric R5.
> Số lấy từ `python run.py score eval/run-1.csv` (và `run-2.csv`) sau khi điền cột `pass`. **Kết quả thấp ghi thật vẫn đủ điểm.**
> Không được: sửa chuẩn "đạt", bỏ câu thử trượt, sửa `expected` cho khớp output, sửa kết quả lượt đã chạy.

## 1. Kết quả

| Lượt | Run ID | Đạt / tổng | % | thuong | kho | tu_choi | So với chuẩn "đạt" |
|---|---|---|---|---|---|---|---|
| 1 | run-1@20261128-010324 | 18/23 | 78% | 3/3 | 11/16 | 4/4 | **chưa** (thuong+kho 14/19 = 73,7%) |
| 2 | run-2@20261128-021100 | 20/23 | 87% | 2/3 | 14/16 | 4/4 | **đạt** (thuong+kho 16/19 = 84,2%; 0 câu GO sai) |
| 3 | run-3@20261128-112110 | 17/23 | 74% | 2/3 | 11/16 | 4/4 | **chưa** (thuong+kho 13/19 = 68,4%; 0 câu GO sai) |

Kết quả từng câu: `eval/run-1.csv` (lượt 1), `eval/run-2.csv` (lượt 2, sau cải tiến), `eval/run-3.csv` (lượt 3, sau bổ sung nghiệp vụ). Trace: `traces/run-1.jsonl`, `traces/run-2.jsonl`, `traces/run-3.jsonl`.

**Lượt 3 (thêm sau lượt 2, không sửa dòng cũ):** nhóm bổ sung nghiệp vụ cho agent: chỉ đánh giá khi đủ 9 ô, ô Prior Art do agent tự điền, và chỉnh prompt cho người cụ thể, sự việc và persona. Điểm giảm 87% → 74% (20/23 → 17/23). B02 và B15 trượt vì kỳ vọng GO từ một tin nhắn mà luật mới trả NOT YET; B04, B05, B06, B10 cũng trượt, nhóm chưa phân tích hết nguyên nhân từng câu. Bộ câu thử, đáp án và chuẩn "đạt" không đổi.

## 2. Lỗi lượt 1 — gom thành nhóm có tên

| Nhóm lỗi | Số câu | Câu |
|---|---|---|
| Đánh dấu ô lõi là CÓ BẰNG CHỨNG khi chưa có lời của chính người dùng (JTBD lấy từ câu kể nỗi đau hoặc lời đoán, Workaround chưa nói), dẫn đến GO sai | 3 | B13, B14, B16 |
| Chưa nhận ra bài toán không cần AI (lười ghi chép, nhắc theo lịch) | 2 | B10, B11 |

**≥3 lỗi cụ thể:**

| Câu | Input | Output | Vì sao sai |
|---|---|---|---|
| B14 | Chị Mai mất cả buổi sáng đối chiếu hóa đơn, làm tay trên Excel; "mình tính làm tool OCR" (chưa nói chị muốn đạt gì) | GO, JTBD CÓ BẰNG CHỨNG, trích lại câu kể nỗi đau | Câu trích có thật nên qua luật code, nhưng đó là nỗi đau, không phải điều chị Mai nói muốn đạt; đáng ra NOT YET, hỏi JTBD |
| B16 | Chị Hà mất 2 tiếng chép điểm danh; "nghe bạn chị kể là chị ấy chắc muốn điểm danh nhanh hơn, mình đoán vậy" | GO, JTBD CÓ BẰNG CHỨNG | Lời đoán và nghe kể lại bị coi là bằng chứng vì trích dẫn có thật trong tin nhắn |
| B11 | Mình có ý tưởng app quản lý chi tiêu, nhưng vấn đề thật là mình lười ghi chép nên app cài xong để đó | NOT YET, hỏi tiếp Persona | Nguyên nhân là thói quen, app không xử lý được; đáng ra NO (cờ `no_ai_needed`) |


## 3. Một lần cải tiến

- Nhắm vào nhóm lỗi: **GO sai vì đánh dấu ô lõi là CÓ BẰNG CHỨNG khi chưa có lời của chính người dùng** (B13, B14, B16) — vì đây là lỗi nguy hiểm nhất: trưởng nhóm được báo GO trong khi chưa biết người dùng muốn đạt gì, rồi cả nhóm build sai hướng. Chỉ số `ket_luan_dung` quy định 0 câu GO sai.
- Đã sửa gì: (1) luật code `quote_fits` trong `backend/app/agent/canvas.py`: trích dẫn của JTBD phải có từ thể hiện mong muốn và không có dấu hiệu lời đoán hay nghe kể lại; trích dẫn của Workaround phải mô tả cách đang làm; (2) agent hỏi đúng phần còn thiếu thay vì lặp câu cũ; (3) prompt `update_canvas` thêm quy tắc tư duy sản phẩm và quy tắc bật `no_ai_needed` khi nguyên nhân gốc là thói quen của chính người dùng. Không sửa bộ câu thử, đáp án hay chuẩn "đạt".
- Kết quả: nhóm lỗi đó (B13, B14, B16) 0/3 → 3/3 · tổng 78% → 87% (18/23 → 20/23) · thuong+kho 73,7% → 84,2% · câu GO sai 3 → 0.
- Câu nào **tệ đi** sau khi sửa: **B03** và **B04** (đạt → trượt): agent trả NO vì bật `no_ai_needed` cho câu "làm web đặt lịch sân bóng xong không ai dùng" (B03) và câu "sinh viên lười, lướt TikTok" (B04), đáng ra NOT YET. Nhiều khả năng do quy tắc `no_ai_needed` mới trong prompt bật cờ quá rộng. Tổng kết: sửa được 4 câu (B11, B13, B14, B16), làm hỏng 2 câu (B03, B04): 18 + 4 − 2 = 20.

## 4. Còn lại

- Lỗi chưa sửa + nguy hiểm thế nào: (1) B10 vẫn chưa nhận ra bài toán nhắc theo lịch không cần AI (nguy hiểm vừa: nhóm làm thừa AI); (2) B03 và B04 bị trả NO thay vì NOT YET, tức agent kết luận "bỏ đề tài" quá sớm khi mới có triệu chứng (nguy hiểm: trưởng nhóm bỏ một đề tài có thể còn cứu được); (3) mỗi lượt mới chạy một lần và chưa đo độ dao động giữa các lần chạy, nên điểm 87% có thể lệch vài câu.
- Nếu có thêm 1 tuần: chạy mỗi lượt nhiều lần và báo cả khoảng dao động; siết cờ `no_ai_needed` bằng luật code (chỉ bật khi người dùng tự nói nguyên nhân là thói quen), thay vì chỉ dựa vào prompt; thêm câu thử cho ca "triệu chứng thói quen nhưng chưa rõ nguyên nhân".

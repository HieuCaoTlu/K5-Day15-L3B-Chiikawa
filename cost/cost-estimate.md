# Chi phí khi dùng thật

> Điền ở guide bước 4.2, nộp ở CP4 14:30 Thứ Bảy 28/11. Ôn lại: ngày 13, ngày 1, ngày 14 · lab ngày 13, lab ngày 14. Chấm ở rubric R6.
> Số **không điền tay**: điền `cost/personas.yaml` → `python run.py simulate` → chép bảng trong `cost/simulate-N-summary.md` vào đây.
> Lúc build dùng gói miễn phí vẫn tính theo **giá gói trả phí** — đây là chi phí cho lúc đưa vào dùng thật.

## 1. Đầu vào

- **Persona** (`cost/personas.yaml`): 3 kiểu — `dung_it` 50% · 1 phiên / tháng · 8 lượt; `dung_vua` 30% · 2 phiên / tháng · 8 lượt; `dung_nhieu` 20% · 4 phiên / tháng · 10 lượt. Nguồn: `spec.md` §2, tự ước tính, chưa kiểm. 8 lượt là mức tối thiểu vì agent chỉ đánh giá khi đủ 9 ô (4 ô lõi + Solution, AI Leverage, MVP Scope, Metrics; ô đối thủ agent tự điền)
- **Số người dùng thật** 3 kịch bản: thấp 100 · cơ sở 175 · cao 250. Nguồn: hơn 700 học viên L3 chia 4 người / nhóm = 175 trưởng nhóm (README hackathon, `spec.md` §2); cao: hơn 1.000 học viên chia 4; thấp tự ước tính
- **Giá** (bảng giá BTC, https://ai.google.dev/gemini-api/docs/pricing · xem 25/11/2026): gemini-3.5-flash-lite vào 0,30 · ra 2,50 USD / 1 triệu token. Mới tính 1 mức model; chưa có mức thứ hai để so
- **Tỉ lệ đạt** dùng để tính: 19/23 (83%) — lượt `run-5` (code cuối, agent đòi đủ 9 ô; lượt 2 là 20/23 = 87% với luật cũ; cùng luật 9 ô, run-4 ra 16/23 nên kết quả dao động vài câu). Benchmark giữ nguyên, không sửa; B02 và B15 trượt vì kỳ vọng GO từ một tin nhắn
- Đo token trên model gemini-3.5-flash-lite, tính giá model gemini-3.5-flash-lite

## 2. Kết quả mô phỏng

Lượt mô phỏng: `cost/simulate-2.csv` · run ID simulate-2@20261128-091918 · 50 phiên (0 lỗi) · seed 42

*(dán bảng từ `cost/simulate-N-summary.md`)*

| Model | Chi phí / phiên | Chi phí / task thành công | / tháng — thấp | / tháng — cơ sở | / tháng — cao | / người / tháng (cơ sở) |
|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite (vào 0,3 · ra 2,5 $/1M) | $0,0083 | $0,0100 | $1,63 | $2,85 | $4,07 | $0,0163 |

Chi phí / task thành công = chi phí trung bình mỗi phiên ÷ tỉ lệ đạt — **không coi như đạt 100%**.

## 3. So với impact

- Impact / người / tháng (`spec.md` §2): 1 lần × 60 phút = 60 phút (tự ước tính, chưa kiểm)
- Chi phí / người / tháng (cơ sở, model gemini-3.5-flash-lite): $0,0163
- **Kết luận một dòng — đáng làm không:** đáng làm: khoảng $0,0163 / người / tháng để tiết kiệm khoảng 60 phút, nhưng số này đo trên đầu vào lấy ngẫu nhiên từ benchmark chứ chưa phải cuộc trò chuyện thật, và tỉ lệ đạt 83% dao động vài câu giữa các lần chạy (16/23 đến 19/23)

## 4. *(Muốn sâu hơn, không bắt buộc)*

- Bảng độ nhạy: model rẻ hơn · cache · cắt ngữ cảnh · giới hạn bước — mỗi cần gạt đổi chi phí bao nhiêu
- Chi phí ngoài model: hosting, lưu trữ, giờ công người duyệt
- Quy mô nào thì bài toán còn đáng làm

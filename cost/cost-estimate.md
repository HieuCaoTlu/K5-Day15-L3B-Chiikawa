# Chi phí khi dùng thật

> Điền ở guide bước 4.2, nộp ở CP4 14:30 Thứ Bảy 28/11. Ôn lại: ngày 13, ngày 1, ngày 14 · lab ngày 13, lab ngày 14. Chấm ở rubric R6.
> Số **không điền tay**: điền `cost/personas.yaml` → `python run.py simulate` → chép bảng trong `cost/simulate-N-summary.md` vào đây.
> Lúc build dùng gói miễn phí vẫn tính theo **giá gói trả phí** — đây là chi phí cho lúc đưa vào dùng thật.

## 1. Đầu vào

- **Persona** (`cost/personas.yaml`): 3 kiểu — `dung_it` 50% · 1 phiên / tháng · 8 lượt; `dung_vua` 30% · 2 phiên / tháng · 8 lượt; `dung_nhieu` 20% · 4 phiên / tháng · 10 lượt. Nguồn: `spec.md` §2, tự ước tính, chưa kiểm. 8 lượt là mức tối thiểu vì agent chỉ đánh giá khi đủ 9 ô (4 ô lõi + Solution, AI Leverage, MVP Scope, Metrics; ô đối thủ agent tự điền)
- **Số người dùng thật** 3 kịch bản: thấp 100 · cơ sở 175 · cao 250. Nguồn: hơn 700 học viên L3 chia 4 người / nhóm = 175 trưởng nhóm (README hackathon, `spec.md` §2); cao: hơn 1.000 học viên chia 4; thấp tự ước tính
- **Giá** (USD / 1 triệu token), **2 mức model**:
  - `gemini-3.5-flash-lite` vào 0,30 · ra 2,50 (bảng giá BTC, https://ai.google.dev/gemini-api/docs/pricing · xem 25/11/2026). Đây là model nhóm đang chạy và đo.
  - `gemini-3.5-flash` vào 1,50 · ra 9,00. Model này **không có trong bảng BTC**; lấy từ trang giá Google Cloud (https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing · xem 28/11/2026, khu vực global, gói trả phí tiêu chuẩn). Chưa đối chiếu được với trang `ai.google.dev` nên giá Developer API có thể khác.
- **Tỉ lệ đạt** dùng để tính: 17/23 (74%): lượt `run-3` (agent hiện tại, đòi đủ 9 ô). Thấp hơn lượt 2 (20/23 = 87%) vì nhóm bổ sung nghiệp vụ mới; xem `eval/report.md`. Benchmark giữ nguyên, không sửa; B02 và B15 trượt vì kỳ vọng GO từ một tin nhắn
- **Đo token trên model gemini-3.5-flash-lite, tính giá cả hai model.** Với `gemini-3.5-flash`, số token thật có thể khác (bộ tách token và độ dài câu trả lời có thể lệch), nên chi phí của dòng này là ước lượng, chưa đo trực tiếp

## 2. Kết quả mô phỏng

Lượt mô phỏng: `cost/simulate-1.csv` · run ID simulate-1@20261128-113124 · 50 phiên (0 lỗi) · seed 42

| Model | Chi phí / phiên | Chi phí / task thành công | / tháng — thấp | / tháng — cơ sở | / tháng — cao | / người / tháng (cơ sở) |
|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite (vào 0,3 · ra 2,5 $/1M) | $0,0085 | $0,0115 | $1,67 | $2,92 | $4,17 | $0,0167 |
| gemini-3.5-flash (vào 1,5 · ra 9,0 $/1M) | $0,0373 | $0,0505 | $7,35 | $12,86 | $18,38 | $0,0735 |

Chi phí / task thành công = chi phí trung bình mỗi phiên ÷ tỉ lệ đạt — **không coi như đạt 100%**.

## 3. So với impact

- Impact / người / tháng (`spec.md` §2): 1 lần × 60 phút = 60 phút (tự ước tính, chưa kiểm)
- Chi phí / người / tháng (cơ sở): $0,0167 với gemini-3.5-flash-lite, $0,0735 với gemini-3.5-flash
- **Kết luận một dòng — đáng làm không:** đáng làm: khoảng $0,0167 (flash-lite) đến $0,0735 (flash) / người / tháng để tiết kiệm khoảng 60 phút, nhưng số đo trên đầu vào lấy ngẫu nhiên từ benchmark chứ chưa phải cuộc trò chuyện thật, tỉ lệ đạt 74% chưa đạt chuẩn 75% của CP2, và dòng gemini-3.5-flash chỉ là ước lượng từ token của flash-lite

## 4. *(Muốn sâu hơn, không bắt buộc)*

- Bảng độ nhạy: model rẻ hơn · cache · cắt ngữ cảnh · giới hạn bước — mỗi cần gạt đổi chi phí bao nhiêu
- Chi phí ngoài model: hosting, lưu trữ, giờ công người duyệt
- Quy mô nào thì bài toán còn đáng làm

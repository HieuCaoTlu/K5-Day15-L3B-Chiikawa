# Hồ sơ đánh giá — một trang

> Điền ở guide bước 2.4 (mục 1–4, trước CP2) và 4.1 (mục 5–6, trước CP4). Ôn lại: ngày 9, ngày 14 · lab ngày 9. Chấm ở rubric R4, R5.
> Người ngoài nhóm đọc trang này phải hiểu được: nhóm đo cái gì, bằng gì, ra số nào. Trang slide "Đánh giá thế nào" lấy từ đây.

## 1. Dataset → xử lý

Dataset nào, xử lý gì (từ `data/DATA_CARD.md`): (1) khảo sát Google Form, 16 phản hồi học viên AI20K, ẩn danh, dùng đào bằng chứng và lấy 8 câu thử; (2) bộ câu thử Thinking 23 câu do nhóm tự viết, dán nhãn `synthetic`, không dùng dữ liệu người thật; (3) dữ liệu mẫu cho demo, không dùng để đo.

## 2. Bộ câu thử dựng ra sao

- `eval/benchmark.csv`: 23 câu (thuong 3 · kho 16 · tu_choi 4, trong đó 2 câu tấn công: B20 áp lực, B23 lệnh chèn)
- Nguồn (`python run.py check` in sẵn): nguoi_dung 4 · data_that 4 · tu_viet 15 · sinh_seed 0 → từ người dùng / data thật 8/23 (cần ≥1/3)
- Độ phủ — lưới input 3–5 chiều (guide 2.4 bước 5): (1) mức bằng chứng: không có / chỉ nghe kể / chỉ thói quen / đủ người + lần; (2) hành vi mong đợi: hỏi lại / NOT YET / GO / NO / từ chối; (3) loại sai: triệu chứng thay vì nguyên nhân, số không nguồn, yêu cầu tính năng, chỉ số phù phiếm; (4) kiểu nhắn: bình thường / viết tắt / không dấu / có áp lực hoặc lệnh chèn
- Câu `kho` trỏ về 4 lớp chỗ khó (`spec.md` §5): lớp 1 (nguồn sự thật): B05, B17, B21 · lớp 2 (mơ hồ): B04, B06 · lớp 3 (ngoài phạm vi / thẩm quyền): B22, B20, B23 · lớp 4 (đặc thù lĩnh vực): B09, B10
- Độ khó: một agent ngu luôn trả "NOT YET, hỏi Persona" chỉ qua 11/23 (48%)

## 3. Metric và cách chấm

| Metric (`eval/metric_spec.yaml`) | Cách chấm | Ngưỡng |
|---|---|---|
| `danh_dau_bang_chung_dung` | code | ≥ 90% ô gắn nhãn đúng |
| `ket_luan_dung` | code | ≥ 75% câu thuong và kho đúng, 0 câu GO khi còn ô lõi giả định |
| `tu_choi_va_khong_bia` | code | 100% câu tu_choi qua |
| `hoi_dung_mot_cau` | nguoi | ≥ 80% câu NOT YET đạt |

- **Người thứ hai chấm thử:** *(làm ở CP3: người ngoài người viết spec chấm độc lập 5 output, cần khớp ≥4/5)*
- LLM chấm (nếu có): không dùng; chấm bằng code.
- **Chuẩn "đạt"** (chép nguyên từ `spec.md` §7, chốt trước 19:30 Thứ Sáu 27/11): "Đạt khi ≥ 75% câu `thuong` và `kho` qua, và 100% câu `tu_choi` qua, và không có câu nào trả GO khi còn ô lõi chưa có bằng chứng"

## 4. Lệnh

`python run.py eval` → `eval/run-N.csv` + `traces/run-N.jsonl` · điền cột `pass` · `python run.py score eval/run-N.csv`

## 5. Đã chạy gì

| Lượt | Run ID | Model | Cấu hình (prompt / công cụ / thay đổi) | Đạt / tổng | % | Đạt chuẩn? |
|---|---|---|---|---|---|---|
| 1 | | | | __/__ | | |
| 2 | | | | __/__ | | |

Lượt chạy lại vì lỗi kỹ thuật, lượt sau CP4: ghi thêm dòng, không sửa dòng cũ.

## 6. Lỗi chính

Tóm 2–3 dòng từ `eval/report.md`: nhóm lỗi lớn nhất · đã sửa gì · còn lại gì.

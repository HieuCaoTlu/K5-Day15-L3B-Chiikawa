# Tóm tắt mô phỏng simulate-2@20261128-091918

Do `python run.py simulate` sinh ra — không sửa tay. Chép bảng sang `cost/cost-estimate.md`.

| Persona | Số phiên mô phỏng | Lượt hỏi / phiên | Token vào / phiên | Token ra / phiên | Gọi model / phiên | Gọi công cụ / phiên |
|---|---:|---:|---:|---:|---:|---:|
| dung_it | 28 | 8 | 12260 | 1726 | 8.0 | 0.0 |
| dung_vua | 12 | 8 | 12302 | 1724 | 8.0 | 0.0 |
| dung_nhieu | 10 | 10 | 15360 | 1897 | 10.0 | 0.0 |

Tỉ lệ đạt dùng để tính: 19/23 (83%) — lượt run-5@20261128-091745

- Tỉ lệ đạt lấy từ lượt nhóm chọn: eval/run-5.csv (--rate-from).

| Model (giá) | Chi phí / phiên | Chi phí / task thành công | Chi phí / câu hỏi đạt | Chi phí / tháng — thấp (100 người) | Chi phí / tháng — cơ sở (175 người) | Chi phí / tháng — cao (250 người) | Chi phí / người / tháng (cơ sở) |
|---|---:|---:|---:|---:|---:|---:|---:|
| gemini-3.5-flash-lite (vào 0.3 · ra 2.5 $/1M) | $0.0083 | $0.0100 | $0.0012 | $1.63 | $2.85 | $4.07 | $0.0163 |

- Chi phí / task thành công = chi phí / phiên ÷ tỉ lệ đạt. Chi phí / câu hỏi đạt = chi phí / phiên ÷ số lượt hỏi trung bình mỗi phiên (8.4) ÷ tỉ lệ đạt — tỉ lệ đạt đo theo từng câu thử.
- Token đo trên model: gemini-3.5-flash-lite. Giá tính theo từng model trong bảng — model khác bộ tách token thì số token thật có thể lệch; ghi rõ "đo trên model X, tính giá model Y" trong cost/cost-estimate.md.
- Phiên lỗi (không tính vào trung bình): 0/50.

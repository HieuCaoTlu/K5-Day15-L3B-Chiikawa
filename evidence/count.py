"""Đếm số liệu khảo sát học viên AI20K từ file CSV xuất của Google Form.

Chạy: python evidence/count.py "đường/dẫn/file.csv"
File gốc có mã sinh viên nên KHÔNG commit; repo chỉ giữ số đã tổng hợp ở evidence/summary.md.
Mẫu số mọi phép đếm = số phản hồi (một dòng = một người). Cột nhận diện được theo đầu câu hỏi.
"""

import csv
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")


def col(header, prefix):
    return next(i for i, h in enumerate(header) if h.strip().startswith(prefix))


def pct(x, n):
    return f"{x}/{n} ({x / n * 100:.1f}%)"


def main(path):
    rows = list(csv.reader(open(path, encoding="utf-8-sig")))
    head, data = rows[0], rows[1:]
    n = len(data)
    print(f"Số phản hồi: {n}\n")

    q1, q2, q3 = col(head, 'Khi giảng viên nhắc'), col(head, 'Bạn có hay tự hỏi'), col(head, 'Bước nào')
    q7, q8 = col(head, 'Bạn được gặp khách hàng'), col(head, 'Hãy kể một lần')

    print("Q1: điều nghĩ đến đầu tiên khi giảng viên nhắc chủ đề")
    for k, v in Counter(r[q1].strip() for r in data).most_common():
        print(f"  {pct(v, n)}  {k}")

    print("\nQ2: tự hỏi 'vấn đề thật đằng sau là gì' (1 = không bao giờ … 5 = luôn luôn)")
    c2 = Counter(r[q2].strip() for r in data)
    for k in sorted(c2):
        print(f"  mức {k}: {pct(c2[k], n)}")
    print(f"  mức 1–2: {pct(c2['1'] + c2['2'], n)} · mức 4–5: {pct(c2['4'] + c2['5'], n)}")

    print("\nQ3: bước khó nhất khi làm sản phẩm")
    for k, v in Counter(r[q3].strip() for r in data).most_common():
        print(f"  {pct(v, n)}  {k}")

    print("\nQ7: câu sẽ hỏi khách hàng (chọn 2, nhiều người chọn quá 2 nên đếm theo người chọn câu đó)")
    asked = Counter()
    for r in data:
        for q in {x.strip() for x in r[q7].split(";") if x.strip()}:
            asked[q] += 1
    for k, v in asked.most_common():
        print(f"  {pct(v, n)}  {k}")
    feature = sum("tính năng gì" in r[q7] for r in data)
    last_time = sum("Lần gần nhất" in r[q7] for r in data)
    only_pain = sum("Lần gần nhất" in r[q7] and "tính năng gì" not in r[q7] for r in data)
    print(f"  chọn 'tính năng gì': {pct(feature, n)} · chọn 'lần gần nhất gặp vấn đề': {pct(last_time, n)}"
          f" · chỉ hỏi chuyện đã xảy ra, không hỏi tính năng: {pct(only_pain, n)}")

    print("\nQ8: kể một lần build xong nhưng không giải quyết đúng vấn đề")
    open_ans = [r[q8].strip() for r in data if r[q8].strip()]
    print(f"  có trả lời: {pct(len(open_ans), n)}")
    for i, a in enumerate(open_ans, 1):
        print(f"  {i}. {a}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Dùng: python evidence/count.py "file.csv"')
    main(sys.argv[1])

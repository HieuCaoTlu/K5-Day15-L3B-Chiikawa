/* Tiến độ thật của từng bước (0 đến 1), dùng để thắp sáng mô hình 3D.
   Tính hoàn toàn từ dữ liệu đang có; nút "Hoàn thành bước này" chỉ đổi nhãn và mở bước sau, không tô thêm tầng. */
(function () {
  const ratio = (n, total) => (total > 0 ? n / total : 0);

  // Thinking: số ô Canvas có bằng chứng / tổng số ô.
  const thinking = (canvas, keys) => ratio(keys.filter(k => canvas && canvas[k] && canvas[k].status === 'evidence').length, keys.length);
  // Planning: số task xong / tổng số task.
  const planning = tasks => ratio(tasks.filter(t => t.done).length, tasks.length);
  // Pitching, Quality, Maintaining: số card đã có nội dung / số card của trang.
  const cards = list => ratio(list.filter(Boolean).length, list.length);

  /* Số khối (ô) cần sáng trên tổng n: đã làm thì sáng ít nhất một, chưa xong thì không sáng hết. */
  const lit = (v, n) => (v <= 0 ? 0 : v >= 0.999 ? n : Math.max(1, Math.min(n - 1, Math.round(v * n))));

  window.PROGRESS = { thinking, planning, cards, lit };
})();

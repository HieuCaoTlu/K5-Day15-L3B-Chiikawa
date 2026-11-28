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

  /* Sprint: khung Sprint và bảng Task phải cùng nhìn một sprint. */
  const DAY_MS = 864e5;
  const dayOf = v => Date.parse(String(v).slice(0, 10) + 'T00:00:00+07:00');
  // Sprint theo ngày hôm nay; ngoài mọi khung ngày thì lấy sprint còn task dở, cuối cùng là sprint sau chót.
  const currentSprint = (sprints, now = Date.now()) =>
    sprints.find(sp => dayOf(sp.starts_on) <= now && now < dayOf(sp.ends_on) + DAY_MS)
    || sprints.find(sp => sp.tasks.some(t => t.progress !== 'done')) || sprints[sprints.length - 1];
  // pick: null = sprint hiện tại, 'all' = mọi sprint (trả null), hoặc id sprint. Id không còn thì về sprint hiện tại.
  const pickedSprint = (sprints, pick, now) => {
    if (!sprints.length || pick === 'all') return null;
    return sprints.find(sp => pick != null && String(sp.id) === String(pick)) || currentSprint(sprints, now);
  };
  // Ghim sprint đang xem trước khi sửa task, vì task xong có thể làm đổi sprint mặc định.
  const pinSprintPick = (sprints, pick, now) =>
    sprints.length < 2 ? null : pick ?? String(currentSprint(sprints, now).id);
  const boardTasks = (sprints, pick, now) => {
    const sprint = pickedSprint(sprints, pick, now);
    return sprint ? sprint.tasks : sprints.flatMap(sp => sp.tasks);
  };

  window.PROGRESS = { thinking, planning, cards, lit, currentSprint, pickedSprint, pinSprintPick, boardTasks };
})();

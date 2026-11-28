/* Luật sức khỏe sản phẩm: ánh xạ số liệu Quality và Maintaining sang trạng thái mô hình 3D.
   Muốn chỉnh độ nhạy, chỉ cần sửa ngưỡng trong RULES. Trạng thái cuối cùng là mức nặng nhất trong các luật bị chạm.
   Mức: ok (bình thường) < warn (xuống cấp) < rescue (cần cứu hộ, xe cứu thương tới) < collapse (công trình sập). */
(function () {
  const LEVELS = ['ok', 'warn', 'rescue', 'collapse'];
  const NAMES = { ok: 'Bình thường', warn: 'Xuống cấp', rescue: 'Cần cứu hộ', collapse: 'Sập' };

  // dir 'below': giá trị nhỏ hơn ngưỡng thì chạm luật. dir 'above': giá trị lớn hơn hoặc bằng ngưỡng thì chạm.
  // fmt: cách hiện số trong giao diện (pct = phần trăm, int = số nguyên, days = số ngày).
  const RULES = {
    passRate: { label: 'Tỉ lệ test pass ở lần chạy gần nhất', dir: 'below', fmt: 'pct', warn: 0.8, rescue: 0.6, collapse: 0.4 },
    passDrop: { label: 'Tỉ lệ pass giảm so với lần chạy trước', dir: 'above', fmt: 'pct', warn: 0.05, rescue: 0.15, collapse: 0.3 },
    metricMiss: { label: 'Số chỉ số chưa đạt mục tiêu ở lần chạy gần nhất', dir: 'above', fmt: 'int', warn: 1, rescue: 2, collapse: 3 },
    overdueDays: { label: 'Việc bảo trì trễ hạn lâu nhất', dir: 'above', fmt: 'days', warn: 1, rescue: 14, collapse: 30 },
    staleDays: { label: 'Số ngày chưa chạy kiểm thử', dir: 'above', fmt: 'days', warn: 7, rescue: 21, collapse: 45 }
  };

  /* signals: { passRate, passDrop, metricMiss, overdueDays, staleDays }, giá trị null nghĩa là chưa đủ dữ liệu. */
  function evaluate(signals) {
    const reasons = [];
    let top = 0;
    Object.entries(RULES).forEach(([key, r]) => {
      const v = signals[key];
      if (v === null || v === undefined || !isFinite(v)) return;
      let lv = 0;
      LEVELS.slice(1).forEach((name, i) => { if (r.dir === 'below' ? v < r[name] : v >= r[name]) lv = i + 1; });
      if (!lv) return;
      reasons.push({ key, label: r.label, fmt: r.fmt, dir: r.dir, value: v, level: LEVELS[lv], threshold: r[LEVELS[lv]] });
      top = Math.max(top, lv);
    });
    reasons.sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level));
    const missing = Object.keys(RULES).filter(k => signals[k] === null || signals[k] === undefined);
    return { level: LEVELS[top], reasons, missing };
  }

  window.HEALTH = { LEVELS, NAMES, RULES, evaluate };
})();

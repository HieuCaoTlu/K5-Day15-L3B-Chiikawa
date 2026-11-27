/* Trang giới thiệu: con lăn chuột có quán tính, trang trượt tiếp rồi chậm dần.
   Chỉ can thiệp vào nấc lăn của chuột. Cảm ứng, bàn di (đã có quán tính sẵn),
   bàn phím, thanh cuộn, phóng to bằng Ctrl và chế độ giảm chuyển động giữ nguyên. */
(function () {
  'use strict';
  if (!document.getElementById('landing')) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  const GLIDE = 5;       // càng nhỏ trượt càng lâu
  const TRACKPAD = 40;   // bước lăn nhỏ hơn mức này là của bàn di

  let frame = 0, pos = 0, target = 0, last = 0, written = 0;

  const limit = () => document.documentElement.scrollHeight - innerHeight;
  function stop() { cancelAnimationFrame(frame); frame = 0; }

  function tick(now) {
    // Có thứ khác vừa cuộn trang (link, thanh cuộn, mã khác) thì nhường
    if (Math.abs(scrollY - written) > 2) { frame = 0; return; }
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    pos += (target - pos) * (1 - Math.exp(-GLIDE * dt));
    if (Math.abs(target - pos) < 0.5) pos = target;
    scrollTo({ top: pos, behavior: 'instant' });
    written = scrollY;
    frame = pos === target ? 0 : requestAnimationFrame(tick);
  }

  // Vùng cuộn riêng nằm trong trang thì để nó tự cuộn
  function insideScroller(node, dy) {
    for (let el = node; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollHeight <= el.clientHeight + 1 || !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
      if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    }
    return false;
  }

  addEventListener('wheel', e => {
    if (calm.matches || e.defaultPrevented || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (!frame && Math.abs(dy) < TRACKPAD) return;
    if (insideScroller(e.target, dy)) return;
    e.preventDefault();
    if (!frame) { pos = target = written = scrollY; last = performance.now(); }
    // Đổi chiều thì bỏ phần đang trượt dở để trang quay đầu ngay
    if ((target - pos) * dy < 0) target = pos;
    target = Math.max(0, Math.min(limit(), target + dy));
    if (!frame) frame = requestAnimationFrame(tick);
  }, { passive: false });

  ['keydown', 'pointerdown', 'touchstart'].forEach(type => addEventListener(type, stop, { passive: true }));
})();

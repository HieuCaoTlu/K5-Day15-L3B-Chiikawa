/* Trang giới thiệu: các khối trượt lên khi cuộn tới. Mỗi khối chỉ chạy một lần.
   Nội dung chỉ bị giấu khi chắc chắn hiện lại được: không có JS, trình duyệt cũ
   hoặc bật giảm chuyển động thì mọi thứ hiện sẵn. */
(function () {
  'use strict';
  const root = document.getElementById('landing');
  if (!root || !('IntersectionObserver' in window)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Mỗi nhóm trượt lần lượt: khối sau trễ hơn khối trước một nhịp
  const GROUPS = [
    '.sec-head', '.steps', '#features .card', '.viewer',
    '.orbit-core, .orbit-card', '.cta h2, .cta .row'
  ];
  const STEP = 90;

  function done(el) {
    el.classList.remove('reveal', 'reveal-in');
    el.style.removeProperty('--reveal-delay');
  }
  function show(el) {
    el.classList.add('reveal-in');
    // Gỡ class sau khi chạy xong để không đè lên hiệu ứng riêng của khối
    const wait = 800 + parseInt(el.style.getPropertyValue('--reveal-delay') || '0', 10);
    setTimeout(() => done(el), wait);
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      // Khối đã nằm phía trên màn hình (nhảy bằng link, tải lại giữa trang) cũng phải hiện
      if (!e.isIntersecting && e.boundingClientRect.bottom > 0) return;
      io.unobserve(e.target);
      show(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });

  GROUPS.forEach(selector => {
    root.querySelectorAll(selector).forEach((el, i) => {
      if (el.getBoundingClientRect().top < innerHeight) return; // đang thấy thì giữ nguyên
      el.style.setProperty('--reveal-delay', `${i * STEP}ms`);
      el.classList.add('reveal');
      io.observe(el);
    });
  });
})();

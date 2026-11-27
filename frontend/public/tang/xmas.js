/* Áo khoác Giáng Sinh cho trang giới thiệu: bốn bạn lông xù, bánh ngọt và tuyết rơi.
   Bật: thêm class .xmas, chèn tranh và tuyết rơi. Tắt: gỡ sạch, trang trở về bản gốc.
   Bỏ hẳn theme: xóa file này, xmas.css, thư mục xmas/ và nút #xmasToggle trong index.html. */
(function () {
  'use strict';
  const root = document.getElementById('landing');
  const btn = document.getElementById('xmasToggle');
  if (!root || !btn) return;

  const KEY = 'tang-xmas';
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  // Bốn bạn lông xù tượng trưng cho bốn thành viên trong đội
  const FRIENDS = ['purple', 'green', 'pink', 'yellow'];
  const SWEETS = ['cupcake', 'donut', 'slice', 'shortcake', 'donut-soft'];

  // [nơi gắn, các ảnh, kiểu]. Nhiều ảnh thì gom thành một nhóm đứng cạnh nhau.
  const ART = [
    ['.hero', FRIENDS, 'art-crew art-hero'],
    ['#features .card:nth-child(1)', ['cupcake'], 'art-card'],
    ['#features .card:nth-child(2)', ['donut'], 'art-card'],
    ['#features .card:nth-child(3)', ['slice'], 'art-card'],
    ['#features .card:nth-child(4)', ['shortcake'], 'art-card'],
    ['.step-panels', ['green', 'pink'], 'art-crew art-peek'],
    ['#roles .o1', ['purple'], 'art-member'],
    ['#roles .o2', ['green'], 'art-member'],
    ['#roles .o3', ['yellow'], 'art-member'],
    ['#roles .o4', ['pink'], 'art-member'],
    ['#roles .orbit-agent', ['donut-soft'], 'art-agent'],
    ['.cta .wrap', FRIENDS, 'art-crew art-cta']
  ];

  function picture(name) {
    const img = new Image();
    img.src = `/tang/xmas/${name}.webp`;
    img.alt = '';
    img.decoding = 'async';
    img.onerror = () => img.remove();
    return img;
  }

  function dress() {
    ART.forEach(([target, names, kind]) => {
      const host = root.querySelector(target);
      if (!host) return;
      let piece;
      if (kind.startsWith('art-crew')) {
        piece = document.createElement('div');
        piece.setAttribute('aria-hidden', 'true');
        names.forEach(name => {
          const img = picture(name);
          img.className = `friend-${name}`;
          piece.append(img);
        });
      } else piece = picture(names[0]);
      piece.className = `xmas-art ${kind}`;
      if (kind.includes('art-cta')) host.prepend(piece); else host.append(piece);
    });
  }

  /* ---------- Bánh ngọt rơi cùng tuyết: một canvas phủ màn hình, không chặn chuột ---------- */
  let snow = null;
  function startSnow() {
    if (snow || calm.matches) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'xmas-snow';
    canvas.setAttribute('aria-hidden', 'true');
    root.append(canvas);
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, flakes = [], treats = [], frame = 0, last = performance.now();
    const sprites = SWEETS.map(picture);
    const treat = (y, k) => {
      const size = 26 + Math.random() * 20;
      return { x: Math.random() * w, y, size, kind: k % sprites.length, v: 14 + size * 0.6, sway: 10 + Math.random() * 22, phase: Math.random() * 6.28, tilt: Math.random() * 6.28 };
    };

    const make = (y) => {
      const r = 2 + Math.random() * 5;
      return { x: Math.random() * w, y, r, v: 12 + r * 4.5, sway: 8 + Math.random() * 18, phase: Math.random() * 6.28, spin: Math.random() * 6.28, star: r > 4.6 };
    };
    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth; h = innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = Array.from({ length: Math.max(8, Math.min(22, Math.round(w / 65))) }, () => make(Math.random() * h));
      const count = Math.max(2, Math.min(5, Math.round(w / 280)));
      treats = Array.from({ length: count }, (_, k) => treat((k / count) * h + Math.random() * 60 - 30, k));
    }
    function crystal(f, x) {
      ctx.save();
      ctx.translate(x, f.y);
      ctx.rotate(f.spin);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const arm = f.r * 1.5;
        ctx.moveTo(0, 0); ctx.lineTo(0, -arm);
        ctx.moveTo(0, -arm * 0.55); ctx.lineTo(arm * 0.28, -arm * 0.8);
        ctx.moveTo(0, -arm * 0.55); ctx.lineTo(-arm * 0.28, -arm * 0.8);
        ctx.rotate(Math.PI / 3);
      }
      ctx.stroke();
      ctx.restore();
    }
    function draw(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      // Xanh nhạt để tuyết vẫn thấy được trên nền trắng
      ctx.fillStyle = 'rgba(147,185,230,.6)';
      ctx.strokeStyle = 'rgba(112,160,218,.75)';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      flakes.forEach((f, i) => {
        f.y += f.v * dt; f.phase += dt; f.spin += dt * 0.5;
        const x = f.x + Math.sin(f.phase) * f.sway;
        if (f.star) crystal(f, x);
        else { ctx.beginPath(); ctx.arc(x, f.y, f.r * 0.6, 0, 6.2832); ctx.fill(); }
        if (f.y > h + 12) flakes[i] = make(-12);
      });
      treats.forEach((c, i) => {
        c.y += c.v * dt; c.phase += dt * 0.9;
        const img = sprites[c.kind];
        if (img.complete && img.naturalWidth) {
          const tall = c.size * img.naturalHeight / img.naturalWidth;
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.translate(c.x + Math.sin(c.phase) * c.sway, c.y);
          ctx.rotate(Math.sin(c.phase * 0.7 + c.tilt) * 0.4);
          ctx.drawImage(img, -c.size / 2, -tall / 2, c.size, tall);
          ctx.restore();
        }
        if (c.y > h + c.size) treats[i] = treat(-c.size, c.kind);
      });
      frame = requestAnimationFrame(draw);
    }
    size();
    addEventListener('resize', size);
    frame = requestAnimationFrame(draw);
    snow = () => { cancelAnimationFrame(frame); removeEventListener('resize', size); canvas.remove(); snow = null; };
  }
  const stopSnow = () => { if (snow) snow(); };

  let on = false;
  function apply(next) {
    if (next === on) return;
    on = next;
    root.classList.toggle('xmas', on);
    btn.setAttribute('aria-checked', String(on));
    if (on) { dress(); startSnow(); }
    else { root.querySelectorAll('.xmas-art').forEach(el => el.remove()); stopSnow(); }
  }

  btn.addEventListener('click', () => {
    apply(!on);
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* bỏ qua */ }
  });
  calm.addEventListener('change', () => { if (calm.matches) stopSnow(); else if (on) startSnow(); });

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* bỏ qua */ }
  btn.hidden = false;
  apply(saved !== 'off');
})();

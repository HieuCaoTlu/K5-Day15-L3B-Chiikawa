/* Avatar nổi khối của ProductPilot: vẽ bằng SVG, dùng chung cho Workstation và khung Planning.
   Đầu và mắt nhìn theo con trỏ khi con trỏ đến gần. Màu trong file này là màu minh họa của nhân vật. */
(function (root) {
  'use strict';

  // Thứ tự 0-3 giữ đúng ý nghĩa cũ để hồ sơ đã lưu không đổi nhân vật.
  const LOOKS = [
    { name: 'Tóc ngắn', bg: ['#e3fbef', '#bdeed7'], skin: ['#ffe0c7', '#f2b48f'], hair: ['#5a4036', '#2e1f1a'], shirt: ['#4fd39a', '#14966a'], style: 'short' },
    { name: 'Kính tròn', bg: ['#eceeff', '#cfd4ff'], skin: ['#f9d3b0', '#e2a276'], hair: ['#3d3a52', '#1d1b2c'], shirt: ['#8490ff', '#4a57d6'], style: 'part', glasses: true },
    { name: 'Tai nghe', bg: ['#fff0df', '#ffd9ad'], skin: ['#d9a072', '#b0744a'], hair: ['#33231c', '#160e0a'], shirt: ['#ffa94d', '#e8730c'], style: 'short', headphones: true },
    { name: 'Mũ lưỡi trai', bg: ['#e1f4ff', '#bde4fd'], skin: ['#ffd8bd', '#eaa882'], hair: ['#a8683a', '#6f3f1f'], shirt: ['#48bdf8', '#0b83c9'], style: 'cap', cap: ['#ff6b79', '#d63a4b'] },
    { name: 'Tóc búi', bg: ['#ffe9ef', '#ffcbd9'], skin: ['#ffe3d0', '#f0b595'], hair: ['#6b3a52', '#3a1c2d'], shirt: ['#ff7d9b', '#d94870'], style: 'bun', lashes: true },
    { name: 'Tóc xoăn', bg: ['#f3e9ff', '#ddc6fb'], skin: ['#a86d49', '#7c4a2c'], hair: ['#2c1b14', '#120a06'], shirt: ['#c07cf2', '#8a3fcc'], style: 'curly' },
    { name: 'Tóc dài', bg: ['#fff8d6', '#ffeb99'], skin: ['#ffdcc2', '#eeac85'], hair: ['#d98a3d', '#9c5516'], shirt: ['#ffcf3d', '#dc9c00'], style: 'long', lashes: true },
    { name: 'Mũ len và râu', bg: ['#e6f6f4', '#c2e7e2'], skin: ['#edbd97', '#c98c62'], hair: ['#4a352a', '#241811'], shirt: ['#5c6b8a', '#313d57'], style: 'beanie', cap: ['#2fc2b0', '#137e72'], beard: true }
  ];

  const HAIR = {
    short: (h) => `<path d="M27 47C23 24 38 15 51 16c15 0 25 10 22 31-3-9-8-13-14-15-9 7-21 9-32 15Z" fill="${h}"/>`,
    part: (h) => `<path d="M26 49c-5-23 9-34 24-34 17 0 29 11 24 34-2-10-7-16-12-19-4 7-20 12-36 19Z" fill="${h}"/><path d="M40 19c7 3 17 4 24 1" stroke="#fff" stroke-opacity=".18" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    bun: (h) => `<circle cx="50" cy="15" r="10" fill="${h}"/><path d="M27 48c-4-22 8-30 23-30s27 8 23 30c-4-12-12-17-23-19-9 4-17 9-23 19Z" fill="${h}"/>`,
    curly: (h) => [[30, 36, 9], [35, 25, 10], [47, 20, 11], [60, 21, 10], [69, 30, 10], [72, 42, 7], [28, 46, 6], [42, 30, 8], [57, 30, 8]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${h}"/>`).join(''),
    long: (h) => `<path d="M27 50c-4-24 8-34 23-34s28 10 23 34c-3-13-9-18-14-21-6 9-19 15-32 21Z" fill="${h}"/>`,
    cap: (h) => `<path d="M28 42c0 4 0 8 1 11l5-12Zm44 0c0 4 0 8-1 11l-5-12Z" fill="${h}"/>`,
    beanie: () => ''
  };
  const BACK = {
    long: (h) => `<path d="M22 50c-1-25 12-36 28-36s30 11 28 36c-1 17 3 25 6 31-10 5-20 2-24-4H40c-4 6-14 9-24 4 3-6 7-14 6-31Z" fill="${h}"/>`,
    bun: (h) => `<ellipse cx="50" cy="43" rx="27" ry="27" fill="${h}"/>`,
    curly: (h) => `<circle cx="50" cy="42" r="30" fill="${h}"/>`
  };

  const radial = (id, [light, dark], cx = '35%', cy = '28%') =>
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="80%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`;

  function markup(index, uid) {
    const look = LOOKS[index] || LOOKS[0];
    const id = (part) => `${uid}-${part}`;
    const fill = (part) => `url(#${id(part)})`;
    const eye = (x) => `<g class="av-eye"><ellipse cx="${x}" cy="48" rx="5.6" ry="6.4" fill="#fff"/><g class="av-pupil"><circle cx="${x}" cy="48.6" r="3.5" fill="#1d2038"/><circle cx="${x + 1.3}" cy="47" r="1.25" fill="#fff"/></g></g>`
      + (look.lashes ? `<path d="M${x - 5.4} 43.6q5.4-4 10.8 0" stroke="#3a2230" stroke-width="1.8" fill="none" stroke-linecap="round"/>` : '');
    const cap = look.style === 'cap'
      ? `<path d="M26 39C25 20 38 14 50 14s25 6 24 25c-16-6-32-6-48 0Z" fill="${fill('cap')}"/><path d="M52 34c13-2 27 1 31 7-9 3-22 1-31-3Z" fill="${fill('cap')}"/><circle cx="50" cy="15" r="2.6" fill="#fff" fill-opacity=".75"/>`
      : look.style === 'beanie'
        ? `<path d="M25 40C23 18 37 11 50 11s27 7 25 29Z" fill="${fill('cap')}"/><rect x="24" y="33" width="52" height="10" rx="5" fill="${fill('cap')}"/><path d="M32 36v5m9-5v5m9-5v5m9-5v5m9-5v5" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"/><circle cx="50" cy="11" r="6" fill="${fill('cap')}"/>`
        : '';
    return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
<defs>${radial(id('bg'), look.bg, '30%', '20%')}${radial(id('skin'), look.skin)}${radial(id('hair'), look.hair)}${radial(id('shirt'), look.shirt)}${look.cap ? radial(id('cap'), look.cap) : ''}</defs>
<rect width="100" height="100" fill="${fill('bg')}"/>
<ellipse cx="50" cy="97" rx="31" ry="7" fill="#1d2038" fill-opacity=".1"/>
<path d="M17 104c1-21 15-30 33-30s32 9 33 30Z" fill="${fill('shirt')}"/>
<path d="M41 75q9 9 18 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2.6" stroke-linecap="round"/>
<rect x="43" y="64" width="14" height="14" rx="6" fill="${fill('skin')}"/>
<g class="av-back">${BACK[look.style] ? BACK[look.style](fill('hair')) : ''}</g>
<g class="av-head">
<ellipse cx="26.5" cy="50" rx="5" ry="6.5" fill="${fill('skin')}"/><ellipse cx="73.5" cy="50" rx="5" ry="6.5" fill="${fill('skin')}"/>
<rect x="27" y="22" width="46" height="50" rx="22" fill="${fill('skin')}"/>
<ellipse cx="39" cy="31" rx="9" ry="4.5" fill="#fff" fill-opacity=".22" transform="rotate(-24 39 31)"/>
<g class="av-face">
<ellipse cx="35.5" cy="58" rx="4.6" ry="2.8" fill="#ff6f7d" fill-opacity=".3"/><ellipse cx="64.5" cy="58" rx="4.6" ry="2.8" fill="#ff6f7d" fill-opacity=".3"/>
${eye(40.5)}${eye(59.5)}
<path d="M49 55.5q1.6 2.4 3.4.2" fill="none" stroke="#7c3f2c" stroke-opacity=".38" stroke-width="1.8" stroke-linecap="round"/>
${look.beard ? `<path d="M29 55c1 15 10 21 21 21s20-6 21-21c-6 7-11 4-21 4s-15 3-21-4Z" fill="${fill('hair')}"/>` : ''}
<path d="M43.5 61.5q6.5 6.4 13 0" fill="${look.beard ? '#fff' : 'none'}" stroke="${look.beard ? '#fff' : '#8a3b34'}" stroke-width="${look.beard ? 1.4 : 2.4}" stroke-linecap="round" stroke-linejoin="round"/>
${look.glasses ? '<g fill="#fff" fill-opacity=".14" stroke="#262a46" stroke-width="2.3"><circle cx="40.5" cy="48" r="9"/><circle cx="59.5" cy="48" r="9"/><path d="M49.5 47q.5-1.6 1 0M31.5 47l-5-1.5M68.5 47l5-1.5" fill="none"/></g>' : ''}
</g>
<g class="av-hair">${HAIR[look.style](fill('hair'))}${cap}</g>
${look.headphones ? '<path d="M24 50C20 8 80 8 76 50" fill="none" stroke="#2b3050" stroke-width="5" stroke-linecap="round"/><rect x="17" y="42" width="13" height="21" rx="6.5" fill="#ff8a1f"/><rect x="70" y="42" width="13" height="21" rx="6.5" fill="#ff8a1f"/><path d="M21 47v9m53-9v9" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>' : ''}
</g>
</svg>`;
  }

  const NEAR = 220, FAR = 340; // px: trong NEAR nhìn hẳn theo, giữa hai mốc thì dịu dần
  const tracked = new WeakSet();

  function track(doc) {
    if (!doc || tracked.has(doc)) return;
    tracked.add(doc);
    const view = doc.defaultView;
    let point = null, frame = 0;
    const clamp = (value) => Math.max(-1, Math.min(1, value));
    function look() {
      frame = 0;
      if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      doc.querySelectorAll('.pl-avatar').forEach((avatar) => {
        let x = 0, y = 0;
        if (point) {
          const box = avatar.getBoundingClientRect();
          const dx = point.x - (box.left + box.width / 2), dy = point.y - (box.top + box.height / 2);
          const strength = clamp((FAR - Math.hypot(dx, dy)) / (FAR - NEAR));
          if (strength > 0) { x = clamp(dx / 80) * strength; y = clamp(dy / 80) * strength; }
        }
        avatar.style.setProperty('--lx', x.toFixed(3));
        avatar.style.setProperty('--ly', y.toFixed(3));
      });
    }
    const schedule = () => { if (!frame) frame = view.requestAnimationFrame(look); };
    doc.addEventListener('pointermove', (event) => { point = { x: event.clientX, y: event.clientY }; schedule(); }, { passive: true });
    doc.documentElement.addEventListener('pointerleave', () => { point = null; schedule(); });
    doc.addEventListener('scroll', schedule, { capture: true, passive: true });
  }

  root.TangAvatar = { names: LOOKS.map((look) => look.name), markup, track };
  if (root.document) track(root.document);
})(typeof window === 'undefined' ? globalThis : window);

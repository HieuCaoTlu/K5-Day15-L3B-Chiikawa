/* Cảnh 3D: tòa nhà ở trang giới thiệu và công trình tiến độ trong workstation. */
(function () {
  const T = window.THREE;
  if (!T) { window.Scenes = null; return; }
  const HEX = { red: 0xff4d5e, orange: 0xff8a1f, yellow: 0xffc21a, green: 0x14b86a, blue: 0x0a9cf0, indigo: 0x4d5bf0, violet: 0xa24ce8 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lerp = (a, b, t) => a + (b - a) * t;

  const mat = (color, o = {}) => new T.MeshLambertMaterial(Object.assign({ color }, o));
  const flat = (color, o = {}) => new T.MeshBasicMaterial(Object.assign({ color }, o));
  function mesh(geo, m, x = 0, y = 0, z = 0, parent) {
    const o = new T.Mesh(geo, m);
    o.position.set(x, y, z);
    if (parent) parent.add(o);
    return o;
  }
  const box = (w, h, d, m, x, y, z, p) => mesh(new T.BoxGeometry(w, h, d), m, x, y, z, p);
  const cyl = (rt, rb, h, m, x, y, z, p, s = 16) => mesh(new T.CylinderGeometry(rt, rb, h, s), m, x, y, z, p);
  const ball = (r, m, x, y, z, p) => mesh(new T.SphereGeometry(r, 14, 12), m, x, y, z, p);
  const outline = (o, color, opacity = 1) => {
    const l = new T.LineSegments(new T.EdgesGeometry(o.geometry), new T.LineBasicMaterial({ color, transparent: true, opacity }));
    o.add(l);
    return l;
  };
  function person(color, parent) {
    const p = new T.Group();
    cyl(0.17, 0.24, 0.62, mat(color), 0, 0.31, 0, p);
    ball(0.2, mat(0xffd9bd), 0, 0.84, 0, p);
    ball(0.22, mat(HEX.yellow), 0, 0.96, 0, p).scale.y = 0.5;
    parent.add(p);
    return p;
  }
  function renderer(canvas) {
    const r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    return r;
  }
  function lights(scene) {
    scene.add(new T.HemisphereLight(0xffffff, 0xc9d4ff, 0.82));
    const d = new T.DirectionalLight(0xffffff, 0.42);
    d.position.set(8, 20, 14);
    scene.add(d);
  }
  function fit(r, cam, canvas) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    const dpr = r.getPixelRatio();
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      r.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    return true;
  }

  /* ---------- Tòa nhà 7 tầng ở trang giới thiệu ---------- */
  function hero(canvas, floors, onPick) {
    const r = renderer(canvas), scene = new T.Scene(), cam = new T.PerspectiveCamera(34, 1, 0.1, 400);
    lights(scene);
    const white = mat(0xffffff), glass = mat(0xdff3ff, { emissive: 0x335577 }), warm = mat(0xfff0b8, { emissive: 0x665522 });
    const leaf = mat(HEX.green), trunk = mat(0x9aa3bd), world = new T.Group();
    scene.add(world);
    const FH = 2.15, groups = [], movers = [];
    const widths = [10.4, 9.6, 9.0, 8.4, 7.6, 6.8, 5.8];
    floors.forEach((f, i) => {
      const g = new T.Group(), w = widths[i], d = w * 0.62, c = HEX[f.color];
      g.position.y = 0.5 + i * FH;
      g.userData = { i };
      outline(box(w, FH - 0.34, d, mat(c), 0, (FH - 0.34) / 2, 0, g), 0xffffff, 0.55);
      outline(box(w + 0.7, 0.22, d + 0.7, white, 0, FH - 0.23, 0, g), c, 0.9);
      box(w + 0.74, 0.07, d + 0.74, flat(c), 0, FH - 0.08, 0, g);
      const n = Math.floor((w - 1) / 1.25), start = -((n - 1) * 1.25) / 2;
      for (let k = 0; k < n; k++) {
        const x = start + k * 1.25;
        if (i === 0 && Math.abs(x) < 1.2) continue;
        const lit = (k * 3 + i * 5) % 4 === 0;
        box(0.84, 1.12, 0.08, white, x, 0.92, d / 2 + 0.02, g);
        box(0.68, 0.96, 0.1, lit ? warm : glass, x, 0.92, d / 2 + 0.05, g);
        box(0.05, 0.96, 0.12, white, x, 0.92, d / 2 + 0.06, g);
        if (i > 0 && (k + i) % 3 === 0) { // ban công có chậu cây
          box(1.08, 0.1, 0.55, white, x, 0.28, d / 2 + 0.3, g);
          for (let b = -2; b <= 2; b++) box(0.04, 0.34, 0.04, white, x + b * 0.25, 0.5, d / 2 + 0.55, g);
          box(1.08, 0.05, 0.06, white, x, 0.68, d / 2 + 0.55, g);
          ball(0.17, leaf, x - 0.3, 0.46, d / 2 + 0.34, g);
          ball(0.12, mat(HEX[floors[(i + 3) % 7].color]), x + 0.28, 0.43, d / 2 + 0.36, g);
        } else if (i > 0 && (k + i) % 3 === 1) { // mái hiên sọc
          for (let s = 0; s < 6; s++) {
            box(0.16, 0.07, 0.42, s % 2 ? white : mat(HEX[floors[(i + 2) % 7].color]), x - 0.4 + s * 0.16, 1.62, d / 2 + 0.2, g).rotation.x = 0.35;
          }
        }
      }
      [-1, 1].forEach(side => { for (let k = -1; k <= 1; k++) box(0.1, 0.95, 0.72, glass, side * (w / 2 + 0.01), 0.92, k * 1.2, g); });
      world.add(g);
      groups.push(g);
    });
    // Cửa chính
    const g0 = groups[0], d0 = widths[0] * 0.62 / 2;
    box(1.8, 1.6, 0.14, white, 0, 0.8, d0 + 0.05, g0);
    box(0.7, 1.4, 0.16, glass, -0.39, 0.7, d0 + 0.09, g0);
    box(0.7, 1.4, 0.16, glass, 0.39, 0.7, d0 + 0.09, g0);
    box(2.6, 0.18, 0.9, mat(HEX.yellow), 0, 1.72, d0 + 0.4, g0);
    box(2.8, 0.16, 0.9, white, 0, -0.1, d0 + 0.55, g0);
    box(3.4, 0.16, 1.4, white, 0, -0.27, d0 + 0.75, g0);
    // Cờ dây
    [[2, 1], [4, 0.6]].forEach(([fi, sag]) => {
      const w = widths[fi] + 0.7, z = widths[fi] * 0.62 / 2 + 0.45;
      for (let k = 0; k <= 14; k++) {
        const t = k / 14;
        mesh(new T.ConeGeometry(0.15, 0.36, 3), mat(HEX[floors[(k + fi) % 7].color]),
          -w / 2 + t * w, FH - 0.46 - Math.sin(t * Math.PI) * 0.3 * sag, z, groups[fi]).rotation.x = Math.PI;
      }
    });
    // Mái
    const roof = new T.Group();
    roof.position.y = FH - 0.1;
    cyl(0.06, 0.08, 3.2, trunk, 0, 1.6, 0, roof);
    const beacon = ball(0.24, flat(HEX.red), 0, 3.3, 0, roof);
    const flag = box(1.3, 0.7, 0.05, mat(HEX.orange), 0.7, 2.6, 0, roof);
    cyl(0.55, 0.55, 0.9, mat(HEX.blue), -1.8, 0.65, -0.3, roof);
    cyl(0.04, 0.62, 0.4, white, -1.8, 1.3, -0.3, roof);
    [[1.5, 0.9], [2.2, 0.2], [1.2, -0.9], [-0.7, 1.2]].forEach(([x, z], k) => {
      box(0.5, 0.28, 0.5, white, x, 0.14, z, roof);
      ball(0.34, k % 2 ? mat(HEX.violet) : leaf, x, 0.52, z, roof);
    });
    groups[6].add(roof);
    // Nền, lưới, vòng quỹ đạo
    cyl(11, 11.4, 0.4, mat(0xf3f6ff), 0, -0.1, 0, world, 72);
    const grid = new T.GridHelper(90, 60, 0xd5ddf8, 0xe8ecfb);
    grid.position.y = -0.35;
    world.add(grid);
    const colors = Object.values(HEX);
    const rings = [11.8, 13.2, 14.8].map((rad, k) => {
      const m = mesh(new T.TorusGeometry(rad, 0.035, 8, 160), flat([HEX.blue, HEX.violet, HEX.orange][k], { transparent: true, opacity: 0.55 }), 0, -0.2, 0, world);
      m.rotation.x = Math.PI / 2;
      return m;
    });
    [[-8.4, 3], [-7, 6], [7.6, 5], [9, 1], [-9, -3], [8, -5]].forEach(([x, z], k) => {
      cyl(0.12, 0.16, 1, trunk, x, 0.6, z, world);
      ball(0.75, mat([HEX.violet, HEX.green, HEX.orange][k % 3]), x, 1.6, z, world);
      ball(0.45, leaf, x + 0.4, 1.2, z + 0.2, world);
    });
    [[-4.6, 6.3], [4.6, 6.3]].forEach(([x, z]) => {
      cyl(0.05, 0.07, 2, trunk, x, 1.1, z, world);
      ball(0.22, flat(HEX.yellow), x, 2.2, z, world);
    });
    [[HEX.red, -3, 6.6], [HEX.blue, -2.1, 7.4], [HEX.violet, 2.4, 7], [HEX.green, 3.3, 6.2]].forEach(([c, x, z], k) => {
      const p = person(c, world);
      p.position.set(x, 0.1, z);
      movers.push(t => { p.position.x = x + Math.sin(t * 0.6 + k * 2) * 0.7; });
    });
    colors.forEach((c, k) => {
      const b = new T.Group(), side = k % 2 ? 1 : -1;
      ball(0.45, mat(c, { emissive: c, emissiveIntensity: 0.12 }), 0, 0, 0, b).scale.y = 1.2;
      cyl(0.012, 0.012, 1.3, trunk, 0, -1.15, 0, b, 5);
      const x = side * (6.8 + (k % 3) * 1.1), y = 5 + k * 1.75;
      b.position.set(x, y, -2 + (k % 4) * 1.2);
      world.add(b);
      movers.push(t => { b.position.y = y + Math.sin(t * 0.9 + k) * 0.45; });
    });
    for (let k = 0; k < 46; k++) {
      const a = k * 2.399, rad = 9 + (k % 9), p = box(0.16, 0.16, 0.16, flat(colors[k % 7]),
        Math.cos(a) * rad, 1, Math.sin(a) * rad * 0.6 - 3, world);
      movers.push(t => { p.rotation.set(t * 0.5 + k, t * 0.7, 0); p.position.y = 1 + ((k * 0.41 + t * 0.25) % 19); });
    }

    // p đi từ 0 (nghiêng đổ, ở xa) đến 1 (thẳng, lại gần)
    const state = { p: reduced ? 1 : 0 };
    let wide = true, last = '', visible = true;
    function place(t) {
      const p = state.p, half = Math.tan((cam.fov * Math.PI) / 360);
      const need = Math.max(11.6 / half, (wide ? 9.4 : 7.2) / (half * cam.aspect));
      const dist = lerp(need * 2.15, need + 4, p), az = lerp(1.05, 0, p) + (reduced ? 0 : Math.sin(t * 0.25) * 0.045 * p);
      const el = lerp(0.62, 0.075, p), ty = lerp(6.5, 9.0, p);
      cam.position.set(Math.sin(az) * Math.cos(el) * dist, ty + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, ty, 0);
      cam.rotateZ(lerp(0.42, 0, p));
    }
    new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(canvas);
    const clock = new T.Clock();
    r.setAnimationLoop(() => {
      if (!visible || !fit(r, cam, canvas)) return;
      const w = canvas.clientWidth, h = canvas.clientHeight, key = w + 'x' + h;
      if (key !== last) {
        last = key;
        wide = innerWidth > 820;
        if (wide) cam.setViewOffset(w, h, -w * 0.21, 0, w, h); else cam.clearViewOffset();
      }
      const t = reduced ? 0 : clock.getElapsedTime();
      movers.forEach(m => m(t));
      flag.rotation.y = Math.sin(t * 2.4) * 0.25;
      beacon.scale.setScalar(1 + Math.sin(t * 3) * 0.18);
      rings.forEach((m, k) => m.scale.setScalar(1 + Math.sin(t * 0.8 + k * 1.7) * 0.025));
      place(t);
      r.render(scene, cam);
    });
    const ray = new T.Raycaster(), pt = new T.Vector2();
    canvas.addEventListener('click', e => {
      const b = canvas.getBoundingClientRect();
      pt.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(pt, cam);
      const hit = ray.intersectObjects(groups, true)[0];
      if (!hit) return;
      let o = hit.object;
      while (o && o.userData.i === undefined) o = o.parent;
      if (o) onPick(o.userData.i, groups[o.userData.i]);
    });
    return { state };
  }

  /* ---------- Công trình đang xây: tiến độ trong workstation ---------- */
  function site(canvas, colors, memberColors, onFrame) {
    const r = renderer(canvas), scene = new T.Scene(), cam = new T.PerspectiveCamera(32, 1, 0.1, 200);
    lights(scene);
    const house = new T.Group(), rubik = new T.Group(), yard = new T.Group();
    scene.add(house, rubik, yard);
    rubik.visible = false;
    const white = mat(0xffffff), steel = mat(0xaab3cf), FH = 1.4, BASE = -2.4;

    // Mỗi tầng gồm 12 khối; khối chưa làm chỉ là khung
    const floors = colors.map((c, i) => {
      const g = new T.Group(), w = 5 - i * 0.45, depth = w * 0.7, blocks = [], cols = 4, rows = 3;
      for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
        const bw = w / cols, bd = depth / rows;
        const b = box(bw * 0.92, 1.1, bd * 0.92, mat(0xeef1fa, { transparent: true, opacity: 0.3 }),
          -w / 2 + bw * (x + 0.5), 0, depth / 2 - bd * (z + 0.5), g);
        b.userData.edge = outline(b, HEX[c], 0.5);
        const wins = new T.Group();
        if (z === 0) box(bw * 0.48, 0.58, 0.04, mat(0xeaf7ff, { emissive: 0x446688 }), 0, 0.02, bd * 0.47, wins);
        if (x === cols - 1) box(0.04, 0.58, bd * 0.46, mat(0xeaf7ff, { emissive: 0x446688 }), bw * 0.47, 0.02, 0, wins);
        if (x === 0) box(0.04, 0.58, bd * 0.46, mat(0xeaf7ff, { emissive: 0x446688 }), -bw * 0.47, 0.02, 0, wins);
        wins.visible = false;
        b.add(wins);
        b.userData.wins = wins;
        blocks.push(b);
      }
      const slab = box(w + 0.35, 0.12, depth + 0.35, mat(0xffffff, { transparent: true }), 0, 0.66, 0, g);
      outline(slab, HEX[c], 0.9);
      g.position.y = BASE + 0.62 + i * FH;
      house.add(g);
      return { g, blocks, slab, color: HEX[c], filled: 0, w, depth };
    });
    const roof = new T.Group();
    const cone = mesh(new T.ConeGeometry(1.8, 1.1, 4), mat(0xeef1fa, { transparent: true, opacity: 0.35 }), 0, 0, 0, roof);
    cone.rotation.y = Math.PI / 4;
    cone.scale.z = 0.72;
    outline(cone, HEX.indigo, 0.7);
    roof.position.y = BASE + 0.62 + 4 * FH + 0.15;
    house.add(roof);

    // Công trường: nền, lưới, cần cẩu, giàn giáo, vật liệu, thành viên
    cyl(6.6, 6.9, 0.3, mat(0xf2f5ff), 0, BASE - 0.15, 0, yard, 72);
    const grid = new T.GridHelper(60, 50, 0xd3dbf7, 0xebeffc);
    grid.position.y = BASE - 0.32;
    yard.add(grid);
    const ring = mesh(new T.TorusGeometry(7.4, 0.025, 8, 140), flat(HEX.blue, { transparent: true, opacity: 0.6 }), 0, BASE - 0.25, 0, yard);
    ring.rotation.x = Math.PI / 2;
    const crane = new T.Group();
    crane.position.set(-4.6, BASE, -2.4);
    const mastH = 8.2;
    [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach(([x, z]) => box(0.07, mastH, 0.07, mat(HEX.yellow), x, mastH / 2, z, crane));
    for (let k = 0; k < 12; k++) {
      const y = 0.35 + k * 0.66;
      [0.22, -0.22].forEach(z => { box(0.66, 0.04, 0.04, mat(HEX.yellow), 0, y, z, crane).rotation.z = k % 2 ? 0.75 : -0.75; });
    }
    const jib = new T.Group();
    jib.position.y = mastH;
    box(6.6, 0.16, 0.2, mat(HEX.yellow), 2.2, 0, 0, jib);
    box(0.7, 0.55, 0.55, mat(HEX.indigo), -1.2, -0.2, 0, jib);
    box(0.55, 0.5, 0.55, white, 0, 0.35, 0, jib);
    const cable = box(0.025, 1, 0.025, steel, 4.6, -1, 0, jib);
    const load = box(0.7, 0.45, 0.55, mat(HEX.orange), 4.6, -2, 0, jib);
    outline(load, 0xffffff);
    crane.add(jib);
    yard.add(crane);
    const scaffold = new T.Group();
    house.add(scaffold);
    function buildScaffold(f) {
      while (scaffold.children.length) {
        const o = scaffold.children.pop();
        o.geometry.dispose();
        scaffold.remove(o);
      }
      const w = f.w / 2 + 0.4, d = f.depth / 2 + 0.4;
      [-w, -w / 3, w / 3, w].forEach(x => box(0.05, FH + 0.3, 0.05, steel, x, 0, d, scaffold));
      [-d, 0].forEach(z => box(0.05, FH + 0.3, 0.05, steel, w, 0, z, scaffold));
      [-0.55, 0.15].forEach(y => {
        box(w * 2, 0.07, 0.28, mat(HEX.orange), 0, y, d, scaffold);
        box(0.28, 0.07, d * 2, mat(HEX.orange), w, y, 0, scaffold);
      });
      scaffold.position.y = f.g.position.y;
    }
    for (let k = 0; k < 9; k++) {
      box(0.55, 0.24, 0.32, mat(HEX[['red', 'orange', 'violet'][k % 3]]), 4.1 + (k % 3) * 0.12, BASE + 0.12 + Math.floor(k / 3) * 0.25, 2.1 + (k % 3) * 0.38 - 0.4, yard);
    }
    [[3.2, 3.8], [-3.4, 3.6], [-1.2, 4.7], [5.3, -0.6]].forEach(([x, z]) => {
      mesh(new T.ConeGeometry(0.22, 0.55, 14), mat(HEX.orange), x, BASE + 0.28, z, yard);
      cyl(0.12, 0.15, 0.1, white, x, BASE + 0.26, z, yard);
    });
    [[-5.4, 1.6], [4.6, -3.6], [1, -5.6]].forEach(([x, z], k) => {
      cyl(0.08, 0.1, 0.6, steel, x, BASE + 0.3, z, yard);
      ball(0.45, mat(k % 2 ? HEX.violet : HEX.green), x, BASE + 0.95, z, yard);
    });
    const crew = memberColors.map((c, k) => {
      const p = person(parseInt(c.slice(1), 16), yard);
      return { p, a: k * 1.55 + 0.4, rad: 4.2 + (k % 2) * 0.7 };
    });

    // Rubik: bốn mặt bên ứng với bốn bước, mặt trên dưới là tổng tiến độ
    const dirs = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
    const faceColor = [...colors.map(c => HEX[c]), HEX.indigo, HEX.yellow];
    const stickers = dirs.map(() => []);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const cube = box(0.98, 0.98, 0.98, mat(0xffffff), x * 1.03, y * 1.03, z * 1.03, rubik);
      outline(cube, 0xc9d1ee);
      dirs.forEach((d, f) => {
        if (x * d[0] + y * d[1] + z * d[2] !== 1) return;
        const s = mesh(new T.PlaneGeometry(0.8, 0.8), flat(0xe9edf8), d[0] * 0.495, d[1] * 0.495, d[2] * 0.495, cube);
        s.lookAt(cube.position.x + d[0] * 5, cube.position.y + d[1] * 5, cube.position.z + d[2] * 5);
        s.userData.order = (1 - y) * 10 + x + z * 3;
        stickers[f].push(s);
      });
    }
    stickers.forEach(a => a.sort((p, q) => q.userData.order - p.userData.order));
    rubik.position.y = 0.2;
    rubik.scale.setScalar(1.35);

    const pop = (obj, base = 1) => {
      if (reduced || !window.Motion) return;
      Motion.animate(0.4, 1, { type: 'spring', stiffness: 240, damping: 13, onUpdate: v => obj.scale.setScalar(v * base) });
    };
    let focus = 'overview', mode = 'house', values = [0, 0, 0, 0];
    function set(next) {
      values = next.slice();
      floors.forEach((f, i) => {
        const n = Math.round(values[i] * f.blocks.length);
        f.blocks.forEach((b, k) => {
          const on = k < n, was = k < f.filled;
          b.userData.wins.visible = on;
          b.userData.edge.material.color.setHex(on ? 0xffffff : f.color);
          b.material.color.setHex(on ? f.color : 0xeef1fa);
          if (on && !was) pop(b);
        });
        f.filled = n;
      });
      const total = values.reduce((a, b) => a + b, 0) / 4, done = total >= 0.999;
      cone.material.color.setHex(done ? HEX.indigo : 0xeef1fa);
      cone.material.opacity = done ? 1 : 0.35;
      let idx = values.findIndex(v => v < 0.999);
      scaffold.visible = idx >= 0;
      if (idx >= 0) buildScaffold(floors[idx]);
      stickers.forEach((list, f) => {
        const v = f < 4 ? values[f] : total, n = Math.round(v * list.length);
        list.forEach((s, k) => {
          const hex = k < n ? faceColor[f] : 0xe9edf8;
          if (s.material.color.getHex() !== hex) { s.material.color.setHex(hex); pop(s); }
        });
      });
      applyDim();
    }
    // Làm mờ các tầng khác khi đang xem một bước
    function applyDim() {
      floors.forEach((f, i) => {
        const dim = typeof focus === 'number' && focus !== i;
        f.blocks.forEach((b, k) => {
          const on = k < f.filled;
          b.material.opacity = on ? (dim ? 0.2 : 1) : (dim ? 0.08 : 0.3);
          b.material.depthWrite = on && !dim;
          b.userData.wins.visible = on && !dim;
          b.userData.edge.material.opacity = dim ? 0.18 : on ? 0.7 : 0.6;
        });
        f.slab.material.opacity = dim ? 0.2 : 1;
      });
    }

    /* Camera: các điểm dừng và chuyển cảnh liền mạch */
    const view = { az: 1.7, el: 0.04, dist: 11, ty: BASE + 1, need: 2.6 };
    let tween = null;
    const floorY = i => BASE + 0.62 + i * FH;
    function goal(key) {
      if (mode === 'rubik') {
        if (key === 'overview') return { az: 0.75, el: 0.5, dist: 17, ty: 0.1, need: 3.9 };
        return { az: [0, 1, 2, -1][key] * Math.PI / 2 + 0.28, el: 0.22, dist: 13, ty: 0.15, need: 3.2 };
      }
      if (key === 'overview') return { az: 0.62, el: 0.3, dist: 25, ty: 0.35, need: 6.4 };
      return { az: [-0.55, 0.62, -0.28, 0.5][key], el: 0.2, dist: 14.5, ty: floorY(key) - 0.1, need: 3.5 };
    }
    function path(points, duration) {
      if (tween) tween.stop();
      tween = null;
      const from = Object.assign({}, view), end = points[points.length - 1];
      // Chọn vòng xoay ngắn nhất
      const turn = Math.round((from.az - end.az) / (Math.PI * 2)) * Math.PI * 2;
      const stops = [from, ...points.map(p => Object.assign({}, p, { az: p.az + turn }))];
      if (reduced || !window.Motion) { Object.assign(view, stops[stops.length - 1]); return; }
      tween = Motion.animate(0, 1, {
        duration, ease: [0.65, 0, 0.25, 1],
        onUpdate: t => {
          const n = stops.length - 1, s = Math.min(n - 1, Math.floor(t * n)), u = t * n - s;
          for (const k in view) view[k] = lerp(stops[s][k], stops[s + 1][k], u);
        },
        onComplete: () => { tween = null; }
      });
    }
    function focusOn(key) {
      focus = key;
      applyDim();
      if (key === 'overview') {
        // Đi vào từ góc công trường, sát mặt đất, rồi lùi ra và xoay lên
        const corner = mode === 'rubik' ? { az: 1.9, el: 0.05, dist: 10, ty: 0, need: 2.6 } : { az: 1.65, el: 0.04, dist: 11, ty: BASE + 1.2, need: 2.8 };
        path([corner, goal('overview')], 2.6);
      } else path([goal(key)], 1.3);
    }

    let drag = null;
    canvas.addEventListener('pointerdown', e => { if (tween) { tween.stop(); tween = null; } drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      view.az -= (e.clientX - drag[0]) * 0.01;
      view.el = Math.max(0.02, Math.min(1.1, view.el + (e.clientY - drag[1]) * 0.006));
      drag = [e.clientX, e.clientY];
    });
    ['pointerup', 'pointercancel'].forEach(n => canvas.addEventListener(n, () => { drag = null; }));

    const clock = new T.Clock(), v3 = new T.Vector3();
    r.setAnimationLoop(() => {
      if (!fit(r, cam, canvas)) return;
      const t = reduced ? 0 : clock.getElapsedTime();
      floors.forEach((f, i) => {
        const s = f.g.scale.x + ((focus === i ? 1.1 : 1) - f.g.scale.x) * 0.08;
        f.g.scale.set(s, 1, s);
      });
      jib.rotation.y = 0.5 + Math.sin(t * 0.28) * 0.9;
      const drop = 2.1 + Math.sin(t * 0.7) * 0.8;
      cable.scale.y = drop; cable.position.y = -drop / 2; load.position.y = -drop - 0.2;
      crew.forEach((c, k) => {
        const a = c.a + Math.sin(t * 0.25 + k) * 0.35;
        c.p.position.set(Math.sin(a) * c.rad, BASE + Math.abs(Math.sin(t * 2 + k)) * 0.05, Math.cos(a) * c.rad);
      });
      ring.scale.setScalar(1 + Math.sin(t * 0.9) * 0.02);
      if (!tween && !drag && !reduced && focus === 'overview') view.az += 0.0016;
      const sway = tween || focus === 'overview' || reduced ? 0 : Math.sin(t * 0.45) * 0.09;
      const half = Math.tan((cam.fov * Math.PI) / 360);
      const dist = Math.max(view.dist, view.need / (half * cam.aspect));
      const az = view.az + sway;
      cam.position.set(Math.sin(az) * Math.cos(view.el) * dist, view.ty + Math.sin(view.el) * dist, Math.cos(az) * Math.cos(view.el) * dist);
      cam.lookAt(0, view.ty, 0);
      r.render(scene, cam);
      // Vị trí nhãn của từng tầng trên màn hình
      const pts = floors.map((f, i) => {
        v3.set(f.w / 2 + 0.2, floorY(i), f.depth / 2).project(cam);
        return { x: (v3.x + 1) / 2 * canvas.clientWidth, y: (1 - v3.y) / 2 * canvas.clientHeight };
      });
      onFrame(pts, mode);
    });

    return {
      set, focus: focusOn,
      mode(m) {
        mode = m;
        house.visible = yard.visible = m === 'house';
        rubik.visible = m === 'rubik';
        pop(m === 'house' ? house : rubik, m === 'house' ? 1 : 1.35);
        path([goal(focus)], 1.1);
      }
    };
  }

  window.Scenes = { hero, site };
})();

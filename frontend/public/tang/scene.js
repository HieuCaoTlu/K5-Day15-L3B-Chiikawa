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
  function hero(canvas, floors, onHover, onAnchor) {
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
    [[-8.4, 3], [-7, 6], [7.6, 5], [9, 1], [-9, -3], [8, -5]].forEach(([x, z], k) => {
      cyl(0.12, 0.16, 1, trunk, x, 0.6, z, world);
      ball(k % 2 ? 0.62 : 0.75, leaf, x, 1.6, z, world);
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
    // p đi từ 0 (nghiêng đổ, ở xa) đến 1 (thẳng, lại gần)
    const state = { p: reduced ? 1 : 0 };
    let wide = true, last = '', visible = true, active = -1;
    const anchor = new T.Vector3();
    // Mỗi tầng có bốn lò xo: cỡ, độ cao, độ bẹp (nhún dẻo) và độ nghiêng (lắc)
    const spring = (value, stiff, drag) => ({ x: value, v: 0, to: value, stiff, drag });
    const jelly = floors.map((_, i) => ({
      size: spring(1, 190, 12), y: spring(0.5 + i * FH, 190, 12), squash: spring(0, 230, 7), tilt: spring(0, 150, 5.5)
    }));
    let before = performance.now();
    function wobble() {
      const now = performance.now(), dt = Math.min(0.05, (now - before) / 1000), steps = Math.max(1, Math.ceil(dt * 120));
      before = now;
      groups.forEach((g, i) => {
        const j = jelly[i], on = i === active;
        j.size.to = on ? 1.08 : 1;
        j.y.to = 0.5 + i * FH + (active >= 0 && i > active ? 0.55 : on ? 0.18 : 0);
        Object.values(j).forEach(k => {
          if (reduced) { k.x = k.to; k.v = 0; return; }
          for (let n = 0; n < steps; n++) {
            k.v += ((k.to - k.x) * k.stiff - k.v * k.drag) * (dt / steps);
            k.x += k.v * (dt / steps);
          }
        });
        // Bẹp xuống thì phình ra hai bên, kéo cao thì thon lại
        const wide = j.size.x * (1 + j.squash.x * 0.7);
        g.scale.set(wide, 1 - j.squash.x, wide);
        g.position.y = j.y.x;
        g.rotation.z = j.tilt.x;
      });
    }
    // Chạm vào một tầng: hích tầng đó, rung động lan sang các tầng gần nó rồi tắt dần
    function poke(i) {
      if (reduced || i < 0) return;
      jelly.forEach((j, k) => {
        const far = Math.abs(k - i), power = far ? 0.35 / far : 1;
        j.squash.v += 3.4 * power;
        j.tilt.v += 1.15 * power * (far % 2 ? -1 : 1);
      });
    }
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
      place(t);
      wobble();
      r.render(scene, cam);
      if (active >= 0 && onAnchor) {
        // Điểm giữa mép trái của tầng trên màn hình, để đặt card cạnh đó
        anchor.set(-widths[active] / 2 - 0.5, 0.5 + active * FH + FH / 2, widths[active] * 0.31).project(cam);
        onAnchor((anchor.x + 1) / 2 * w, (1 - anchor.y) / 2 * h);
      }
    });
    const ray = new T.Raycaster(), pt = new T.Vector2();
    // Hộp dò chuột đứng yên (không nằm trong cảnh), nên tầng nhấc lên cũng không làm hover nhấp nháy
    const hitBoxes = widths.map((width, i) => {
      const m = new T.Mesh(new T.BoxGeometry(width + 0.7, FH, width * 0.62 + 0.7));
      m.position.y = 0.5 + i * FH + FH / 2 - 0.1;
      m.userData.i = i;
      m.updateMatrixWorld();
      return m;
    });
    function setActive(i) {
      if (i === active) return;
      active = i;
      poke(i);
      canvas.style.cursor = i >= 0 ? 'pointer' : 'default';
      onHover(i);
    }
    function pick(e) {
      const b = canvas.getBoundingClientRect();
      pt.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(pt, cam);
      const hit = ray.intersectObjects(hitBoxes, false)[0];
      setActive(hit ? hit.object.userData.i : -1);
    }
    canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') pick(e); });
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') setActive(-1); });
    canvas.addEventListener('click', pick); // cảm ứng: chạm vào tầng
    // Bàn phím: Tab vào cảnh rồi dùng mũi tên lên xuống
    canvas.addEventListener('keydown', e => {
      const next = { ArrowUp: Math.min(floors.length - 1, active + 1), ArrowDown: Math.max(0, active - 1), Escape: -1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      setActive(next);
    });
    canvas.addEventListener('blur', () => setActive(-1));
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
      const g = new T.Group(), w = Math.max(1.4, 5 - i * 0.45), depth = w * 0.7, blocks = [], cols = 4, rows = 3;
      // Thắp theo cột từ trái sang, để nhìn mặt trước là thấy đúng phần đã làm
      for (let x = 0; x < cols; x++) for (let z = 0; z < rows; z++) {
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
      return { g, blocks, slab, color: HEX[c], filled: 0, w, depth, origin: g.position.clone(), angle: g.rotation.clone() };
    });
    const roof = new T.Group();
    const cone = mesh(new T.ConeGeometry(1.8, 1.1, 4), mat(0xeef1fa, { transparent: true, opacity: 0.35 }), 0, 0, 0, roof);
    cone.rotation.y = Math.PI / 4;
    cone.scale.z = 0.72;
    outline(cone, HEX.indigo, 0.7);
    roof.position.y = BASE + 0.62 + floors.length * FH + 0.15;
    house.add(roof);

    // Công trường: nền, lưới, cần cẩu, giàn giáo, vật liệu, thành viên
    cyl(6.6, 6.9, 0.3, mat(0xf2f5ff), 0, BASE - 0.15, 0, yard, 72);
    const grid = new T.GridHelper(60, 50, 0xd3dbf7, 0xebeffc);
    grid.position.y = BASE - 0.32;
    scene.add(grid); // dùng chung cho mọi mô hình, không nằm trong sân của Nhà tầng
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
    let scaffoldFloor = -1;
    function buildScaffold(f) {
      while (scaffold.children.length) {
        const o = scaffold.children[scaffold.children.length - 1];
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
      scaffold.position.y = f.origin.y;
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

    // Dựng sẵn vết nứt, rào chắn, xe cứu thương và mảnh vỡ để dùng lại
    const dark = flat(0x4a5664), orange = mat(HEX.orange);
    floors.forEach(f => {
      const bw = f.w / 4, z = f.depth / 3 * 0.47 + 0.025;
      f.cracks = f.blocks.filter((_, k) => k % 3 === 0).slice(0, 2).map(b => { // khối hàng trước
        const crack = new T.Group(), x = bw * 0.28;
        b.add(crack);
        box(0.025, 0.19, 0.015, dark, x - 0.025, 0.12, z, crack).rotation.z = 0.35;
        box(0.025, 0.16, 0.015, dark, x - 0.02, -0.035, z, crack).rotation.z = -0.48;
        box(0.023, 0.22, 0.015, dark, x, -0.19, z, crack).rotation.z = 0.18;
        crack.visible = false;
        return crack;
      });
    });
    const barrier = new T.Group(), rescue = new T.Group(), debris = new T.Group();
    yard.add(barrier, rescue, debris);
    barrier.visible = rescue.visible = debris.visible = false;
    const posts = Array.from({ length: 10 }, (_, k) => {
      const a = (k + 0.5) * Math.PI / 5;
      return [3.5 * Math.cos(a), 2.65 * Math.sin(a)];
    });
    posts.forEach(([x, z], k) => {
      box(0.36, 0.06, 0.36, orange, x, BASE + 0.03, z, barrier);
      cyl(0.025, 0.16, 0.52, orange, x, BASE + 0.29, z, barrier, 12);
      cyl(0.063, 0.088, 0.09, white, x, BASE + 0.37, z, barrier, 12);
      const [nx, nz] = posts[(k + 1) % posts.length], dx = nx - x, dz = nz - z;
      for (let j = 0; j < 8; j++) {
        const p = (j + 0.5) / 8;
        box(Math.hypot(dx, dz) / 8, 0.09, 0.03, j % 2 ? white : orange, x + dx * p, BASE + 0.48, z + dz * p, barrier).rotation.y = -Math.atan2(dz, dx);
      }
    });
    const ambulance = new T.Group(), medics = new T.Group();
    rescue.add(ambulance, medics);
    box(1.25, 0.72, 0.88, white, 0.32, 0.59, 0, ambulance);
    box(0.71, 0.54, 0.8, white, -0.63, 0.49, 0, ambulance);
    box(0.05, 0.23, 0.64, dark, -0.98, 0.61, 0, ambulance);
    box(1.27, 0.11, 0.89, orange, 0.32, 0.53, 0, ambulance);
    box(0.7, 0.11, 0.81, orange, -0.63, 0.37, 0, ambulance);
    [-0.65, 0.63].forEach(x => [-0.43, 0.43].forEach(z => {
      cyl(0.19, 0.19, 0.14, dark, x, 0.2, z, ambulance, 12).rotation.x = Math.PI / 2;
    }));
    const sirens = [HEX.red, HEX.blue].map((c, k) => ball(0.1, flat(c), -0.14, 1.02, (k - 0.5) * 0.43, ambulance));
    ambulance.rotation.y = -Math.atan2(5 - 3.4, 8 - 3.2);
    [2.45, 3.15].forEach((x, k) => {
      const p = person(k ? HEX.blue : HEX.green, medics);
      p.position.set(x, BASE, 4.45 + k * 0.18);
      p.scale.setScalar(0.66);
    });

    const rubble = [steel, white, mat(0x5f6b79)], dust = new T.Group();
    const dustMat = mat(0x9aa3bd, { transparent: true, opacity: 0, depthWrite: false });
    yard.add(dust);
    dust.visible = false;
    dust.position.set(2.4, BASE, -3.5);
    for (let k = 0; k < 20; k++) {
      const a = k * 2.399, rad = 0.6 + (k % 7) * 0.28, size = 0.16 + k % 4 * 0.06;
      box(size * 1.5, size, size, rubble[k % rubble.length], 2.4 + Math.cos(a) * rad, BASE + size / 2, -3.5 + Math.sin(a) * rad, debris).rotation.y = a;
    }
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      ball(0.65 + k % 3 * 0.16, dustMat, Math.cos(a) * 1.15, 0.45 + k % 2 * 0.25, Math.sin(a) * 0.9, dust).scale.y = 0.65;
    }

    // Rubik: bốn mặt bên ứng với bốn bước đầu, mặt dưới là tổng tiến độ
    const dirs = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
    const faceColor = dirs.map((_, f) => f === 5 ? HEX.yellow : HEX[colors[f]] ?? HEX.indigo);
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

    // Hai mô hình tùy chọn: Trường đại học và Cây thông Noel. Mỗi bước là một phần; xong bước nào phần đó lên màu.
    const ghostMat = () => mat(0xeef1fa, { transparent: true, opacity: 0.3 });
    const makePart = c => {
      const part = { color: HEX[c] ?? HEX.indigo, items: [] };
      part.add = m => { m.userData.edge = outline(m, part.color, 0.6); part.items.push(m); return m; };
      return part;
    };
    const uniModel = new T.Group(), treeModel = new T.Group();
    uniModel.position.y = treeModel.position.y = BASE + 0.1;
    uniModel.visible = treeModel.visible = false;
    scene.add(uniModel, treeModel);

    // Hoa lá: cây, bụi và hoa rải thành vành quanh mô hình (vị trí cố định, không ngẫu nhiên)
    function garden(parent, cx, cz, rIn, rOut, count, y = 0) {
      const g = new T.Group(), leaf = [0x2fbf71, 0x46c978, 0x1ea866], bloom = [0xff6b8b, 0xffc21a, 0xff8a1f, 0xa24ce8, 0xffffff];
      g.position.y = y;
      parent.add(g);
      for (let k = 0; k < count; k++) {
        const ang = k * 2.399 + 0.6, rad = rIn + ((k * 37) % 100) / 100 * (rOut - rIn), x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad;
        if (k % 4 === 0) {
          cyl(0.07, 0.1, 0.5, mat(0x8a5a3c), x, 0.25, z, g, 8);
          ball(0.34 + (k % 3) * 0.06, mat(leaf[k % 3]), x, 0.74, z, g);
        } else if (k % 4 === 1) {
          ball(0.26 + (k % 2) * 0.08, mat(leaf[(k + 1) % 3]), x, 0.2, z, g).scale.y = 0.75;
        } else {
          cyl(0.015, 0.015, 0.28, mat(0x2fbf71), x, 0.14, z, g, 6);
          ball(0.08, mat(bloom[k % bloom.length]), x, 0.3, z, g);
          if (k % 3 === 0) ball(0.07, mat(bloom[(k + 2) % bloom.length]), x + 0.12, 0.26, z + 0.08, g);
        }
      }
      return g;
    }

    // Trường đại học: đại sảnh (Thinking), nhà bên (Planning), giảng đường (Pitching), tháp đồng hồ (Quality), thư viện mái vòm (Maintaining)
    box(12, 0.14, 8.2, mat(0xe3f5ea), 0, -0.07, 0, uniModel);
    box(1.3, 0.04, 3.4, mat(0xf4efe6), 0, 0.02, 3.2, uniModel);
    cyl(0.03, 0.03, 2.4, mat(0x9aa3bd), -2.0, 1.2, 2.6, uniModel, 8);
    // Cờ Việt Nam: nền đỏ, sao vàng năm cánh (vật liệu phẳng để màu luôn đúng)
    const vnFlag = (w, h, x, y, z) => {
      const g = new T.Group(), shape = new T.Shape(), R = h * 0.3, r = R * 0.382;
      g.position.set(x, y, z);
      for (let k = 0; k < 10; k++) {
        const a = Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? r : R;
        if (k) shape.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else shape.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      shape.closePath();
      mesh(new T.PlaneGeometry(w, h), flat(0xda251d, { side: T.DoubleSide }), 0, 0, 0, g);
      mesh(new T.ShapeGeometry(shape), flat(0xffd400, { side: T.DoubleSide }), 0, 0, 0.01, g);
      uniModel.add(g);
      return g;
    };
    vnFlag(1.0, 0.67, -1.5, 2.0, 2.6);
    vnFlag(0.72, 0.48, 0, 1.15, 1.03);
    const uniParts = colors.map(c => makePart(c));
    // Đại sảnh: thân, mái, bốn cột, bậc thềm
    uniParts[0].add(box(3.8, 1.7, 2.0, ghostMat(), 0, 0.85, 0, uniModel));
    const hallRoof = mesh(new T.ConeGeometry(2.5, 1.0, 4), ghostMat(), 0, 2.2, 0, uniModel);
    hallRoof.rotation.y = Math.PI / 4;
    hallRoof.scale.z = 0.62;
    uniParts[0].add(hallRoof);
    [-1.35, -0.45, 0.45, 1.35].forEach(x => uniParts[0].add(cyl(0.12, 0.12, 1.5, ghostMat(), x, 0.75, 1.15, uniModel, 12)));
    uniParts[0].add(box(4.2, 0.18, 0.7, ghostMat(), 0, 0.09, 1.5, uniModel));
    // Nhà bên (tây)
    uniParts[1].add(box(2.2, 1.3, 1.6, ghostMat(), -3.4, 0.65, 0.1, uniModel));
    uniParts[1].add(box(2.4, 0.15, 1.8, ghostMat(), -3.4, 1.38, 0.1, uniModel));
    // Giảng đường tròn (đông)
    uniParts[2].add(cyl(1.15, 1.15, 1.2, ghostMat(), 3.4, 0.6, 0.3, uniModel, 20));
    uniParts[2].add(cyl(0.3, 1.25, 0.45, ghostMat(), 3.4, 1.42, 0.3, uniModel, 20));
    // Tháp đồng hồ (sau đại sảnh)
    uniParts[3].add(box(0.95, 3.0, 0.95, ghostMat(), 0, 1.5, -1.9, uniModel));
    const towerRoof = mesh(new T.ConeGeometry(0.8, 0.9, 4), ghostMat(), 0, 3.45, -1.9, uniModel);
    towerRoof.rotation.y = Math.PI / 4;
    uniParts[3].add(towerRoof);
    const clockFace = cyl(0.3, 0.3, 0.06, flat(0xd5dbee), 0, 2.5, -1.4, uniModel, 20);
    clockFace.rotation.x = Math.PI / 2;
    uniParts[3].glow = [clockFace];
    // Thư viện mái vòm (đông bắc)
    uniParts[4].add(box(1.8, 1.0, 1.4, ghostMat(), 3.3, 0.5, -1.9, uniModel));
    uniParts[4].add(mesh(new T.SphereGeometry(0.8, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), ghostMat(), 3.3, 1.0, -1.9, uniModel));
    uniParts[4].add(cyl(0.1, 0.1, 0.4, ghostMat(), 3.3, 1.95, -1.9, uniModel, 10));
    garden(uniModel, 0, 0.4, 4.0, 5.4, 34);
    garden(uniModel, 0, 3.4, 0.9, 1.6, 8);

    // Cây thông Noel: năm tầng ứng với năm bước (tầng đáy là Thinking), ngôi sao trên đỉnh thuộc Maintaining
    cyl(4.3, 4.4, 0.1, mat(0xf4f8ff), 0, -0.14, 0, treeModel, 48);
    cyl(2.9, 3.0, 0.14, mat(0xffffff), 0, -0.05, 0, treeModel, 48);
    const padRing = mesh(new T.TorusGeometry(3.3, 0.03, 8, 80), flat(HEX.blue, { transparent: true, opacity: 0.6 }), 0, 0.03, 0, treeModel);
    padRing.rotation.x = Math.PI / 2;
    cyl(0.35, 0.5, 1.0, mat(0x8a5a3c), 0, 0.5, 0, treeModel, 14);
    const rp = colors.map(c => makePart(c));
    const GREENS = [0x1c9a57, 0x24ad63, 0x2fbf71, 0x3ccf80, 0x4ddb8f];
    rp.forEach((p, i) => {
      const r = 2.6 - i * 0.45, h = 1.6, y0 = 0.8 + i * 1.05;
      const cone = mesh(new T.ConeGeometry(r, h, 28), ghostMat(), 0, y0 + h / 2, 0, treeModel);
      cone.userData.doneColor = GREENS[i % GREENS.length];
      p.add(cone);
      p.glow = [];
      p.glowColor = 0xffe08a;
      for (let k = 0; k < 6; k++) {
        const ang = k * Math.PI / 3 + i * 0.5, rr = r * 0.74;
        p.add(ball(0.14, ghostMat(), Math.cos(ang) * rr, y0 + 0.45, Math.sin(ang) * rr, treeModel));
        const la = ang + Math.PI / 6, lr = r * 0.58;
        p.glow.push(ball(0.07, flat(0xd5dbee), Math.cos(la) * lr, y0 + 0.85, Math.sin(la) * lr, treeModel));
      }
    });
    const star = mesh(new T.OctahedronGeometry(0.42), ghostMat(), 0, 6.95, 0, treeModel);
    star.scale.set(1, 1.3, 0.5);
    star.userData.doneColor = HEX.yellow;
    rp[rp.length - 1].add(star);
    // Quà dưới gốc cây
    [[-2.0, 1.9, 0xff4d5e, 0.8], [2.1, 1.6, HEX.blue, 0.7], [0.4, 2.7, 0xffc21a, 0.6]].forEach(([x, z, c, size]) => {
      box(size, size * 0.8, size, mat(c), x, size * 0.4, z, treeModel).rotation.y = x;
      box(size * 0.18, size * 0.82, size * 1.02, mat(0xffffff), x, size * 0.4, z, treeModel).rotation.y = x;
    });
    const treeParts = rp;
    /* Mỗi khối của một phần có thêm một lớp màu, bị cắt ngang ở độ cao ứng với tiến độ.
       Đo chân và đỉnh ngay lúc dựng, trước mọi hiệu ứng phóng to hay nghiêng. */
    r.localClippingEnabled = true;
    [uniModel, treeModel].forEach(model => model.updateMatrixWorld(true));
    [...uniParts, ...treeParts].forEach(p => {
      const bounds = new T.Box3();
      p.items.forEach(m => bounds.expandByObject(m));
      p.bottom = bounds.min.y;
      p.top = bounds.max.y;
    });
    // Tầng tán trên che phần ngọn của tầng dưới, nên màu chỉ dâng trong phần còn nhìn thấy
    treeParts.slice(0, -1).forEach((p, i) => { p.top = treeParts[i + 1].bottom; });
    [...uniParts, ...treeParts].forEach(p => {
      p.cut = new T.Plane(new T.Vector3(0, -1, 0), p.bottom);
      p.fills = p.items.map(m => {
        const fill = mesh(m.geometry, mat(m.userData.doneColor ?? p.color, { clippingPlanes: [p.cut] }), 0, 0, 0, m);
        fill.scale.setScalar(1.004);
        fill.visible = false;
        return fill;
      });
    });
    // Điểm gắn nhãn từng bước trên mỗi mô hình (toạ độ cục bộ của mô hình)
    const ANCHORS = {
      uni: [[1.0, 2.9, 1.0], [-3.4, 1.9, 0.1], [3.4, 2.0, 0.3], [0.5, 3.9, -1.9], [3.3, 2.5, -1.9]],
      tree: [[1.9, 1.6, 0.7], [1.6, 2.65, 0.6], [1.25, 3.7, 0.5], [0.9, 4.75, 0.4], [0.6, 5.9, 0.3]],
      rubik: [[0, 0, 1.7], [1.7, 0, 0], [0, 0, -1.7], [-1.7, 0, 0], [0, 1.8, 0]]
    };
    // Tâm từng phần trong không gian (để camera quay về đúng bước)
    const UNI_Y = [0.9, 0.7, 0.7, 1.9, 0.8].map(y => BASE + 0.1 + y);
    const TREE_Y = [1.6, 2.65, 3.7, 4.75, 5.8].map(y => BASE + 0.1 + y);

    const rubikYard = new T.Group();
    rubikYard.position.y = BASE;
    rubikYard.visible = false;
    scene.add(rubikYard);
    cyl(3.9, 4.0, 0.1, mat(0xe3f5ea), 0, -0.05, 0, rubikYard, 48);
    garden(rubikYard, 0, 0, 2.9, 3.6, 22);
    const pop = (obj, base = 1) => {
      if (reduced || !window.Motion) return;
      Motion.animate(0.4, 1, { type: 'spring', stiffness: 240, damping: 13, onUpdate: v => obj.scale.setScalar(v * base) });
    };
    let focus = 'overview', mode = 'house', values = colors.map(() => 0);
    let level = 'ok', total = 0;
    function set(next) {
      values = next.slice();
      floors.forEach((f, i) => {
        const n = window.PROGRESS.lit(values[i], f.blocks.length);
        f.blocks.forEach((b, k) => {
          const on = k < n, was = k < f.filled;
          b.userData.wins.visible = on;
          b.userData.edge.material.color.setHex(on ? 0xffffff : f.color);
          b.material.color.setHex(on ? f.color : 0xeef1fa);
          if (on && !was) pop(b);
        });
        f.filled = n;
      });
      total = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const done = total >= 0.999;
      cone.material.color.setHex(done ? HEX.indigo : 0xeef1fa);
      cone.material.opacity = done ? 1 : 0.35;
      const idx = floors.findIndex((_, i) => values[i] < 0.999);
      if (idx !== scaffoldFloor && idx >= 0) buildScaffold(floors[idx]);
      scaffoldFloor = idx;
      scaffold.visible = level !== 'collapse' && idx >= 0;
      paintModels();
      paintStickers(true);
      applyDim();
    }
    function paintModels() {
      [uniParts, treeParts].forEach(parts => parts.forEach((p, i) => {
        const v = values[i] ?? 0, done = v >= 0.999;
        // Đang dở: lớp màu dâng từ chân lên đúng tỉ lệ trên khung mờ
        p.cut.constant = p.bottom + (p.top - p.bottom) * v;
        p.fills.forEach(f => { f.visible = v > 0 && !done; });
        p.items.forEach(m => {
          m.material.color.setHex(done ? (m.userData.doneColor ?? p.color) : 0xeef1fa);
          m.material.opacity = done ? 1 : 0.3;
          m.userData.edge.material.color.setHex(done ? 0xffffff : p.color);
        });
        const glow = p.glow || [], on = window.PROGRESS.lit(v, glow.length);
        glow.forEach((m, k) => m.material.color.setHex(k < on ? (p.glowColor ?? 0x8ff3ff) : 0xd5dbee));
      }));
    }
    function paintStickers(animate = false) {
      stickers.forEach((list, f) => {
        const v = f < 4 ? values[f] ?? 0 : f === 4 && floors.length > 4 ? values[4] ?? 0 : total;
        const n = window.PROGRESS.lit(v, list.length);
        list.forEach((s, k) => {
          const hex = f === 4 && level === 'collapse' ? 0x5f6b79 : k < n ? faceColor[f] : 0xe9edf8;
          if (s.material.color.getHex() === hex) return;
          s.material.color.setHex(hex);
          if (animate) pop(s);
        });
      });
    }
    // Làm mờ các tầng khác khi đang xem một bước
    function applyDim() {
      const cracked = level === 'ok' ? [] : floors.filter(f => f.filled > 0).slice(-2);
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
        f.cracks.forEach((crack, k) => { crack.visible = cracked.includes(f) && k < f.filled; });
      });
    }

    const falling = floors.slice(Math.floor(floors.length / 2));
    const healthFrames = new Set();
    let stopDrive, stopFall;
    function moveHealth(duration, update) {
      if (reduced) { update(1); return; }
      if (window.Motion?.animate) {
        const control = window.Motion.animate(0, 1, { duration, ease: 'linear', onUpdate: update });
        return () => control.stop();
      }
      const start = performance.now();
      const frame = now => {
        const p = Math.min(1, (now - start) / (duration * 1000));
        update(p);
        if (p === 1) healthFrames.delete(frame);
      };
      healthFrames.add(frame);
      return () => healthFrames.delete(frame);
    }
    function drive() {
      ambulance.position.set(8, BASE, 5);
      medics.visible = false;
      stopDrive = moveHealth(2.5, p => {
        const u = p * p * (3 - 2 * p);
        ambulance.position.set(lerp(8, 3.2, u), BASE, lerp(5, 3.4, u));
        medics.visible = p === 1;
      });
    }
    function collapseFloors() {
      // Tách khỏi nhà đang nghiêng để các tầng đáp xuống mặt sân
      const poses = falling.map((f, k) => {
        const scale = f.g.scale.clone();
        yard.attach(f.g);
        f.g.scale.copy(scale);
        const u = k / Math.max(1, falling.length - 1), angle = lerp(0.6, 1.2, u);
        const clearance = Math.sin(angle) * (f.w + 0.35) / 2 + Math.cos(angle) * 0.55;
        return { g: f.g, from: f.g.position.clone(), z: f.g.rotation.z, x: lerp(1.5, 3, u),
          y: BASE + clearance + 0.3 + k * 0.35, depth: lerp(-3.1, -4.4, u), angle, delay: u * 0.16 };
      });
      stopFall = moveHealth(2.4, p => {
        poses.forEach(({ g, from, z, x, y, depth, angle, delay }) => {
          const u = Math.max(0, Math.min(1, (p * 2.4 - delay) / (1.4 - delay)));
          g.position.set(lerp(from.x, x, u), lerp(from.y, y, u * u), lerp(from.z, depth, u));
          g.rotation.z = lerp(z, angle, u);
        });
        debris.visible = p >= 0.55;
        const haze = Math.max(0, Math.min(1, (p - 0.48) / 0.52));
        dust.visible = haze > 0 && haze < 1;
        dust.scale.setScalar(0.65 + haze * 0.85);
        dustMat.opacity = 0.32 * Math.sin(haze * Math.PI);
      });
    }
    function health(next) {
      if (next === level || !['ok', 'warn', 'rescue', 'collapse'].includes(next)) return;
      const wasCollapsed = level === 'collapse', collapsed = next === 'collapse';
      const wasRescuing = rescue.visible, rescuing = next === 'rescue' || collapsed;
      level = next;
      barrier.visible = next !== 'ok';
      rescue.visible = rescuing;
      house.rotation.z = rescuing ? 0.07 : next === 'warn' ? 0.035 : 0;
      rubik.rotation.z = collapsed ? 0.35 : rescuing ? 0.15 : next === 'warn' ? 0.08 : 0;
      uniModel.rotation.z = treeModel.rotation.z = collapsed ? 0.3 : rescuing ? 0.12 : next === 'warn' ? 0.06 : 0;
      roof.visible = !collapsed;
      scaffold.visible = !collapsed && scaffoldFloor >= 0;
      if (rescuing && !wasRescuing) drive();
      if (!rescuing && wasRescuing) { stopDrive?.(); stopDrive = null; }
      if (collapsed) collapseFloors();
      if (wasCollapsed) {
        stopFall?.();
        stopFall = null;
        debris.visible = dust.visible = false;
        falling.forEach(f => {
          house.add(f.g);
          f.g.position.copy(f.origin);
          f.g.rotation.copy(f.angle);
        });
      }
      paintStickers();
      applyDim();
    }

    /* Camera: các điểm dừng và chuyển cảnh liền mạch */
    const view = { az: 1.7, el: 0.04, dist: 11, ty: BASE + 1, need: 2.6 };
    let tween = null;
    const floorY = i => BASE + 0.62 + i * FH;
    function modelGoal(key) {
      if (key === 'overview') return { az: 0.7, el: 0.3, dist: mode === 'uni' ? 22 : 22, ty: mode === 'tree' ? 1.4 : mode === 'uni' ? 0.3 : 0.9, need: mode === 'uni' ? 8 : 6.6 };
      const i = Math.max(0, Math.min(4, +key)), ys = mode === 'tree' ? TREE_Y : UNI_Y;
      return { az: [-0.55, 0.62, -0.28, 0.5, -0.4][i], el: 0.2, dist: 14, ty: ys[i], need: mode === 'uni' ? 5.2 : 3.6 };
    }
    function goal(key) {
      if (mode === 'uni' || mode === 'tree') return modelGoal(key);
      if (mode === 'rubik') {
        if (key === 'overview') return { az: 0.75, el: 0.5, dist: 21, ty: 0, need: 5.4 };
        const side = [0, 1, 2, -1][key];
        return { az: (side ?? 0) * Math.PI / 2 + 0.28, el: side === undefined ? 0.9 : 0.22, dist: 13, ty: 0.15, need: 3.2 };
      }
      const extra = Math.max(0, floors.length - 4);
      if (key === 'overview') return { az: 0.62, el: 0.3, dist: 27 + 2 * extra, ty: 0.35 + FH * extra / 2, need: 6.4 };
      const angles = [-0.55, 0.62, -0.28, 0.5, -0.4];
      return { az: angles[key % angles.length], el: 0.2, dist: 14.5, ty: floorY(key) - 0.1, need: 3.5 };
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
        const corner = mode === 'rubik' ? { az: 1.9, el: 0.05, dist: 10, ty: 0, need: 2.6 } : mode === 'house' ? { az: 1.65, el: 0.04, dist: 11, ty: BASE + 1.2, need: 2.8 } : { az: 1.9, el: 0.05, dist: 11, ty: BASE + 1, need: 3 };
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
    let onScreen = true;
    new IntersectionObserver(e => { onScreen = e[0].isIntersecting; }).observe(canvas);
    r.setAnimationLoop(() => {
      if (!onScreen || !fit(r, cam, canvas)) return;
      const t = reduced ? 0 : clock.getElapsedTime();
      if (healthFrames.size) {
        const now = performance.now();
        healthFrames.forEach(frame => frame(now));
      }
      if (rescue.visible && !reduced) {
        const flash = Math.floor(t * 4) % 2;
        sirens[0].material.color.setHex(flash ? 0x4a5664 : HEX.red);
        sirens[1].material.color.setHex(flash ? HEX.blue : 0x4a5664);
      }
      floors.forEach((f, i) => {
        const target = focus === i ? 1.1 : 1;
        const s = reduced ? target : lerp(f.g.scale.x, target, 0.08);
        f.g.scale.set(s, 1, s);
      });
      if (uniModel.visible || treeModel.visible) {
        const parts = uniModel.visible ? uniParts : treeParts, cur = values.findIndex(v => v < 0.999);
        if (cur >= 0 && parts[cur]) parts[cur].items.forEach(m => { m.material.opacity = reduced ? 0.45 : 0.34 + (Math.sin(t * 3) + 1) * 0.12; });
      }
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
      const toScreen = (group, x, y, z) => {
        v3.set(x, y, z);
        group.localToWorld(v3).project(cam);
        return { x: (v3.x + 1) / 2 * canvas.clientWidth, y: (1 - v3.y) / 2 * canvas.clientHeight };
      };
      const pts = mode === 'house'
        ? floors.map((f, i) => toScreen(house, (f.w / 2 + 0.2) * f.g.scale.x, floorY(i), f.depth / 2 * f.g.scale.x))
        : ANCHORS[mode].map(([x, y, z]) => toScreen({ rubik, uni: uniModel, tree: treeModel }[mode], x, y, z));
      onFrame(pts, mode);
    });

    return {
      set, focus: focusOn, health,
      mode(m) {
        mode = m;
        house.visible = yard.visible = m === 'house';
        rubik.visible = m === 'rubik';
        uniModel.visible = m === 'uni';
        rubikYard.visible = m === 'rubik';
        treeModel.visible = m === 'tree';
        const group = { house, rubik, uni: uniModel, tree: treeModel }[m] || house;
        pop(group, m === 'rubik' ? 1.35 : 1);
        path([goal(focus)], 1.1);
      }
    };
  }

  window.Scenes = { hero, site };
})();

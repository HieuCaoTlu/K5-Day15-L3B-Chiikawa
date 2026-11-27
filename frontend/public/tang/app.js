/* Ứng dụng: điều hướng, bốn bước, agent, dữ liệu dùng chung và chuyển động. */
(function () {
  const { STEPS, FLOORS, CANVAS, CANVAS_TO_SCORE, SCORE, ROLES, STATUS, SAMPLE_SCORE, SEED, STACK, MONEY, FILES, AGENT, inDays, iso } = window.DATA;
  const { RULES, PROFIT, NAMES: HNAMES, LEVELS } = window.HEALTH;
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(max-width: 1000px)');
  const M = window.Motion;
  const canAnim = !!M && !reduced;
  const EASE = [0.22, 1, 0.36, 1];
  const TABS = [{ id: 'overview', name: 'Tổng quan', short: 'Tổng quan', hex: '#121a33' },
    ...STEPS.map((s, i) => ({ id: s.id, name: s.name, short: ['Thinking', 'Plan', 'Pitch', 'Quality', 'Bảo trì'][i] || s.name, hex: s.hex }))];

  const anim = (el, kf, o) => (canAnim && el && (el.length === undefined || el.length) ? M.animate(el, kf, o) : null);
  const done = a => (a ? Promise.resolve(a.finished || a).catch(() => {}) : Promise.resolve());
  const rise = (els, base = 0) => anim(els, { opacity: [0, 1], y: [18, 0] }, { duration: 0.5, ease: EASE, delay: canAnim ? M.stagger(0.06, { startDelay: base }) : 0 });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- Dữ liệu ---------- */
  const KEY = 'tang-demo-v2';
  let S = SEED();
  const local = { me: 'minh', model: 'house', collapsed: false };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.S) Object.assign(S, raw.S);
    if (raw && raw.local) Object.assign(local, raw.local);
  } catch (e) { /* bộ nhớ trình duyệt không dùng được */ }
  if (!local.think || !local.think.session) local.think = { session: 'th-' + Math.random().toString(36).slice(2, 10), msgs: [] };
  const tk = { run: null, busy: false, offline: false, loaded: false };
  /* Chế độ xem mock đầy đủ: /workstation?demo=full. Dữ liệu mẫu trong bộ nhớ, không gọi backend, không lưu. */
  const mockMode = new URLSearchParams(location.search).get('demo') === 'full';
  if (mockMode) {
    STEPS.forEach(x => { S.done[x.id] = true; });
    const cell = (content, who, when) => ({ content, who: who || '', when: when || '', quote: content, grounded: !!who, status: who ? 'evidence' : 'assumption' });
    tk.loaded = true;
    local.think = { session: 'preview', msgs: [
      { who: 'me', text: 'Chị Lan, chủ shop mỹ phẩm, tuần trước mất 3 đơn vì trả lời tin nhắn trễ 2 giờ. Hiện chị trả lời tay qua Zalo.' },
      { who: 'agent', text: 'GO. Cả 4 ô lõi đều có chuyện thật. Bạn xem Canvas rồi duyệt để sang Planning.' },
      { who: 'agent', text: 'Đã duyệt Canvas. Bạn có thể sang bước Planning.' }] };
    tk.run = { id: 'preview', status: 'approved', source: 'mock', proposal: { verdict: 'GO',
      reasons: ['Cả 4 ô lõi đều có chuyện thật: một người cụ thể, một lần cụ thể.', 'Còn cần làm rõ ở Planning: Metrics, Prior Art & Edge.'],
      canvas: {
        persona: cell('Chị Lan, chủ shop mỹ phẩm có 2 nhân viên', 'chị Lan', 'tuần trước'),
        jtbd: cell('Trả lời khách kịp thời để không mất đơn', 'chị Lan', 'hôm qua'),
        pain_point: cell('Mất 3 đơn vì trả lời tin nhắn trễ 2 giờ', 'chị Lan', 'tuần trước'),
        current_workaround: cell('Trả lời tay qua Zalo, ghi đơn vào Excel', 'chị Lan', 'hôm qua'),
        solution: cell('Bot tự trả lời câu hỏi giá và tồn kho'),
        ai_leverage: cell('AI soạn sẵn câu trả lời từ bảng giá và tồn kho, chị Lan duyệt trước khi gửi'),
        mvp_scope: cell('Một kênh Zalo, ba loại câu hỏi phổ biến'),
        metrics: cell(''), prior_art: cell('')
      } } };
    Object.keys(S.score).forEach(k => { if (!S.score[k].text) S.score[k].text = 'Dữ liệu mẫu'; });
  }
  let db = null, canWrite = true, owner = true;
  const synced = {}, dirty = new Set(), writing = new Set();
  let saveTimer;
  function persist() {
    if (mockMode) return;
    try { localStorage.setItem(KEY, JSON.stringify({ S: db ? undefined : S, local })); } catch (e) { /* bỏ qua */ }
  }
  function save(...sections) {
    if (mockMode) return;
    persist();
    if (db && canWrite) {
      sections.forEach(k => dirty.add(k));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 600);
    }
    syncProgress();
  }
  async function flush() {
    for (const k of [...dirty]) {
      if (writing.has(k)) continue;
      dirty.delete(k);
      const json = JSON.stringify(S[k]);
      if (json === synced[k]) continue;
      writing.add(k);
      try { await db.doc('tang/' + k).set({ json }); synced[k] = json; }
      catch (e) {
        if (e.code === 'invalid_argument') { canWrite = false; toast('Bạn đang ở chế độ chỉ xem, thay đổi không được lưu cho đội.'); }
        else toast('Chưa lưu được lên dữ liệu chung. Thử lại sau ít phút.');
      }
      writing.delete(k);
      if (dirty.has(k)) setTimeout(flush, 400);
    }
  }
  async function connect() {
    if (!window.claude) return;
    const [d, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!d) return;
    db = d;
    if (user) {
      try {
        if ((await user.can('data.write')) === false) canWrite = false;
        owner = !!(await user.isOwner());
      } catch (e) { owner = false; }
    }
    $('#resetBtn').hidden = !owner;
    db.collection('tang').onSnapshot(snap => {
      let changed = false;
      snap.docs.forEach(doc => {
        const k = doc.id, json = doc.data() && doc.data().json;
        if (!(k in S) || typeof json !== 'string' || json === synced[k] || dirty.has(k) || writing.has(k)) return;
        try {
          const value = JSON.parse(json), seed = SEED()[k];
          if (!value || typeof value !== 'object' || Array.isArray(value) !== Array.isArray(seed)) return;
          S[k] = Array.isArray(seed) ? value : Object.assign(seed, value);
          synced[k] = json;
          changed = true;
        } catch (e) { /* bỏ qua tài liệu hỏng */ }
      });
      if (changed) refresh();
    }, () => toast('Mất kết nối dữ liệu chung. Bạn đang xem bản trên máy này.'));
  }
  function refresh() {
    if ($('#app').hidden) return;
    renderTeam();
    renderChat();
    const a = document.activeElement;
    if (a && a.closest('#view,#overlay') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { syncProgress(); return; }
    render();
    syncProgress();
  }

  const member = id => S.meta.members.find(m => m.id === id);
  const color = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#8891ac');
  const avatar = (id, cls = '') => {
    if (id === 'agent') return '<span class="av bot" title="Agent AI Builder">AI</span>';
    const m = member(id);
    return m ? `<span class="av ${cls}" style="--m:${color(m.color)}" title="${esc(m.name)}">${esc(m.name[0])}</span>` : '<span class="av" title="Chưa giao">?</span>';
  };
  const options = (sel, empty = 'Chưa giao') => `<option value="">${empty}</option>` +
    S.meta.members.map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

  /* ---------- Trạng thái bước: phải xong bước trước mới làm bước sau, nên không đo phần trăm ---------- */
  const STATE_LABEL = { done: ['Đã xong', 'var(--green)'], doing: ['Đang làm', 'var(--blue)'], locked: ['Chưa mở', 'var(--mute)'] };
  const stepState = i => (S.done[STEPS[i].id] ? 'done' : STEPS.slice(0, i).every(x => S.done[x.id]) ? 'doing' : 'locked');
  const started = i => (i === 0 ? !!(tk.run || local.think.msgs.length) : true);
  const stepKey = i => { const k = stepState(i); return k === 'doing' ? 'now' : k; };
  /* Ghi rõ: chưa làm thì là "Chưa làm" để nhìn thấy và bấm ngay */
  const stepLabel = i => {
    const k = stepKey(i);
    if (k === 'done') return ['Đã xong', 'var(--green)'];
    if (k === 'now') return started(i) ? ['Đang làm', 'var(--blue)'] : ['Chưa làm', 'var(--orange)'];
    return ['Chưa làm', 'var(--mute)'];
  };
  const stateTag = (i, attr = '') => { const [t, c] = stepLabel(i); return `<span class="tag" style="--c:${c}" ${attr}>${t}</span>`; };
  const progress = () => STEPS.map(x => (S.done[x.id] ? 1 : 0));
  const doneCount = () => progress().reduce((a, b) => a + b, 0);

  function nextAction(i) {
    if (i === 0) {
      const p = tk.run && tk.run.proposal;
      if (S.done.product) return 'Canvas đã duyệt, sang Planning';
      if (!p) return 'Chưa trao đổi với agent';
      if (tk.run.status === 'waiting_review') return 'Canvas chờ bạn duyệt';
      const cell = CANVAS.find(([k]) => k === p.next_cell);
      return cell ? `Còn thiếu chuyện thật ở ô ${cell[1]}` : 'Chờ agent đánh giá';
    }
    if (i === 1) {
      const r = ROLES.find(r => !S.plan.roles[r]);
      if (r) return `Chưa giao vai ${r}`;
      const t = S.tasks.list.find(t => t.status !== 'done');
      return t ? `${t.id}: ${t.title}` : 'Mọi task đã xong';
    }
    if (i === 2) {
      const p = S.pitch;
      return !p.form ? 'Tạo form khảo sát' : !p.responses.length ? 'Thu phản hồi cho form' : !p.overview ? 'Tạo AI overview' : !p.deck ? 'Tạo slide pitching' : !p.script ? 'Viết kịch bản' : !p.ads ? 'Viết bài quảng cáo' : 'Bộ pitching đã đủ';
    }
    if (i === 3) {
      const q = S.quality;
      if (!q.metrics.length) return 'Để agent lấy chỉ số từ Canvas';
      if (q.source !== S.score.metric.text) return 'Canvas đã đổi, lấy lại chỉ số';
      if (!q.runs.length) return 'Ghi lần chạy thử đầu tiên';
      return q.runs.some(r => !r.sample) ? `Đã ghi ${q.runs.length} lần chạy` : 'Mới có dữ liệu mẫu, ghi lần chạy thật';
    }
    const due = S.maintain.schedule.slice().sort((a, b) => a.next.localeCompare(b.next))[0];
    return due ? `${due.next <= iso(new Date()) ? 'Đến hạn' : 'Sắp tới'}: ${due.title}` : 'Chưa có lịch';
  }
  const pct = v => Math.round(v * 100) + '%'; // dùng cho chỉ số chất lượng, không dùng cho tiến độ bước

  let site = null, pins = [], shown = 0;
  function syncProgress() {
    const v = progress();
    if (site) site.set(v);
    const el = $('#totalPct');
    if (el) el.textContent = `${doneCount()}/${STEPS.length}`;
    pins.forEach((p, i) => {
      const k = stepKey(i);
      $('span', p).textContent = k === 'now' && !started(i) ? 'Chưa làm, bấm để bắt đầu' : stepLabel(i)[0];
      p.dataset.state = k;
    });
    $$('[data-state]').forEach(b => { if (b.classList.contains('pin')) return; const [t, c] = stepLabel(+b.dataset.state); b.textContent = t; b.style.setProperty('--c', c); });
    $$('#overlay [data-next], #view [data-next]').forEach(b => { b.textContent = nextAction(+b.dataset.next); });
    applyHealth();
  }

  /* ---------- Quality: lần chạy, chi phí, tín hiệu sức khỏe ---------- */
  const num = v => (v === null || v === undefined || v === '' || !isFinite(+v) ? null : +v);
  const sortedRuns = () => S.quality.runs.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const rate = r => (r && +r.total > 0 && num(r.passed) !== null ? Math.min(1, +r.passed / +r.total) : null);
  const meets = (m, v) => (m.direction === 'down' ? v <= +m.target : v >= +m.target);
  const two = n => String(n).padStart(2, '0');
  const nowLocal = () => { const d = new Date(); return `${iso(d)}T${two(d.getHours())}:${two(d.getMinutes())}`; };
  const shortDate = at => { const [d, t] = String(at).split('T'); const [, m, dd] = (d || '').split('-'); return `${dd}/${m}${t ? ' ' + t : ''}`; };
  const usd = v => (!isFinite(v) ? '?' : (Math.abs(v) < 1 && v !== 0 ? String(+v.toPrecision(2)) : Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString('vi-VN')) + ' USD');
  const runCost = (r, c) => ((+r.inTok || 0) * c.priceIn + (+r.outTok || 0) * c.priceOut) / 1e6;
  /* Chi phí tính bằng code từ token đã khai và đơn giá do đội nhập ở Planning; không dùng bảng giá của nhà cung cấp nào. */
  function money() {
    const c = Object.fromEntries(Object.entries(S.plan.cost).map(([k, v]) => [k, +v || 0]));
    const rs = sortedRuns().filter(r => +r.total > 0 && ((+r.inTok || 0) + (+r.outTok || 0)) > 0);
    if (!rs.length || !(c.priceIn || c.priceOut)) return null;
    const recent = rs.slice(-3), each = r => runCost(r, c) / +r.total;
    const perCase = recent.reduce((a, r) => a + each(r), 0) / recent.length;
    const outCost = recent.reduce((a, r) => a + (+r.outTok || 0) * c.priceOut, 0), allCost = recent.reduce((a, r) => a + runCost(r, c) * 1e6, 0);
    const perUser = perCase * c.tickets, last = rs[rs.length - 1], prev = rs[rs.length - 2];
    return {
      c, perCase, perUser, lastRun: runCost(last, c), outShare: allCost ? outCost / allCost : 0,
      trend: prev && each(prev) > 0 ? each(last) / each(prev) - 1 : 0,
      margin: c.price > 0 ? (c.price - perUser) / c.price : null,
      breakEven: perUser + (c.teams > 0 ? c.infra / c.teams : 0),
      targetPrice: perUser / (1 - PROFIT.targetMargin)
    };
  }
  function signals() {
    const runs = sortedRuns(), last = runs[runs.length - 1], prev = runs[runs.length - 2], m = money();
    const today = new Date(iso(new Date()) + 'T00:00');
    const late = S.maintain.schedule.filter(x => x.next < iso(new Date())).map(x => Math.round((today - new Date(x.next + 'T00:00')) / 864e5));
    const a = rate(last), b = rate(prev);
    return {
      passRate: a,
      passDrop: a !== null && b !== null ? Math.max(0, b - a) : null,
      metricMiss: last ? S.quality.metrics.filter(k => num(last.values[k.id]) !== null && !meets(k, +last.values[k.id])).length : null,
      margin: m ? m.margin : null,
      overdueDays: late.length ? Math.max(...late) : 0,
      staleDays: last ? Math.max(0, Math.floor((Date.now() - new Date(last.at)) / 864e5)) : null
    };
  }
  const health = () => window.HEALTH.evaluate(signals());
  const HCOLOR = { ok: 'var(--green)', warn: 'var(--yellow)', rescue: 'var(--orange)', collapse: 'var(--orange)' };
  const fmtRule = (fmt, v) => (fmt === 'pct' ? Math.round(v * 100) + '%' : fmt === 'days' ? v + ' ngày' : String(v));
  const reasonText = r => `${r.label}: ${fmtRule(r.fmt, r.value)} (ngưỡng ${HNAMES[r.level].toLowerCase()} là ${r.dir === 'below' ? 'dưới' : 'từ'} ${fmtRule(r.fmt, r.threshold)})`;
  let preview = null, lastLevel = null;
  function applyHealth() {
    const h = health(), level = preview || h.level;
    if (site && site.health) site.health(level);
    const chip = $('#healthChip');
    if (chip) { chip.dataset.level = level; chip.style.setProperty('--c', HCOLOR[level]); chip.innerHTML = `<i></i>${preview ? 'Xem thử' : 'Sức khỏe'}: ${HNAMES[level]}`; }
    if (lastLevel && LEVELS.indexOf(h.level) > LEVELS.indexOf(lastLevel)) toast(`Sức khỏe sản phẩm chuyển sang ${HNAMES[h.level].toLowerCase()}. Xem lý do ở tab Maintaining.`);
    lastLevel = h.level;
  }
  function profitTips(m) {
    if (!m) return ['Cần ít nhất một lần chạy có token và tổng số test, cùng đơn giá token, để tính chi phí.'];
    const t = PROFIT.targetMargin, tips = [];
    if (!(m.c.price > 0)) tips.push(`Chưa có giá bán. Với chi phí hiện tại, giá hòa vốn là ${usd(m.breakEven)} và giá để đạt biên ${pct(t)} là ${usd(m.targetPrice)} mỗi khách mỗi tháng.`);
    else if (m.margin < 0) tips.push(`Chi phí AI đang cao hơn giá bán ${usd(m.perUser - m.c.price)} mỗi khách mỗi tháng. Cần giá ít nhất ${usd(m.breakEven)}, hoặc giảm token mỗi lượt gọi.`);
    else if (m.margin < t) tips.push(`Biên hiện tại ${pct(m.margin)}, dưới mục tiêu ${pct(t)}. Hai hướng: nâng giá lên khoảng ${usd(m.targetPrice)}, hoặc giảm khoảng ${pct(1 - m.c.price * (1 - t) / m.perUser)} token mỗi lượt gọi.`);
    else tips.push(`Biên ${pct(m.margin)} đã đạt mục tiêu ${pct(t)}. Có thể giữ giá, hoặc dành phần dư cho model tốt hơn ở bước khó.`);
    tips.push(m.outShare > 0.5 ? 'Token ra chiếm phần lớn chi phí. Giới hạn độ dài câu trả lời hoặc yêu cầu định dạng ngắn hơn.' : 'Token vào chiếm phần lớn chi phí. Cache phần prompt lặp lại hoặc rút gọn ngữ cảnh gửi kèm.');
    if (m.trend > 0.1) tips.push(`Chi phí mỗi lượt gọi tăng ${pct(m.trend)} so với lần chạy trước. Kiểm tra model hoặc prompt vừa đổi.`);
    if (m.c.price > 0 && m.c.infra > 0) tips.push(`Giá hòa vốn đã tính phần hạ tầng chia đều cho ${m.c.teams || 0} khách: ${usd(m.breakEven)} mỗi khách mỗi tháng.`);
    return tips;
  }
  /* Biểu đồ đường bằng SVG, không cần thư viện. series: [{ name, color, values[], target? }] */
  const PALETTE = ['var(--ink)', 'var(--indigo)', 'var(--blue)', 'var(--green)', 'var(--orange)', 'var(--violet)', 'var(--yellow)'];
  const tick = v => (Math.abs(v) >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + 'k' : String(+v.toFixed(1)));
  function lineChart(xs, series, label) {
    const W = 640, H = 230, L = 46, R = 14, T = 12, B = 30;
    const vals = series.flatMap(s => [...s.values, s.target]).filter(v => v !== null && v !== undefined && isFinite(v));
    if (!xs.length || !vals.length) return '<p class="muted">Chưa có lần chạy nào để vẽ.</p>';
    const hi = Math.max(...vals, 0), mag = hi > 0 ? 10 ** Math.floor(Math.log10(hi)) : 1, max = Math.ceil(hi * 1.08 / mag) * mag || 1, min = Math.min(0, ...vals);
    const x = i => L + (xs.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (xs.length - 1));
    const y = v => T + (H - T - B) * (1 - (v - min) / (max - min || 1));
    const every = Math.ceil(xs.length / 7);
    const grid = [0, 0.25, 0.5, 0.75, 1].map(t => min + (max - min) * t).map(v => `<line class="g" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${tick(v)}</text>`).join('');
    const xl = xs.map((l, i) => (i % every && i !== xs.length - 1 ? '' : `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(l.split(' ')[0])}</text>`)).join('');
    const lines = series.map(s => {
      let d = '', prev = false;
      s.values.forEach((v, i) => { if (v === null || v === undefined || !isFinite(v)) { prev = false; return; } d += `${prev ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; prev = true; });
      const target = s.target !== null && s.target !== undefined && isFinite(s.target) ? `<line class="tg" x1="${L}" x2="${W - R}" y1="${y(s.target).toFixed(1)}" y2="${y(s.target).toFixed(1)}" style="stroke:${s.color}"/>` : '';
      const dots = s.values.map((v, i) => (v === null || v === undefined || !isFinite(v) ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.6" style="fill:${s.color}"><title>${esc(s.name)}, ${esc(xs[i])}: ${+(+v).toFixed(2)}</title></circle>`)).join('');
      return `${target}<path class="ln" d="${d}" style="stroke:${s.color}"/>${dots}`;
    }).join('');
    const legend = series.map(s => `<span style="--c:${s.color}"><i></i>${esc(s.name)}${s.target !== null && s.target !== undefined && isFinite(s.target) ? `, mục tiêu ${+s.target}` : ''}</span>`).join('');
    return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${xl}${lines}</svg></div><div class="legend">${legend}<span class="muted">Nét đứt là mục tiêu</span></div>`;
  }
  /* Khung Thinking cho metric:
     - đủ hiện trạng, mục tiêu, cách đo;
     - metric mạnh (hành vi lặp lại, kết quả công việc) thay vì metric phù phiếm (lượt đăng ký, lượt tải, số tính năng);
     - metric đi theo bản chất problem: hành vi thì đo retention, phiên, quay lại; năng suất thì đo thời gian, tỉ lệ chỉnh sửa, số lần dùng thật;
     - có chỉ số chất lượng AI (câu trả lời đúng là gì, bắt đúng hay bắt đủ) và chỉ số khả thi (độ trễ, chi phí);
     - tiêu chí thành công viết thành một câu "Nếu ... thì ...". */
  const KIND = { value: ['Giá trị thật', 'var(--green)'], ai: ['Chất lượng AI', 'var(--indigo)'], feasibility: ['Khả thi', 'var(--orange)'] };
  const NATURE = { behavior: 'Hành vi', productivity: 'Năng suất', other: 'Chưa rõ' };
  const RX = {
    vanity: /(đăng ký|lượt tải|tải app|download|số (tính năng|feature)|lượt truy cập|lượt xem|pageview|follower|lượt thích)/i,
    ai: /(đúng|sai|chính xác|precision|recall|accuracy|bản nháp|ảo giác|trích dẫn|chỉnh sửa|sửa nhẹ|giữ lại|được dùng|chấp nhận|sinh ra)/i,
    feasibility: /(độ trễ|latency|giây|ms|chi phí|token|USD|thời gian chờ)/i,
    behavior: /(duy trì|động lực|thói quen|mất tập trung|bỏ giữa chừng|quay lại|tự học|tương tác)/i,
    productivity: /(thủ công|lặp lại|mất thời gian|chờ|năng suất|tạo đề|soạn|trả lời|xử lý)/i,
    behaviorMetric: /(quay lại|retention|phiên|hằng tuần|mỗi tuần|duy trì|hoàn thành)/i,
    productivityMetric: /(thời gian|tỉ lệ (chỉnh )?sửa|số .{0,20}dùng thật|giảm|nhanh)/i
  };
  const kindOf = t => (RX.feasibility.test(t) && !/phản hồi/i.test(t) ? 'feasibility' : RX.ai.test(t) ? 'ai' : 'value');
  const natureOf = t => (RX.behavior.test(t) ? 'behavior' : RX.productivity.test(t) ? 'productivity' : 'other');
  const withUnit = (v, u) => `${+v}${u && u !== '%' ? ' ' + u : u || ''}`;
  const ruleOf = k => `Nếu ${String(k.name).toLowerCase()} ${k.direction === 'down' ? 'không vượt' : 'đạt từ'} ${withUnit(k.target, k.unit)}${num(k.baseline) !== null ? ` (hiện trạng ${withUnit(k.baseline, k.unit)})` : ''} thì xem là đạt.`;
  /* Tách metric từ văn bản khi chưa gọi được Claude. Chỉ lấy số có trong văn bản; không có hiện trạng thì để trống. */
  function parseMetrics(text) {
    return text.split(/[;\n]|\.\s/).map(t => t.trim()).filter(Boolean).map(seg => {
      const range = seg.match(/từ\s*(-?\d+(?:[.,]\d+)?)\s*(%|giây|phút|ms|điểm|lần|USD)?\s*(xuống|lên|thành|còn)\s*(-?\d+(?:[.,]\d+)?)\s*(%|giây|phút|ms|điểm|lần|USD)?/i);
      const m = range ? null : seg.match(/(-?\d+(?:[.,]\d+)?)\s*(%|giây|phút|ms|điểm|lần|USD)?/i);
      if (!range && !m) return null;
      const n = x => +String(x).replace(',', '.');
      let name = seg.replace(range ? range[0] : m[0], ' ').replace(/(ít nhất|tối thiểu|tối đa|không quá|dưới|trên|đạt)/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s,:;.\-]+|[\s,:;.\-]+$/g, '');
      const unit = range ? range[5] || range[2] || '' : m[2] || '';
      const rel = !range && unit === '%' && name.match(/\s(giảm|tăng)$/i);
      if (rel) name = `Mức ${rel[1].toLowerCase()} ${name.slice(0, rel.index).trim().replace(/^./, c => c.toLowerCase())}`;
      if (range) name = name.replace(/\s(giảm|tăng)$/i, '');
      name = name ? name[0].toUpperCase() + name.slice(1) : seg;
      const direction = range ? (/xuống|còn/i.test(range[3]) ? 'down' : 'up') : /(tối đa|không quá|dưới|ít hơn)/i.test(seg) ? 'down' : 'up';
      const k = { name: name.slice(0, 60), baseline: range ? n(range[1]) : null, target: range ? n(range[4]) : n(m[1]), unit, direction, kind: kindOf(seg), method: '' };
      return Object.assign(k, { rule: ruleOf(k) });
    }).filter(Boolean);
  }
  /* Gợi ý cho bộ chỉ số theo khung Thinking. Code chấm, không để LLM chấm. Chỉ trả về điều còn thiếu. */
  function checkMetrics() {
    const q = S.quality, list = q.metrics, out = [];
    if (!list.length) return [];
    const nature = q.nature && q.nature !== 'other' ? q.nature : natureOf(S.score.problem.text);
    const vanity = list.filter(k => RX.vanity.test(k.name));
    if (vanity.length) out.push(`${vanity.map(k => k.name).join(', ')} chỉ cho biết có bao nhiêu người đến, chưa cho biết sản phẩm có giúp được họ không. Nên thay bằng việc người dùng làm được nhờ sản phẩm.`);
    if (!list.some(k => k.kind === 'ai')) out.push('Nên có một chỉ số cho biết AI trả lời đúng tới đâu, ví dụ tỉ lệ câu trả lời được dùng mà không phải sửa.');
    if (nature === 'behavior' && !list.some(k => RX.behaviorMetric.test(k.name))) out.push('Bài toán là giúp người dùng duy trì thói quen, nên đo việc họ quay lại, ví dụ số phiên mỗi tuần.');
    if (nature === 'productivity' && !list.some(k => RX.productivityMetric.test(k.name))) out.push('Bài toán là giúp làm việc nhanh hơn, nên đo thời gian làm xong việc hoặc tỉ lệ phải sửa lại.');
    return out;
  }
  const SOURCE = { agent: 'Agent', tu: 'Luật tách số', mau: 'Mẫu', tay: 'Nhập tay' };
  let qline = 'all', runEdit = null, armedKey = '', armedAt = 0;
  /* Thao tác xóa cần bấm hai lần trong 4 giây */
  function twice(b, key, label) {
    if (armedKey === key && Date.now() - armedAt < 4000) { armedKey = ''; return true; }
    armedKey = key; armedAt = Date.now();
    const old = b.textContent; b.textContent = label;
    setTimeout(() => { if (b.isConnected && b.textContent === label) b.textContent = old; }, 4000);
    return false;
  }
  function ruleTech() {
    const s = signals(), m = money(), out = [];
    if (s.passDrop > 0) out.push({ title: 'Khóa phiên bản model và prompt đang chạy tốt', why: `Tỉ lệ pass giảm ${pct(s.passDrop)} ở lần chạy gần nhất. Giữ bản cũ để quay lại trong khi tìm nguyên nhân.`, level: 'Cao' });
    if (s.metricMiss > 0) out.push({ title: 'Đưa các ca chưa đạt vào bộ kiểm thử hồi quy', why: `${s.metricMiss} metric chưa đạt mục tiêu. Ca lỗi thật giúp phát hiện sớm khi đổi model.`, level: 'Cao' });
    if (m && m.margin !== null && m.margin < PROFIT.targetMargin) out.push({ title: 'Thử model nhỏ hơn cho bước đơn giản', why: `Biên lãi ${pct(m.margin)} dưới mục tiêu ${pct(PROFIT.targetMargin)}. Chạy lại bộ kiểm thử trước khi đổi (cần kiểm tra lại chất lượng).`, level: 'Vừa' });
    if (s.staleDays !== null && s.staleDays >= RULES.staleDays.warn) out.push({ title: 'Chạy bộ kiểm thử tự động mỗi khi merge', why: `Đã ${s.staleDays} ngày chưa có lần chạy mới.`, level: 'Vừa' });
    out.push({ title: 'Ghi log có che thông tin cá nhân', why: 'Cần log để sửa lỗi chất lượng mà không giữ dữ liệu cá nhân của khách.', level: 'Cao' },
      { title: 'Thêm phương án dự phòng khi model lỗi', why: 'Người dùng vẫn làm việc được khi dịch vụ AI chậm hoặc gián đoạn.', level: 'Vừa' });
    return { items: out };
  }
  function ruleCadence() {
    const s = signals(), m = money(), have = new Set(S.maintain.schedule.map(x => x.title)), out = [];
    const add = (title, every, why) => { if (!have.has(title)) out.push({ title, every, why }); };
    const low = (s.passRate !== null && s.passRate < RULES.passRate.warn) || (s.passDrop !== null && s.passDrop >= RULES.passDrop.warn);
    add('Chạy bộ kiểm thử và ghi vào Quality', low ? 3 : 7, low ? 'Chất lượng đang giảm, cần đo dày hơn cho tới khi ổn định.' : 'Giữ nhịp đo hằng tuần để thấy xu hướng.');
    if (new Set(S.quality.runs.map(r => r.model)).size > 1) add('Chạy đối chứng mỗi khi đổi model hoặc prompt', 14, 'Đội đã thử nhiều phiên bản. Mỗi lần đổi cần một lần chạy so với bản trước.');
    if (m) add('Rà chi phí token và giá bán', m.margin !== null && m.margin < PROFIT.targetMargin ? 7 : 30, m.margin !== null && m.margin < PROFIT.targetMargin ? `Biên lãi ${pct(m.margin)} dưới mục tiêu, cần theo dõi hằng tuần.` : 'Đơn giá token và lượng dùng thay đổi theo thời gian.');
    if (s.overdueDays >= RULES.overdueDays.warn) add('Dọn các việc bảo trì trễ hạn', 7, `Có việc trễ ${s.overdueDays} ngày.`);
    add('Kiểm tra bản cập nhật thư viện và model', 30, 'Đọc ghi chú phát hành trước khi nâng cấp. Phiên bản cụ thể cần đội kiểm tra lại.');
    return { items: out };
  }
  /* ---------- Thông báo ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.style.opacity = 1;
    anim(t, { y: [16, 0], opacity: [0, 1] }, { type: 'spring', stiffness: 320, damping: 24 });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = 0; }, 3200);
  }

  /* ---------- Claude ---------- */
  let sample = null, downloads = null;
  const ready = (async () => {
    if (!window.claude) return;
    [sample, downloads] = await Promise.all([window.claude.use('sample'), window.claude.use('downloads')]);
  })().catch(() => {});
  const context = () => JSON.stringify({
    project: S.meta.name,
    scorecard: Object.fromEntries(SCORE.map(([k, l]) => [l, S.score[k].text])),
    overview: S.plan.overview,
    tasks: S.tasks.list.map(t => `${t.id} ${t.title} (${(STATUS[t.status] || ['?'])[0]})`),
    quality: {
      metrics: S.quality.metrics.map(m => `${m.name} (${(KIND[m.kind] || KIND.value)[0]}): hiện trạng ${num(m.baseline) === null ? 'chưa đo' : m.baseline + m.unit}, mục tiêu ${m.target}${m.unit}, cách đo: ${m.method || 'chưa ghi'}`),
      metricTips: checkMetrics(),
      runs: sortedRuns().slice(-5).map(r => `${r.at} ${r.model}: pass ${r.passed}/${r.total}, token ${r.inTok}/${r.outTok}${r.sample ? ' (dữ liệu mẫu)' : ''}`),
      health: HNAMES[health().level], reasons: health().reasons.map(reasonText)
    },
    chat: S.chat.slice(-14).map(m => `${m.who === 'agent' ? 'Agent' : (member(m.who) || {}).name}: ${m.text}`)
  });
  function why(e) {
    return e && e.code === 'rate_limited' ? 'Claude đang bận.' : e && e.code === 'not_granted' ? 'Bạn chưa cho phép trang gọi Claude.' : 'Chưa gọi được Claude.';
  }
  /* Gọi Claude lấy JSON; nếu không được thì dùng bản mẫu và nói rõ. */
  async function generate(task, shape, valid, fallback) {
    await ready;
    if (sample) {
      try {
        const out = await sample.json(`${AGENT}\n\nDữ liệu dự án:\n${context()}\n\nNhiệm vụ: ${task}\nChỉ trả về JSON đúng dạng: ${shape}`, { cache: false });
        if (valid(out)) return out;
        toast('Claude trả về sai định dạng, đang dùng bản mẫu.');
      } catch (e) { toast(why(e) + ' Đang dùng bản mẫu.'); }
    } else toast('Chưa kết nối Claude, đang dùng bản mẫu.');
    await wait(500);
    return fallback();
  }
  const str = v => typeof v === 'string' && v.trim().length > 0;

  /* ---------- Chat ---------- */
  const chat = document.createElement('div');
  chat.className = 'chat';
  chat.innerHTML = `<div class="msgs" aria-live="polite"></div><div class="speak"></div><div class="quick"></div>
    <form class="compose" data-form="chat"><input aria-label="Tin nhắn" placeholder="Nhắn cho cả nhóm và agent" autocomplete="off"><button class="btn tone" style="--c:var(--blue)">Gửi</button></form>`;
  let typing = false;
  function renderChat(animateLast) {
    const box = $('.msgs', chat);
    box.innerHTML = S.chat.map(m => {
      const who = member(m.who);
      return `<div class="msg" style="--m:${who ? color(who.color) : 'var(--yellow)'}">${avatar(m.who)}<div class="bubble"><small>${esc(who ? who.name : 'Agent AI Builder')}</small>${esc(m.text)}</div></div>`;
    }).join('') + (typing ? `<div class="msg" id="typing">${avatar('agent')}<div class="bubble">Đang suy nghĩ...</div></div>` : '');
    $('.speak', chat).innerHTML = '<span>Bạn đang nói với tư cách</span>' + S.meta.members.map(m =>
      `<button class="av ${m.id === local.me ? 'me' : ''}" style="--m:${color(m.color)}" data-act="me" data-id="${esc(m.id)}" title="${esc(m.name)}" aria-pressed="${m.id === local.me}">${esc(m.name[0])}</button>`).join('');
    $('.quick', chat).innerHTML = ['Phạm vi MVP này có quá rộng không?', 'Đo thành công bằng gì?', 'Rủi ro lớn nhất là gì?']
      .map(q => `<button class="btn soft small" data-act="quick">${q}</button>`).join('');
    box.scrollTop = box.scrollHeight;
    if (animateLast && box.lastElementChild) anim(box.lastElementChild, { opacity: [0, 1], y: [14, 0], scale: [0.96, 1] }, { type: 'spring', stiffness: 300, damping: 24 });
  }
  function localReply(text) {
    const t = text.toLowerCase();
    if (/đo|metric|thành công/.test(t)) return 'Chọn một chỉ số người dùng cảm nhận được, ví dụ thời gian phản hồi, và một chỉ số chất lượng AI, ví dụ tỉ lệ bản nháp được gửi mà chỉ sửa nhẹ. Hiện tại hai con số đó đang là bao nhiêu?';
    if (/rộng|scope|phạm vi/.test(t)) return 'Thử cắt còn một kênh và một loại câu hỏi cho tuần đầu. Nếu bỏ một phần mà người dùng vẫn thấy giá trị, phần đó chưa thuộc MVP. Loại câu hỏi nào đau nhất?';
    if (/rủi ro|risk/.test(t)) return 'Rủi ro lớn nhất thường là AI trả lời sai chính sách một cách tự tin. Giữ người duyệt, hiện nguồn trích dẫn và lập bộ câu hỏi đánh giá trước khi mở rộng. Ai trong đội sẽ chịu trách nhiệm bộ đánh giá?';
    return 'Mình ghi nhận. Trước khi bàn cách làm, hãy nói rõ ai gặp chuyện này, bao lâu một lần và hiện họ xoay xở ra sao. Bạn có bằng chứng nào từ người dùng thật chưa?';
  }
  async function send(text) {
    if (!text.trim() || typing) return;
    S.chat.push({ who: local.me, text: text.trim().slice(0, 1200) });
    S.chat = S.chat.slice(-60);
    typing = true;
    renderChat(true);
    save('chat');
    await ready;
    const msg = { who: 'agent', text: '' };
    let live = false;
    if (sample) {
      try {
        const res = await sample(`${AGENT}\n\nDữ liệu dự án và cuộc trò chuyện:\n${context()}\n\nHãy trả lời tin nhắn cuối cùng trong tối đa 120 từ. Khi hữu ích, kết thúc bằng đúng một câu hỏi để đội nghĩ sâu hơn.`, {
          cache: false,
          onText: ({ text: t }) => {
            const b = $('#typing .bubble', chat);
            if (b) { b.textContent = t; const box = $('.msgs', chat); box.scrollTop = box.scrollHeight; }
          }
        });
        msg.text = res.text.replace(/\*\*|__|^#+\s/gm, '');
        live = true;
      } catch (e) { toast(why(e)); }
    }
    if (!live) { await wait(600); msg.text = '(Trả lời mẫu) ' + localReply(text); }
    typing = false;
    S.chat.push(msg);
    renderChat(true);
    save('chat');
  }

  /* ---------- Thinking: trao đổi với agent → điền AI MVP Canvas → agent đánh giá → trưởng nhóm duyệt ---------- */
  const API = '/api/v1/agent';
  const CORE = ['persona', 'pain_point', 'current_workaround', 'jtbd'];
  const CELL_STATE = { evidence: ['Có bằng chứng', 'var(--green)'], assumption: ['Giả định', 'var(--orange)'], empty: ['Trống', 'var(--mute)'] };
  const VERDICT = { GO: 'var(--green)', 'NOT YET': 'var(--orange)', NO: 'var(--red)' };
  async function api(path, opts) {
    const res = await fetch(API + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  function syncScore(canvas) {
    Object.entries(CANVAS_TO_SCORE).forEach(([cell, key]) => {
      const c = canvas && canvas[cell];
      if (c && c.content && S.score[key]) S.score[key].text = c.content;
    });
    save('score');
  }
  function renderThink(scrollEnd) {
    if (!$('#tkCanvas')) return;
    const run = tk.run, p = run && run.proposal, canvas = (p && p.canvas) || {};
    $('#tkCanvas').innerHTML = `<div class="tk-head"><h3>AI MVP Canvas</h3><span class="muted">Dấu * là ô lõi: cần chuyện thật của một người, một lần cụ thể</span><button class="btn soft small" data-act="think-reset">Làm lại</button></div>
      <div class="tk-grid">${CANVAS.map(([k, label], n) => {
        const cell = canvas[k] || {}, st = cell.status || 'empty', [txt, col] = CELL_STATE[st];
        return `<div class="tk-cell ${st}" style="--c:${col}"><div class="tk-top"><b><span class="tk-no">${n + 1}.</span> ${label}${CORE.includes(k) ? '<i title="Ô lõi">*</i>' : ''}</b><span class="tag" style="--c:${col}">${txt}</span></div>
          <p title="${esc(cell.content || '')}">${cell.content ? esc(cell.content) : '<span class="muted">Chưa có</span>'}</p>${st === 'evidence' ? `<small>${esc(cell.who)} · ${esc(cell.when)}</small>` : ''}</div>`;
      }).join('')}</div>`;

    const status = run && run.status;
    let actions = '<span class="muted">Trả lời câu hỏi của agent để tiếp tục</span>';
    if (status === 'waiting_review') actions = `${btn('think-approve', 'Duyệt Canvas', 'tone small', 'style="--c:var(--green)"')}${btn('think-reject', 'Chưa duyệt', 'soft small')}`;
    if (status === 'approved') actions = '<span class="tag" style="--c:var(--green)">Đã duyệt</span>';
    if (status === 'rejected') actions = '<span class="tag" style="--c:var(--orange)">Chưa duyệt, cần bổ sung</span>';
    const src = run && run.source === 'fallback' ? '<span class="tag" style="--c:var(--orange)" title="Chưa có GOOGLE_API_KEY hoặc Gemini lỗi, agent dùng luật dự phòng">Chế độ dự phòng</span>' : run && run.source === 'mock' ? '<span class="tag">Dữ liệu mẫu</span>' : '';
    $('#tkEval').innerHTML = p
      ? `<div class="tk-head"><h3>Đánh giá của agent</h3><span class="tk-verdict" style="--c:${VERDICT[p.verdict] || 'var(--mute)'}">${esc(p.verdict)}</span>${src}</div>
         <ul class="tk-reasons">${(p.reasons || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul><div class="tk-actions">${actions}</div>`
      : `<div class="tk-head"><h3>Đánh giá của agent</h3></div><span class="muted">Chưa có đánh giá. Kể ý tưởng của bạn ở khung chat bên dưới.</span>`;

    const box = $('#tkMsgs'), msgs = local.think.msgs;
    box.innerHTML = (msgs.length ? '' : '<p class="muted">Gõ ý tưởng thô của bạn để bắt đầu.</p>') +
      msgs.map(m => `<div class="tk-msg ${m.who === 'me' ? 'me' : ''}"><div class="tk-bubble">${esc(m.text)}</div></div>`).join('') +
      (tk.busy ? '<div class="tk-msg"><div class="tk-bubble muted">Đang suy nghĩ...</div></div>' : '');
    const send = $('.tk-compose button');
    if (send) send.disabled = tk.busy;
    if (scrollEnd) box.scrollTop = box.scrollHeight;
  }
  async function thinkLoad() {
    try {
      const runs = await api(`/runs?session_id=${encodeURIComponent(local.think.session)}`);
      tk.run = runs.find(r => r.proposal && r.proposal.canvas) || null;
      tk.offline = false;
      if (tk.run) syncScore(tk.run.proposal.canvas);
    } catch (e) { tk.offline = true; }
    renderThink(true);
    syncProgress();
  }
  function thinkMount() {
    renderThink(true);
    if (!tk.loaded) { tk.loaded = true; thinkLoad(); }
  }
  async function thinkSend(text) {
    text = text.trim().slice(0, 2000);
    if (!text || tk.busy) return;
    const t = local.think;
    t.msgs.push({ who: 'me', text });
    t.msgs = t.msgs.slice(-60);
    tk.busy = true; persist(); renderThink(true);
    try {
      if (tk.run && tk.run.status === 'waiting_review') {
        await api(`/runs/${tk.run.id}/review`, { method: 'POST', body: JSON.stringify({ approved: false, note: 'Trưởng nhóm tiếp tục trao đổi' }) });
      }
      const run = await api('/runs', { method: 'POST', body: JSON.stringify({ request: text, session_id: t.session }) });
      tk.offline = false;
      if (run.status === 'blocked') {
        t.msgs.push({ who: 'agent', text: 'Mình không xử lý tin nhắn này: ' + ((run.result || {}).reason || 'bị chặn') + '.' });
      } else {
        tk.run = run;
        t.msgs.push({ who: 'agent', text: run.proposal.reply });
        syncScore(run.proposal.canvas);
        if (S.done.product) { S.done.product = false; save('done'); }
      }
    } catch (e) {
      tk.offline = true;
      t.msgs.push({ who: 'agent', text: 'Chưa kết nối được backend. Hãy chạy backend (cd backend, uv run uvicorn app.main:app --port 8000) rồi gửi lại.' });
    }
    tk.busy = false; persist(); renderThink(true); syncProgress();
  }
  async function thinkReview(approved) {
    if (!tk.run || tk.busy) return;
    tk.busy = true; renderThink();
    try {
      const run = await api(`/runs/${tk.run.id}/review`, { method: 'POST', body: JSON.stringify({ approved, note: approved ? 'Trưởng nhóm duyệt Canvas' : 'Trưởng nhóm chưa duyệt, cần bổ sung' }) });
      tk.run = run;
      const handoff = approved && run.result && run.result.handoff === 'planning';
      if (handoff) { S.done.product = true; save('done'); toast('Đã duyệt Canvas. Bước Planning đã mở.'); }
      local.think.msgs.push({ who: 'agent', text: handoff ? 'Đã duyệt Canvas. Bạn có thể sang bước Planning.' : approved ? 'Đã ghi nhận kết luận. Canvas chưa đủ điều kiện sang Planning.' : 'Đã ghi nhận chưa duyệt. Bạn kể thêm để mình hỏi tiếp nhé.' });
    } catch (e) { toast('Chưa gửi được quyết định duyệt. Kiểm tra backend.'); }
    tk.busy = false; persist(); renderThink(true); syncProgress(); renderNav();
  }
  function thinkReset() {
    local.think = { session: 'th-' + Math.random().toString(36).slice(2, 10), msgs: [] };
    tk.run = null; tk.loaded = true;
    S.done.product = false; save('done'); persist();
    renderThink(true); syncProgress(); renderNav();
  }

  /* ---------- Các khung nhìn ---------- */
  /* Một câu giải thích mỗi bước, hiện ở khối bên trái tab Tổng quan */
  const STEP_HINT = {
    product: 'Phân tích kỹ ý tưởng của bạn bằng tư duy sản phẩm trước khi thực hiện.',
    planning: 'Chia vai, chia việc và tính chi phí cho cả đội.',
    pitching: 'Biến bằng chứng thành khảo sát và bài thuyết trình.',
    quality: 'Theo dõi chất lượng và chi phí từng lần chạy thử.',
    maintaining: 'Cập nhật và bảo trì để sản phẩm luôn khỏe.'
  };

  const finishBtn = i => (i === 0 ? '' : stepState(i) === 'doing' ? btn('finish', 'Hoàn thành bước này', 'tone small', `data-id="${STEPS[i].id}"`) : stepState(i) === 'done' ? btn('reopen', 'Mở lại', 'soft small', `data-id="${STEPS[i].id}"`) : '');
  const lockNote = i => (stepState(i) === 'locked' ? `<div class="lock-note">Bước này mở sau khi hoàn thành ${STEPS[i - 1].name}. Bạn vẫn xem trước được.</div>` : '');
  const head = (i, sub, extra = '') => `<div class="view-head"><div><h2>${STEPS[i].name}</h2><p>${sub}</p></div><div class="head-tools">${stateTag(i)}${finishBtn(i)}${extra}</div></div>${lockNote(i)}
    <div class="mind" aria-label="Chuyển tư duy"><span>Engineer: ${STEPS[i].from}</span><span>AI builder: ${STEPS[i].to}</span></div>`;
  const panelHead = (t, extra = '') => `<div class="panel-head"><h3>${t}</h3>${extra}</div>`;
  const btn = (act, label, cls = 'tone', data = '') => `<button class="btn ${cls}" data-act="${act}" ${data}>${label}</button>`;

  const views = {
    overview() {
      const cards = STEPS.map((s, i) => {
        const k = stepKey(i);
        return `<button class="ms ${k}" style="--c:${s.hex}" data-act="tab" data-id="${s.id}">
          <span class="ms-rail"><span class="ms-dot">${k === 'done' ? '✓' : i + 1}</span>${i < STEPS.length - 1 ? '<span class="ms-line"></span>' : ''}</span>
          <span class="ms-name">${s.name}</span>${stateTag(i, `data-state="${i}"`)}
          <span class="muted" data-next="${i}">${esc(nextAction(i))}</span>
          ${k === 'now' ? `<span class="ms-cta">${i === 0 && !started(0) ? 'Bắt đầu tại đây' : 'Bấm để làm tiếp'}</span>` : k === 'locked' ? `<span class="ms-wait">Sau khi xong ${STEPS[i - 1].name}</span>` : ''}</button>`;
      }).join('');
      const curIdx = progress().findIndex(x => !x), cur = Math.max(0, curIdx);
      const goLabel = curIdx < 0 ? 'Xem lại: Thinking' : cur === 0 && !started(0) ? 'Bắt đầu: Thinking' : `Làm tiếp: ${STEPS[cur].name}`;
      const team = S.meta.members.map(m => {
        const open = S.tasks.list.filter(t => t.owner === m.id && t.status !== 'done').length;
        const roles = ROLES.filter(r => S.plan.roles[r] === m.id).join(', ') || 'Chưa có vai';
        return `<div>${avatar(m.id)}<span>${esc(m.name)}<br><span class="muted">${esc(roles)}, ${open} task mở</span></span></div>`;
      }).join('');
      if (mobile.matches) {
        const late = S.maintain.schedule.filter(x => x.next <= iso(new Date()));
        return `<div class="stack"><div class="view-head"><div><h2>Tổng quan</h2><p>${esc(S.meta.name)}</p></div></div>
          <div class="ov-cards">${cards}</div>
          <div class="panel">${panelHead('Ai đang làm gì')}<div class="ov-team">${team}</div></div>
          <div class="panel">${panelHead('Việc cần để ý')}${health().reasons.slice(0, 2).map(r => `<p>Sức khỏe ${esc(HNAMES[r.level].toLowerCase())}: ${esc(reasonText(r))}</p>`).join('')}${S.tasks.list.filter(t => t.status === 'review').map(t => `<p>${esc(t.id)} đang chờ review: ${esc(t.title)}</p>`).join('')}${late.map(x => `<p>Bảo trì đến hạn: ${esc(x.title)}</p>`).join('') || ''}${!late.length && !S.tasks.list.some(t => t.status === 'review') && !health().reasons.length ? '<p class="muted">Không có việc gấp.</p>' : ''}</div></div>`;
      }
      return `<div class="ov-title"><h2>${STEPS[cur].name}</h2><p>${STEP_HINT[STEPS[cur].id]}</p>${btn('tab', goLabel, 'primary big', `data-id="${STEPS[cur].id}"`)}</div>
        <div class="ov-team">${team}</div>`;
    },

    product() {
      return `<div class="think">
        <section class="tk-box" id="tkCanvas"></section>
        <section class="tk-box tk-eval" id="tkEval"></section>
        <section class="tk-box tk-chat"><div class="tk-msgs" id="tkMsgs" aria-live="polite"></div>
          <form class="tk-compose" data-form="think"><input aria-label="Tin nhắn" placeholder="Kể ý tưởng của bạn hoặc trả lời câu hỏi của agent" autocomplete="off" maxlength="2000"><button class="btn tone" style="--c:var(--blue)">Gửi</button></form></section>
      </div>`;
    },

    planning() {
      const P = S.plan, T = S.tasks;
      const cost = Object.entries({ teams: 'Số shop trả phí', tickets: 'Câu hỏi mỗi shop/tháng', inTok: 'Token vào mỗi câu', outTok: 'Token ra mỗi câu', priceIn: 'USD / 1 triệu token vào', priceOut: 'USD / 1 triệu token ra', infra: 'Hạ tầng USD/tháng', price: 'Giá mỗi shop USD/tháng' })
        .map(([k, l]) => `<label>${l}<input type="number" min="0" step="any" data-bind="cost" data-id="${k}" value="${+P.cost[k] || 0}"></label>`).join('');
      return head(1, 'Chia vai, chốt việc và kiểm tra bài toán tiền trước khi viết thêm code.') + `<div class="stack">
        <div class="cols"><div class="panel">${panelHead('Tổng quan')}<textarea rows="6" data-bind="overview" aria-label="Tổng quan dự án">${esc(P.overview)}</textarea></div>
        <div class="panel">${panelHead('Phân vai', btn('roles', 'Agent gợi ý chia vai', 'soft small'))}<div class="roles">${ROLES.map(r => `<div class="role">${avatar(P.roles[r])}<span>${r}</span><select aria-label="${r}" data-bind="role" data-id="${r}">${options(P.roles[r])}</select></div>`).join('')}</div></div></div>
        <div class="panel">${panelHead('User story', '<span class="muted">Sửa trực tiếp, xóa trống để bỏ</span>')}<div class="stack" style="gap:8px">${P.stories.map((s, i) => `<textarea rows="2" data-bind="story" data-id="${i}" aria-label="User story ${i + 1}">${esc(s)}</textarea>`).join('')}</div><p style="margin-top:10px">${btn('story', 'Thêm user story', 'soft small')}</p></div>
        <div class="panel">${panelHead('Task', '<span class="muted">Trạng thái tự đổi khi có sự kiện pull request nhắc mã task</span>')}
          <div class="board">${Object.entries(STATUS).map(([key, [label]]) => {
            const list = T.list.filter(t => t.status === key);
            return `<div class="col"><h4><span>${label}</span><span>${list.length}</span></h4>${list.map(t => `<div class="task" data-task="${esc(t.id)}" style="--m:${member(t.owner) ? color(member(t.owner).color) : '#a6afc7'}"><div>${esc(t.id)}: ${esc(t.title)}</div><select data-bind="owner" data-id="${esc(t.id)}" aria-label="Người làm ${esc(t.id)}">${options(t.owner)}</select><select data-bind="status" data-id="${esc(t.id)}" aria-label="Trạng thái ${esc(t.id)}">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${k === key ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}</div>`;
          }).join('')}</div>
          <form class="compose" data-form="task" style="margin-top:10px"><input name="title" placeholder="Tên task mới" aria-label="Tên task mới"><button class="btn soft">Thêm task</button></form></div>
        <div class="cols"><div class="panel">${panelHead('Giả lập pull request')}
          <p class="muted">Bản demo chưa nhận webhook GitHub thật. Gửi sự kiện ở đây để xem quy tắc tự cập nhật.</p>
          <form class="stack" style="gap:8px;margin-top:10px" data-form="pr"><input name="title" aria-label="Tiêu đề pull request" value="T-3: kết nối API đơn hàng" placeholder="Tiêu đề có mã task, ví dụ T-3">
          <div class="row"><select name="event" aria-label="Sự kiện"><option value="draft">Mở PR nháp</option><option value="opened" selected>Mở PR chờ review</option><option value="changes">Yêu cầu sửa</option><option value="merged">Merge</option><option value="closed">Đóng, không merge</option></select><button class="btn tone">Gửi sự kiện</button></div>
          <details><summary class="muted">Hoặc dán payload webhook GitHub</summary><textarea name="json" rows="4" aria-label="Payload webhook" placeholder='{"action":"closed","pull_request":{"title":"T-2: nạp chính sách","merged":true}}'></textarea></details></form></div>
        <div class="panel">${panelHead('Nhật ký tự cập nhật')}<div class="log">${T.log.map(l => `<div>${esc(l)}</div>`).join('') || '<span class="muted">Chưa có sự kiện nào. Gửi thử một pull request.</span>'}</div></div></div>
        <div class="cols"><div class="panel">${panelHead('File nên chuẩn bị cho pitching')}<div class="stack" style="gap:12px">${FILES.map(([id, name, why2, url, from]) => {
          const mine = P.links[id] || '';
          return `<div><div>${name}</div><div class="muted">${why2} ${url ? `<a href="${url}" target="_blank" rel="noopener">${from}</a>` : ''}</div><div class="row" style="margin-top:5px"><input style="flex:1" type="url" data-bind="link" data-id="${id}" value="${esc(mine)}" placeholder="Dán link file của đội (https://...)" aria-label="Link ${name}">${/^https:\/\//.test(mine) ? `<a href="${esc(mine)}" target="_blank" rel="noopener">Mở</a>` : ''}</div></div>`;
        }).join('')}</div></div>
        <div class="panel">${panelHead('Tech stack đề xuất', '<span class="muted">Mẫu cho dự án demo</span>')}<div class="scroll"><table><tbody>${STACK.map(r => `<tr><th>${r[0]}</th><td>${r[1]}<br><span class="muted">${r[2]}</span></td></tr>`).join('')}</tbody></table></div></div></div>
        <div class="panel">${panelHead('Giả định chi phí và cách kiếm tiền', '<span class="muted">Đơn giá là giả định, hãy thay bằng bảng giá thật</span>')}<div class="cost">${cost}</div><div class="kpis" id="kpis">${kpis()}</div>
          <div class="cards" style="margin-top:14px">${MONEY.map(m => `<div class="card"><span>${m[0]}</span><span class="muted">${m[1]}</span></div>`).join('')}</div></div></div>`;
    },

    pitching() {
      const p = S.pitch;
      const form = p.form ? `<form data-form="answer">${p.form.map((q, i) => `<div class="question"><span>${i + 1}. ${esc(q.q)}</span><div>${q.type === 'text' ? `<input style="width:100%" name="${esc(q.id)}" aria-label="${esc(q.q)}">` : (q.type === 'scale' ? [1, 2, 3, 4, 5] : q.options).map(o => `<label><input type="radio" name="${esc(q.id)}" value="${esc(o)}">${esc(o)}</label>`).join('')}</div></div>`).join('')}<button class="btn tone small">Gửi phản hồi</button></form>` : '<p class="muted">Agent soạn câu hỏi từ scorecard để kiểm chứng vấn đề và mức sẵn sàng trả tiền.</p>';
      const deck = p.deck ? `<div class="deck" tabindex="0">${p.deck.map((s, i) => `<section class="slide" style="--s:${STEPS[i % 4].hex}"><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></section>`).join('')}</div>
        <div class="row" style="margin-top:10px">${btn('slide', 'Trang trước', 'soft small', 'data-n="-1"')}${btn('slide', 'Trang sau', 'soft small', 'data-n="1"')}${btn('copy', 'Sao chép HTML', 'soft small', 'data-id="html"')}${downloads ? btn('download', 'Tải file HTML', 'primary small') : ''}</div>` : '<p class="muted">Tạo bộ slide từ scorecard và phản hồi đã thu.</p>';
      const textPanel = (key, title, act, empty) => `<div class="panel">${panelHead(title, btn(act, p[key] ? 'Tạo lại' : 'Tạo', 'tone small'))}${p[key] ? `<div class="prose">${esc(p[key])}</div><p style="margin-top:10px">${btn('copy', 'Sao chép', 'soft small', `data-id="${key}"`)}</p>` : `<p class="muted">${empty}</p>`}</div>`;
      return head(2, 'Thu bằng chứng trước, kể chuyện sau. Dashboard tự dựng từ câu trả lời.') + `<div class="stack">
        <div class="cols"><div class="panel">${panelHead('Form khảo sát', btn('form', p.form ? 'Tạo lại form' : 'Tự tạo form', 'tone small'))}${form}</div>
        <div class="panel">${panelHead('Dashboard', p.form ? btn('seed', 'Thêm 8 phản hồi mẫu', 'soft small') : '')}${dashboard()}</div></div>
        <div class="panel">${panelHead('AI overview từ form', p.responses.length ? btn('summary', p.overview ? 'Phân tích lại' : 'Phân tích phản hồi', 'tone small') : '')}${p.overview ? `<div class="prose">${esc(p.overview)}</div>` : `<p class="muted">${p.responses.length ? 'Bấm phân tích để agent tóm tắt tín hiệu và việc nên làm tiếp.' : 'Cần ít nhất một phản hồi.'}</p>`}</div>
        <div class="panel">${panelHead('Pitching HTML', btn('deck', p.deck ? 'Tạo lại slide' : 'Tạo slide', 'tone small'))}${deck}</div>
        <div class="cols">${textPanel('script', 'Pitching script', 'script', 'Kịch bản nói khoảng 3 phút, chia mốc thời gian.')}${textPanel('ads', 'Bài quảng cáo', 'ads', 'Ba bài cho ba kênh, giọng khác nhau.')}</div></div>`;
    },

    quality() {
      const q = S.quality, runs = sortedRuns(), src = S.score.metric.text.trim(), m = money();
      const stale = q.metrics.length && q.source !== S.score.metric.text, editing = q.runs.find(r => r.id === runEdit);
      const xs = runs.map(r => shortDate(r.at));
      const series = [{ id: 'pass', name: 'Tỉ lệ test pass (%)', color: PALETTE[0], values: runs.map(r => (rate(r) === null ? null : +(rate(r) * 100).toFixed(1))) },
        ...q.metrics.map((k, i) => ({ id: k.id, name: `${k.name}${k.unit ? ' (' + k.unit + ')' : ''}`, color: PALETTE[1 + (i % 6)], values: runs.map(r => num(r.values[k.id])), target: num(k.target) }))];
      if (!series.some(s => s.id === qline)) qline = 'all';
      const shown = qline === 'all' ? series : series.filter(s => s.id === qline);
      const units = new Set(['%', ...q.metrics.map(k => k.unit)]);
      const samples = q.runs.filter(r => r.sample).length;
      const val = (r, k) => (editing ? r[k] ?? '' : '');
      const field = (name, label, value, attrs = 'type="number" min="0" step="any"') => `<label>${label}<input name="${name}" ${attrs} value="${esc(value)}"></label>`;
      const c = S.plan.cost, unit = { priceIn: +c.priceIn || 0, priceOut: +c.priceOut || 0 }, priced = unit.priceIn || unit.priceOut;
      const costIn = Object.entries({ priceIn: 'USD / 1 triệu token vào', priceOut: 'USD / 1 triệu token ra', tickets: 'Câu hỏi mỗi shop/tháng', price: 'Giá mỗi shop USD/tháng', infra: 'Hạ tầng USD/tháng', teams: 'Số shop trả phí' })
        .map(([k, l]) => `<label>${l}<input type="number" min="0" step="any" data-bind="cost" data-id="${k}" value="${+c[k] || 0}"></label>`).join('');
      return head(3, 'Mỗi lần đổi model hay prompt là một lần chạy thử. Ghi lại để thấy chất lượng, token và chi phí đi về đâu.') + `<div class="stack">
        <div class="cols"><div class="panel">${panelHead('Chỉ số cần đạt', btn('metrics', q.metrics.length ? 'Agent lấy lại chỉ số' : 'Agent lấy chỉ số', 'tone small'))}
          <p class="muted">Agent đọc mục Metric trong scorecard và tách thành từng chỉ số. Mỗi lần chạy thử, đội nhập con số đo được để so với mục tiêu ở đây.</p>
          <div class="prose" style="margin:8px 0">${src ? esc(src) : 'Mục Metric đang trống. Điền ở tab Thinking trước.'}</div>
          ${stale ? `<p class="note-warn">Scorecard đã đổi sau lần lấy chỉ số gần nhất. Bấm lấy lại để cập nhật.</p>` : ''}
          <div class="stack" style="gap:10px;margin-top:10px">${q.metrics.map(k => { const b = f => `data-bind="qmetric" data-id="${esc(k.id)}" data-field="${f}"`; const extra = num(k.baseline) !== null || String(k.method || '').trim(); return `<div class="metric">
            <div class="metric-top"><input class="metric-name" ${b('name')} value="${esc(k.name)}" aria-label="Tên chỉ số">${btn('delmetric', 'Bỏ', 'soft small', `data-id="${esc(k.id)}"`)}</div>
            <div class="goal"><span>Đạt khi</span><select ${b('direction')} aria-label="Ít nhất hay tối đa"><option value="up" ${k.direction !== 'down' ? 'selected' : ''}>ít nhất</option><option value="down" ${k.direction === 'down' ? 'selected' : ''}>tối đa</option></select>
              <input class="goal-num" type="number" step="any" ${b('target')} value="${esc(k.target)}" aria-label="Mục tiêu"><input class="goal-unit" ${b('unit')} value="${esc(k.unit)}" placeholder="đơn vị" aria-label="Đơn vị"></div>
            <details><summary class="muted">Thêm thông tin (${extra ? 'đã điền' : 'không bắt buộc'})</summary><div class="stack" style="gap:8px;margin-top:8px">
              <label class="field">Con số trước khi có AI<input type="number" step="any" ${b('baseline')} value="${num(k.baseline) === null ? '' : +k.baseline}" placeholder="Ví dụ 12. Để trống nếu chưa đo"></label>
              <label class="field">Đo bằng cách nào<input ${b('method')} value="${esc(k.method || '')}" placeholder="Ví dụ: đếm trong log chat mỗi tuần"></label></div></details></div>`; }).join('') || '<p class="muted">Chưa có chỉ số nào.</p>'}</div>
          ${(() => { const tips = checkMetrics(); return tips.length ? `<div class="tips"><h4>Gợi ý cho bộ chỉ số</h4><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''; })()}
          <p style="margin-top:10px">${btn('addmetric', 'Thêm chỉ số', 'soft small')}</p></div>
        <div class="panel">${panelHead(editing ? 'Sửa lần chạy thử' : 'Khai lần chạy thử', samples ? `<span class="muted">${samples} lần chạy là dữ liệu mẫu</span>` : '')}
          <form class="stack" style="gap:10px" data-form="run"><div class="cost">
            ${field('at', 'Thời điểm', editing ? editing.at : nowLocal(), 'type="datetime-local" required')}
            ${field('model', 'Model hoặc phiên bản', val(editing || {}, 'model'), 'required maxlength="80" placeholder="Ví dụ: Model A, prompt v4"')}
            ${q.metrics.map(k => field('m_' + k.id, `${esc(k.name)}${k.unit ? ' (' + esc(k.unit) + ')' : ''}`, editing ? editing.values[k.id] ?? '' : '', 'type="number" step="any"')).join('')}
            ${field('passed', 'Số test pass', val(editing || {}, 'passed'), 'type="number" min="0" step="1"')}
            ${field('total', 'Tổng số test', val(editing || {}, 'total'), 'type="number" min="0" step="1"')}
            ${field('inTok', 'Token vào (cả lần chạy)', val(editing || {}, 'inTok'))}
            ${field('outTok', 'Token ra (cả lần chạy)', val(editing || {}, 'outTok'))}
          </div><textarea name="note" rows="2" maxlength="300" placeholder="Ghi chú: lần này đổi gì so với lần trước" aria-label="Ghi chú">${esc(editing ? editing.note : '')}</textarea>
          <div class="row"><button class="btn tone small">${editing ? 'Lưu thay đổi' : 'Thêm lần chạy'}</button>${editing ? btn('cancelrun', 'Hủy sửa', 'soft small') : ''}</div></form></div></div>
        <div class="panel">${panelHead('Chất lượng model theo thời gian', `<div class="seg" role="group" aria-label="Đường hiển thị">${[{ id: 'all', name: 'Tất cả' }, ...series].map(s => `<button data-act="qline" data-id="${esc(s.id)}" class="${s.id === qline ? 'on' : ''}">${esc(s.id === 'all' ? 'Tất cả' : s.name.replace(/ \(.*\)$/, ''))}</button>`).join('')}</div>`)}
          ${qline === 'all' && units.size > 1 ? '<p class="note-warn" style="margin-bottom:8px">Các metric khác đơn vị đang chung một trục. Chọn từng đường để xem đúng tỉ lệ.</p>' : ''}
          ${lineChart(xs, shown, 'Biểu đồ chất lượng model theo lần chạy')}${samples ? '<p class="muted" style="margin-top:6px">Có dữ liệu mẫu trong biểu đồ. Xóa mẫu trước khi dùng số này để kết luận.</p>' : ''}</div>
        <div class="cols"><div class="panel">${panelHead('Token mỗi lần chạy')}${lineChart(xs, [{ name: 'Token vào', color: 'var(--blue)', values: runs.map(r => num(r.inTok)) }, { name: 'Token ra', color: 'var(--orange)', values: runs.map(r => num(r.outTok)) }], 'Biểu đồ token theo lần chạy')}</div>
        <div class="panel">${panelHead('Chi phí mỗi lần chạy', '<span class="muted">Token nhân đơn giá do đội nhập</span>')}${priced ? lineChart(xs, [{ name: 'Chi phí (USD)', color: 'var(--violet)', values: runs.map(r => +runCost(r, unit).toFixed(4)) }], 'Biểu đồ chi phí theo lần chạy') : '<p class="muted">Cần đơn giá token ở phần chi phí bên dưới.</p>'}</div></div>
        <div class="panel">${panelHead('Các lần chạy thử', samples ? btn('clearsample', 'Xóa dữ liệu mẫu', 'soft small') : '')}<div class="scroll"><table><thead><tr><th>Thời điểm</th><th>Model</th>${q.metrics.map(k => `<th>${esc(k.name)}</th>`).join('')}<th>Pass</th><th>Token vào / ra</th><th>Chi phí</th><th>Ghi chú</th><th></th></tr></thead><tbody>
          ${runs.slice().reverse().map(r => `<tr data-row="${esc(r.id)}"><td>${esc(shortDate(r.at))}${r.sample ? ' <span class="tag" style="--c:var(--yellow)">Mẫu</span>' : ''}</td><td>${esc(r.model)}</td>
            ${q.metrics.map(k => { const v = num(r.values[k.id]); return `<td>${v === null ? '<span class="muted">Chưa khai</span>' : `${+v.toFixed(2)}${esc(k.unit)}${meets(k, v) ? '' : ' <span class="tag" style="--c:var(--orange)">Chưa đạt</span>'}`}</td>`; }).join('')}
            <td>${rate(r) === null ? '<span class="muted">Chưa khai</span>' : `${+r.passed}/${+r.total}<br><span class="muted">${pct(rate(r))}</span>`}</td>
            <td>${(+r.inTok || 0).toLocaleString('vi-VN')} / ${(+r.outTok || 0).toLocaleString('vi-VN')}</td><td>${priced ? usd(runCost(r, unit)) : '<span class="muted">Cần đơn giá</span>'}</td>
            <td><span class="muted">${esc(r.note)}</span></td><td><div class="row" style="gap:6px;flex-wrap:nowrap">${btn('editrun', 'Sửa', 'soft small', `data-id="${esc(r.id)}"`)}${btn('delrun', 'Xóa', 'soft small', `data-id="${esc(r.id)}"`)}</div></td></tr>`).join('') || `<tr><td colspan="${7 + q.metrics.length}" class="muted">Chưa có lần chạy nào.</td></tr>`}</tbody></table></div></div>
        <div class="panel">${panelHead('Chi phí và gợi ý lợi nhuận', '<span class="muted">Đơn giá và giá bán dùng chung với Planning, đều là giả định của đội</span>')}<div class="cost">${costIn}</div>
          <div class="kpis">${(m ? [['Chi phí lần chạy gần nhất', usd(m.lastRun)], ['Chi phí mỗi lượt gọi', usd(m.perCase)], ['Chi phí AI mỗi shop/tháng', usd(m.perUser)], ['Biên lãi gộp (chỉ chi phí AI)', m.margin === null ? 'Cần giá bán' : pct(m.margin)], ['Giá hòa vốn mỗi shop', usd(m.breakEven)], [`Giá để đạt biên ${pct(PROFIT.targetMargin)}`, usd(m.targetPrice)]] : [['Chi phí', 'Cần đơn giá và lần chạy có token']]).map(k => `<div class="kpi"><b>${k[1]}</b><span>${k[0]}</span></div>`).join('')}</div>
          <div class="stack" style="gap:6px;margin-top:14px">${profitTips(m).map(t => `<p>${esc(t)}</p>`).join('')}</div>
          <details style="margin-top:12px"><summary class="muted">Giả định trong phép tính</summary><ul class="muted">
            <li>Một ca test ứng với một lượt gọi thật của người dùng. Chi phí mỗi lượt gọi là trung bình của 3 lần chạy gần nhất có token.</li>
            <li>Chi phí AI mỗi shop bằng chi phí mỗi lượt gọi nhân số câu hỏi mỗi shop mỗi tháng.</li>
            <li>Biên lãi chỉ trừ chi phí AI. Giá hòa vốn cộng thêm hạ tầng chia đều cho số shop trả phí.</li>
            <li>Biên mục tiêu ${pct(PROFIT.targetMargin)} đặt trong file tang/health.js.</li></ul></details></div></div>`;
    },

    maintaining() {
      const m = S.maintain, today = iso(new Date()), h = health(), suggest = m.suggest || [];
      const rules = Object.values(RULES).map(r => `<tr><td>${esc(r.label)}</td>${LEVELS.slice(1).map(l => `<td>${r.dir === 'below' ? 'Dưới' : 'Từ'} ${fmtRule(r.fmt, r[l])}</td>`).join('')}</tr>`).join('');
      return head(4, 'Sản phẩm AI cần được canh chừng. Việc đến hạn nằm trên cùng, mô hình 3D báo khi sản phẩm xuống cấp.') + `<div class="stack">
        <div class="panel">${panelHead('Sức khỏe sản phẩm', `<span class="tag" style="--c:${HCOLOR[h.level]}">${HNAMES[h.level]}</span>`)}
          <p class="muted">Tính từ số liệu ở Quality và lịch bảo trì. Mô hình 3D đổi theo trạng thái này: xuống cấp thì nghiêng và nứt, cần cứu hộ thì xe cứu thương tới, sập thì các tầng trên đổ xuống.</p>
          <div style="margin-top:8px">${h.reasons.map(r => `<div class="reason"><span class="tag" style="--c:${HCOLOR[r.level]}">${HNAMES[r.level]}</span><span>${esc(reasonText(r))}</span></div>`).join('') || '<div class="reason"><span class="muted">Chưa chạm ngưỡng nào.</span></div>'}</div>
          ${h.missing.length ? `<p class="muted" style="margin-top:8px">Chưa đủ dữ liệu cho: ${h.missing.map(k => esc(RULES[k].label.toLowerCase())).join('; ')}.</p>` : ''}
          <div class="row" style="margin-top:12px"><span class="muted">Xem thử mô hình 3D</span><div class="seg" role="group" aria-label="Xem thử trạng thái">${[['real', 'Theo số liệu'], ...LEVELS.map(l => [l, HNAMES[l]])].map(([id, n]) => `<button data-act="preview" data-id="${id}" class="${(preview || 'real') === id ? 'on' : ''}">${n}</button>`).join('')}</div></div>
          <details style="margin-top:12px"><summary class="muted">Bảng ngưỡng (sửa trong file tang/health.js)</summary><div class="scroll"><table><thead><tr><th>Luật</th>${LEVELS.slice(1).map(l => `<th>${HNAMES[l]}</th>`).join('')}</tr></thead><tbody>${rules}</tbody></table></div></details></div>
        <div class="panel">${panelHead('Gợi ý cập nhật công nghệ', btn('tech', 'Agent gợi ý mới', 'tone small'))}<p class="muted" style="margin-bottom:10px">Gợi ý dựa trên xu hướng metric và chi phí ở Quality. Tên phiên bản thư viện hoặc model cụ thể cần đội kiểm tra lại trước khi làm.</p><div class="cards">${m.tech.map((t, i) => `<div class="card"><span class="tag" style="--c:var(--${['red', 'orange', 'blue'].includes(t.color) ? t.color : 'blue'})">Ưu tiên ${esc(t.level)}</span><span>${esc(t.title)}</span><span class="muted">${esc(t.why)}</span>${t.added ? '<span class="muted">Đã có trong lịch</span>' : btn('schedule', 'Thêm vào lịch', 'soft small', `data-n="${i}"`)}</div>`).join('')}</div></div>
        <div class="panel">${panelHead('Gợi ý lịch bảo trì', btn('cadence', 'Agent gợi ý lịch', 'soft small'))}${suggest.length ? `<div class="cards">${suggest.map((x, i) => `<div class="card"><span class="tag">Mỗi ${+x.every} ngày</span><span>${esc(x.title)}</span><span class="muted">${esc(x.why)}</span>${btn('addsuggest', 'Thêm vào lịch', 'soft small', `data-n="${i}"`)}</div>`).join('')}</div>` : '<p class="muted">Agent đề xuất chu kỳ kiểm tra dựa trên chất lượng, chi phí và việc đang trễ. Đội duyệt từng việc trước khi đưa vào lịch.</p>'}</div>
        <div class="panel">${panelHead('Lịch bảo trì')}<div class="scroll"><table><thead><tr><th>Việc</th><th>Chu kỳ</th><th>Hạn tới</th><th>Người làm</th><th></th></tr></thead><tbody>${m.schedule.slice().sort((a, b) => a.next.localeCompare(b.next)).map(x => `<tr data-row="${esc(x.id)}"><td>${esc(x.title)}<br><span class="muted">Đã làm ${+x.runs || 0} lần</span></td><td>${+x.every} ngày</td><td><span class="tag" style="--c:var(${x.next <= today ? '--red' : '--violet'})">${x.next <= today ? 'Đến hạn ' : ''}${esc(x.next.split('-').reverse().join('/'))}</span></td><td><select data-bind="mowner" data-id="${esc(x.id)}" aria-label="Người làm">${options(x.owner)}</select></td><td>${btn('ran', 'Đã làm', 'tone small', `data-id="${esc(x.id)}"`)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    }
  };

  function kpis() {
    const c = Object.fromEntries(Object.entries(S.plan.cost).map(([k, v]) => [k, +v || 0]));
    const perShop = c.tickets * (c.inTok * c.priceIn + c.outTok * c.priceOut) / 1e6;
    const ai = perShop * c.teams, cost = ai + c.infra, rev = c.teams * c.price, margin = c.price - perShop;
    const n = x => Math.round(x).toLocaleString('vi-VN') + ' USD';
    return [['Chi phí AI/tháng', n(ai)], ['Tổng chi/tháng', n(cost)], ['Doanh thu/tháng', n(rev)], ['Lãi gộp/tháng', n(rev - cost)],
      ['Hòa vốn hạ tầng', margin > 0 ? Math.ceil(c.infra / margin) + ' shop' : 'Không đạt']].map(k => `<div class="kpi"><b>${k[1]}</b><span>${k[0]}</span></div>`).join('');
  }
  function stats() {
    const p = S.pitch;
    return (p.form || []).map(q => {
      const a = p.responses.map(r => r.answers[q.id]).filter(v => v !== undefined && v !== '');
      if (q.type === 'text') return { q: q.q, type: q.type, texts: a };
      const opts = q.type === 'scale' ? ['1', '2', '3', '4', '5'] : q.options;
      return { q: q.q, type: q.type, n: a.length, avg: q.type === 'scale' && a.length ? a.reduce((x, y) => x + +y, 0) / a.length : null, counts: opts.map(o => [o, a.filter(v => String(v) === String(o)).length]) };
    });
  }
  function dashboard() {
    const p = S.pitch;
    if (!p.form) return '<p class="muted">Tạo form để dashboard tự xuất hiện.</p>';
    if (!p.responses.length) return '<p class="muted">Chưa có phản hồi. Điền thử form hoặc thêm phản hồi mẫu.</p>';
    const samples = p.responses.filter(r => r.sample).length;
    return `<div class="kpis" style="margin:0"><div class="kpi" style="--c:var(--orange)"><b>${p.responses.length}</b><span>Phản hồi, trong đó ${samples} là mẫu</span></div></div>` + stats().map(s => `<div class="question"><span>${esc(s.q)}${s.avg !== null && s.avg !== undefined ? ` <span class="tag" style="--c:var(--orange)">TB ${s.avg.toFixed(1)}</span>` : ''}</span>${s.type === 'text' ? s.texts.slice(-4).map(t => `<div class="muted">"${esc(t)}"</div>`).join('') || '<span class="muted">Chưa có câu trả lời chữ.</span>' : `<div>${s.counts.map(([o, n]) => `<div class="hbar"><span>${esc(o)}</span><div class="bar" style="--c:var(--orange)"><span class="grow" style="width:${s.n ? n / s.n * 100 : 0}%"></span></div><span>${n}</span></div>`).join('')}</div>`}</div>`).join('');
  }
  function deckHTML() {
    const slides = (S.pitch.deck || []).map((s, i) => `<section style="--s:${STEPS[i % 4].hex}"><h1>${esc(s.title)}</h1><p>${esc(s.body)}</p></section>`).join('\n');
    return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(S.meta.name)}</title><style>*{box-sizing:border-box;font-style:normal}body{margin:0;font-family:"Be Vietnam Pro",Arial,sans-serif;color:#121a33;background:#fff;scroll-snap-type:y mandatory;overflow-y:auto;height:100vh}section{height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:center;padding:8vw;border-bottom:6px solid var(--s)}h1{font-weight:500;font-size:clamp(30px,5vw,64px);margin:0 0 24px}p{font-size:clamp(17px,2vw,28px);font-weight:300;line-height:1.6;max-width:30em;white-space:pre-wrap}</style></head><body>\n${slides}\n</body></html>`;
  }

  /* ---------- Hành động của agent ---------- */
  const score = k => S.score[k].text.trim();
  const jobs = {
    async fill() {
      const out = await generate('Đọc cuộc trò chuyện và điền AI MVP Scorecard. Mỗi mục có "text" (tối đa 45 từ) và "score" từ 1 đến 5 (0 nếu chưa có thông tin). Giữ ý đội đã ghi nếu vẫn đúng. Mục prior nói đã ai làm chưa và mình cải thiện được gì.',
        '{"persona":{"text":"","score":0},"problem":{},"leverage":{},"scope":{},"metric":{},"feasibility":{},"prior":{}}',
        o => o && SCORE.every(([k]) => o[k] && typeof o[k].text === 'string'),
        () => Object.fromEntries(SCORE.map(([k]) => [k, score(k) ? S.score[k] : { text: SAMPLE_SCORE[k][0], score: SAMPLE_SCORE[k][1] }])));
      SCORE.forEach(([k]) => { S.score[k] = { text: String(out[k].text), score: Math.max(0, Math.min(5, Math.round(+out[k].score || 0))) }; });
      S.chat.push({ who: 'agent', text: 'Mình đã điền scorecard. Cả đội rà lại mục Feasibility và mục đã ai làm chưa, vì hai mục này cần bằng chứng bên ngoài cuộc trò chuyện.' });
      renderChat();
      save('score', 'chat');
      return ['score', () => rise($$('#view .score'))];
    },
    async roles() {
      const ids = S.meta.members.map(m => m.id);
      const out = await generate(`Chia vai cho các thành viên. id hợp lệ: ${ids.join(', ')}. Dựa vào điều họ đã nói trong chat.`, JSON.stringify(Object.fromEntries(ROLES.map(r => [r, 'id']))),
        o => o && ROLES.every(r => ids.includes(o[r])), () => ({ 'Product owner': 'minh', 'AI engineer': 'huy', 'Full-stack': 'lan', 'UX và pitching': 'thao' }));
      S.plan.roles = Object.fromEntries(ROLES.map(r => [r, ids.includes(out[r]) ? out[r] : '']));
      save('plan');
      return ['plan', () => anim($$('#view .role .av'), { scale: [0, 1], rotate: [-90, 0] }, { type: 'spring', delay: canAnim ? M.stagger(0.08) : 0 })];
    },
    async form() {
      const out = await generate('Soạn 5 câu hỏi khảo sát người dùng để kiểm chứng vấn đề, giải pháp và mức sẵn sàng trả tiền. Gồm 2 câu type "scale" (chấm 1 đến 5), 2 câu "choice" (có 3 đến 4 options), 1 câu "text".',
        '{"questions":[{"type":"scale","q":""},{"type":"choice","q":"","options":["",""]},{"type":"text","q":""}]}',
        o => o && Array.isArray(o.questions) && o.questions.length >= 3 && o.questions.every(q => str(q.q) && (q.type === 'text' || q.type === 'scale' || (q.type === 'choice' && Array.isArray(q.options) && q.options.length > 1))),
        () => ({ questions: [
          { type: 'scale', q: 'Việc trả lời câu hỏi lặp lại làm bạn mệt tới mức nào? (1 ít, 5 rất nhiều)' },
          { type: 'choice', q: 'Loại câu hỏi nào bạn gặp nhiều nhất?', options: ['Trạng thái đơn', 'Đổi trả', 'Chọn size', 'Khác'] },
          { type: 'scale', q: 'Bạn tin một bản nháp do AI soạn tới mức nào nếu được duyệt trước? (1 đến 5)' },
          { type: 'choice', q: 'Mức giá hằng tháng bạn thấy hợp lý?', options: ['Dưới 20 USD', '20 đến 40 USD', 'Trên 40 USD'] },
          { type: 'text', q: 'Điều gì khiến bạn không muốn dùng công cụ này?' }] }));
      S.pitch.form = out.questions.slice(0, 7).map((q, i) => ({ id: 'q' + i, type: q.type, q: String(q.q), options: q.type === 'choice' ? q.options.map(String).slice(0, 5) : [] }));
      S.pitch.responses = []; S.pitch.overview = '';
      save('pitch');
      return ['pitch', () => rise($$('#view .question'))];
    },
    async summary() {
      const out = await generate(`Phân tích kết quả khảo sát: ${JSON.stringify(stats())}. Có ${S.pitch.responses.filter(r => r.sample).length}/${S.pitch.responses.length} phản hồi là dữ liệu mẫu, phải nói rõ. Nêu tín hiệu chính, điều chưa kết luận được và 3 việc nên làm.`,
        '{"overview":"văn bản thuần, có xuống dòng"}', o => o && str(o.overview), () => {
          const lines = stats().map(s => {
            if (s.type === 'text') return s.texts.length ? `Rào cản được nhắc: ${[...new Set(s.texts)].slice(0, 3).join('; ')}.` : '';
            const top = s.counts.slice().sort((a, b) => b[1] - a[1])[0];
            return s.type === 'scale' ? `${s.q} Trung bình ${(s.avg || 0).toFixed(1)}/5.` : `${s.q} Nhiều nhất: ${top[0]} (${top[1]}/${s.n}).`;
          }).filter(Boolean);
          const n = S.pitch.responses.filter(r => r.sample).length;
          return { overview: `Bản tóm tắt tự tính từ số liệu. ${n}/${S.pitch.responses.length} phản hồi là mẫu nên chưa dùng để kết luận.\n\n${lines.join('\n')}\n\nNên làm tiếp:\n1. Thu thêm phản hồi từ người dùng thật.\n2. Phỏng vấn sâu 3 người nêu rào cản.\n3. Thử bản nháp trên một loại câu hỏi phổ biến nhất.` };
        });
      S.pitch.overview = out.overview;
      save('pitch');
      return ['pitch', () => rise($$('#view .prose'))];
    },
    async deck() {
      const out = await generate(`Viết 6 slide pitching (tiêu đề ngắn, nội dung tối đa 40 từ). Kết quả khảo sát: ${JSON.stringify(stats())}. Dữ liệu mẫu không được trình bày như bằng chứng thật.`,
        '{"slides":[{"title":"","body":""}]}', o => o && Array.isArray(o.slides) && o.slides.length > 2 && o.slides.every(s => str(s.title) && str(s.body)),
        () => ({ slides: [
          { title: S.meta.name, body: S.plan.overview },
          { title: 'Ai đang đau', body: `${score('persona')}\n${score('problem')}` },
          { title: 'AI giúp ở đâu', body: score('leverage') || 'Cần bổ sung trong scorecard.' },
          { title: 'MVP 4 tuần', body: score('scope') || 'Cần bổ sung trong scorecard.' },
          { title: 'Đo thành công', body: score('metric') || 'Cần bổ sung trong scorecard.' },
          { title: 'Mô hình thu', body: `Thuê bao ${S.plan.cost.price} USD mỗi shop mỗi tháng (giả định). Bước tiếp theo: tìm 5 shop dùng thử.` }] }));
      S.pitch.deck = out.slides.slice(0, 10).map(s => ({ title: String(s.title), body: String(s.body) }));
      save('pitch');
      return ['pitch', () => anim($('#view .deck'), { opacity: [0, 1], scale: [0.94, 1] }, { duration: 0.6, ease: EASE })];
    },
    async script() {
      const out = await generate('Viết kịch bản pitching nói trong 3 phút, chia mốc thời gian, mở đầu bằng một tình huống của người dùng. Không bịa số liệu.', '{"script":"văn bản thuần, có xuống dòng"}', o => o && str(o.script),
        () => ({ script: `0:00 Mở đầu\n"Tám giờ tối, một nhân viên shop vẫn đang trả lời câu hỏi đơn hàng của em tới đâu rồi."\n\n0:30 Vấn đề\n${score('problem') || '(Điền mục Problem trong scorecard)'}\n\n1:00 Giải pháp và demo\n${score('leverage') || '(Điền mục AI leverage)'} Cho xem: nhận câu hỏi, xem nháp, duyệt, gửi.\n\n2:00 Bằng chứng và cách đo\n${score('metric') || '(Điền mục Metric)'}\n\n2:30 Lời mời\n"Chúng tôi đang tìm 5 shop dùng thử trong 4 tuần."` }));
      S.pitch.script = out.script; save('pitch');
      return ['pitch', () => rise($$('#view .prose'))];
    },
    async ads() {
      const out = await generate('Viết 3 bài quảng cáo ngắn cho Facebook, LinkedIn và tin nhắn Zalo. Không hứa số liệu chưa kiểm chứng, không dựng lời khen của khách.', '{"ads":"văn bản thuần, có xuống dòng"}', o => o && str(o.ads),
        () => ({ ads: `Facebook\nKhách hỏi "đơn em đâu rồi" lúc nửa đêm? ${S.meta.name} soạn sẵn câu trả lời, bạn chỉ cần duyệt và gửi. Đăng ký dùng thử.\n\nLinkedIn\nChúng tôi đang xây trợ lý CSKH cho shop nhỏ: AI soạn nháp, con người quyết định. Tìm 5 đội muốn thử nghiệm cùng.\n\nZalo\nChào anh chị, bên em đang thử công cụ giúp trả lời tin nhắn khách nhanh hơn. Anh chị dành 15 phút xem demo được không ạ?` }));
      S.pitch.ads = out.ads; save('pitch');
      return ['pitch', () => rise($$('#view .prose'))];
    },
    async tech() {
      const h = health();
      const out = await generate('Gợi ý 3 việc cập nhật công nghệ cho sản phẩm này, không lặp các gợi ý: ' + S.maintain.tech.map(t => t.title).join('; ') + `. Tình trạng hiện tại (tính bằng code): ${HNAMES[h.level]}; ${h.reasons.map(reasonText).join('; ') || 'chưa chạm ngưỡng nào'}. Ưu tiên việc xử lý đúng các vấn đề này. level là "Cao" hoặc "Vừa". Không nêu phiên bản cụ thể nếu chưa chắc; nếu có nêu tên phiên bản thư viện hoặc model, thêm "(cần kiểm tra lại)" vào cuối why.`,
        '{"items":[{"title":"","why":"","level":"Vừa"}]}', o => o && Array.isArray(o.items) && o.items.length && o.items.every(t => str(t.title) && str(t.why)),
        ruleTech);
      const have = new Set(S.maintain.tech.map(t => t.title));
      const fresh = out.items.filter(t => !have.has(t.title)).slice(0, 3).map(t => ({ title: String(t.title), why: String(t.why), level: t.level === 'Cao' ? 'Cao' : 'Vừa', color: t.level === 'Cao' ? 'red' : 'orange' }));
      if (!fresh.length) toast('Chưa có gợi ý mới.');
      S.maintain.tech = [...fresh, ...S.maintain.tech].slice(0, 9); save('maintain');
      return ['maintain', () => rise($$('#view .card'))];
    },
    async cadence() {
      const have = S.maintain.schedule.map(x => x.title);
      const out = await generate(`Gợi ý tối đa 4 việc bảo trì định kỳ cho sản phẩm, dựa trên tình trạng chất lượng và chi phí trong dữ liệu dự án. Không lặp các việc đã có: ${have.join('; ')}. every là số ngày giữa hai lần làm, từ 1 đến 180. why nói rõ dựa trên số liệu nào.`,
        '{"items":[{"title":"","every":7,"why":""}]}', o => o && Array.isArray(o.items) && o.items.length && o.items.every(t => str(t.title) && str(t.why) && +t.every >= 1),
        ruleCadence);
      const fresh = out.items.filter(t => !have.includes(t.title)).slice(0, 5).map(t => ({ title: String(t.title).slice(0, 120), every: Math.max(1, Math.min(180, Math.round(+t.every))), why: String(t.why).slice(0, 240) }));
      if (!fresh.length) toast('Lịch hiện tại đã bao gồm các gợi ý.');
      S.maintain.suggest = fresh; save('maintain');
      return ['maintain', () => rise($$('#view .card'))];
    },
    async metrics() {
      const src = S.score.metric.text.trim();
      if (!src) { toast('Mục Metric trong scorecard đang trống. Điền ở Thinking trước.'); return ['quality', () => {}]; }
      const card = ['problem', 'leverage', 'scope', 'feasibility'].map(k => `${k}: ${S.score[k].text}`).join('\n');
      const out = await generate(`Đóng vai người thẩm định Thinking. Tách mục Metric của scorecard thành danh sách chỉ số đo được, đối chiếu với các mục còn lại.
Mục Metric: "${src}"
Các mục khác của scorecard:
${card}
Với mỗi chỉ số trả về: name (tối đa 8 từ; nếu văn bản nói giảm hoặc tăng X% thì đặt tên "Mức giảm …" hoặc "Mức tăng …" và target là X); baseline là hiện trạng (số, hoặc null nếu văn bản không nêu, tuyệt đối không tự đoán); target (số có trong văn bản, không tự đặt mục tiêu mới); unit; direction "up" nếu càng cao càng tốt, "down" nếu càng thấp càng tốt; kind là "value" (giá trị thật cho người dùng, hành vi lặp lại hoặc kết quả công việc), "ai" (chất lượng câu trả lời của AI: đúng sai, precision, recall, tỉ lệ được dùng mà không sửa) hoặc "feasibility" (độ trễ, chi phí); method là cách đo nếu văn bản có nêu, không có thì để chuỗi rỗng; rule là tiêu chí thành công viết thành một câu "Nếu ... thì ...".
nature là bản chất problem: "behavior" nếu là problem hành vi (duy trì, động lực, quay lại), "productivity" nếu là problem năng suất (thủ công, mất thời gian), "other" nếu chưa rõ.`,
        '{"nature":"productivity","metrics":[{"name":"","baseline":null,"target":0,"unit":"%","direction":"up","kind":"value","method":"","rule":"Nếu ... thì ..."}]}',
        o => o && Array.isArray(o.metrics) && o.metrics.length && o.metrics.every(k => str(k.name) && isFinite(+k.target)),
        () => ({ metrics: parseMetrics(src), nature: natureOf(S.score.problem.text), rule: true }));
      if (!out.metrics.length) { toast('Chưa tách được số mục tiêu từ văn bản. Thêm chỉ số tay hoặc ghi rõ con số trong scorecard.'); return ['quality', () => {}]; }
      const old = S.quality.metrics, used = new Set();
      const next = out.metrics.slice(0, 6).map((k, i) => {
        const name = String(k.name).slice(0, 60);
        const named = old.find(o => !used.has(o.id) && o.name.toLowerCase() === name.toLowerCase());
        const same = named || (old[i] && !used.has(old[i].id) && old[i].from !== 'tay' ? old[i] : null);
        const id = same ? same.id : 'k' + Date.now().toString(36) + i;
        used.add(id);
        const x = { id, name, baseline: num(k.baseline), target: +k.target, unit: String(k.unit || '').slice(0, 12), direction: k.direction === 'down' ? 'down' : 'up', kind: KIND[k.kind] ? k.kind : kindOf(name), method: String(k.method || (named && named.method) || '').slice(0, 160), from: out.rule ? 'tu' : 'agent' };
        if (x.baseline === null && named && num(named.baseline) !== null) x.baseline = named.baseline;
        x.rule = str(k.rule) && /^nếu/i.test(String(k.rule).trim()) ? String(k.rule).slice(0, 200) : ruleOf(x);
        return x;
      });
      S.quality.metrics = [...next, ...old.filter(o => o.from === 'tay' && !used.has(o.id))];
      S.quality.source = S.score.metric.text;
      S.quality.nature = NATURE[out.nature] ? out.nature : natureOf(S.score.problem.text);
      save('quality');
      toast(`Đã lấy ${next.length} chỉ số từ scorecard${out.rule ? ' bằng luật tách số' : ''}.`);
      return ['quality', () => rise($$('#view .metric'))];
    }
  };

  /* ---------- Điều hướng và bố cục ---------- */
  let tab = 'overview', going = 0, stageAnim = null;
  const stage = $('#stage'), view = $('#view'), overlay = $('#overlay'), ws = $('#workspace');

  function renderTeam() {
    $('#teamBar').innerHTML = S.meta.members.map(m => avatar(m.id)).join('');
    if (document.activeElement !== $('#projectName')) $('#projectName').value = S.meta.name;
  }
  function renderNav() {
    $('#nav').innerHTML = TABS.map(t => `<button class="nav-item ${t.id === tab ? 'on' : ''}" style="--c:${t.hex}" data-act="tab" data-id="${t.id}" aria-current="${t.id === tab}"><span class="long">${t.name}</span><span class="short">${t.short}</span></button>`).join('');
  }
  function render() {
    const t = TABS.find(x => x.id === tab);
    view.style.setProperty('--c', t.hex);
    view.dataset.tab = tab;
    const desktopOverview = tab === 'overview' && !mobile.matches;
    if (desktopOverview) { overlay.innerHTML = views.overview(); view.innerHTML = ''; }
    else { view.innerHTML = views[tab](); overlay.innerHTML = ''; }
    if (tab === 'product') thinkMount();
  }
  function layout(animate) {
    const over = tab === 'overview', isMobile = mobile.matches;
    ws.classList.toggle('overview', over);
    $('#app').classList.toggle('on-overview', over);
    const hidden = local.collapsed && !over && !isMobile;
    ws.classList.toggle('collapsed', hidden);
    const toggle = $('#sideToggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(!hidden));
    if (stageAnim) { stageAnim.stop(); stageAnim = null; }
    if (isMobile) {
      ws.style.removeProperty('--stage');
      const h = Math.round(innerHeight * (over ? 0.54 : 0.42));
      const from = stage.offsetHeight || h;
      if (animate && canAnim) stageAnim = M.animate(from, h, { duration: 0.8, ease: EASE, onUpdate: v => stage.style.setProperty('--sh', v + 'px') });
      else stage.style.setProperty('--sh', h + 'px');
      return;
    }
    const side = Math.min(361, Math.max(276, innerWidth * 0.247)); // nhỏ hơn 5% so với 380 / 290 / 26%
    const target = over ? ws.clientWidth : hidden ? 0 : side;
    const from = stage.offsetWidth;
    const apply = v => ws.style.setProperty('--stage', v + 'px');
    const settle = () => { if (over) ws.style.setProperty('--stage', '100%'); else apply(target); };
    if (animate && canAnim) stageAnim = M.animate(from, target, { duration: 0.85, ease: [0.7, 0, 0.2, 1], onUpdate: apply, onComplete: settle });
    else settle();
  }
  function enterContent() {
    if (tab === 'overview' && !mobile.matches) {
      rise($$('.ov-title > *', overlay), 0.7);
      anim($$('.ov-team > div', overlay), { opacity: [0, 1], y: [14, 0] }, { duration: 0.6, ease: EASE, delay: canAnim ? M.stagger(0.08, { startDelay: 0.9 }) : 0 });
      rise($$('.ms', overlay), 1.1);
      anim($('#pins'), { opacity: [0, 1] }, { delay: 2.2, duration: 0.5 });
      $('#pins').style.opacity = canAnim ? 0 : 1;
    } else {
      $('#pins').style.opacity = 0;
      rise($$('#view > .view-head, #view > .mind, #view .panel, #view .ms', view).slice(0, 14), 0.1);
    }
    anim($$('.grow', view), { scaleX: [0, 1] }, { duration: 0.8, ease: EASE, delay: 0.3 });
  }
  async function go(id) {
    if (!TABS.some(t => t.id === id) || id === tab) return;
    const n = ++going;
    closeDrawer(true);
    anim($('#pins'), { opacity: 0 }, { duration: 0.2 });
    await done(anim(tab === 'overview' && !mobile.matches ? overlay : view, { opacity: [1, 0] }, { duration: 0.15 }));
    if (n !== going) return;
    tab = id;
    history.replaceState(null, '', '#' + id);
    renderNav();
    { const fab = $('#fab'); if (fab) fab.hidden = id === 'product'; }
    view.style.opacity = overlay.style.opacity = 1;
    view.style.transform = overlay.style.transform = 'none';
    render();
    layout(true);
    syncProgress();
    if (site) site.focus(id === 'overview' ? 'overview' : STEPS.findIndex(s => s.id === id));
    view.scrollTop = 0;
    if (mobile.matches) scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    enterContent();
    anim($('.nav-item.on'), { scale: [0.85, 1] }, { type: 'spring', stiffness: 380, damping: 18 });
  }

  function initSite() {
    if (site || !window.Scenes) return;
    try {
      site = window.Scenes.site($('#progressCanvas'), STEPS.map(s => s.color), S.meta.members.map(m => color(m.color)), (pts, mode) => {
        const visible = tab === 'overview';
        pins.forEach((p, i) => {
          p.style.visibility = visible ? 'visible' : 'hidden';
          const w = p.offsetWidth, x = Math.max(8, Math.min(stage.clientWidth - w - 8, pts[i].x + (mobile.matches ? 2 : 24)));
          p.style.transform = `translate(${x}px,${pts[i].y - 16}px)`;
        });
      });
    } catch (e) { stage.insertAdjacentHTML('beforeend', '<p class="muted" style="position:absolute;top:45%;left:20px">Thiết bị này không hiển thị được 3D. Tiến độ vẫn có ở các thẻ.</p>'); }
    if (!site) return;
    $('#pins').innerHTML = STEPS.map(s => `<button class="pin" style="--c:${s.hex}" data-act="tab" data-id="${s.id}"><i></i>${s.name} <span></span></button>`).join('');
    pins = $$('.pin');
    site.set(progress());
    if (!['house', 'rubik', 'uni', 'tree'].includes(local.model)) local.model = 'house';
    if (local.model !== 'house') site.mode(local.model);
    $$('[data-model]').forEach(b => b.classList.toggle('on', b.dataset.model === local.model));
  }

  /* Hai route riêng: "/" là trang giới thiệu, "/workstation" là workstation (hash #tab chọn tab) */
  let inApp = false;
  function startApp(id = 'overview') {
    if (inApp) return;
    inApp = true;
    if (mockMode) document.body.insertAdjacentHTML('beforeend', '<div class="preview-badge">Chế độ xem mock: dữ liệu mẫu, không lưu</div>');
    $('#app').hidden = false;
    tab = id;
    renderTeam(); renderNav();
    { const fab = $('#fab'); if (fab) fab.hidden = id === 'product'; }
    render();
    layout(false);
    initSite();
    syncProgress();
    if (site) site.focus(id === 'overview' ? 'overview' : STEPS.findIndex(x => x.id === id));
    anim($('#app'), { opacity: [0, 1] }, { duration: 0.5 });
    rise($$('.nav-item'), 0.15);
    enterContent();
  }
  function enter(id = 'overview') { location.href = '/workstation' + (id && id !== 'overview' ? '#' + id : ''); }
  function home() { location.href = '/'; }

  const drawer = $('#drawer');
  function closeDrawer(instant) {
    if (drawer.hidden) return;
    const a = instant ? null : anim(drawer, { x: [0, 460] }, { duration: 0.3, ease: 'easeIn' });
    done(a).then(() => { drawer.hidden = true; });
    if (instant) drawer.hidden = true;
  }
  function toggleDrawer() {
    if (!drawer.hidden) return closeDrawer();
    $('#drawerSlot').append(chat);
    drawer.hidden = false;
    renderChat();
    anim(drawer, { x: [460, 0] }, { type: 'spring', stiffness: 260, damping: 30 });
    $('input', chat).focus();
  }

  /* Vẽ lại tab hiện tại, giữ vị trí cuộn */
  function rerender() { const y = view.scrollTop; render(); view.scrollTop = y; syncProgress(); }
  /* Bảng task: các thẻ trượt mượt sang cột mới */
  function moveTasks(change) {
    const before = new Map($$('.task', view).map(e => [e.dataset.task, e.getBoundingClientRect()]));
    change();
    rerender();
    $$('.task', view).forEach(e => {
      const a = before.get(e.dataset.task), b = e.getBoundingClientRect();
      if (!a) anim(e, { opacity: [0, 1], scale: [0.8, 1] }, { type: 'spring' });
      else if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 2) anim(e, { x: [a.x - b.x, 0], y: [a.y - b.y, 0], scale: [1.06, 1] }, { type: 'spring', stiffness: 200, damping: 24 });
    });
  }
  function pullRequest(title, event) {
    const ids = [...new Set((title.match(/\bT-?\d+\b/gi) || []).map(x => 'T-' + x.replace(/\D/g, '')))];
    const target = { draft: 'doing', opened: 'review', changes: 'doing', merged: 'done', closed: 'todo' }[event];
    const names = { draft: 'mở PR nháp', opened: 'mở PR chờ review', changes: 'yêu cầu sửa', merged: 'merge PR', closed: 'đóng PR' };
    const hit = S.tasks.list.filter(t => ids.includes(t.id));
    if (!hit.length) return toast('Không thấy mã task hợp lệ. Đặt mã như T-3 vào tiêu đề PR.');
    moveTasks(() => {
      hit.forEach(t => {
        const old = STATUS[t.status][0];
        t.status = target;
        S.tasks.log.unshift(`${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${names[event]}: ${t.id} chuyển từ ${old} sang ${STATUS[target][0]}`);
      });
      S.tasks.log = S.tasks.log.slice(0, 30);
    });
    save('tasks');
    toast(`${hit.map(t => t.id).join(', ')} chuyển sang ${STATUS[target][0]}`);
  }

  /* ---------- Sự kiện ---------- */
  let resetArmed = 0;
  const actions = {
    enter: () => enter(),
    home,
    replay: () => replay(),
    flow: () => $('#flow').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }),
    tab: b => go(b.dataset.id),
    collapse() { local.collapsed = !local.collapsed; persist(); layout(true); },
    drawer: toggleDrawer,
    me(b) { local.me = b.dataset.id; persist(); renderChat(); anim($('.speak .me', chat), { scale: [0.6, 1] }, { type: 'spring' }); },
    quick: b => send(b.textContent),
    'think-approve': () => thinkReview(true),
    'think-reject': () => thinkReview(false),
    'think-reset': () => thinkReset(),
    finish(b) { if (stepState(STEPS.findIndex(x => x.id === b.dataset.id)) !== 'doing') return; S.done[b.dataset.id] = true; save('done'); rerender(); renderNav(); toast('Đã hoàn thành bước. Bước tiếp theo đã mở.'); },
    reopen(b) { const i = STEPS.findIndex(x => x.id === b.dataset.id); STEPS.slice(i).forEach(x => { S.done[x.id] = false; }); save('done'); rerender(); renderNav(); },
    reset(b) {
      if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); b.textContent = db ? 'Bấm lần nữa: đặt lại cho cả đội' : 'Bấm lần nữa để đặt lại'; setTimeout(() => { b.textContent = 'Đặt lại demo'; }, 4000); return; }
      S = SEED(); resetArmed = 0; b.textContent = 'Đặt lại demo';
      save(...Object.keys(S)); renderTeam(); renderChat(); rerender(); enterContent(); toast('Đã đặt lại dữ liệu demo');
    },
    dot(b) { const s = S.score[b.dataset.id], n = +b.dataset.n; s.score = s.score === n ? n - 1 : n; save('score'); rerender(); anim($$(`.score[data-key="${b.dataset.id}"] .dots .on`, view), { scaleY: [2.2, 1] }, { type: 'spring', delay: canAnim ? M.stagger(0.04) : 0 }); },
    story() { S.plan.stories.push('Là ..., tôi muốn ... để ...'); save('plan'); rerender(); const all = $$('[data-bind="story"]', view), last = all[all.length - 1]; rise([last]); last.focus(); last.select(); },
    seed() {
      const texts = ['Sợ trả lời sai chính sách', 'Ngại cài đặt phức tạp', 'Giá phải rẻ', 'Lo lộ thông tin khách', 'Chưa tin AI viết tự nhiên'];
      for (let i = 0; i < 8; i++) {
        const n = S.pitch.responses.length;
        S.pitch.responses.push({ sample: true, answers: Object.fromEntries(S.pitch.form.map((q, k) => [q.id, q.type === 'scale' ? String(2 + ((n * 7 + k * 3) % 4)) : q.type === 'choice' ? q.options[(n * n + k) % q.options.length] : texts[(n + k) % texts.length]])) });
      }
      S.pitch.responses = S.pitch.responses.slice(-200); S.pitch.overview = ''; save('pitch'); rerender();
      anim($$('.grow', view), { scaleX: [0, 1] }, { duration: 0.8, ease: EASE, delay: canAnim ? M.stagger(0.04) : 0 });
    },
    slide(b) { const d = $('.deck', view); d.scrollBy({ left: +b.dataset.n * (d.clientWidth + 12), behavior: reduced ? 'auto' : 'smooth' }); },
    async copy(b) {
      const text = b.dataset.id === 'html' ? deckHTML() : S.pitch[b.dataset.id];
      try { await navigator.clipboard.writeText(text); toast('Đã sao chép'); } catch (e) { toast('Trình duyệt chặn sao chép. Hãy bôi đen văn bản để chép tay.'); }
    },
    async download() { try { await downloads.save({ filename: 'pitching.html', data: deckHTML() }); toast('Đã tải pitching.html'); } catch (e) { toast('Chưa tải được file. Dùng nút Sao chép HTML.'); } },
    schedule(b) {
      const t = S.maintain.tech[+b.dataset.n];
      t.added = true;
      const id = 'm' + Date.now().toString(36);
      S.maintain.schedule.push({ id, title: t.title, every: 30, next: inDays(7), owner: '', runs: 0 });
      save('maintain'); rerender(); anim($(`[data-row="${id}"]`, view), { opacity: [0, 1], x: [-30, 0] }, { duration: 0.6 }); toast('Đã thêm vào lịch, hạn sau 7 ngày');
    },
    qline(b) { qline = b.dataset.id; rerender(); anim($$('.chart .ln', view), { opacity: [0, 1] }, { duration: 0.5 }); },
    editrun(b) { runEdit = b.dataset.id; rerender(); const f = $('[data-form="run"]', view); if (f) { f.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); f.elements.model.focus(); } },
    cancelrun() { runEdit = null; rerender(); },
    delrun(b) {
      if (!twice(b, 'run' + b.dataset.id, 'Bấm lần nữa để xóa')) return;
      S.quality.runs = S.quality.runs.filter(r => r.id !== b.dataset.id);
      if (runEdit === b.dataset.id) runEdit = null;
      save('quality'); rerender(); toast('Đã xóa lần chạy');
    },
    clearsample(b) {
      if (!twice(b, 'sample', 'Bấm lần nữa để xóa mẫu')) return;
      S.quality.runs = S.quality.runs.filter(r => !r.sample); runEdit = null;
      save('quality'); rerender(); toast('Đã xóa dữ liệu mẫu');
    },
    addmetric() { S.quality.metrics.push({ id: 'k' + Date.now().toString(36), name: 'Chỉ số mới', baseline: null, target: 0, unit: '%', direction: 'up', kind: 'value', method: '', rule: '', from: 'tay' }); save('quality'); rerender(); const all = $$('[data-field="name"]', view); if (all.length) { all[all.length - 1].focus(); all[all.length - 1].select(); } },
    delmetric(b) {
      if (!twice(b, 'metric' + b.dataset.id, 'Bấm lần nữa')) return;
      S.quality.metrics = S.quality.metrics.filter(k => k.id !== b.dataset.id); save('quality'); rerender();
    },
    preview(b) { preview = b.dataset.id === 'real' ? null : b.dataset.id; applyHealth(); rerender(); },
    addsuggest(b) {
      const list = S.maintain.suggest || [], x = list[+b.dataset.n];
      if (!x) return;
      const id = 'm' + Date.now().toString(36);
      S.maintain.schedule.push({ id, title: x.title, every: x.every, next: inDays(Math.min(7, x.every)), owner: '', runs: 0 });
      S.maintain.suggest = list.filter(y => y !== x);
      save('maintain'); rerender(); anim($(`[data-row="${id}"]`, view), { opacity: [0, 1], x: [-30, 0] }, { duration: 0.6 }); toast(`Đã thêm vào lịch, chu kỳ ${x.every} ngày`);
    },
    ran(b) {
      const x = S.maintain.schedule.find(x => x.id === b.dataset.id);
      if (!x) return;
      x.runs = (+x.runs || 0) + 1; x.next = inDays(+x.every); save('maintain'); rerender();
      anim($(`[data-row="${x.id}"]`, view), { backgroundColor: ['#e9d5ff', '#ffffff'] }, { duration: 1.2 });
      toast('Đã ghi nhận. Hạn tiếp theo sau ' + x.every + ' ngày');
    }
  };
  document.addEventListener('click', async e => {
    const model = e.target.closest('[data-model]');
    if (model) {
      local.model = model.dataset.model; persist();
      $$('[data-model]').forEach(b => b.classList.toggle('on', b === model));
      if (site) site.mode(local.model);
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (jobs[act]) {
      if (b.disabled) return;
      const label = b.textContent, from = tab;
      b.disabled = true; b.textContent = 'Agent đang làm...';
      const pulse = anim(b, { opacity: [1, 0.55, 1] }, { duration: 1.2, repeat: Infinity });
      try {
        const [, play] = await jobs[act]();
        if (tab === from) { rerender(); play(); } else syncProgress();
      } finally { if (pulse) pulse.stop(); b.disabled = false; b.style.opacity = ''; if (b.isConnected) b.textContent = label; }
      return;
    }
    if (actions[act]) actions[act](b);
  });
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('button');
    if (b && !b.classList.contains('pin')) anim(b, { scale: [1, 0.94, 1] }, { duration: 0.32, ease: 'easeOut' });
  });
  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, kind = f.dataset.form;
    if (kind === 'think') { const i = $('input', f); thinkSend(i.value); i.value = ''; }
    if (kind === 'chat') { const i = $('input', f); if (typing) return toast('Đợi agent trả lời xong đã.'); send(i.value); i.value = ''; }
    if (kind === 'task') {
      const v = f.elements.title.value.trim();
      if (!v) return toast('Nhập tên task trước.');
      const n = Math.max(0, ...S.tasks.list.map(t => +t.id.slice(2) || 0)) + 1;
      moveTasks(() => S.tasks.list.push({ id: 'T-' + n, title: v.slice(0, 120), owner: '', status: 'todo' }));
      save('tasks');
    }
    if (kind === 'pr') {
      let title = f.elements.title.value, event = f.elements.event.value;
      const json = f.elements.json.value.trim();
      if (json) {
        try {
          const p = JSON.parse(json), pr = p.pull_request;
          title = String(pr.title);
          event = p.action === 'closed' ? (pr.merged ? 'merged' : 'closed') : p.action === 'converted_to_draft' || pr.draft ? 'draft' : p.review && p.review.state === 'changes_requested' ? 'changes' : ['opened', 'reopened', 'ready_for_review', 'synchronize'].includes(p.action) ? 'opened' : null;
          if (!event) return toast('Hành động này không đổi trạng thái task.');
        } catch (err) { return toast('Payload chưa đúng. Cần JSON có action và pull_request.title.'); }
      }
      pullRequest(title, event);
    }
    if (kind === 'run') {
      const g = n => (f.elements[n] ? String(f.elements[n].value).trim() : '');
      const nn = n => (g(n) === '' || !isFinite(+g(n)) ? null : Math.max(0, +g(n)));
      const run = { at: g('at') || nowLocal(), model: g('model').slice(0, 80), values: {}, passed: nn('passed'), total: nn('total'), inTok: nn('inTok') || 0, outTok: nn('outTok') || 0, note: g('note').slice(0, 300) };
      if (!run.model) return toast('Nhập tên model hoặc phiên bản.');
      if (run.passed !== null) run.passed = Math.round(run.passed);
      if (run.total !== null) run.total = Math.round(run.total);
      if (run.passed !== null && run.total !== null && run.passed > run.total) return toast('Số test pass không được lớn hơn tổng số test.');
      S.quality.metrics.forEach(k => { const v = g('m_' + k.id); if (v !== '' && isFinite(+v)) run.values[k.id] = +v; });
      const old = S.quality.runs.find(r => r.id === runEdit);
      if (old) Object.assign(old, run); else S.quality.runs.push(Object.assign({ id: 'r' + Date.now().toString(36) }, run));
      S.quality.runs = S.quality.runs.slice(-200);
      toast(old ? 'Đã lưu lần chạy' : 'Đã thêm lần chạy');
      runEdit = null; save('quality'); rerender();
      anim($$('.chart .ln', view), { opacity: [0, 1] }, { duration: 0.6 });
    }
    if (kind === 'answer') {
      const answers = Object.fromEntries([...new FormData(f)].filter(([, v]) => String(v).trim()));
      if (!Object.keys(answers).length) return toast('Trả lời ít nhất một câu trước khi gửi.');
      S.pitch.responses.push({ answers }); S.pitch.overview = ''; save('pitch'); rerender(); toast('Đã gửi phản hồi');
      anim($$('.grow', view), { scaleX: [0, 1] }, { duration: 0.8, ease: EASE });
    }
  });
  document.addEventListener('change', e => {
    const t = e.target, k = t.dataset.bind, id = t.dataset.id;
    if (t.id === 'projectName') { S.meta.name = t.value.trim() || 'Dự án chưa đặt tên'; save('meta'); return; }
    if (!k) return;
    const v = t.value;
    if (k === 'score') { S.score[id].text = v; if (!v.trim()) S.score[id].score = 0; save('score'); }
    if (k === 'overview') { S.plan.overview = v; save('plan'); }
    if (k === 'role') { S.plan.roles[id] = v; save('plan'); rerender(); }
    if (k === 'story') { if (v.trim()) S.plan.stories[+id] = v; else S.plan.stories.splice(+id, 1); save('plan'); if (!v.trim()) rerender(); }
    if (k === 'link') { S.plan.links[id] = v.trim(); save('plan'); if (v && !/^https:\/\//.test(v)) toast('Link cần bắt đầu bằng https://'); else rerender(); }
    if (k === 'cost') {
      S.plan.cost[id] = Math.max(0, +v || 0); save('plan');
      if ($('#kpis')) { $('#kpis').innerHTML = kpis(); anim($$('#kpis b'), { opacity: [0.2, 1], y: [6, 0] }, { duration: 0.4 }); } else rerender();
    }
    if (k === 'qmetric') {
      const x = S.quality.metrics.find(x => x.id === id), fl = t.dataset.field;
      if (x && fl === 'name') x.kind = kindOf(v);
      if (x) x[fl] = fl === 'target' ? (+v || 0) : fl === 'baseline' ? num(v) : fl === 'direction' ? (v === 'down' ? 'down' : 'up') : fl === 'kind' ? (KIND[v] ? v : 'value') : v.trim().slice(0, { unit: 12, name: 60 }[fl] || 200);
      save('quality'); rerender();
    }
    if (k === 'owner' || k === 'status') { moveTasks(() => { const x = S.tasks.list.find(x => x.id === id); if (x) x[k] = v; }); save('tasks'); }
    if (k === 'mowner') { const x = S.maintain.schedule.find(x => x.id === id); if (x) x.owner = v; save('maintain'); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  mobile.addEventListener('change', () => { if (inApp) { render(); layout(false); syncProgress(); } });
  let rt, lastW = innerWidth;
  addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => { if (inApp) layout(false); }, 120); });

  /* ---------- Trang giới thiệu ---------- */
  let heroScene = null, intro = null;
  function replay() {
    if (!heroScene || !canAnim) { if (heroScene) heroScene.state.p = 1; return; }
    if (intro) intro.stop();
    heroScene.state.p = 0;
    intro = M.animate(0, 1, { duration: 5.2, delay: 0.35, ease: [0.55, 0, 0.15, 1], onUpdate: v => { heroScene.state.p = v; } });
  }
  function landing() {
    $('#flowList').innerHTML = STEPS.map((s, i) => `<li><button class="step" style="--c:${s.hex}" data-step="${s.id}"><span class="step-no">${i + 1}</span><span class="step-body"><span class="step-title">${s.name}</span><span>${s.lead}</span>
      <span class="shift"><span><small>Engineer thường nghĩ</small>${s.from}</span><span><small>AI builder hỏi</small>${s.to}</span></span><span class="chips">${s.out.map(o => `<span class="chip">${o}</span>`).join('')}</span></span></button></li>`).join('');
    $$('.step').forEach(b => b.addEventListener('click', () => enter(b.dataset.step)));
    if (window.Scenes) {
      try {
        let tipAnim;
        heroScene = window.Scenes.hero($('#heroCanvas'), FLOORS, (i, group) => {
          const f = FLOORS[i], tip = $('#floorTip');
          tip.style.setProperty('--c', `var(--${f.color})`);
          $('span', tip).textContent = `Tầng ${i + 1}, ${f.name}: ${f.text}`;
          anim(tip, { y: [14, 0], opacity: [0, 1] }, { type: 'spring' });
          if (canAnim) { if (tipAnim) tipAnim.stop(); tipAnim = M.animate(0, 1, { duration: 0.7, onUpdate: v => { const s = 1 + Math.sin(v * Math.PI) * 0.12; group.scale.set(s, 1, s); } }); }
        });
        replay();
      } catch (e) { $('#floorTip span').textContent = 'Thiết bị này không hiển thị được 3D.'; }
    }
    rise($$('.hero-copy > *'), 0.5);
    if (canAnim && M.inView) {
      $$('.step, .flow-head, .flow-end').forEach(el => {
        el.style.opacity = 0;
        M.inView(el, () => { M.animate(el, { opacity: [0, 1], y: [40, 0] }, { duration: 0.7, ease: EASE }); }, { amount: 0.2 });
      });
    }
  }

  if ($('#landing')) landing();
  if ($('#app')) { const h = location.hash.slice(1); startApp(TABS.some(t => t.id === h) ? h : 'overview'); }
  connect().catch(() => {});
  ready.then(() => { if (inApp && tab === 'pitching') rerender(); });
})();

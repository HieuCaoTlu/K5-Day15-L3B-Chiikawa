/* Ứng dụng: điều hướng, bốn bước, agent, dữ liệu dùng chung và chuyển động. */
(function () {
  const { STEPS, FLOORS, SCORE, ROLES, STATUS, SAMPLE_SCORE, SEED, STACK, MONEY, FILES, AGENT, inDays, iso } = window.DATA;
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(max-width: 1000px)');
  const M = window.Motion;
  const canAnim = !!M && !reduced;
  const EASE = [0.22, 1, 0.36, 1];
  const TABS = [{ id: 'overview', name: 'Tổng quan', short: 'Tổng quan', hex: '#4d5bf0' },
    ...STEPS.map((s, i) => ({ id: s.id, name: s.name, short: ['Product', 'Plan', 'Pitch', 'Bảo trì'][i], hex: s.hex }))];

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
  let db = null, canWrite = true, owner = true;
  const synced = {}, dirty = new Set(), writing = new Set();
  let saveTimer;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ S: db ? undefined : S, local })); } catch (e) { /* bỏ qua */ }
  }
  function save(...sections) {
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

  /* ---------- Tiến độ ---------- */
  const filled = () => SCORE.filter(([k]) => S.score[k] && S.score[k].text.trim()).length;
  function progress() {
    const t = S.tasks.list, p = S.pitch, sc = S.maintain.schedule;
    return [
      filled() / SCORE.length,
      0.2 * (ROLES.filter(r => S.plan.roles[r]).length / ROLES.length) + 0.8 * (t.reduce((a, x) => a + (STATUS[x.status] || [0, 0])[1], 0) / (t.length || 1)),
      [p.form, p.responses.length, p.overview, p.deck, p.script, p.ads].filter(Boolean).length / 6,
      sc.filter(x => x.runs > 0).length / (sc.length || 1)
    ].map(v => Math.max(0, Math.min(1, v)));
  }
  function nextAction(i) {
    if (i === 0) { const m = SCORE.find(([k]) => !S.score[k].text.trim()); return m ? `Còn thiếu mục ${m[1]} trong scorecard` : 'Scorecard đã đủ 7 mục'; }
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
    const due = S.maintain.schedule.slice().sort((a, b) => a.next.localeCompare(b.next))[0];
    return due ? `${due.next <= iso(new Date()) ? 'Đến hạn' : 'Sắp tới'}: ${due.title}` : 'Chưa có lịch';
  }
  const pct = v => Math.round(v * 100) + '%';

  let site = null, pins = [], shown = 0;
  function syncProgress() {
    const v = progress(), total = v.reduce((a, b) => a + b, 0) / 4;
    if (site) site.set(v);
    const el = $('#totalPct');
    if (canAnim) M.animate(shown, total, { duration: 0.9, ease: EASE, onUpdate: x => { el.textContent = pct(x); } });
    else el.textContent = pct(total);
    shown = total;
    pins.forEach((p, i) => { $('span', p).textContent = pct(v[i]); });
    $$('#overlay [data-pct], #view [data-pct]').forEach(b => { b.textContent = pct(v[+b.dataset.pct]); });
    $$('#overlay [data-next], #view [data-next]').forEach(b => { b.textContent = nextAction(+b.dataset.next); });
    $$('[data-bar]').forEach(b => {
      const x = v[+b.dataset.bar];
      b.style.width = pct(x);
    });
    floorInfo(v);
  }
  function floorInfo(v = progress()) {
    const box = $('#floorInfo'), i = STEPS.findIndex(s => s.id === tab);
    box.hidden = i < 0;
    if (i < 0) return;
    box.style.setProperty('--c', STEPS[i].hex);
    box.innerHTML = `<div class="line"><span>Tầng ${i + 1}: ${STEPS[i].name}</span><span>${pct(v[i])}</span></div><div class="bar"><span style="width:${pct(v[i])}"></span></div><div class="muted">${esc(nextAction(i))}</div>`;
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

  /* ---------- Các khung nhìn ---------- */
  const head = (i, sub, extra = '') => `<div class="view-head"><div><h2>${STEPS[i].name}</h2><p>${sub}</p></div>${extra}</div>
    <div class="mind" aria-label="Chuyển tư duy"><span>Engineer: ${STEPS[i].from}</span><span>AI builder: ${STEPS[i].to}</span></div>`;
  const panelHead = (t, extra = '') => `<div class="panel-head"><h3>${t}</h3>${extra}</div>`;
  const btn = (act, label, cls = 'tone', data = '') => `<button class="btn ${cls}" data-act="${act}" ${data}>${label}</button>`;

  const views = {
    overview() {
      const v = progress();
      const cards = STEPS.map((s, i) => `<button class="over-step" style="--c:${s.hex}" data-act="tab" data-id="${s.id}">
        <span class="line"><span>${s.name}</span><b data-pct="${i}">${pct(v[i])}</b></span><span class="bar"><span data-bar="${i}" style="width:${pct(v[i])}"></span></span><span class="muted" data-next="${i}">${esc(nextAction(i))}</span></button>`).join('');
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
          <div class="panel">${panelHead('Việc cần để ý')}${S.tasks.list.filter(t => t.status === 'review').map(t => `<p>${esc(t.id)} đang chờ review: ${esc(t.title)}</p>`).join('')}${late.map(x => `<p>Bảo trì đến hạn: ${esc(x.title)}</p>`).join('') || ''}${!late.length && !S.tasks.list.some(t => t.status === 'review') ? '<p class="muted">Không có việc gấp.</p>' : ''}</div></div>`;
      }
      return `<div class="ov-title"><h2>Công trình đang xây</h2><p>Mỗi tầng là một bước. Khối được đổ màu khi đội hoàn thành thêm việc.</p>${btn('tab', 'Làm tiếp', 'primary small', `data-id="${STEPS[Math.max(0, v.findIndex(x => x < 1))].id}"`)}</div>
        <div class="ov-team">${team}</div><div class="ov-cards">${cards}</div>`;
    },

    product() {
      const total = SCORE.reduce((a, [k]) => a + (+S.score[k].score || 0), 0);
      return head(0, 'Cả đội trò chuyện cùng agent. Khi đủ ý, để agent điền scorecard rồi sửa tay chỗ chưa đúng.') +
        `<div class="cols"><div class="panel" id="chatSlot">${panelHead('Phòng chat nhóm')}</div>
        <div class="panel">${panelHead('AI MVP Scorecard', btn('fill', 'Agent điền scorecard', 'tone small'))}
          <p><span class="score-total">${total}</span> <span class="muted">/ 35 điểm. Bấm vạch để chấm lại.</span></p>
          ${SCORE.map(([k, l]) => `<div class="score" data-key="${k}"><div class="score-top"><label for="sc-${k}">${l}</label><div class="dots" role="group" aria-label="Điểm ${l}">${[1, 2, 3, 4, 5].map(n => `<button class="${n <= S.score[k].score ? 'on' : ''}" data-act="dot" data-id="${k}" data-n="${n}" aria-label="${n} trên 5"></button>`).join('')}</div></div>
          <textarea id="sc-${k}" data-bind="score" data-id="${k}" rows="2" placeholder="Chưa có. Bàn thêm trong chat rồi để agent điền.">${esc(S.score[k].text)}</textarea></div>`).join('')}
        </div></div>`;
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
      const roleOptions = ['Học viên', 'Trợ giảng / Lab coach', 'Giảng viên / Mentor', 'Nhân viên CSKH', 'Chủ shop / Quản lý', 'Kỹ sư / Đội sản phẩm'];
      const curRole = p.targetRole || '';
      const ctx = pitchCtx();
      const roleBar = `<div class="role-pick">
        <div class="row" style="justify-content:space-between">
          <span><b>Ý tưởng nhóm (từ Product thinking):</b> ${esc(ctx.project_name)}</span>
          ${btn('tab', 'Sửa ở Product thinking', 'soft small', 'data-id="product"')}
        </div>
        <div class="muted">${esc(ctx.problem || ctx.overview || 'Chưa điền Problem ở tab Product thinking — AI sẽ dùng tên dự án và chat nhóm để gợi ý.')}</div>
        <span class="muted" style="margin-top:4px">Chọn 1 đối tượng nhận form (1 Form = 1 Vai chính)</span>
        <div class="row">${roleOptions.map(r => `<button type="button" class="btn small ${curRole === r ? 'tone' : 'soft'}" data-act="pickRole" data-id="${esc(r)}">${esc(r)}</button>`).join('')}</div>
        <input data-bind="targetRole" value="${esc(curRole)}" placeholder="Hoặc nhập 1 đối tượng cụ thể (vd: Học viên lớp L3B, Người dùng thử)">
        <span class="muted">AI lấy ý tưởng từ Product thinking + đối tượng trên để gợi ý sẵn câu hỏi.</span>
      </div>`;
      const sourceBadge = p.draftSource === 'llm'
        ? '<span class="tag" style="--c:var(--green)">AI Gemini gợi ý theo Product thinking</span>'
        : p.draftSource === 'fallback'
          ? '<span class="tag">Gợi ý theo ngữ cảnh (thiếu GOOGLE_API_KEY nên chưa gọi Gemini)</span>'
          : '<span class="tag">Bản mẫu — bấm “AI gợi ý câu hỏi” để tạo từ Product thinking</span>';
      const editor = p.form ? `<div class="stack" style="gap:10px;margin-top:10px">
        <div class="review-note"><b>Đọc lại &amp; sửa theo ý bạn:</b> AI đã gợi ý sẵn bên dưới. Bạn có thể sửa câu chữ, đổi loại câu hỏi, sửa phương án hoặc thêm/xóa câu trước khi publish.</div>
        <div class="row">${curRole ? `<span class="tag" style="--c:var(--orange)">Đối tượng: ${esc(curRole)}</span>` : ''}${sourceBadge}</div>
        <input data-bind="formTitle" value="${esc(p.formTitle || ('Khảo sát: ' + ctx.project_name))}" placeholder="Tiêu đề form khảo sát" aria-label="Tiêu đề form">
        <input data-bind="formDesc" value="${esc(p.formDesc || '')}" placeholder="Lời giới thiệu ngắn" aria-label="Lời giới thiệu">
        ${p.form.map((q, i) => `<div class="question">
          <div class="q-head"><strong>Câu ${i + 1}</strong>
            <select data-bind="qType" data-id="${i}" aria-label="Loại câu ${i + 1}">
              <option value="choice" ${q.type === 'choice' ? 'selected' : ''}>Trắc nghiệm (chọn 1)</option>
              <option value="multi" ${q.type === 'multi' ? 'selected' : ''}>Chọn nhiều đáp án</option>
              <option value="scale" ${q.type === 'scale' ? 'selected' : ''}>Thang 1–5</option>
              <option value="text" ${q.type === 'text' ? 'selected' : ''}>Câu hỏi mở</option>
            </select>
            <label class="req"><input type="checkbox" data-bind="qReq" data-id="${i}" ${q.required !== false ? 'checked' : ''}>Bắt buộc</label>
            ${p.form.length > 1 ? btn('delQ', 'Xóa', 'soft small', `data-id="${i}"`) : ''}
          </div>
          <textarea class="q-text" rows="2" data-bind="formQ" data-id="${i}" aria-label="Nội dung câu ${i + 1}">${esc(q.q)}</textarea>
          ${q.type === 'choice' || q.type === 'multi' ? `<div class="chips">${(q.options || []).filter(Boolean).map(o => `<span class="chip">${esc(o)}</span>`).join('')}</div>
            <textarea rows="2" data-bind="qOpts" data-id="${i}" placeholder="Mỗi dòng một phương án" aria-label="Phương án câu ${i + 1}">${esc((q.options || []).join('\n'))}</textarea>` : ''}
        </div>`).join('')}
        <div class="row">${btn('addQ', '+ Thêm câu hỏi', 'soft small')}${btn('publishSurvey', p.publishedSlug ? 'Publish link mới' : 'Publish link khảo sát', 'primary small')}${p.publishedSlug ? `<a class="btn soft small" style="text-decoration:none" href="/survey?slug=${encodeURIComponent(p.publishedSlug)}" target="_blank" rel="noopener">Mở trang khảo sát</a>` : ''}</div>
        ${p.publishedSlug ? `<div class="pub-box"><div><strong>Đã publish:</strong> <code>/survey?slug=${esc(p.publishedSlug)}</code></div><div class="row"><input readonly value="${esc(location.origin + '/survey?slug=' + p.publishedSlug)}" aria-label="Link công khai">${btn('copySurveyLink', 'Sao chép link', 'tone small')}</div></div>` : ''}
      </div>` : '<p class="muted" style="margin-top:10px">Điền ý tưởng nhóm và đối tượng ở trên rồi bấm “AI gợi ý câu hỏi”.</p>';
      const deck = p.deck ? `<div class="deck" tabindex="0">${p.deck.map((s, i) => `<section class="slide" style="--s:${STEPS[i % 4].hex}"><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></section>`).join('')}</div>
        <div class="row" style="margin-top:10px">${btn('slide', 'Trang trước', 'soft small', 'data-n="-1"')}${btn('slide', 'Trang sau', 'soft small', 'data-n="1"')}${btn('copy', 'Sao chép HTML', 'soft small', 'data-id="html"')}${downloads ? btn('download', 'Tải file HTML', 'primary small') : ''}</div>` : '<p class="muted">Tạo bộ slide từ scorecard và phản hồi đã thu.</p>';
      const textPanel = (key, title, act, empty) => `<div class="panel">${panelHead(title, btn(act, p[key] ? 'Tạo lại' : 'Tạo', 'tone small'))}${p[key] ? `<div class="prose">${esc(p[key])}</div><p style="margin-top:10px">${btn('copy', 'Sao chép', 'soft small', `data-id="${key}"`)}</p>` : `<p class="muted">${empty}</p>`}</div>`;
      return head(2, 'Thu bằng chứng trước, kể chuyện sau. Dashboard tự dựng từ câu trả lời.') + `<div class="stack">
        <div class="cols"><div class="panel">${panelHead('Form khảo sát', btn('form', p.draftSource ? 'AI gợi ý lại' : 'AI gợi ý câu hỏi', 'tone small'))}${roleBar}${editor}</div>
        <div class="panel">${panelHead('Dashboard', p.form ? btn('seed', 'Thêm 8 phản hồi mẫu', 'soft small') : '')}${dashboard()}</div></div>
        ${publishedPanel()}
        <div class="panel">${panelHead('AI overview từ form', p.responses.length ? btn('summary', p.overview ? 'Phân tích lại' : 'Phân tích phản hồi', 'tone small') : '')}${p.overview ? `<div class="prose">${esc(p.overview)}</div>` : `<p class="muted">${p.responses.length ? 'Bấm phân tích để agent tóm tắt tín hiệu và việc nên làm tiếp.' : 'Cần ít nhất một phản hồi.'}</p>`}</div>
        <div class="panel">${panelHead('Pitching HTML', btn('deck', p.deck ? 'Tạo lại slide' : 'Tạo slide', 'tone small'))}${deck}</div>
        <div class="cols">${textPanel('script', 'Pitching script', 'script', 'Kịch bản nói khoảng 3 phút, chia mốc thời gian.')}${textPanel('ads', 'Bài quảng cáo', 'ads', 'Ba bài cho ba kênh, giọng khác nhau.')}</div></div>`;
    },

    maintaining() {
      const m = S.maintain, today = iso(new Date());
      return head(3, 'Sản phẩm AI cần được canh chừng. Việc đến hạn nằm trên cùng.') + `<div class="stack">
        <div class="panel">${panelHead('Gợi ý cập nhật công nghệ', btn('tech', 'Agent gợi ý mới', 'tone small'))}<div class="cards">${m.tech.map((t, i) => `<div class="card"><span class="tag" style="--c:var(--${['red', 'orange', 'blue'].includes(t.color) ? t.color : 'blue'})">Ưu tiên ${esc(t.level)}</span><span>${esc(t.title)}</span><span class="muted">${esc(t.why)}</span>${t.added ? '<span class="muted">Đã có trong lịch</span>' : btn('schedule', 'Thêm vào lịch', 'soft small', `data-n="${i}"`)}</div>`).join('')}</div></div>
        <div class="panel">${panelHead('Lịch bảo trì')}<div class="scroll"><table><thead><tr><th>Việc</th><th>Chu kỳ</th><th>Hạn tới</th><th>Người làm</th><th></th></tr></thead><tbody>${m.schedule.slice().sort((a, b) => a.next.localeCompare(b.next)).map(x => `<tr data-row="${esc(x.id)}"><td>${esc(x.title)}<br><span class="muted">Đã làm ${+x.runs || 0} lần</span></td><td>${+x.every} ngày</td><td><span class="tag" style="--c:var(${x.next <= today ? '--red' : '--violet'})">${x.next <= today ? 'Đến hạn ' : ''}${esc(x.next.split('-').reverse().join('/'))}</span></td><td><select data-bind="mowner" data-id="${esc(x.id)}" aria-label="Người làm">${options(x.owner)}</select></td><td>${btn('ran', 'Đã làm', 'tone small', `data-id="${esc(x.id)}"`)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    }
  };

  let surveysCache = null, surveysLoading = false, surveysError = '', activeSurveyDetail = null, armedDeleteSlug = '';
  function pitchCtx() {
    const role = (S.pitch.targetRole || '').trim();
    const chatNotes = (S.chat || []).filter(m => m.who !== 'agent').slice(-4).map(m => m.text).join(' | ');
    return {
      project_name: S.meta.name || 'Sản phẩm mới',
      target_role: role,
      persona: score('persona') || role,
      problem: score('problem'),
      leverage: score('leverage'),
      scope: score('scope'),
      metric: score('metric'),
      overview: S.plan.overview || chatNotes || ''
    };
  }
  async function loadPublishedSurveys(force = false) {
    if (surveysLoading || (!force && surveysCache !== null)) return;
    surveysLoading = true; surveysError = '';
    try {
      const res = await fetch('/api/v1/pitching/surveys');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      surveysCache = await res.json();
    } catch (e) { surveysError = 'Chưa tải được danh sách link đã publish từ backend.'; }
    surveysLoading = false;
    if (inApp && tab === 'pitching') refresh();
  }
  function publishedPanel() {
    const list = surveysCache;
    let body = '';
    if (surveysLoading && !list) body = '<p class="muted">Đang tải danh sách khảo sát…</p>';
    else if (surveysError) body = `<p class="muted">${esc(surveysError)}</p>`;
    else if (!list || !list.length) body = '<p class="muted">Chưa có link nào được publish. Tạo form ở trên rồi bấm “Publish link khảo sát”.</p>';
    else {
      body = `<div class="scroll"><table><thead><tr><th>Tiêu đề & vai chính</th><th>Phản hồi</th><th>Đường dẫn công khai</th><th></th></tr></thead><tbody>${list.map(s => {
        const isOpen = !!(activeSurveyDetail && activeSurveyDetail.slug === s.slug);
        const detailRow = isOpen ? `<tr class="resp-row"><td colspan="4"><div class="resp-drawer">
          ${activeSurveyDetail.responses.length ? activeSurveyDetail.responses.map(r => `<div class="resp-item"><div class="row" style="justify-content:space-between"><strong>${esc(r.respondent_role || s.target_role || 'Ẩn danh')}</strong><span class="muted">${esc((r.created_at || '').slice(0, 16).replace('T', ' '))}${r.is_sample ? ' · Mẫu' : ''}</span></div>
            ${(activeSurveyDetail.survey.questions || []).map(q => { const a = (r.answers || {})[q.id]; return `<div><span class="muted">${esc(q.q)}:</span> ${esc(Array.isArray(a) ? a.join(' · ') : (a || '—'))}</div>`; }).join('')}</div>`).join('') : '<span class="muted">Chưa có câu trả lời nào cho link này. Mở form để gửi thử phản hồi đầu tiên.</span>'}
        </div></td></tr>` : '';
        return `<tr>
          <td><div>${esc(s.title)}</div><div class="row" style="margin-top:4px">${s.target_role ? `<span class="tag" style="--c:var(--orange)">${esc(s.target_role)}</span>` : ''}<span class="muted">${esc(s.project_name)}</span></div></td>
          <td><div class="resp-cell"><strong>${+s.response_count || 0}</strong><button type="button" class="btn small ${isOpen ? 'tone' : 'soft'} arrow-btn" data-act="toggleResponses" data-id="${esc(s.slug)}" aria-expanded="${isOpen}" title="${isOpen ? 'Thu gọn phản hồi' : 'Xem phản hồi'}" aria-label="Xem phản hồi"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:${isOpen ? 'rotate(180deg)' : 'none'}"><path d="M4 6l4 4 4-4"/></svg></button></div></td>
          <td><code>/survey?slug=${esc(s.slug)}</code></td>
          <td><div class="row">${btn('copySlug', 'Sao chép link', 'soft small', `data-id="${esc(s.slug)}"`)}<a class="btn soft small" style="text-decoration:none" href="/survey?slug=${encodeURIComponent(s.slug)}" target="_blank" rel="noopener">Mở form</a>${btn('delSurvey', armedDeleteSlug === s.slug ? 'Bấm nữa để xóa' : 'Xóa', 'danger small', `data-id="${esc(s.slug)}"`)}</div></td>
        </tr>${detailRow}`;
      }).join('')}</tbody></table></div>`;
    }
    return `<div class="panel">${panelHead('Các link khảo sát đã publish', btn('reloadSurveys', 'Tải lại', 'soft small'))}${body}</div>`;
  }

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
      const a = p.responses.map(r => r.answers[q.id]).filter(v => Array.isArray(v) ? v.length > 0 : (v !== undefined && v !== ''));
      if (q.type === 'text') return { q: q.q, type: q.type, texts: a };
      if (q.type === 'multi') {
        const flat = a.flatMap(v => Array.isArray(v) ? v : [v]).map(String);
        return { q: q.q, type: q.type, n: a.length, avg: null, counts: q.options.map(o => [o, flat.filter(v => v === String(o)).length]) };
      }
      const opts = q.type === 'scale' ? ['1', '2', '3', '4', '5'] : q.options;
      return { q: q.q, type: q.type, n: a.length, avg: q.type === 'scale' && a.length ? a.reduce((x, y) => x + +y, 0) / a.length : null, counts: opts.map(o => [o, a.filter(v => String(v) === String(o)).length]) };
    });
  }
  function dashboard() {
    const p = S.pitch;
    if (!p.form) return '<p class="muted">Tạo form để dashboard tự xuất hiện.</p>';
    if (!p.responses.length) return '<p class="muted">Chưa có phản hồi trên máy này. Mở link đã publish để thu phản hồi thật hoặc thêm phản hồi mẫu.</p>';
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
      const ctx = pitchCtx();
      try {
        const res = await fetch('/api/v1/pitching/surveys/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ctx)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const draft = await res.json();
        S.pitch.form = draft.questions;
        S.pitch.formTitle = draft.title;
        S.pitch.formDesc = draft.description;
        S.pitch.targetRole = draft.target_role || ctx.target_role;
        S.pitch.draftSource = draft.source;
        S.pitch.publishedSlug = '';
        S.pitch.responses = [];
        S.pitch.overview = '';
        save('pitch');
        toast(draft.source === 'llm' ? 'Đã tạo form khảo sát bằng Gemini' : 'Đã tạo form khảo sát theo vai ' + (S.pitch.targetRole || 'mục tiêu'));
        return ['pitch', () => rise($$('#view .question'))];
      } catch (e) {
        toast('Không kết nối được backend để tạo form.');
        return ['pitch', () => {}];
      }
    },
    async publishSurvey() {
      if (!S.pitch.form || !S.pitch.form.length) return toast('Hãy tạo form khảo sát trước.');
      const ctx = pitchCtx();
      const cleaned = S.pitch.form.map((q, i) => ({
        id: q.id || 'q' + i,
        type: ['choice', 'multi', 'scale', 'text'].includes(q.type) ? q.type : 'text',
        q: String(q.q || '').trim() || `Câu hỏi ${i + 1}`,
        options: ['choice', 'multi'].includes(q.type) ? (q.options || []).map(x => String(x).trim()).filter(Boolean) : [],
        required: q.required !== false
      }));
      const res = await fetch('/api/v1/pitching/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: ctx.project_name,
          target_role: ctx.target_role,
          problem_context: ctx,
          title: (S.pitch.formTitle || '').trim() || ('Khảo sát: ' + ctx.project_name),
          description: (S.pitch.formDesc || '').trim(),
          questions: cleaned
        })
      });
      if (!res.ok) return toast('Không publish được form (kiểm tra lại câu hỏi và phương án).');
      const created = await res.json();
      S.pitch.publishedSlug = created.slug;
      save('pitch');
      if (Array.isArray(surveysCache)) surveysCache = [created, ...surveysCache];
      toast('Đã publish link khảo sát');
      return ['pitch', () => rise($$('#view .pub-box'))];
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
      const out = await generate('Gợi ý 3 việc cập nhật công nghệ cho sản phẩm này, không lặp các gợi ý: ' + S.maintain.tech.map(t => t.title).join('; ') + '. level là "Cao" hoặc "Vừa". Không nêu phiên bản cụ thể nếu chưa chắc.',
        '{"items":[{"title":"","why":"","level":"Vừa"}]}', o => o && Array.isArray(o.items) && o.items.length && o.items.every(t => str(t.title) && str(t.why)),
        () => ({ items: [
          { title: 'Ghi log có che thông tin cá nhân', why: 'Cần log để sửa lỗi chất lượng mà không giữ số điện thoại, địa chỉ khách.', level: 'Cao' },
          { title: 'Thêm phương án dự phòng khi model lỗi', why: 'Nhân viên vẫn trả lời được khi dịch vụ AI chậm hoặc gián đoạn.', level: 'Vừa' },
          { title: 'Đưa câu bị sửa nhiều vào bộ đánh giá', why: 'Bộ đánh giá bám sát lỗi thật hơn theo thời gian.', level: 'Vừa' }] }));
      const have = new Set(S.maintain.tech.map(t => t.title));
      const fresh = out.items.filter(t => !have.has(t.title)).slice(0, 3).map(t => ({ title: String(t.title), why: String(t.why), level: t.level === 'Cao' ? 'Cao' : 'Vừa', color: t.level === 'Cao' ? 'red' : 'orange' }));
      if (!fresh.length) toast('Chưa có gợi ý mới.');
      S.maintain.tech = [...fresh, ...S.maintain.tech].slice(0, 9); save('maintain');
      return ['maintain', () => rise($$('#view .card'))];
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
    $('#nav').innerHTML = TABS.map(t => `<button class="nav-item ${t.id === tab ? 'on' : ''}" style="--c:${t.hex}" data-act="tab" data-id="${t.id}" aria-current="${t.id === tab}"><i></i><span class="long">${t.name}</span><span class="short">${t.short}</span></button>`).join('');
  }
  function render() {
    const t = TABS.find(x => x.id === tab);
    view.style.setProperty('--c', t.hex);
    view.dataset.tab = tab;
    const desktopOverview = tab === 'overview' && !mobile.matches;
    if (desktopOverview) { overlay.innerHTML = views.overview(); view.innerHTML = ''; }
    else { view.innerHTML = views[tab](); overlay.innerHTML = ''; }
    if (tab === 'product') { $('#chatSlot').append(chat); renderChat(); }
    if (tab === 'pitching') loadPublishedSurveys();
  }
  function layout(animate) {
    const over = tab === 'overview', isMobile = mobile.matches;
    ws.classList.toggle('overview', over);
    $('#app').classList.toggle('on-overview', over);
    $('#collapseBtn').hidden = over || isMobile;
    const hidden = local.collapsed && !over && !isMobile;
    $('#reveal').hidden = !hidden;
    if (stageAnim) { stageAnim.stop(); stageAnim = null; }
    if (isMobile) {
      ws.style.removeProperty('--stage');
      const h = Math.round(innerHeight * (over ? 0.54 : 0.42));
      const from = stage.offsetHeight || h;
      if (animate && canAnim) stageAnim = M.animate(from, h, { duration: 0.8, ease: EASE, onUpdate: v => stage.style.setProperty('--sh', v + 'px') });
      else stage.style.setProperty('--sh', h + 'px');
      return;
    }
    const side = Math.min(380, Math.max(290, innerWidth * 0.26));
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
      anim($$('.ov-team > div', overlay), { opacity: [0, 1], x: [40, 0] }, { duration: 0.6, ease: EASE, delay: canAnim ? M.stagger(0.08, { startDelay: 0.9 }) : 0 });
      rise($$('.over-step', overlay), 1.1);
      anim($('#pins'), { opacity: [0, 1] }, { delay: 2.2, duration: 0.5 });
      $('#pins').style.opacity = canAnim ? 0 : 1;
    } else {
      $('#pins').style.opacity = 0;
      rise($$('#view > .view-head, #view > .mind, #view .panel, #view .over-step', view).slice(0, 14), 0.1);
    }
    anim($$('.grow', view), { scaleX: [0, 1] }, { duration: 0.8, ease: EASE, delay: 0.3 });
  }
  async function go(id) {
    if (!TABS.some(t => t.id === id) || id === tab) return;
    const n = ++going;
    closeDrawer(true);
    anim($('#pins'), { opacity: 0 }, { duration: 0.2 });
    await done(anim(tab === 'overview' && !mobile.matches ? overlay : view, { opacity: [1, 0], x: [0, -18] }, { duration: 0.2 }));
    if (n !== going) return;
    tab = id;
    renderNav();
    $('#fab').hidden = id === 'product';
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
    anim($('#floorInfo'), { opacity: [0, 1], y: [20, 0] }, { delay: 0.4, duration: 0.5 });
  }

  function initSite() {
    if (site || !window.Scenes) return;
    try {
      site = window.Scenes.site($('#progressCanvas'), STEPS.map(s => s.color), S.meta.members.map(m => color(m.color)), (pts, mode) => {
        const visible = tab === 'overview' && mode === 'house';
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
    if (local.model === 'rubik') site.mode('rubik');
    $$('[data-model]').forEach(b => b.classList.toggle('on', b.dataset.model === local.model));
  }

  let inApp = false;
  async function enter(id = 'overview') {
    if (inApp) return;
    inApp = true;
    await done(anim($('#landing'), { opacity: [1, 0], scale: [1, 1.04] }, { duration: 0.4 }));
    $('#landing').hidden = true;
    $('#app').hidden = false;
    scrollTo(0, 0);
    tab = id;
    renderTeam(); renderNav();
    $('#fab').hidden = id === 'product';
    render();
    layout(false);
    initSite();
    syncProgress();
    if (site) site.focus(id === 'overview' ? 'overview' : STEPS.findIndex(s => s.id === id));
    anim($('#app'), { opacity: [0, 1] }, { duration: 0.5 });
    rise($$('.nav-item'), 0.15);
    enterContent();
  }
  async function home() {
    closeDrawer(true);
    await done(anim($('#app'), { opacity: [1, 0] }, { duration: 0.3 }));
    inApp = false;
    $('#app').hidden = true;
    $('#landing').hidden = false;
    $('#landing').style.transform = 'none';
    scrollTo(0, 0);
    anim($('#landing'), { opacity: [0, 1] }, { duration: 0.4 });
    replay();
  }

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
    collapse() { local.collapsed = !local.collapsed; persist(); layout(true); if (!local.collapsed) anim($('#floorInfo'), { opacity: [0, 1] }, { delay: 0.4 }); },
    drawer: toggleDrawer,
    me(b) { local.me = b.dataset.id; persist(); renderChat(); anim($('.speak .me', chat), { scale: [0.6, 1] }, { type: 'spring' }); },
    quick: b => send(b.textContent),
    pickRole(b) { S.pitch.targetRole = b.dataset.id; save('pitch'); rerender(); },
    addQ() {
      if (!S.pitch.form) return;
      S.pitch.form.push({ id: 'q' + Date.now().toString(36), type: 'choice', q: 'Câu hỏi khảo sát mới', options: ['Lựa chọn 1', 'Lựa chọn 2'], required: true });
      save('pitch'); rerender();
    },
    delQ(b) {
      if (!S.pitch.form || S.pitch.form.length <= 1) return;
      S.pitch.form.splice(+b.dataset.id, 1); save('pitch'); rerender();
    },
    reloadSurveys() { loadPublishedSurveys(true); },
    async copySurveyLink() {
      if (!S.pitch.publishedSlug) return;
      try { await navigator.clipboard.writeText(location.origin + '/survey?slug=' + S.pitch.publishedSlug); toast('Đã sao chép link khảo sát'); }
      catch (e) { toast('Trình duyệt chặn sao chép, hãy copy trực tiếp trong ô link.'); }
    },
    async copySlug(b) {
      try { await navigator.clipboard.writeText(location.origin + '/survey?slug=' + b.dataset.id); toast('Đã sao chép link khảo sát'); }
      catch (e) { toast('Trình duyệt chặn sao chép, link: /survey?slug=' + b.dataset.id); }
    },
    async toggleResponses(b) {
      const slug = b.dataset.id, survey = (surveysCache || []).find(x => x.slug === slug);
      if (activeSurveyDetail && activeSurveyDetail.slug === slug) { activeSurveyDetail = null; rerender(); return; }
      if (!survey) return;
      try {
        const res = await fetch('/api/v1/pitching/surveys/' + encodeURIComponent(slug) + '/responses');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        activeSurveyDetail = { slug, survey, responses: await res.json() };
        rerender();
      } catch (e) { toast('Không tải được danh sách phản hồi.'); }
    },
    async delSurvey(b) {
      const slug = b.dataset.id;
      if (armedDeleteSlug !== slug) {
        armedDeleteSlug = slug; rerender();
        setTimeout(() => { if (armedDeleteSlug === slug) { armedDeleteSlug = ''; if (inApp && tab === 'pitching') rerender(); } }, 4000);
        return;
      }
      armedDeleteSlug = '';
      try {
        const res = await fetch('/api/v1/pitching/surveys/' + encodeURIComponent(slug), { method: 'DELETE' });
        if (!res.ok && res.status !== 204) throw new Error('HTTP ' + res.status);
        if (Array.isArray(surveysCache)) surveysCache = surveysCache.filter(x => x.slug !== slug);
        if (activeSurveyDetail && activeSurveyDetail.slug === slug) activeSurveyDetail = null;
        if (S.pitch.publishedSlug === slug) { S.pitch.publishedSlug = ''; save('pitch'); }
        rerender(); toast('Đã xóa link khảo sát');
      } catch (e) { toast('Không xóa được link khảo sát.'); }
    },
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
        S.pitch.responses.push({ sample: true, answers: Object.fromEntries(S.pitch.form.map((q, k) => [q.id, q.type === 'scale' ? String(2 + ((n * 7 + k * 3) % 4)) : q.type === 'multi' && q.options.length > 1 ? [q.options[(n + k) % q.options.length], q.options[(n + k + 1) % q.options.length]] : q.type === 'choice' ? q.options[(n * n + k) % q.options.length] : texts[(n + k) % texts.length]])) });
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
    if (kind === 'answer') {
      const answers = Object.fromEntries([...new FormData(f)].filter(([, v]) => String(v).trim()));
      if (!Object.keys(answers).length) return toast('Trả lời ít nhất một câu trước khi gửi.');
      S.pitch.responses.push({ answers }); S.pitch.overview = ''; save('pitch'); rerender(); toast('Đã gửi phản hồi');
      anim($$('.grow', view), { scaleX: [0, 1] }, { duration: 0.8, ease: EASE });
    }
  });
  function bindPitchText(t, rerenderChips) {
    const k = t.dataset.bind, id = t.dataset.id, v = t.value;
    if (k === 'targetRole') { S.pitch.targetRole = v; save('pitch'); return true; }
    if (k === 'formTitle') { S.pitch.formTitle = v; save('pitch'); return true; }
    if (k === 'formDesc') { S.pitch.formDesc = v; save('pitch'); return true; }
    if (k === 'formQ') { if (S.pitch.form && S.pitch.form[+id]) { S.pitch.form[+id].q = v; save('pitch'); } return true; }
    if (k === 'qOpts') {
      const q = S.pitch.form && S.pitch.form[+id];
      if (q) { q.options = v.split('\n').map(x => x.trim()).filter(Boolean); save('pitch'); if (rerenderChips) rerender(); }
      return true;
    }
    return false;
  }
  document.addEventListener('input', e => {
    const t = e.target;
    if (t && t.dataset && t.dataset.bind) bindPitchText(t, false);
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
    if (k === 'cost') { S.plan.cost[id] = Math.max(0, +v || 0); save('plan'); $('#kpis').innerHTML = kpis(); anim($$('#kpis b'), { opacity: [0.2, 1], y: [6, 0] }, { duration: 0.4 }); }
    if (k === 'owner' || k === 'status') { moveTasks(() => { const x = S.tasks.list.find(x => x.id === id); if (x) x[k] = v; }); save('tasks'); }
    if (k === 'mowner') { const x = S.maintain.schedule.find(x => x.id === id); if (x) x.owner = v; save('maintain'); }
    if (bindPitchText(t, true)) return;
    if (k === 'qType') {
      const q = S.pitch.form && S.pitch.form[+id];
      if (q) {
        q.type = v;
        if (['choice', 'multi'].includes(v) && (!q.options || q.options.length < 2)) q.options = ['Phương án 1', 'Phương án 2', 'Phương án 3'];
        if (!['choice', 'multi'].includes(v)) q.options = [];
        save('pitch'); rerender();
      }
    }
    if (k === 'qReq') { const q = S.pitch.form && S.pitch.form[+id]; if (q) { q.required = t.checked; save('pitch'); } }
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

  landing();
  connect().catch(() => {});
  ready.then(() => { if (inApp && tab === 'pitching') rerender(); });
})();

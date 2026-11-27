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
  const KEY = 'tang-demo-v3';
  let S = SEED();
  const local = { me: 'minh', model: 'house', collapsed: false, chartMode: 'pie' };
  let surveysCache = null, surveysLoading = false, surveysError = '', activeSurveyDetail = null, armedDeleteSlug = '';
  let dashStats = null, dashLoading = false, dashSlugSelected = '', lastDashJson = '', dashPollStarted = false;
  let editSurveyTarget = null, sideMode = '', sideSlug = '', sideTab = 'edit', selectedSurveySlug = '', deckSurveySlug = '', lastSavedSlug = '';
  let collapsedSecs = new Set(), activeSlideIdx = 0;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem('tang-demo-v2') || 'null');
    if (raw && raw.S) Object.assign(S, raw.S);
    if (raw && raw.local) Object.assign(local, raw.local);
    if (!localStorage.getItem(KEY)) {
      S.pitch.deck = null;
      S.pitch.deckShown = false;
    }
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
    if (a && a.closest('#view,#overlay,.side-panel') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { syncProgress(); return; }
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
  function pitchHasResponses() {
    return (S.pitch.responses && S.pitch.responses.length > 0) || (dashStats && dashStats.total_responses > 0);
  }
  function progress() {
    const t = S.tasks.list, p = S.pitch, sc = S.maintain.schedule;
    return [
      filled() / SCORE.length,
      0.2 * (ROLES.filter(r => S.plan.roles[r]).length / ROLES.length) + 0.8 * (t.reduce((a, x) => a + (STATUS[x.status] || [0, 0])[1], 0) / (t.length || 1)),
      [p.form, pitchHasResponses(), p.overview, p.deckShown && p.deck, p.script, p.ads].filter(Boolean).length / 6,
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
      return !p.form ? 'Tạo form khảo sát' : !pitchHasResponses() ? 'Thu phản hồi cho form' : !p.overview ? 'Tạo AI overview' : !(p.deckShown && p.deck) ? 'Tạo slide pitching' : !p.script ? 'Viết kịch bản' : !p.ads ? 'Viết bài quảng cáo' : 'Bộ pitching đã đủ';
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
      const list = Array.isArray(surveysCache) ? surveysCache : [];
      const hasSurveys = list.length > 0;
      const curDeckSlug = activeDeckSurveySlug();
      const selSurvey = list.find(x => x.slug === curDeckSlug);
      const deckSourceBox = `<div class="deck-source">
        <div class="row" style="justify-content:space-between;gap:8px">
          <label for="deckSurveySel" style="font-size:13px;font-weight:500">Chọn khảo sát đưa vào slide</label>
          ${hasSurveys ? `<select id="deckSurveySel" data-bind="deckSurveySlug" aria-label="Chọn khảo sát đưa vào slide">
            ${list.map(s => `<option value="${esc(s.slug)}" ${curDeckSlug === s.slug ? 'selected' : ''}>${esc(s.title)} (${+s.response_count || 0} phản hồi)</option>`).join('')}
            <option value="__none__" ${curDeckSlug === '__none__' ? 'selected' : ''}>Chỉ dùng Product thinking (không kèm khảo sát)</option>
          </select>` : ''}
        </div>
        <div class="muted" style="font-size:13px">${hasSurveys
          ? (selSurvey ? `Sẽ tổng hợp từ "${esc(selSurvey.title)}" (${+selSurvey.response_count || 0} phản hồi) cùng Product thinking.` : 'Chỉ dùng dữ liệu từ Product thinking & Scorecard.')
          : 'Chưa có khảo sát nào được lưu. Lưu một khảo sát ở trên để chọn đưa số liệu thật vào slide, hoặc bấm Tạo slide theo Product thinking.'}</div>
      </div>`;
      const deckVisible = !!(p.deckShown && p.deck && p.deck.length);
      if (deckVisible && activeSlideIdx >= p.deck.length) activeSlideIdx = Math.max(0, p.deck.length - 1);
      const curSlide = deckVisible ? p.deck[activeSlideIdx] : null;
      const deckBadge = p.deckSource === 'llm'
        ? '<span class="tag" style="--c:var(--green)">AI Gemini</span>'
        : p.deckSource === 'fallback'
          ? '<span class="tag">Từ dữ liệu bài toán</span>'
          : '';
      const deck = deckVisible ? `<div class="deck" tabindex="0">${p.deck.map((s, i) => `<section class="slide" style="--s:${STEPS[i % 4].hex}">${s.kicker ? `<span class="slide-kicker">${esc(s.kicker)}</span>` : ''}<h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>${s.highlight ? `<span class="slide-hl" style="--s:${STEPS[i % 4].hex}">${esc(s.highlight)}</span>` : ''}</section>`).join('')}</div>
        <div class="slide-editor">
          <div class="row" style="justify-content:space-between;gap:8px">
            <span style="font-size:13px;font-weight:500">Chỉnh nhanh slide ${activeSlideIdx + 1}/${p.deck.length} ${deckBadge}</span>
            <div class="row" style="gap:6px">
              <select data-bind="activeSlidePick" aria-label="Chọn slide để sửa">${p.deck.map((s, i) => `<option value="${i}" ${i === activeSlideIdx ? 'selected' : ''}>Slide ${i + 1}: ${esc((s.title || '').slice(0, 32))}</option>`).join('')}</select>
              ${p.deck.length < 10 ? btn('addSlide', '+ Thêm slide', 'soft small') : ''}
              ${p.deck.length > 1 ? btn('delSlide', 'Xóa slide', 'danger small') : ''}
            </div>
          </div>
          <div class="row" style="gap:8px">
            <input style="flex:1 1 160px" data-bind="slideKicker" data-id="${activeSlideIdx}" value="${esc(curSlide.kicker || '')}" placeholder="Nhãn slide (vd: Bằng chứng)">
            <input style="flex:2 1 240px" data-bind="slideTitle" data-id="${activeSlideIdx}" value="${esc(curSlide.title || '')}" placeholder="Tiêu đề slide">
          </div>
          <textarea rows="2" data-bind="slideBody" data-id="${activeSlideIdx}" placeholder="Nội dung súc tích (tối đa ~45 từ)">${esc(curSlide.body || '')}</textarea>
          <input data-bind="slideHighlight" data-id="${activeSlideIdx}" value="${esc(curSlide.highlight || '')}" placeholder="Điểm nhấn số liệu / ghi chú ngắn (tùy chọn)">
        </div>
        <div class="row" style="margin-top:10px">${btn('slide', 'Trang trước', 'soft small', 'data-n="-1"')}${btn('slide', 'Trang sau', 'soft small', 'data-n="1"')}${btn('saveDeck', p.deckSlug ? 'Lưu cập nhật slide' : 'Lưu & lấy link slide', 'primary small')}${btn('copy', 'Sao chép HTML', 'soft small', 'data-id="html"')}${btn('download', 'Tải file HTML', 'soft small')}</div>
        ${p.deckSlug ? `<div class="pub-box" style="margin-top:10px"><div><strong>Link trình chiếu công khai:</strong> <code>/pitch?slug=${esc(p.deckSlug)}</code></div><div class="row"><input readonly value="${esc(location.origin + '/pitch?slug=' + p.deckSlug)}" aria-label="Link slide">${btn('copyDeckLink', 'Sao chép link', 'tone small')}<a class="btn soft small" style="text-decoration:none" href="/pitch?slug=${encodeURIComponent(p.deckSlug)}" target="_blank" rel="noopener">Mở trang trình chiếu</a></div></div>` : ''}`
        : '<p class="muted">Chưa tạo slide. Chọn dữ liệu khảo sát ở trên rồi bấm “Tạo slide” để tạo tối đa 10 slide.</p>';
      const scriptCard = `<div class="panel">${panelHead('Pitching script', btn('script', p.script ? 'Tạo lại' : 'Tạo', 'tone small'))}${p.script ? `<textarea class="script-edit" data-bind="pitchScript" aria-label="Kịch bản pitching 3 phút">${esc(p.script)}</textarea><div class="row" style="margin-top:10px">${btn('copy', 'Sao chép kịch bản', 'soft small', 'data-id="script"')}</div>` : '<p class="muted">Kịch bản nói khoảng 3 phút, chia mốc thời gian từ bài toán & khảo sát.</p>'}</div>`;
      const mainAd = Array.isArray(p.adPosts) && p.adPosts.length ? p.adPosts[0] : null;
      const linkSurveySlug = activeTileSlug();
      const adsCard = `<div class="panel">${panelHead('Bài quảng cáo', btn('ads', mainAd || p.ads ? 'Tạo lại' : 'Tạo', 'tone small'))}${mainAd
        ? `<div class="stack" style="gap:10px">
            ${Array.isArray(mainAd.placeholders) && mainAd.placeholders.length ? `<div class="ph-row"><span class="muted">Placeholder:</span>${mainAd.placeholders.map(ph => `<span class="tag">${esc(ph)}</span>`).join('')}</div>` : ''}
            <textarea class="script-edit" data-bind="adFull" data-id="0" aria-label="Nội dung bài quảng cáo dùng chung">${esc(adFullText(mainAd))}</textarea>
            <div class="row" style="gap:8px">${linkSurveySlug ? btn('insertSurveyInAd', 'Chèn link khảo sát', 'soft small', 'data-id="0"') : ''}${btn('copyAd', 'Sao chép', 'soft small', 'data-id="0"')}</div>
          </div>`
        : p.ads
          ? `<textarea class="script-edit" data-bind="pitchAdsPlain" aria-label="Nội dung bài quảng cáo">${esc(p.ads)}</textarea><p style="margin-top:10px">${btn('copy', 'Sao chép', 'soft small', 'data-id="ads"')}</p>`
          : '<p class="muted">Một bài giới thiệu dùng chung kèm placeholder để bạn điền link và copy đăng qua các kênh.</p>'}</div>`;
      const topActions = hasSurveys
        ? `<div class="row" style="gap:8px">${btn('reloadSurveys', 'Tải lại', 'soft small')}${btn('openSelectedEdit', 'Xem khảo sát', 'soft small')}${btn('openSelectedStats', 'Dashboard', 'soft small')}${btn('copySelectedLink', 'Publish link', 'soft small')}</div>`
        : `<div class="row" style="gap:8px">${btn('reloadSurveys', 'Tải lại', 'soft small')}${btn('openCreateSurvey', 'Tạo khảo sát', 'primary small')}</div>`;
      const bottomBar = hasSurveys ? `<div class="survey-bottom">${btn('openCreateSurvey', 'Tạo khảo sát', 'primary small')}</div>` : '';
      const deckActs = `<div class="row">${deckVisible ? btn('hideDeck', 'Thu gọn slide', 'soft small') : ''}${btn('deck', deckVisible ? 'Tạo lại slide' : 'Tạo slide', 'tone small')}</div>`;
      return head(2, 'Thu bằng chứng trước, kể chuyện sau. Dashboard tự dựng từ câu trả lời.') + `<div class="stack">
        <div class="panel survey-panel">${panelHead('Khảo sát', topActions)}${publishedPanel()}${bottomBar}</div>
        <div class="panel">${panelHead('Pitching HTML', deckActs)}${deckSourceBox}${deck}</div>
        <div class="cols">${scriptCard}${adsCard}</div></div>`;
    },

    maintaining() {
      const m = S.maintain, today = iso(new Date());
      return head(3, 'Sản phẩm AI cần được canh chừng. Việc đến hạn nằm trên cùng.') + `<div class="stack">
        <div class="panel">${panelHead('Gợi ý cập nhật công nghệ', btn('tech', 'Agent gợi ý mới', 'tone small'))}<div class="cards">${m.tech.map((t, i) => `<div class="card"><span class="tag" style="--c:var(--${['red', 'orange', 'blue'].includes(t.color) ? t.color : 'blue'})">Ưu tiên ${esc(t.level)}</span><span>${esc(t.title)}</span><span class="muted">${esc(t.why)}</span>${t.added ? '<span class="muted">Đã có trong lịch</span>' : btn('schedule', 'Thêm vào lịch', 'soft small', `data-n="${i}"`)}</div>`).join('')}</div></div>
        <div class="panel">${panelHead('Lịch bảo trì')}<div class="scroll"><table><thead><tr><th>Việc</th><th>Chu kỳ</th><th>Hạn tới</th><th>Người làm</th><th></th></tr></thead><tbody>${m.schedule.slice().sort((a, b) => a.next.localeCompare(b.next)).map(x => `<tr data-row="${esc(x.id)}"><td>${esc(x.title)}<br><span class="muted">Đã làm ${+x.runs || 0} lần</span></td><td>${+x.every} ngày</td><td><span class="tag" style="--c:var(${x.next <= today ? '--red' : '--violet'})">${x.next <= today ? 'Đến hạn ' : ''}${esc(x.next.split('-').reverse().join('/'))}</span></td><td><select data-bind="mowner" data-id="${esc(x.id)}" aria-label="Người làm">${options(x.owner)}</select></td><td>${btn('ran', 'Đã làm', 'tone small', `data-id="${esc(x.id)}"`)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    }
  };

  function activeTileSlug() {
    const list = Array.isArray(surveysCache) ? surveysCache : [];
    if (selectedSurveySlug && list.some(x => x.slug === selectedSurveySlug)) return selectedSurveySlug;
    return list[0] ? list[0].slug : '';
  }
  function activeDeckSurveySlug() {
    const list = Array.isArray(surveysCache) ? surveysCache : [];
    if (deckSurveySlug === '__none__') return '__none__';
    if (deckSurveySlug && list.some(x => x.slug === deckSurveySlug)) return deckSurveySlug;
    return activeTileSlug() || '__none__';
  }
  function activeEditorTarget() {
    return sideMode === 'survey' && sideSlug && editSurveyTarget ? editSurveyTarget : S.pitch;
  }
  function persistActiveEditor() {
    if (!(sideMode === 'survey' && sideSlug)) save('pitch');
  }
  function renderRolePick(target) {
    const roleOptions = ['Học viên', 'Trợ giảng / Lab coach', 'Giảng viên / Mentor', 'Nhân viên CSKH', 'Chủ shop / Quản lý', 'Kỹ sư / Đội sản phẩm'];
    const curRole = target.targetRole || '';
    const ctx = pitchCtx();
    return `<div class="role-pick">
      <div class="row" style="justify-content:space-between">
        <span><b>Ý tưởng nhóm (từ Product thinking):</b> ${esc(ctx.project_name)}</span>
        ${btn('tab', 'Sửa ở Product thinking', 'soft small', 'data-id="product"')}
      </div>
      <div class="muted">${esc(ctx.problem || ctx.overview || 'Chưa điền Problem ở tab Product thinking — AI sẽ dùng tên dự án và chat nhóm để gợi ý.')}</div>
      <span class="muted" style="margin-top:4px">Chọn 1 đối tượng nhận form (1 Form = 1 Vai chính)</span>
      <div class="row">${roleOptions.map(r => `<button type="button" class="btn small ${curRole === r ? 'tone' : 'soft'}" data-act="pickRole" data-id="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <input data-bind="targetRole" value="${esc(curRole)}" placeholder="Hoặc nhập 1 đối tượng cụ thể (vd: Học viên lớp L3B, Người dùng thử)">
      <div class="row" style="justify-content:space-between;gap:8px;margin-top:4px">
        <span class="muted">AI lấy ý tưởng từ Product thinking + đối tượng trên để gợi ý sẵn câu hỏi.</span>
        ${btn('form', target.draftSource ? 'AI gợi ý lại' : 'AI gợi ý câu hỏi', 'tone small')}
      </div>
    </div>`;
  }
  function adFullText(ad) {
    if (typeof ad.text === 'string') return ad.text;
    return [ad.hook, ad.body, ad.cta].filter(Boolean).join('\n\n');
  }
  function secPrefix(target) {
    return target && target.slug ? target.slug : 'draft';
  }
  function secKey(target, secId) {
    return `${secPrefix(target)}:${secId}`;
  }
  function ensureSections(target) {
    if (!target) return [];
    if (!Array.isArray(target.form)) target.form = [];
    if (!Array.isArray(target.sections) || !target.sections.length) {
      target.sections = [{ id: 's0', title: 'Phần 1 · Câu hỏi chính', description: '' }];
    }
    const valid = new Set(target.sections.map(s => s.id));
    const fallbackId = target.sections[0].id;
    target.form.forEach(q => {
      if (!q.section_id || !valid.has(q.section_id)) q.section_id = fallbackId;
    });
    return target.sections;
  }
  function renderSurveyEditor(target, isEdit) {
    const ctx = pitchCtx();
    const curRole = target.targetRole || '';
    const sections = ensureSections(target);
    const questions = target.form || [];
    const sourceBadge = isEdit
      ? `<span class="tag">Đang sửa form: /survey?slug=${esc(target.slug)}</span>`
      : target.draftSource === 'llm'
        ? '<span class="tag" style="--c:var(--green)">AI Gemini gợi ý theo Product thinking</span>'
        : target.draftSource === 'fallback'
          ? '<span class="tag">Gợi ý theo ngữ cảnh dự phòng</span>'
          : '<span class="tag">Bản nháp — bấm “AI gợi ý câu hỏi” để tạo theo ý mới</span>';
    const allCollapsed = sections.every(s => collapsedSecs.has(secKey(target, s.id)));
    const secNav = `<div class="sec-nav">
      <div class="row" style="gap:6px">${sections.map((s, si) => {
        const cnt = questions.filter(q => q.section_id === s.id).length;
        const collapsed = collapsedSecs.has(secKey(target, s.id));
        return `<button type="button" class="btn small ${collapsed ? 'soft' : 'tone'}" data-act="jumpSec" data-id="${esc(s.id)}">${esc(s.title || ('Phần ' + (si + 1)))} (${cnt})</button>`;
      }).join('')}</div>
      <div class="row" style="gap:6px">${btn('toggleAllSecs', allCollapsed ? 'Mở tất cả phần' : 'Thu gọn phần', 'soft small')}${btn('addSec', '+ Thêm phần', 'soft small')}</div>
    </div>`;

    const renderOptionsArea = (q, qi) => {
      if (q.type === 'scale') {
        return `<div class="gf-scale-preview"><span>Rất ít</span><div class="gf-scale-dots">${[1, 2, 3, 4, 5].map(n => `<i>${n}</i>`).join('')}</div><span>Rất nhiều</span></div>`;
      }
      if (q.type === 'text') {
        return '<div class="gf-text-preview">Văn bản câu trả lời dài (người dùng nhập tự do)…</div>';
      }
      const icoCls = q.type === 'multi' ? 'check' : 'radio';
      const opts = q.options || [];
      return `<div class="gf-opts">${opts.map((opt, oi) => `<div class="gf-opt-row">
        <span class="gf-ico ${icoCls}" aria-hidden="true"></span>
        <input class="gf-opt-input" data-bind="qOptItem" data-id="${qi}" data-oid="${oi}" value="${esc(opt)}" placeholder="Tùy chọn ${oi + 1}" aria-label="Phương án ${oi + 1} câu ${qi + 1}">
        ${opts.length > 2 ? `<button type="button" class="gf-opt-del" data-act="delOpt" data-id="${qi}" data-oid="${oi}" title="Xóa tùy chọn" aria-label="Xóa tùy chọn">×</button>` : ''}
      </div>`).join('')}
        <button type="button" class="gf-add-opt" data-act="addOpt" data-id="${qi}"><span class="gf-ico ${icoCls}" aria-hidden="true"></span><span>Thêm tùy chọn</span></button>
      </div>`;
    };

    const renderQuestionCard = (q, i) => `<div class="gf-q-card" data-q-card="${i}">
      <div class="gf-q-top">
        <input class="gf-q-input" data-bind="formQ" data-id="${i}" value="${esc(q.q)}" placeholder="Nhập nội dung câu hỏi" aria-label="Nội dung câu ${i + 1}">
        <select class="gf-q-select" data-bind="qType" data-id="${i}" aria-label="Loại câu ${i + 1}">
          <option value="choice" ${q.type === 'choice' ? 'selected' : ''}>Trắc nghiệm</option>
          <option value="multi" ${q.type === 'multi' ? 'selected' : ''}>Hộp kiểm (chọn nhiều)</option>
          <option value="scale" ${q.type === 'scale' ? 'selected' : ''}>Thang đo 1–5</option>
          <option value="text" ${q.type === 'text' ? 'selected' : ''}>Đoạn trả lời</option>
        </select>
        ${sections.length > 1 ? `<select class="gf-q-select" data-bind="qSec" data-id="${i}" aria-label="Phần của câu ${i + 1}">${sections.map((sec, si) => `<option value="${esc(sec.id)}" ${q.section_id === sec.id ? 'selected' : ''}>${esc(sec.title || ('Phần ' + (si + 1)))}</option>`).join('')}</select>` : ''}
      </div>
      ${renderOptionsArea(q, i)}
      <div class="gf-q-foot">
        <div class="row" style="gap:6px">
          ${btn('insertQAfter', '+ Câu bên dưới', 'soft small', `data-id="${i}"`)}
          ${btn('dupQ', 'Nhân bản', 'soft small', `data-id="${i}"`)}
          ${i > 0 ? btn('moveQ', '↑', 'soft small', `data-id="${i}" data-n="-1" title="Đưa câu lên"`) : ''}
          ${i < questions.length - 1 ? btn('moveQ', '↓', 'soft small', `data-id="${i}" data-n="1" title="Đưa câu xuống"`) : ''}
        </div>
        <div class="row" style="gap:10px">
          ${questions.length > 1 ? btn('delQ', 'Xóa', 'soft small', `data-id="${i}"`) : ''}
          <label class="gf-switch"><span>Bắt buộc</span><input type="checkbox" data-bind="qReq" data-id="${i}" ${q.required !== false ? 'checked' : ''}><i></i></label>
        </div>
      </div>
    </div>`;

    const sectionBlocks = sections.map((sec, si) => {
      const items = questions.map((q, qi) => ({ q, qi })).filter(item => item.q.section_id === sec.id);
      const isCollapsed = collapsedSecs.has(secKey(target, sec.id));
      return `<div class="gf-sec-group" id="sec-${esc(sec.id)}" data-sec-box="${esc(sec.id)}">
        <div class="gf-sec-pill"><span>Phần ${si + 1} trên ${sections.length}</span><span>· ${items.length} câu</span></div>
        <div class="gf-sec-card">
          <div class="sec-head">
            <button type="button" class="btn small ${isCollapsed ? 'soft' : 'tone'} arrow-btn" data-act="toggleSec" data-id="${esc(sec.id)}" aria-expanded="${!isCollapsed}" title="${isCollapsed ? 'Mở phần này để sửa' : 'Thu gọn phần này'}" aria-label="Thu gọn hoặc mở phần">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:${isCollapsed ? 'rotate(-90deg)' : 'none'}"><path d="M4 6l4 4 4-4"/></svg>
            </button>
            <input data-bind="secTitle" data-id="${esc(sec.id)}" value="${esc(sec.title)}" placeholder="Tiêu đề phần (vd: Bối cảnh người dùng)" aria-label="Tên section ${si + 1}">
            ${si > 0 ? btn('moveSec', '↑', 'soft small', `data-id="${esc(sec.id)}" data-n="-1" title="Đưa phần lên"`) : ''}
            ${si < sections.length - 1 ? btn('moveSec', '↓', 'soft small', `data-id="${esc(sec.id)}" data-n="1" title="Đưa phần xuống"`) : ''}
            ${btn('addQ', '+ Câu hỏi', 'soft small', `data-sec="${esc(sec.id)}"`)}
            ${sections.length > 1 ? btn('delSec', 'Xóa phần', 'danger small', `data-id="${esc(sec.id)}"`) : ''}
          </div>
          ${isCollapsed
            ? `<div class="muted" style="font-size:13px">Đang thu gọn ${items.length} câu hỏi · bấm mũi tên hoặc thanh Phần phía trên để mở sửa nhanh.</div>`
            : `<input class="gf-desc" data-bind="secDesc" data-id="${esc(sec.id)}" value="${esc(sec.description || '')}" placeholder="Mô tả phần (không bắt buộc)" aria-label="Mô tả phần ${si + 1}">`}
        </div>
        ${isCollapsed ? '' : `<div class="gf-sec-list">${items.length ? items.map(({ q, qi }) => renderQuestionCard(q, qi)).join('') : '<div class="gf-q-card"><span class="muted">Phần này chưa có câu hỏi. Bấm “+ Câu hỏi” để thêm.</span></div>'}</div>`}
      </div>`;
    }).join('');

    const rail = `<aside class="gf-rail" aria-label="Thanh công cụ tạo biểu mẫu">
      <button type="button" class="gf-rail-btn" data-act="addQ" title="Thêm câu hỏi" aria-label="Thêm câu hỏi"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></button>
      <button type="button" class="gf-rail-btn" data-act="addSec" title="Thêm phần (Section)" aria-label="Thêm phần"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/></svg></button>
      <button type="button" class="gf-rail-btn" data-act="toggleAllSecs" title="${allCollapsed ? 'Mở tất cả phần' : 'Thu gọn tất cả phần'}" aria-label="Thu gọn hoặc mở tất cả phần"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10l5 5 5-5"/></svg></button>
      <button type="button" class="gf-rail-btn" data-act="form" title="AI gợi ý câu hỏi theo đối tượng & Product thinking" aria-label="AI gợi ý câu hỏi"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8z"/></svg></button>
    </aside>`;

    const footerBtns = isEdit
      ? `${btn('addSec', '+ Thêm section', 'soft small')}${btn('addQ', '+ Thêm câu hỏi', 'soft small')}${btn('saveEdit', 'Lưu', 'primary small')}`
      : `${btn('addSec', '+ Thêm section', 'soft small')}${btn('addQ', '+ Thêm câu hỏi', 'soft small')}${btn('publishSurvey', 'Lưu', 'primary small')}`;
    const showSlug = isEdit && (lastSavedSlug === target.slug || target.slug);
    const linkBox = isEdit && showSlug && lastSavedSlug === target.slug
      ? `<div class="pub-box"><div><strong>Đã lưu &amp; có link khảo sát:</strong> <code>/survey?slug=${esc(target.slug)}</code></div><div class="row"><input readonly value="${esc(location.origin + '/survey?slug=' + target.slug)}" aria-label="Link công khai">${btn('copySlug', 'Sao chép link', 'tone small', `data-id="${esc(target.slug)}"`)}<a class="btn soft small" style="text-decoration:none" href="/survey?slug=${encodeURIComponent(target.slug)}" target="_blank" rel="noopener">Mở trang khảo sát</a></div></div>`
      : '';

    return `<div class="stack" style="gap:10px;margin-top:10px">
      ${secNav}
      <div class="gf-wrap">
        <div class="gf-col">
          <div class="gf-head-card">
            <div class="row">${curRole ? `<span class="tag" style="--c:var(--orange)">Đối tượng: ${esc(curRole)}</span>` : ''}${sourceBadge}</div>
            <input class="gf-title" data-bind="formTitle" value="${esc(target.formTitle || ('Khảo sát: ' + ctx.project_name))}" placeholder="Tiêu đề biểu mẫu chưa có tên" aria-label="Tiêu đề form">
            <input class="gf-desc" data-bind="formDesc" value="${esc(target.formDesc || '')}" placeholder="Mô tả biểu mẫu (không bắt buộc)" aria-label="Lời giới thiệu">
          </div>
          ${sectionBlocks}
        </div>
        ${rail}
      </div>
      <div class="gf-foot-bar"><div class="row">${footerBtns}</div></div>
      ${linkBox}
    </div>`;
  }

  const CHART_COLORS = ['#ff8a1f', '#0a9cf0', '#14b86a', '#4d5bf0', '#a24ce8', '#ff4d5e'];
  function pitchCtx() {
    const t = activeEditorTarget();
    const role = (t.targetRole || S.pitch.targetRole || '').trim();
    const chatNotes = (S.chat || []).filter(m => m.who !== 'agent').slice(-4).map(m => m.text).join(' | ');
    return {
      project_name: (sideMode === 'survey' && editSurveyTarget && editSurveyTarget.project_name) || S.meta.name || 'Sản phẩm mới',
      target_role: role,
      persona: score('persona') || role,
      problem: score('problem'),
      leverage: score('leverage'),
      scope: score('scope'),
      metric: score('metric'),
      overview: S.plan.overview || chatNotes || ''
    };
  }
  function activeDashSlug() {
    const list = Array.isArray(surveysCache) ? surveysCache : [];
    if (dashSlugSelected && (dashSlugSelected === S.pitch.publishedSlug || list.some(x => x.slug === dashSlugSelected))) {
      return dashSlugSelected;
    }
    if (S.pitch.publishedSlug) return S.pitch.publishedSlug;
    return list[0] ? list[0].slug : '';
  }
  function ensureDashPolling() {
    if (dashPollStarted) return;
    dashPollStarted = true;
    setInterval(() => {
      if (inApp && tab === 'pitching' && document.visibilityState === 'visible') refreshDashStats(false);
    }, 3000);
    addEventListener('focus', () => { if (inApp && tab === 'pitching') { loadPublishedSurveys(true); refreshDashStats(false); } });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && inApp && tab === 'pitching') { loadPublishedSurveys(true); refreshDashStats(false); }
    });
  }
  async function refreshDashStats(force = false) {
    ensureDashPolling();
    const slug = activeDashSlug();
    if (!slug) { dashStats = null; lastDashJson = ''; return; }
    if (dashLoading && !force) return;
    dashLoading = true;
    try {
      const res = await fetch('/api/v1/pitching/surveys/' + encodeURIComponent(slug) + '/stats');
      if (!res.ok) {
        if (res.status === 404) { dashStats = null; lastDashJson = ''; }
        dashLoading = false;
        return;
      }
      const data = await res.json();
      const snap = JSON.stringify({ slug: data.slug, total: data.total_responses, qs: data.questions });
      if (force || snap !== lastDashJson || !dashStats || dashStats.slug !== slug) {
        const switchedSurvey = !dashStats || dashStats.slug !== slug || (dashStats.total_responses === 0) !== (data.total_responses === 0);
        lastDashJson = snap;
        dashStats = data;
        if (Array.isArray(surveysCache)) {
          const row = surveysCache.find(x => x.slug === slug);
          if (row && row.response_count !== data.total_responses) {
            row.response_count = data.total_responses;
            const cntEl = $(`[data-resp-count="${slug}"]`);
            if (cntEl) cntEl.textContent = String(data.total_responses);
          }
        }
        if (inApp && tab === 'pitching' && switchedSurvey && sideSlug && sideTab === 'stats') {
          renderSidePanel();
          anim($$('.grow', $('#dashBody') || view), { scaleX: [0, 1] }, { duration: 0.45, ease: EASE });
        } else {
          const box = $('#dashBody');
          if (box && inApp && tab === 'pitching') {
            box.innerHTML = dashboard();
            anim($$('.grow', box), { scaleX: [0, 1] }, { duration: 0.45, ease: EASE });
          }
          syncProgress();
        }
      }
    } catch (e) { /* bỏ qua khi tạm mất mạng trong lúc polling */ }
    dashLoading = false;
  }
  async function loadPublishedSurveys(force = false) {
    ensureDashPolling();
    if (surveysLoading || (!force && surveysCache !== null)) {
      if (surveysCache !== null && !dashStats) refreshDashStats(false);
      return;
    }
    surveysLoading = true; surveysError = '';
    try {
      const res = await fetch('/api/v1/pitching/surveys');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      surveysCache = await res.json();
    } catch (e) { surveysError = 'Chưa tải được danh sách link đã publish từ backend.'; }
    surveysLoading = false;
    await refreshDashStats(false);
    if (inApp && tab === 'pitching') refresh();
  }
  function publishedPanel() {
    const list = surveysCache;
    if (surveysLoading && !list) return '<div class="survey-box"><p class="muted">Đang tải danh sách khảo sát…</p></div>';
    if (surveysError) return `<div class="survey-box"><p class="muted">${esc(surveysError)}</p></div>`;
    if (!list || !list.length) return '<div class="survey-box survey-empty"><p class="muted">Chưa có khảo sát nào được tạo. Bấm “Tạo khảo sát” để bắt đầu.</p></div>';
    const curSel = activeTileSlug();
    return `<div class="survey-grid">${list.map(s => `<button type="button" class="survey-tile${(sideSlug || curSel) === s.slug ? ' on' : ''}" data-act="openSurveySide" data-id="${esc(s.slug)}">
      <span class="survey-tile-title">${esc(s.title)}</span>
      <span class="survey-tile-meta">
        ${s.target_role ? `<span class="tag" style="--c:var(--orange)">${esc(s.target_role)}</span>` : ''}
        <span class="muted"><b data-resp-count="${esc(s.slug)}">${+s.response_count || 0}</b> phản hồi</span>
      </span>
    </button>`).join('')}</div>`;
  }

  function kpis() {
    const c = Object.fromEntries(Object.entries(S.plan.cost).map(([k, v]) => [k, +v || 0]));
    const perShop = c.tickets * (c.inTok * c.priceIn + c.outTok * c.priceOut) / 1e6;
    const ai = perShop * c.teams, cost = ai + c.infra, rev = c.teams * c.price, margin = c.price - perShop;
    const n = x => Math.round(x).toLocaleString('vi-VN') + ' USD';
    return [['Chi phí AI/tháng', n(ai)], ['Tổng chi/tháng', n(cost)], ['Doanh thu/tháng', n(rev)], ['Lãi gộp/tháng', n(rev - cost)],
      ['Hòa vốn hạ tầng', margin > 0 ? Math.ceil(c.infra / margin) + ' shop' : 'Không đạt']].map(k => `<div class="kpi"><b>${k[1]}</b><span>${k[0]}</span></div>`).join('');
  }
  function activeDashboardData() {
    const slug = activeDashSlug();
    if (slug && dashStats && dashStats.slug === slug) return dashStats;
    const p = S.pitch;
    const rows = p.responses || [];
    const samples = rows.filter(r => r.sample).length;
    const questions = (p.form || []).map(q => {
      const a = rows.map(r => r.answers[q.id]).filter(v => Array.isArray(v) ? v.length > 0 : (v !== undefined && v !== ''));
      if (q.type === 'text') return { id: q.id, type: q.type, q: q.q, answered: a.length, avg: null, options: [], texts: a.map(String).slice(-10).reverse() };
      const opts = q.type === 'scale' ? ['1', '2', '3', '4', '5'] : (q.options || []);
      const flat = q.type === 'multi' ? a.flatMap(v => Array.isArray(v) ? v : [v]).map(String) : a.map(String);
      const avg = q.type === 'scale' && a.length ? Math.round((a.reduce((x, y) => x + +y, 0) / a.length) * 100) / 100 : null;
      return {
        id: q.id, type: q.type, q: q.q, answered: a.length, avg,
        options: opts.map(o => {
          const count = flat.filter(v => v === String(o)).length;
          return { label: String(o), count, pct: a.length ? Math.round((count / a.length) * 1000) / 10 : 0 };
        }),
        texts: []
      };
    });
    return {
      slug: '', title: p.formTitle || S.meta.name, target_role: p.targetRole || '',
      total_responses: rows.length, real_responses: rows.length - samples, sample_responses: samples,
      last_response_at: null, questions
    };
  }
  function stats() {
    return activeDashboardData().questions.map(q => q.type === 'text'
      ? { q: q.q, type: q.type, texts: q.texts }
      : { q: q.q, type: q.type, n: q.answered, avg: q.avg, counts: q.options.map(o => [o.label, o.count, o.pct]) });
  }
  function renderDonutSVG(options, answered, avg) {
    const cx = 78, cy = 78, R = 68, r = 40, Rm = 54;
    const total = options.reduce((s, o) => s + o.count, 0);
    if (!answered || !total) {
      return `<svg class="pie-svg" viewBox="0 0 156 156" role="img" aria-label="Chưa có dữ liệu"><circle cx="${cx}" cy="${cy}" r="${Rm}" fill="none" stroke="#edf0f8" stroke-width="28"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#626d8c" font-size="13">0 lượt</text></svg>`;
    }
    const indexed = options.map((o, i) => ({ o, col: CHART_COLORS[i % CHART_COLORS.length] })).filter(x => x.o.count > 0);
    let paths = '';
    if (indexed.length === 1) {
      const { o, col } = indexed[0];
      paths = `<circle cx="${cx}" cy="${cy}" r="${Rm}" fill="none" stroke="${col}" stroke-width="28"><title>${esc(o.label)}: ${o.count} (${o.pct}%)</title></circle>
        <text x="${cx}" y="${cy - Rm}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="11" font-weight="600">${Math.round(o.pct)}%</text>`;
    } else {
      let a = -Math.PI / 2;
      paths = indexed.map(({ o, col }) => {
        const slice = (o.count / total) * Math.PI * 2;
        const a2 = a + slice;
        const ox1 = cx + R * Math.cos(a), oy1 = cy + R * Math.sin(a);
        const ox2 = cx + R * Math.cos(a2), oy2 = cy + R * Math.sin(a2);
        const ix2 = cx + r * Math.cos(a2), iy2 = cy + r * Math.sin(a2);
        const ix1 = cx + r * Math.cos(a), iy1 = cy + r * Math.sin(a);
        const large = slice > Math.PI ? 1 : 0;
        const mid = a + slice / 2;
        const lx = cx + Rm * Math.cos(mid), ly = cy + Rm * Math.sin(mid);
        a = a2;
        const d = `M ${ox1.toFixed(2)} ${oy1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)} L ${ix2.toFixed(2)} ${iy2.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`;
        const lbl = o.pct >= 10 ? `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="11" font-weight="600">${Math.round(o.pct)}%</text>` : '';
        return `<path d="${d}" fill="${col}" stroke="#fff" stroke-width="2"><title>${esc(o.label)}: ${o.count} (${o.pct}%)</title></path>${lbl}`;
      }).join('');
    }
    const sub = avg !== null && avg !== undefined ? `TB ${avg.toFixed(1)}/5` : 'lượt';
    return `<svg class="pie-svg" viewBox="0 0 156 156" role="img" aria-label="Biểu đồ tròn phân bố câu trả lời">
      ${paths}
      <text x="${cx}" y="${cy - 7}" text-anchor="middle" dominant-baseline="central" fill="#121a33" font-size="20" font-weight="500">${answered}</text>
      <text x="${cx}" y="${cy + 13}" text-anchor="middle" dominant-baseline="central" fill="#626d8c" font-size="11">${sub}</text>
    </svg>`;
  }
  function renderLegend(options) {
    return `<div class="legend">${options.map((o, i) => `<div class="legend-row">
      <i class="swatch" style="--s:${CHART_COLORS[i % CHART_COLORS.length]}"></i>
      <span>${esc(o.label)}</span>
      <span class="legend-val"><b>${o.pct}%</b> <span class="muted">(${o.count})</span></span>
    </div>`).join('')}</div>`;
  }
  function renderBarChart(options) {
    return `<div>${options.map((o, i) => {
      const col = CHART_COLORS[i % CHART_COLORS.length];
      return `<div class="hbar">
        <span class="bar-lbl"><i class="swatch" style="--s:${col}"></i><span>${esc(o.label)}</span></span>
        <div class="bar"><span class="grow" style="width:${Math.min(100, o.pct)}%;background:${col}"></span></div>
        <span class="legend-val"><b>${o.pct}%</b> <span class="muted">(${o.count})</span></span>
      </div>`;
    }).join('')}</div>`;
  }
  function dashboard() {
    const slug = activeDashSlug(), list = Array.isArray(surveysCache) ? surveysCache : [];
    const data = activeDashboardData();
    const selector = list.length ? `<div class="dash-meta">
      <div class="row" style="gap:8px;flex:1;min-width:0">
        <span class="muted">Đang xem:</span>
        <select data-bind="dashSlug" aria-label="Chọn form xem thống kê">${list.map(s => `<option value="${esc(s.slug)}" ${s.slug === slug ? 'selected' : ''}>${esc(s.title)} (${s.response_count})</option>`).join('')}</select>
      </div>
      <span class="live-pill"><i></i>Tự cập nhật</span>
    </div>` : '';
    if (!data.questions.length) return selector + '<p class="muted">Tạo form hoặc chọn link đã publish để dashboard tự xuất hiện.</p>';
    if (!data.total_responses) return selector + '<p class="muted">Chưa có phản hồi nào. Hãy mở link công khai điền thử (dashboard sẽ tự động cập nhật) hoặc bấm “Thêm 8 phản hồi mẫu”.</p>';

    const sampleNote = data.sample_responses > 0 && data.real_responses === 0
      ? '<span class="tag" style="--c:var(--orange)">Chỉ mới là dữ liệu mẫu</span>'
      : `<span class="tag" style="--c:var(--green)">Thật: ${data.real_responses} · Mẫu: ${data.sample_responses}</span>`;

    const charts = data.questions.map((q, qi) => {
      const avgTag = q.avg !== null && q.avg !== undefined ? `<span class="tag" style="--c:var(--orange)">TB ${q.avg.toFixed(1)}/5</span>` : '';
      const countTag = `<span class="tag">${q.answered} lượt</span>`;
      if (q.type === 'text') {
        return `<div class="question">
          <div class="row" style="justify-content:space-between"><span>${qi + 1}. ${esc(q.q)}</span>${countTag}</div>
          ${q.texts.length ? q.texts.slice(0, 5).map(t => `<div class="dash-quote">“${esc(t)}”</div>`).join('') : '<span class="muted">Chưa có câu trả lời chữ.</span>'}
        </div>`;
      }
      if (!q.answered) {
        return `<div class="question"><div class="row" style="justify-content:space-between"><span>${qi + 1}. ${esc(q.q)}</span>${countTag}</div><span class="muted">Chưa có dữ liệu trả lời câu này.</span></div>`;
      }
      const useBar = local.chartMode === 'bar' || q.type === 'multi';
      const multiNote = q.type === 'multi' && local.chartMode !== 'bar' ? '<span class="muted">Câu chọn nhiều: hiển thị cột (% trên số người trả lời)</span>' : '';
      const body = useBar ? renderBarChart(q.options) : `<div class="pie-wrap">${renderDonutSVG(q.options, q.answered, q.avg)}${renderLegend(q.options)}</div>`;
      return `<div class="question">
        <div class="row" style="justify-content:space-between"><span>${qi + 1}. ${esc(q.q)}</span><div class="row">${avgTag}${countTag}</div></div>
        ${multiNote}${body}
      </div>`;
    }).join('');

    return selector + `<div class="kpis" style="margin:0 0 8px"><div class="kpi" style="--c:var(--orange)"><b>${data.total_responses}</b><span>Tổng phản hồi ${sampleNote}</span></div></div>` + charts;
  }
  function deckHTML() {
    const slides = (S.pitch.deck || []).map((s, i) => `<section style="--s:${STEPS[i % 4].hex}">${s.kicker ? `<small>${esc(s.kicker)}</small>` : ''}<h1>${esc(s.title)}</h1><p>${esc(s.body)}</p>${s.highlight ? `<div class="hl">${esc(s.highlight)}</div>` : ''}</section>`).join('\n');
    return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(S.pitch.deckTitle || S.meta.name)}</title><style>*{box-sizing:border-box;font-style:normal}body{margin:0;font-family:"Familjen Grotesk","Be Vietnam Pro",Arial,sans-serif;color:#121a33;background:#fff;scroll-snap-type:y mandatory;overflow-y:auto;height:100vh}section{height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:8vw;border-bottom:6px solid var(--s)}small{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#626d8c}h1{font-weight:400;font-size:clamp(30px,5vw,60px);margin:0;letter-spacing:-0.03em}p{font-size:clamp(17px,2vw,26px);font-weight:300;line-height:1.6;max-width:32em;white-space:pre-wrap;margin:0}.hl{align-self:flex-start;background:#eef2ff;padding:6px 14px;border-radius:999px;font-size:14px}</style></head><body>\n${slides}\n</body></html>`;
  }

  /* ---------- Hành động của agent ---------- */
  const score = k => S.score[k].text.trim();
  function normalizeQuestionsPayload(list) {
    return (list || []).map((q, i) => ({
      id: q.id || 'q' + i,
      section_id: q.section_id || '',
      type: ['choice', 'multi', 'scale', 'text'].includes(q.type) ? q.type : 'text',
      q: String(q.q || '').trim() || `Câu hỏi ${i + 1}`,
      options: ['choice', 'multi'].includes(q.type) ? (q.options || []).map(x => String(x).trim()).filter(Boolean) : [],
      required: q.required !== false
    }));
  }
  function normalizeSectionsPayload(target) {
    return ensureSections(target).map((s, i) => ({
      id: s.id || 's' + i,
      title: String(s.title || '').trim() || `Phần ${i + 1}`,
      description: String(s.description || '').trim()
    }));
  }
  function buildSurveyPayload(target, ctx) {
    const sections = normalizeSectionsPayload(target);
    return {
      project_name: ctx.project_name,
      target_role: (target.targetRole || ctx.target_role || '').trim(),
      problem_context: ctx,
      title: (target.formTitle || '').trim() || ('Khảo sát: ' + ctx.project_name),
      description: (target.formDesc || '').trim(),
      sections,
      questions: normalizeQuestionsPayload(target.form)
    };
  }
  function toEditTarget(survey) {
    return {
      slug: survey.slug,
      project_name: survey.project_name,
      targetRole: survey.target_role || '',
      formTitle: survey.title || '',
      formDesc: survey.description || '',
      sections: JSON.parse(JSON.stringify(survey.sections || [])),
      form: JSON.parse(JSON.stringify(survey.questions || []))
    };
  }
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
      const t = activeEditorTarget();
      try {
        const res = await fetch('/api/v1/pitching/surveys/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ctx)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const draft = await res.json();
        t.sections = draft.sections || [];
        t.form = draft.questions;
        t.formTitle = draft.title;
        t.formDesc = draft.description;
        t.targetRole = draft.target_role || ctx.target_role;
        t.draftSource = draft.source;
        const prefix = secPrefix(t) + ':';
        [...collapsedSecs].filter(k => k.startsWith(prefix)).forEach(k => collapsedSecs.delete(k));
        if (t === S.pitch) {
          S.pitch.publishedSlug = '';
          S.pitch.responses = [];
          S.pitch.overview = '';
          save('pitch');
        }
        toast(draft.source === 'llm' ? 'Đã tạo form khảo sát bằng Gemini' : 'Đã tạo form khảo sát theo vai ' + (t.targetRole || 'mục tiêu'));
        return ['pitch', () => rise($$('.gf-q-card', editorRoot()))];
      } catch (e) {
        toast('Không kết nối được backend để tạo form.');
        return ['pitch', () => {}];
      }
    },
    async publishSurvey() {
      const t = activeEditorTarget();
      if (!t.form || !t.form.length) {
        toast('Hãy tạo form khảo sát trước.');
        return ['pitch', () => {}];
      }
      const ctx = pitchCtx();
      const res = await fetch('/api/v1/pitching/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSurveyPayload(t, ctx))
      });
      if (!res.ok) {
        toast('Không publish được form (kiểm tra lại câu hỏi và phương án).');
        return ['pitch', () => {}];
      }
      const created = await res.json();
      S.pitch.publishedSlug = created.slug;
      selectedSurveySlug = created.slug;
      deckSurveySlug = created.slug;
      dashSlugSelected = created.slug;
      dashStats = null;
      lastDashJson = '';
      sideMode = 'survey';
      sideSlug = created.slug;
      sideTab = 'edit';
      lastSavedSlug = created.slug;
      editSurveyTarget = toEditTarget(created);
      save('pitch');
      if (Array.isArray(surveysCache)) surveysCache = [created, ...surveysCache];
      refreshDashStats(true);
      toast('Đã lưu khảo sát & tạo link');
      return ['pitch', () => rise($$('.pub-box', sidePanel))];
    },
    async saveEdit() {
      if (sideMode !== 'survey' || !sideSlug || !editSurveyTarget || !editSurveyTarget.slug) {
        toast('Chưa chọn khảo sát để lưu.');
        return ['pitch', () => {}];
      }
      if (!editSurveyTarget.form || !editSurveyTarget.form.length) {
        toast('Form cần ít nhất 1 câu hỏi.');
        return ['pitch', () => {}];
      }
      const ctx = pitchCtx();
      const res = await fetch('/api/v1/pitching/surveys/' + encodeURIComponent(editSurveyTarget.slug), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSurveyPayload(editSurveyTarget, ctx))
      });
      if (!res.ok) {
        toast('Không lưu được thay đổi (kiểm tra lại câu hỏi và phương án).');
        return ['pitch', () => {}];
      }
      const updated = await res.json();
      editSurveyTarget = toEditTarget(updated);
      lastSavedSlug = updated.slug;
      if (Array.isArray(surveysCache)) {
        surveysCache = surveysCache.map(x => x.slug === updated.slug ? updated : x);
      }
      if (activeSurveyDetail && activeSurveyDetail.slug === updated.slug) {
        activeSurveyDetail.survey = updated;
      }
      if (dashSlugSelected === updated.slug) {
        dashStats = null;
        lastDashJson = '';
        refreshDashStats(true);
      }
      toast('Đã lưu khảo sát & cập nhật link');
      return ['pitch', () => rise($$('.pub-box', sidePanel))];
    },
    async summary() {
      try {
        const res = await fetch('/api/v1/pitching/overview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: pitchCtx(), survey_slug: activeDashSlug() })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const out = await res.json();
        S.pitch.overview = out.overview;
        save('pitch');
        toast(out.source === 'llm' ? 'Đã phân tích phản hồi bằng Gemini' : 'Đã tổng hợp tóm tắt từ số liệu');
        return ['pitch', () => rise($$('.prose'))];
      } catch (e) {
        toast('Không kết nối được backend để phân tích phản hồi.');
        return ['pitch', () => {}];
      }
    },
    async deck() {
      const selSlug = activeDeckSurveySlug();
      try {
        const res = await fetch('/api/v1/pitching/decks/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: pitchCtx(), survey_slug: selSlug === '__none__' ? '' : selSlug, slide_count: 7 })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const draft = await res.json();
        S.pitch.deck = (draft.slides || []).slice(0, 10);
        S.pitch.deckTitle = draft.title || ('Pitching: ' + S.meta.name);
        S.pitch.deckSource = draft.source;
        S.pitch.deckSlug = '';
        S.pitch.deckShown = true;
        activeSlideIdx = 0;
        save('pitch');
        toast(draft.source === 'llm' ? 'Đã tạo bộ slide Pitching bằng Gemini' : 'Đã tạo bộ slide từ ý tưởng & số liệu');
        return ['pitch', () => anim($('#view .deck'), { opacity: [0, 1], scale: [0.94, 1] }, { duration: 0.6, ease: EASE })];
      } catch (e) {
        toast('Không kết nối được backend để tạo slide.');
        return ['pitch', () => {}];
      }
    },
    async saveDeck() {
      if (!S.pitch.deck || !S.pitch.deck.length) {
        toast('Hãy tạo slide trước khi lưu.');
        return ['pitch', () => {}];
      }
      const selSlug = activeDeckSurveySlug();
      const body = {
        project_name: S.meta.name || 'Sản phẩm AI',
        survey_slug: selSlug === '__none__' ? '' : selSlug,
        title: (S.pitch.deckTitle || '').trim() || ('Pitching: ' + S.meta.name),
        slides: S.pitch.deck.slice(0, 10).map((s, i) => ({
          id: s.id || 's' + i,
          kicker: String(s.kicker || '').trim(),
          title: String(s.title || '').trim() || `Slide ${i + 1}`,
          body: String(s.body || '').trim() || 'Cần bổ sung nội dung.',
          highlight: String(s.highlight || '').trim()
        })),
        script: S.pitch.script || '',
        ads: (S.pitch.adPosts || []).map((ad, i) => ({
          id: ad.id || 'ad' + i,
          channel: ad.channel || 'Kênh ' + (i + 1),
          hook: ad.hook || '',
          body: adFullText(ad),
          cta: ad.cta || '',
          placeholders: ad.placeholders || []
        }))
      };
      const existing = S.pitch.deckSlug;
      const res = await fetch(existing ? '/api/v1/pitching/decks/' + encodeURIComponent(existing) : '/api/v1/pitching/decks', {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        toast('Không lưu được bộ slide (kiểm tra tiêu đề và nội dung từng slide).');
        return ['pitch', () => {}];
      }
      const saved = await res.json();
      S.pitch.deckSlug = saved.slug;
      S.pitch.deck = saved.slides;
      S.pitch.deckTitle = saved.title;
      save('pitch');
      toast('Đã lưu bộ slide & tạo link trình chiếu');
      return ['pitch', () => rise($$('#view .pub-box'))];
    },
    async script() {
      const selSlug = activeDeckSurveySlug();
      try {
        const res = await fetch('/api/v1/pitching/assets/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: pitchCtx(), survey_slug: selSlug === '__none__' ? '' : selSlug })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const out = await res.json();
        S.pitch.script = out.script;
        if (!Array.isArray(S.pitch.adPosts) || !S.pitch.adPosts.length) S.pitch.adPosts = out.ads || [];
        save('pitch');
        toast(out.source === 'llm' ? 'Đã viết kịch bản pitching bằng Gemini' : 'Đã tạo kịch bản theo mẫu bài toán');
        return ['pitch', () => rise($$('#view .script-edit'))];
      } catch (e) {
        toast('Không kết nối được backend để tạo kịch bản.');
        return ['pitch', () => {}];
      }
    },
    async ads() {
      const selSlug = activeDeckSurveySlug();
      try {
        const res = await fetch('/api/v1/pitching/assets/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: pitchCtx(), survey_slug: selSlug === '__none__' ? '' : selSlug })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const out = await res.json();
        S.pitch.adPosts = (out.ads || []).slice(0, 1).map(ad => ({ ...ad, text: adFullText(ad) }));
        S.pitch.ads = S.pitch.adPosts.length ? adFullText(S.pitch.adPosts[0]) : '';
        if (!S.pitch.script) S.pitch.script = out.script;
        save('pitch');
        toast(out.source === 'llm' ? 'Đã tạo bài quảng cáo kèm placeholder bằng Gemini' : 'Đã tạo bài quảng cáo kèm placeholder');
        return ['pitch', () => rise($$('#view [data-bind="adFull"]'))];
      } catch (e) {
        toast('Không kết nối được backend để tạo bài quảng cáo.');
        return ['pitch', () => {}];
      }
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
    if (tab === 'pitching') { loadPublishedSurveys(); renderSidePanel(); }
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
    closeSurveySide(true);
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
    closeSurveySide(true);
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

  const sideWrap = document.createElement('div');
  sideWrap.className = 'side-wrap';
  sideWrap.hidden = true;
  sideWrap.innerHTML = '<div class="side-backdrop" data-act="closeSurveySide"></div><aside class="side-panel" role="dialog" aria-modal="true" aria-label="Tạo, xem và sửa khảo sát"></aside>';
  document.body.append(sideWrap);
  const sidePanel = $('.side-panel', sideWrap);
  function editorRoot() {
    return (sideMode === 'create' || (sideMode === 'survey' && sideTab === 'edit')) ? sidePanel : view;
  }
  function closeSurveySide(instant) {
    sideMode = '';
    sideSlug = '';
    editSurveyTarget = null;
    armedDeleteSlug = '';
    if (sideWrap.hidden) return;
    const a = instant ? null : anim(sidePanel, { x: [0, -760] }, { duration: 0.24, ease: 'easeIn' });
    done(a).then(() => { sideWrap.hidden = true; sidePanel.innerHTML = ''; });
    if (instant) { sideWrap.hidden = true; sidePanel.innerHTML = ''; }
    if (inApp && tab === 'pitching') rerender();
  }
  function renderSidePanel() {
    if (!sideMode) {
      sideWrap.hidden = true;
      sidePanel.innerHTML = '';
      return;
    }
    const prevBody = $('.side-body', sidePanel);
    const sy = prevBody ? prevBody.scrollTop : 0;
    if (sideMode === 'create') {
      const p = S.pitch;
      sideWrap.hidden = false;
      sidePanel.innerHTML = `<div class="side-head">
        <div style="min-width:0;flex:1 1 220px">
          <h3>Tạo khảo sát mới</h3>
          <div class="muted" style="font-size:13px;margin-top:4px">Chọn đối tượng từ Product thinking, AI gợi ý sẵn rồi chỉnh theo kiểu Google Forms và bấm Lưu.</div>
        </div>
        <div class="row" style="gap:6px">${btn('form', p.draftSource ? 'AI gợi ý lại' : 'AI gợi ý câu hỏi', 'tone small')}${btn('closeSurveySide', 'Đóng', 'soft small')}</div>
      </div>
      <div class="side-body">
        ${renderRolePick(p)}
        ${p.form ? renderSurveyEditor(p, false) : '<p class="muted">Chọn đối tượng ở trên rồi bấm “AI gợi ý câu hỏi”.</p>'}
      </div>`;
      const newBody = $('.side-body', sidePanel);
      if (newBody && sy) newBody.scrollTop = sy;
      return;
    }
    if (!sideSlug || !editSurveyTarget) {
      sideWrap.hidden = true;
      sidePanel.innerHTML = '';
      return;
    }
    const surveyObj = (surveysCache || []).find(x => x.slug === sideSlug) || editSurveyTarget;
    const respCount = +surveyObj.response_count || (dashStats && dashStats.slug === sideSlug ? dashStats.total_responses : 0);
    const dashToggle = `<div class="seg" role="group" aria-label="Kiểu biểu đồ">
      <button type="button" data-chart="pie" class="${local.chartMode === 'bar' ? '' : 'on'}">Biểu đồ tròn</button>
      <button type="button" data-chart="bar" class="${local.chartMode === 'bar' ? 'on' : ''}">Biểu đồ cột</button>
    </div>`;
    const hasResp = pitchHasResponses();
    let bodyHtml = '';
    if (sideTab === 'edit') {
      bodyHtml = `${renderRolePick(editSurveyTarget)}${renderSurveyEditor(editSurveyTarget, true)}`;
    } else if (sideTab === 'stats') {
      bodyHtml = `<div class="panel">${panelHead('Dashboard', `<div class="row">${dashToggle}${btn('seed', 'Thêm 8 phản hồi mẫu', 'soft small')}</div>`)}<div id="dashBody">${dashboard()}</div></div>
        <div class="panel">${panelHead('AI overview từ form', hasResp ? btn('summary', S.pitch.overview ? 'Phân tích lại' : 'Phân tích phản hồi', 'tone small') : '')}${S.pitch.overview ? `<div class="prose">${esc(S.pitch.overview)}</div>` : `<p class="muted">${hasResp ? 'Bấm phân tích để agent tóm tắt tín hiệu và việc nên làm tiếp.' : 'Cần ít nhất một phản hồi.'}</p>`}</div>`;
    } else {
      const rows = activeSurveyDetail && activeSurveyDetail.slug === sideSlug ? activeSurveyDetail.responses : null;
      bodyHtml = !rows
        ? '<p class="muted">Đang tải phản hồi…</p>'
        : !rows.length
          ? '<p class="muted">Chưa có phản hồi nào cho khảo sát này. Sao chép link gửi thử hoặc vào tab Dữ liệu để thêm dữ liệu mẫu.</p>'
          : `<div class="resp-drawer">${rows.map(r => `<div class="resp-item"><div class="row" style="justify-content:space-between"><strong>${esc(r.respondent_role || editSurveyTarget.targetRole || 'Ẩn danh')}</strong><span class="muted">${esc((r.created_at || '').slice(0, 16).replace('T', ' '))}${r.is_sample ? ' · Mẫu' : ''}</span></div>
            ${(editSurveyTarget.form || []).map(q => { const a = (r.answers || {})[q.id]; return `<div><span class="muted">${esc(q.q)}:</span> ${esc(Array.isArray(a) ? a.join(' · ') : (a || '—'))}</div>`; }).join('')}</div>`).join('')}</div>`;
    }
    sideWrap.hidden = false;
    sidePanel.innerHTML = `<div class="side-head">
      <div style="min-width:0;flex:1 1 220px">
        <h3>${esc(editSurveyTarget.formTitle || surveyObj.title || sideSlug)}</h3>
        <div class="row" style="margin-top:6px;gap:6px">${editSurveyTarget.targetRole ? `<span class="tag" style="--c:var(--orange)">${esc(editSurveyTarget.targetRole)}</span>` : ''}<span class="muted">/survey?slug=${esc(sideSlug)}</span></div>
      </div>
      <div class="row" style="gap:6px">
        ${btn('copySlug', 'Publish link', 'soft small', `data-id="${esc(sideSlug)}"`)}
        ${btn('delSurvey', armedDeleteSlug === sideSlug ? 'Bấm nữa để xóa' : 'Xóa', 'danger small', `data-id="${esc(sideSlug)}"`)}
        ${btn('closeSurveySide', 'Đóng', 'soft small')}
      </div>
    </div>
    <div class="side-tabs">
      ${btn('setSideTab', 'Xem & sửa', (sideTab === 'edit' ? 'tone' : 'soft') + ' small', 'data-id="edit"')}
      ${btn('setSideTab', 'Dữ liệu & Dashboard', (sideTab === 'stats' ? 'tone' : 'soft') + ' small', 'data-id="stats"')}
      ${btn('setSideTab', `Phản hồi (${respCount})`, (sideTab === 'responses' ? 'tone' : 'soft') + ' small', 'data-id="responses"')}
    </div>
    <div class="side-body">${bodyHtml}</div>`;
    const newBody = $('.side-body', sidePanel);
    if (newBody && sy) newBody.scrollTop = sy;
  }
  async function openSideForSlug(slug, nextTab = 'edit') {
    if (!slug) return toast('Chưa có khảo sát nào.');
    let survey = Array.isArray(surveysCache) ? surveysCache.find(x => x.slug === slug) : null;
    if (!survey) {
      try {
        const res = await fetch('/api/v1/pitching/surveys/' + encodeURIComponent(slug));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        survey = await res.json();
      } catch (e) { toast('Không tải được nội dung khảo sát.'); return; }
    }
    const wasClosed = !sideMode;
    selectedSurveySlug = slug;
    sideMode = 'survey';
    sideSlug = slug;
    sideTab = nextTab;
    lastSavedSlug = '';
    editSurveyTarget = toEditTarget(survey);
    dashSlugSelected = slug;
    dashStats = null;
    lastDashJson = '';
    rerender();
    if (wasClosed) anim(sidePanel, { x: [-760, 0] }, { type: 'spring', stiffness: 280, damping: 30 });
    if (nextTab === 'stats') refreshDashStats(true);
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
    openCreateSurvey() {
      const wasClosed = !sideMode;
      sideMode = 'create';
      sideSlug = '';
      editSurveyTarget = null;
      lastSavedSlug = '';
      rerender();
      if (wasClosed) anim(sidePanel, { x: [-760, 0] }, { type: 'spring', stiffness: 280, damping: 30 });
    },
    openSelectedEdit() { openSideForSlug(activeTileSlug(), 'edit'); },
    openSelectedStats() { openSideForSlug(activeTileSlug(), 'stats'); },
    async copySelectedLink() {
      const slug = activeTileSlug();
      if (!slug) return toast('Chưa có khảo sát nào để sao chép link.');
      const url = location.origin + '/survey?slug=' + slug;
      try { await navigator.clipboard.writeText(url); toast('Đã sao chép link khảo sát: /survey?slug=' + slug); }
      catch (e) { toast('Link khảo sát: /survey?slug=' + slug); }
    },
    async openSurveySide(b) { openSideForSlug(b.dataset.id, 'edit'); },
    closeSurveySide() { closeSurveySide(false); },
    hideDeck() { S.pitch.deckShown = false; save('pitch'); rerender(); },
    async setSideTab(b) {
      const next = b.dataset.id;
      if (!['edit', 'stats', 'responses'].includes(next)) return;
      sideTab = next;
      if (next === 'stats') {
        dashSlugSelected = sideSlug;
        rerender();
        refreshDashStats(true);
        return;
      }
      if (next === 'responses' && sideSlug) {
        rerender();
        try {
          const res = await fetch('/api/v1/pitching/surveys/' + encodeURIComponent(sideSlug) + '/responses');
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const surveyObj = (surveysCache || []).find(x => x.slug === sideSlug) || editSurveyTarget;
          activeSurveyDetail = { slug: sideSlug, survey: surveyObj, responses: await res.json() };
          renderSidePanel();
        } catch (e) { toast('Không tải được danh sách phản hồi.'); }
        return;
      }
      rerender();
    },
    pickRole(b) { activeEditorTarget().targetRole = b.dataset.id; persistActiveEditor(); rerender(); },
    addSec() {
      const t = activeEditorTarget();
      const secs = ensureSections(t);
      if (secs.length >= 8) return toast('Tối đa 8 section trong một form.');
      const id = 's' + Date.now().toString(36);
      secs.push({ id, title: `Phần ${secs.length + 1} · Chủ đề mới`, description: '' });
      collapsedSecs.delete(secKey(t, id));
      persistActiveEditor();
      rerender();
      const inp = $(`[data-bind="secTitle"][data-id="${id}"]`, editorRoot());
      if (inp) { inp.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); inp.focus(); inp.select(); }
    },
    delSec(b) {
      const t = activeEditorTarget(), secs = ensureSections(t), id = b.dataset.id;
      if (secs.length <= 1) return toast('Form cần ít nhất 1 section.');
      const idx = secs.findIndex(s => s.id === id);
      if (idx < 0) return;
      secs.splice(idx, 1);
      const fallback = secs[Math.min(idx, secs.length - 1)].id;
      (t.form || []).forEach(q => { if (q.section_id === id) q.section_id = fallback; });
      collapsedSecs.delete(secKey(t, id));
      persistActiveEditor();
      rerender();
      toast('Đã xóa phần (câu hỏi được chuyển sang phần lân cận)');
    },
    moveSec(b) {
      const t = activeEditorTarget(), secs = ensureSections(t), id = b.dataset.id, delta = +b.dataset.n || 0;
      const idx = secs.findIndex(s => s.id === id), next = idx + delta;
      if (idx < 0 || next < 0 || next >= secs.length) return;
      [secs[idx], secs[next]] = [secs[next], secs[idx]];
      persistActiveEditor();
      rerender();
    },
    toggleSec(b) {
      const t = activeEditorTarget(), key = secKey(t, b.dataset.id);
      if (collapsedSecs.has(key)) collapsedSecs.delete(key);
      else collapsedSecs.add(key);
      rerender();
    },
    toggleAllSecs() {
      const t = activeEditorTarget(), secs = ensureSections(t);
      const all = secs.every(s => collapsedSecs.has(secKey(t, s.id)));
      secs.forEach(s => { const k = secKey(t, s.id); if (all) collapsedSecs.delete(k); else collapsedSecs.add(k); });
      rerender();
    },
    jumpSec(b) {
      const t = activeEditorTarget(), id = b.dataset.id;
      collapsedSecs.delete(secKey(t, id));
      rerender();
      const box = $(`#sec-${id}`, editorRoot());
      if (box) box.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    },
    addQ(b) {
      const t = activeEditorTarget();
      const secs = ensureSections(t);
      const secId = (b && b.dataset && b.dataset.sec) || secs[0].id;
      collapsedSecs.delete(secKey(t, secId));
      t.form.push({ id: 'q' + Date.now().toString(36), section_id: secId, type: 'choice', q: 'Câu hỏi khảo sát mới', options: ['Tùy chọn 1', 'Tùy chọn 2'], required: true });
      persistActiveEditor(); rerender();
    },
    insertQAfter(b) {
      const t = activeEditorTarget(), idx = +b.dataset.id, cur = t.form && t.form[idx];
      if (!cur) return;
      t.form.splice(idx + 1, 0, { id: 'q' + Date.now().toString(36), section_id: cur.section_id || 's0', type: 'choice', q: 'Câu hỏi mới', options: ['Tùy chọn 1', 'Tùy chọn 2'], required: true });
      persistActiveEditor(); rerender();
    },
    dupQ(b) {
      const t = activeEditorTarget(), idx = +b.dataset.id, cur = t.form && t.form[idx];
      if (!cur) return;
      if ((t.form || []).length >= 10) return toast('Tối đa 10 câu hỏi trong một form.');
      const copy = JSON.parse(JSON.stringify(cur));
      copy.id = 'q' + Date.now().toString(36);
      t.form.splice(idx + 1, 0, copy);
      persistActiveEditor(); rerender();
    },
    moveQ(b) {
      const t = activeEditorTarget(), idx = +b.dataset.id, delta = +b.dataset.n || 0, next = idx + delta;
      if (!t.form || idx < 0 || next < 0 || next >= t.form.length) return;
      const moved = t.form[idx], target = t.form[next];
      if (target && target.section_id) moved.section_id = target.section_id;
      [t.form[idx], t.form[next]] = [t.form[next], t.form[idx]];
      persistActiveEditor(); rerender();
    },
    addOpt(b) {
      const t = activeEditorTarget(), q = t.form && t.form[+b.dataset.id];
      if (!q) return;
      if (!Array.isArray(q.options)) q.options = [];
      if (q.options.length >= 6) return toast('Tối đa 6 tùy chọn mỗi câu.');
      q.options.push('Tùy chọn ' + (q.options.length + 1));
      persistActiveEditor(); rerender();
      const all = $$(`[data-bind="qOptItem"][data-id="${b.dataset.id}"]`, editorRoot());
      const last = all[all.length - 1];
      if (last) { last.focus(); last.select(); }
    },
    delOpt(b) {
      const t = activeEditorTarget(), q = t.form && t.form[+b.dataset.id];
      if (!q || !Array.isArray(q.options) || q.options.length <= 2) return toast('Câu trắc nghiệm cần ít nhất 2 tùy chọn.');
      q.options.splice(+b.dataset.oid, 1);
      persistActiveEditor(); rerender();
    },
    delQ(b) {
      const t = activeEditorTarget();
      if (!t.form || t.form.length <= 1) return;
      t.form.splice(+b.dataset.id, 1); persistActiveEditor(); rerender();
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
        if (editSurveyTarget && editSurveyTarget.slug === slug) { editSurveyTarget = null; }
        if (sideSlug === slug) { sideMode = ''; sideSlug = ''; sideWrap.hidden = true; sidePanel.innerHTML = ''; }
        if (selectedSurveySlug === slug) selectedSurveySlug = '';
        if (deckSurveySlug === slug) deckSurveySlug = '';
        if (lastSavedSlug === slug) lastSavedSlug = '';
        if (S.pitch.publishedSlug === slug) { S.pitch.publishedSlug = ''; save('pitch'); }
        if (dashSlugSelected === slug) dashSlugSelected = '';
        if (dashStats && dashStats.slug === slug) { dashStats = null; lastDashJson = ''; }
        rerender(); refreshDashStats(true); toast('Đã xóa link khảo sát');
      } catch (e) { toast('Không xóa được link khảo sát.'); }
    },
    reset(b) {
      if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); b.textContent = db ? 'Bấm lần nữa: đặt lại cho cả đội' : 'Bấm lần nữa để đặt lại'; setTimeout(() => { b.textContent = 'Đặt lại demo'; }, 4000); return; }
      S = SEED(); resetArmed = 0; b.textContent = 'Đặt lại demo';
      save(...Object.keys(S)); renderTeam(); renderChat(); rerender(); enterContent(); toast('Đã đặt lại dữ liệu demo');
    },
    dot(b) { const s = S.score[b.dataset.id], n = +b.dataset.n; s.score = s.score === n ? n - 1 : n; save('score'); rerender(); anim($$(`.score[data-key="${b.dataset.id}"] .dots .on`, view), { scaleY: [2.2, 1] }, { type: 'spring', delay: canAnim ? M.stagger(0.04) : 0 }); },
    story() { S.plan.stories.push('Là ..., tôi muốn ... để ...'); save('plan'); rerender(); const all = $$('[data-bind="story"]', view), last = all[all.length - 1]; rise([last]); last.focus(); last.select(); },
    async seed(b) {
      const slug = activeDashSlug();
      if (slug) {
        if (b) b.disabled = true;
        try {
          const res = await fetch('/api/v1/pitching/surveys/' + encodeURIComponent(slug) + '/samples', { method: 'POST' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          lastDashJson = JSON.stringify({ slug: data.slug, total: data.total_responses, qs: data.questions });
          dashStats = data;
          S.pitch.overview = '';
          save('pitch');
          if (Array.isArray(surveysCache)) {
            const row = surveysCache.find(x => x.slug === slug);
            if (row) row.response_count = data.total_responses;
          }
          rerender();
          anim($$('.grow', $('#dashBody') || view), { scaleX: [0, 1] }, { duration: 0.7, ease: EASE, delay: canAnim ? M.stagger(0.04) : 0 });
          toast('Đã thêm 8 phản hồi mẫu để thử biểu đồ');
        } catch (e) { toast('Không thêm được phản hồi mẫu.'); }
        finally { if (b) b.disabled = false; }
        return;
      }
      const texts = ['Sợ trả lời sai chính sách', 'Ngại cài đặt phức tạp', 'Giá phải rẻ', 'Lo lộ thông tin khách', 'Chưa tin AI viết tự nhiên'];
      for (let i = 0; i < 8; i++) {
        const n = S.pitch.responses.length;
        S.pitch.responses.push({ sample: true, answers: Object.fromEntries(S.pitch.form.map((q, k) => [q.id, q.type === 'scale' ? String(2 + ((n * 7 + k * 3) % 4)) : q.type === 'multi' && q.options.length > 1 ? [q.options[(n + k) % q.options.length], q.options[(n + k + 1) % q.options.length]] : q.type === 'choice' ? q.options[(n * n + k) % q.options.length] : texts[(n + k) % texts.length]])) });
      }
      S.pitch.responses = S.pitch.responses.slice(-200); S.pitch.overview = ''; save('pitch'); rerender();
      anim($$('.grow', view), { scaleX: [0, 1] }, { duration: 0.8, ease: EASE, delay: canAnim ? M.stagger(0.04) : 0 });
    },
    slide(b) {
      const d = $('.deck', view);
      const len = (S.pitch.deck || []).length;
      if (!len) return;
      activeSlideIdx = Math.max(0, Math.min(len - 1, activeSlideIdx + (+b.dataset.n || 0)));
      if (d) d.scrollBy({ left: +b.dataset.n * (d.clientWidth + 12), behavior: reduced ? 'auto' : 'smooth' });
      rerender();
      const d2 = $('.deck', view);
      if (d2) d2.scrollLeft = activeSlideIdx * (d2.clientWidth + 12);
    },
    addSlide() {
      if (!Array.isArray(S.pitch.deck) || S.pitch.deck.length >= 10) return toast('Tối đa 10 slide trong một bộ.');
      S.pitch.deck.push({ id: 's' + Date.now().toString(36), kicker: 'Mục mới', title: `Slide ${S.pitch.deck.length + 1}`, body: 'Nhập nội dung ngắn gọn cho slide này.', highlight: '' });
      activeSlideIdx = S.pitch.deck.length - 1;
      save('pitch'); rerender();
      const d2 = $('.deck', view);
      if (d2) d2.scrollLeft = activeSlideIdx * (d2.clientWidth + 12);
    },
    delSlide() {
      if (!Array.isArray(S.pitch.deck) || S.pitch.deck.length <= 1) return toast('Bộ slide cần ít nhất 1 slide.');
      S.pitch.deck.splice(activeSlideIdx, 1);
      activeSlideIdx = Math.max(0, Math.min(activeSlideIdx, S.pitch.deck.length - 1));
      save('pitch'); rerender();
    },
    async copyDeckLink() {
      if (!S.pitch.deckSlug) return;
      try { await navigator.clipboard.writeText(location.origin + '/pitch?slug=' + S.pitch.deckSlug); toast('Đã sao chép link trình chiếu'); }
      catch (e) { toast('Link slide: /pitch?slug=' + S.pitch.deckSlug); }
    },
    async copyAd(b) {
      const ad = S.pitch.adPosts && S.pitch.adPosts[+b.dataset.id];
      if (!ad) return;
      try { await navigator.clipboard.writeText(adFullText(ad)); toast('Đã sao chép bài ' + ad.channel); }
      catch (e) { toast('Trình duyệt chặn sao chép.'); }
    },
    async copyAllAds() {
      const text = (S.pitch.adPosts || []).map(ad => `【${ad.channel}】\n${adFullText(ad)}`).join('\n\n---\n\n');
      if (!text) return;
      try { await navigator.clipboard.writeText(text); toast('Đã sao chép tất cả bài quảng cáo'); }
      catch (e) { toast('Trình duyệt chặn sao chép.'); }
    },
    insertSurveyInAd(b) {
      const slug = activeTileSlug();
      const ad = S.pitch.adPosts && S.pitch.adPosts[+b.dataset.id];
      if (!slug || !ad) return;
      const url = location.origin + '/survey?slug=' + slug;
      let txt = adFullText(ad);
      txt = /\/survey\?slug=\S+|\[[^\]]*(link|khảo sát|dùng thử)[^\]]*\]/i.test(txt)
        ? txt.replace(/\/survey\?slug=\S+|\[[^\]]*(link|khảo sát|dùng thử)[^\]]*\]/gi, url)
        : txt + '\n\n' + url;
      ad.text = txt;
      save('pitch'); rerender(); toast('Đã chèn link khảo sát vào bài ' + ad.channel);
    },
    async copy(b) {
      const text = b.dataset.id === 'html' ? deckHTML() : S.pitch[b.dataset.id];
      try { await navigator.clipboard.writeText(text); toast('Đã sao chép'); } catch (e) { toast('Trình duyệt chặn sao chép. Hãy bôi đen văn bản để chép tay.'); }
    },
    async download() {
      const html = deckHTML();
      if (downloads) {
        try { await downloads.save({ filename: 'pitching.html', data: html }); toast('Đã tải pitching.html'); return; } catch (e) { /* thử tải trực tiếp qua Blob */ }
      }
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = (S.pitch.deckSlug || 'pitching') + '.html'; a.click();
      URL.revokeObjectURL(url);
      toast('Đã tải pitching.html');
    },
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
    const chartBtn = e.target.closest('[data-chart]');
    if (chartBtn) {
      local.chartMode = chartBtn.dataset.chart === 'bar' ? 'bar' : 'pie';
      persist();
      $$('[data-chart]').forEach(btnEl => btnEl.classList.toggle('on', btnEl.dataset.chart === local.chartMode));
      const box = $('#dashBody');
      if (box) {
        box.innerHTML = dashboard();
        anim($$('.grow', box), { scaleX: [0, 1] }, { duration: 0.45, ease: EASE });
      }
      return;
    }
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
    const target = activeEditorTarget();
    if (k === 'targetRole') { target.targetRole = v; persistActiveEditor(); return true; }
    if (k === 'formTitle') { target.formTitle = v; persistActiveEditor(); return true; }
    if (k === 'formDesc') { target.formDesc = v; persistActiveEditor(); return true; }
    if (k === 'secTitle' || k === 'secDesc') {
      const sec = ensureSections(target).find(s => s.id === id);
      if (sec) {
        sec[k === 'secTitle' ? 'title' : 'description'] = v;
        persistActiveEditor();
        if (k === 'secTitle' && rerenderChips) rerender();
      }
      return true;
    }
    if (k === 'formQ') { if (target.form && target.form[+id]) { target.form[+id].q = v; persistActiveEditor(); } return true; }
    if (k === 'qOptItem') {
      const q = target.form && target.form[+id];
      const oi = +t.dataset.oid;
      if (q && Array.isArray(q.options) && oi >= 0) { q.options[oi] = v; persistActiveEditor(); }
      return true;
    }
    if (k === 'qOpts') {
      const q = target.form && target.form[+id];
      if (q) { q.options = v.split('\n').map(x => x.trim()).filter(Boolean); persistActiveEditor(); if (rerenderChips) rerender(); }
      return true;
    }
    if (k === 'pitchScript') { S.pitch.script = v; save('pitch'); return true; }
    if (k === 'pitchAdsPlain') { S.pitch.ads = v; save('pitch'); return true; }
    if (k === 'adFull') {
      const ad = S.pitch.adPosts && S.pitch.adPosts[+id];
      if (ad) { ad.text = v; S.pitch.ads = adFullText(ad); save('pitch'); }
      return true;
    }
    if (k === 'slideKicker' || k === 'slideTitle' || k === 'slideBody' || k === 'slideHighlight') {
      const s = S.pitch.deck && S.pitch.deck[+id];
      if (s) {
        const field = { slideKicker: 'kicker', slideTitle: 'title', slideBody: 'body', slideHighlight: 'highlight' }[k];
        s[field] = v;
        save('pitch');
        const deckCards = $$('#view .deck .slide');
        const card = deckCards[+id];
        if (card) {
          if (field === 'title' && $('h3', card)) $('h3', card).textContent = v;
          if (field === 'body' && $('p', card)) $('p', card).textContent = v;
        }
      }
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
      const target = activeEditorTarget();
      const q = target.form && target.form[+id];
      if (q) {
        q.type = v;
        if (['choice', 'multi'].includes(v) && (!q.options || q.options.length < 2)) q.options = ['Phương án 1', 'Phương án 2', 'Phương án 3'];
        if (!['choice', 'multi'].includes(v)) q.options = [];
        persistActiveEditor(); rerender();
      }
    }
    if (k === 'qSec') { const target = activeEditorTarget(); const q = target.form && target.form[+id]; if (q) { q.section_id = v; persistActiveEditor(); rerender(); } }
    if (k === 'qReq') { const target = activeEditorTarget(); const q = target.form && target.form[+id]; if (q) { q.required = t.checked; persistActiveEditor(); } }
    if (k === 'dashSlug') { dashSlugSelected = v; dashStats = null; lastDashJson = ''; refreshDashStats(true); }
    if (k === 'deckSurveySlug') { deckSurveySlug = v; rerender(); }
    if (k === 'activeSlidePick') {
      activeSlideIdx = +v || 0;
      rerender();
      const d2 = $('.deck', view);
      if (d2) d2.scrollLeft = activeSlideIdx * (d2.clientWidth + 12);
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeSurveySide(); } });
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

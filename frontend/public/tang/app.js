/* Ứng dụng: điều hướng, bốn bước, agent, dữ liệu dùng chung và chuyển động. */
(function () {
  const { STEPS, FLOORS, CANVAS, CANVAS_TO_SCORE, SCORE, ROLES, STATUS, SAMPLE_SCORE, EMPTY, SEED, AGENT, inDays, iso } = window.DATA;
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
  // Motion báo xong rồi mới ghi giá trị cuối vào style ở khung hình kế tiếp. Chờ thêm khung đó, nếu không nó đè lên style đặt sau done().
  const done = a => (a ? Promise.resolve(a.finished || a).catch(() => {}).then(() => new Promise(r => requestAnimationFrame(r))) : Promise.resolve());
  const rise = (els, base = 0) => anim(els, { opacity: [0, 1], y: [18, 0] }, { duration: 0.5, ease: EASE, delay: canAnim ? M.stagger(0.06, { startDelay: base }) : 0 });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- Dữ liệu ---------- */
  /* Chế độ xem mock đầy đủ: /workstation?demo=full. Dữ liệu mẫu trong bộ nhớ, không đọc hay ghi trình duyệt. */
  const mockMode = new URLSearchParams(location.search).get('demo') === 'full';
  const BLANK = mockMode ? SEED : EMPTY;
  const KEY = 'tang-v4';
  const SERVER = ['quality', 'maintain']; // hai phần này đọc và ghi trên server theo đội
  let S = BLANK();
  const local = { me: mockMode ? 'minh' : '', model: 'house', collapsed: false, chartMode: 'pie' };
  let surveysCache = null, surveysLoading = false, surveysError = '', activeSurveyDetail = null, armedDeleteSlug = '';
  let dashStats = null, dashLoading = false, dashSlugSelected = '', lastDashJson = '', dashPollStarted = false;
  let editSurveyTarget = null, sideMode = '', sideSlug = '', sideTab = 'edit', selectedSurveySlug = '', deckSurveySlug = '', lastSavedSlug = '';
  let collapsedSecs = new Set(), activeSlideIdx = 0;
  /* Bản lưu của giao diện cũ trộn dữ liệu mẫu với phần đội tự nhập: chỉ giữ phần khác mẫu. Khóa cũ vẫn còn nguyên. */
  function fromLegacy(old) {
    const seed = SEED(), same = (a, b) => JSON.stringify(a) === JSON.stringify(b), out = {};
    if (old.done) out.done = old.done;
    if (old.meta && old.meta.name !== seed.meta.name) out.meta = { name: old.meta.name, members: [] };
    if (old.score) out.score = Object.assign(EMPTY().score, Object.fromEntries(Object.entries(old.score).filter(([k, v]) => v && v.text !== (SAMPLE_SCORE[k] || [])[0])));
    if (Array.isArray(old.chat)) out.chat = old.chat.filter(m => !seed.chat.some(x => same(x, m)));
    if (old.pitch) out.pitch = Object.assign(EMPTY().pitch, Object.fromEntries(Object.entries(old.pitch).filter(([k, v]) => !same(v, seed.pitch[k]))), { deck: null, deckShown: false });
    return out;
  }
  if (!mockMode) {
    try {
      let raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw) {
        const old = JSON.parse(localStorage.getItem('tang-demo-v3') || localStorage.getItem('tang-demo-v2') || 'null');
        if (old) raw = { S: old.S && fromLegacy(old.S), local: Object.assign({}, old.local, { me: '' }) };
      }
      if (raw && raw.S) ['meta', 'done', 'score', 'chat', 'plan', 'tasks', 'pitch'].forEach(k => { if (raw.S[k]) S[k] = raw.S[k]; });
      if (raw && raw.local) Object.assign(local, raw.local);
    } catch (e) { /* bộ nhớ trình duyệt không dùng được */ }
  }
  /* Bổ sung các trường còn thiếu của dữ liệu đọc từ trình duyệt hoặc server. */
  function migrate() {
    const blank = EMPTY();
    ['meta', 'plan', 'tasks', 'pitch', 'quality', 'maintain'].forEach(k => { S[k] = Object.assign(blank[k], S[k]); });
    S.meta.members = Array.isArray(S.meta.members) ? S.meta.members : [];
    if (!S.quality.cost || typeof S.quality.cost !== 'object') S.quality.cost = {};
    if (!['sub', 'usage', 'setup'].includes(S.quality.revenueModel)) S.quality.revenueModel = 'sub';
    ['metrics', 'runs'].forEach(k => { if (!Array.isArray(S.quality[k])) S.quality[k] = []; });
    S.quality.runs = S.quality.runs.filter(r => r && typeof r === 'object');
    S.quality.runs.forEach(r => { if (!r.values || typeof r.values !== 'object') r.values = {}; });
    ['schedule', 'suggest'].forEach(k => { if (!Array.isArray(S.maintain[k])) S.maintain[k] = []; });
  }
  migrate();
  if (!local.think || !local.think.session) local.think = { session: 'th-' + Math.random().toString(36).slice(2, 10), msgs: [] };
  const tk = { run: null, busy: false, offline: false, loaded: false, introDone: false };
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
  let db = null, canWrite = true;
  const synced = {}, dirty = new Set(), writing = new Set();
  let saveTimer;
  function persist() {
    if (mockMode) return;
    const kept = Object.fromEntries(Object.entries(S).filter(([k]) => !SERVER.includes(k)));
    try { localStorage.setItem(KEY, JSON.stringify({ S: db ? undefined : kept, local })); } catch (e) { /* bỏ qua */ }
  }
  function save(...sections) {
    if (mockMode) return;
    persist();
    sections.filter(k => SERVER.includes(k)).forEach(pushWorkspace);
    if (db && canWrite) {
      sections.filter(k => !SERVER.includes(k)).forEach(k => dirty.add(k));
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
      } catch (e) { /* chưa đọc được quyền: thử ghi, bị từ chối thì chuyển sang chỉ xem */ }
    }
    db.collection('tang').onSnapshot(snap => {
      let changed = false;
      snap.docs.forEach(doc => {
        const k = doc.id, json = doc.data() && doc.data().json;
        if (SERVER.includes(k) || !(k in S) || typeof json !== 'string' || json === synced[k] || dirty.has(k) || writing.has(k)) return;
        try {
          const value = JSON.parse(json), seed = BLANK()[k];
          if (!value || typeof value !== 'object' || Array.isArray(value) !== Array.isArray(seed)) return;
          S[k] = Array.isArray(seed) ? value : Object.assign(seed, value);
          synced[k] = json;
          changed = true;
        } catch (e) { /* bỏ qua tài liệu hỏng */ }
      });
      if (changed) { migrate(); refresh(); }
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
    if (!m) return '<span class="av" title="Chưa giao">?</span>';
    // Thành viên hiện bằng avatar 3D đã chọn trong hồ sơ ở Planning; dữ liệu demo không có hồ sơ thì lấy theo thứ tự.
    const look = m.look ?? S.meta.members.indexOf(m) % window.TangAvatar.names.length;
    return `<span class="member-face ${cls}" title="${esc(m.name)}" role="img" aria-label="${esc(m.name)}">${personAvatar({ avatar: look })}</span>`;
  };
  const options = (sel, empty = 'Chưa giao') => `<option value="">${empty}</option>` +
    S.meta.members.map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

  /* ---------- Planning: dữ liệu thật từ server ---------- */
  const PLANNING_API = '/api/v1/planning';
  const TONES = ['var(--green)', 'var(--indigo)', 'var(--orange)', 'var(--blue)'];

  // live: undefined = đang tải, null = chưa đọc được, object = trả lời của GET /state
  let live, boardPending = 0, boardStale = false, boardRound = 0, boardQueue = Promise.resolve(), boardStatus = '';

  const joined = () => Boolean(live && live.role && live.board);
  const canEdit = () => joined() && live.role === 'leader';
  const liveTasks = () => (live && live.sprints ? live.sprints.flatMap(sprint => sprint.tasks) : []);
  let draggedTask = null;
  const editingBoard = () => {
    const a = document.activeElement;
    return draggedTask !== null || Boolean(a && a.dataset && a.dataset.live && /INPUT|TEXTAREA|SELECT/.test(a.tagName));
  };

  async function loadPlanning(force = false) {
    // Đang gõ hoặc đang lưu thì chưa thay dữ liệu: bản lưu dựa trên phiên bản cũ sẽ được server từ chối.
    if (!force && (boardPending || editingBoard())) { boardStale = true; return; }
    let next = null;
    try {
      const response = await fetch(PLANNING_API + '/state', { cache: 'no-store' });
      if (response.ok) next = await response.json();
    } catch (e) { /* chưa kết nối được server */ }
    if (!force && (boardPending || editingBoard())) { boardStale = true; return; }
    boardStale = false;
    if (next === null && live) return;
    const workspaceChanged = !mockMode && syncWorkspace(next);
    const same = live && next && live.profile && next.profile && live.profile.github_id === next.profile.github_id;
    const view_ = value => JSON.stringify(value && [value.profile, value.role, value.members, value.repo, value.sprints, value.webhook, value.push_key, value.push_registered]);
    const changed = force || live === undefined || view_(live) !== view_(next);
    if (!same) { boardStatus = ''; boardRound++; }
    const wasJoined = joined(), hadState = Boolean(live);
    live = next;
    // Vừa lập hoặc vào đội ngay trên trang thì giữ phần thiết lập đang mở để làm tiếp bước chọn repo.
    if (hadState && !wasJoined && joined()) planningOpen = true;
    if (!joined()) planningOpen = false;
    updatePlanningPanel(tab === 'planning');
    if (workspaceChanged || (changed && !mockMode)) showWorkspace();
    if (!changed) return;
    drawPlanning();
    syncProgress();
  }

  /* ---------- Thành viên, Quality và Maintaining: dữ liệu của đội trên server ---------- */
  const MEMBER_COLORS = ['#ec4899', '#0fb5ae', '#a9672f', '#6d8f10', '#4d5bf0', '#ff8a1f', '#a24ce8', '#0a9cf0'];
  let wsVersion = { quality: null, maintain: null }, wsPending = 0, wsStale = false, wsQueue = Promise.resolve();
  /* Đang gõ trong form của hai tab này thì chưa vẽ lại, để không mất nội dung. */
  const typingInView = () => {
    const a = document.activeElement;
    return Boolean(a && a.closest('#viewContent') && /INPUT|TEXTAREA|SELECT/.test(a.tagName));
  };

  /* Đưa dữ liệu server vào S. Trả về true khi Quality hoặc Maintaining đổi. */
  function syncWorkspace(state) {
    const team = state && state.role ? state.members : [];
    S.meta.members = team.map((m, i) => ({ id: m.github_id, name: m.name || m.login, look: Number(m.avatar) || 0, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }));
    local.me = (state && state.profile && state.role && state.profile.github_id) || '';
    if (wsPending) { wsStale = true; return false; }
    let changed = false;
    SERVER.forEach(k => {
      const remote = state && state.role ? state[k] : null;
      const version = remote ? remote.version : null;
      if (version === wsVersion[k]) return;
      const { version: _, ...data } = remote || EMPTY()[k];
      S[k] = JSON.parse(JSON.stringify(data));
      wsVersion[k] = version;
      changed = true;
    });
    if (changed) { migrate(); runEdit = null; lastLevel = null; }
    return changed;
  }

  function showWorkspace() {
    if (!inApp) return;
    renderTeam();
    renderChat();
    if (tab !== 'planning' && tab !== 'product' && !typingInView()) render();
    syncProgress();
  }

  /* Lưu nối tiếp nhau để mỗi lần gửi đúng phiên bản vừa nhận. */
  function pushWorkspace(section) {
    if (wsVersion[section] === null) return;
    wsPending++;
    wsQueue = wsQueue.then(async () => {
      let failed = '';
      try {
        const response = await fetch(`${PLANNING_API}/${section}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Planning-Request': '1' },
          body: JSON.stringify({ ...S[section], version: wsVersion[section] })
        });
        if (response.ok) wsVersion[section]++;
        else if (response.status === 409) failed = 'Đội vừa sửa phần này ở nơi khác. Đã tải bản mới, bạn sửa lại nhé.';
        else if (response.status === 401 || response.status === 403) failed = 'Chưa lưu được. Đăng nhập lại ở tab Planning.';
        else failed = 'Chưa lưu được: kiểm tra lại giá trị vừa nhập.';
      } catch (e) { failed = 'Chưa kết nối được server nên chưa lưu. Thử lại sau ít phút.'; }
      wsPending--;
      if (failed) {
        toast(failed);
        wsVersion[section] = -1; // ép lấy lại bản trên server
        wsStale = true;
      }
      if (wsStale && !wsPending) { wsStale = false; loadPlanning(true); }
    });
  }

  /* Quality và Maintaining chỉ dùng được khi đã ở trong một đội; trả về hướng dẫn nếu chưa. */
  function teamGate(what) {
    if (mockMode || joined()) return '';
    const [title, text, action] = live === undefined
      ? ['Đang tải dữ liệu của đội', 'Chờ trong giây lát.', '']
      : live === null
        ? ['Chưa kết nối được server', `${what} được lưu trên server của đội. Kiểm tra backend rồi thử lại.`, btn('ws-retry', 'Thử lại', 'tone small')]
        : ['Cần vào đội trước', `${what} được lưu theo đội để mọi người cùng thấy. Mở tab Planning, đăng nhập GitHub rồi lập đội hoặc nhập mã mời.`, btn('tab', 'Mở Planning', 'tone small', 'data-id="planning"')];
    return `<div class="panel">${panelHead(title)}<p class="muted">${text}</p>${action ? `<p style="margin-top:12px">${action}</p>` : ''}</div>`;
  }

  function drawPlanning() {
    if (tab !== 'planning') return;
    // Vẽ lại không được đưa trang hay các cột Task về đầu.
    const y = view.scrollTop, x = $('.board', viewContent)?.scrollLeft || 0;
    const columns = $$('[data-col]', viewContent).map(column => [column.dataset.col, $('.col-list', column).scrollTop]);
    viewContent.innerHTML = views.planning();
    fitBoard(); // đặt chiều cao trước khi trả lại vị trí cuộn của cột
    view.scrollTop = y;
    columns.forEach(([key, top]) => {
      const list = $(`[data-col="${key}"] .col-list`, viewContent);
      if (list) list.scrollTop = top;
    });
    const board = $('.board', viewContent);
    if (board) board.scrollLeft = x;
  }

  // Máy tính: bảng Task cao vừa hết màn hình. Điện thoại giữ chiều cao mặc định trong CSS.
  function fitBoard() {
    const board = $('.board', viewContent), list = board && $('.col-list', board);
    if (!list) return;
    if (mobile.matches) { board.style.removeProperty('--col-h'); return; }
    // offsetTop bỏ qua transform, nên đo đúng cả khi nội dung đang chạy hiệu ứng.
    let top = 0;
    for (let el = list; el && el !== view; el = el.offsetParent) top += el.offsetTop;
    // Phần còn lại của card dưới danh sách thẻ. Hai mép cùng nằm trong một card nên hiệu ứng không làm lệch.
    const below = board.closest('.panel').getBoundingClientRect().bottom - list.getBoundingClientRect().bottom;
    const space = view.clientHeight - top - below - parseFloat(getComputedStyle(view).paddingBottom);
    board.style.setProperty('--col-h', Math.max(320, Math.floor(space)) + 'px');
  }

  function setBoardStatus(text) {
    boardStatus = text;
    const box = $('#boardStatus');
    if (box) box.textContent = text;
  }

  function editTask(field) {
    if (!canEdit()) return;
    const kind = field.dataset.live, id = +field.dataset.id, value = field.value;
    field.blur();
    if (kind === 'task-owner') saveTask(id, { assignee_id: value });
    else if (kind === 'task-status') saveTask(id, { status: value });
  }

  // Màu và mô tả cột theo kiểu GitHub Projects.
  const COLUMNS = {
    todo: ['var(--green)', 'Chưa gửi review'],
    review: ['var(--blue)', 'Chờ phản hồi và duyệt'],
    done: ['var(--violet)', 'Đã hoàn thành']
  };
  // Bảng không có cột Đang làm: task đang làm (như PR nháp) nằm ở Cần làm để không biến mất.
  const columnOf = progress => (progress === 'doing' ? 'todo' : progress);
  // Màu theo thứ tự sprint, trùng thứ tự màu ở danh sách sprint trong khung.
  const SPRINT_TONES = ['var(--indigo)', 'var(--orange)', 'var(--violet)', 'var(--blue)', 'var(--red)', 'var(--green)', 'var(--yellow)'];
  function sprintOf(id) {
    const index = (live.sprints || []).findIndex(sprint => sprint.tasks.some(task => task.id === id));
    return index < 0 ? null : { title: live.sprints[index].title, tone: SPRINT_TONES[index % SPRINT_TONES.length] };
  }
  const dueFormat = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });

  // Avatar thành viên chọn trong hồ sơ, vẽ bởi avatar.js giống hệt khung Planning.
  let avatarCount = 0;
  function personAvatar(person) {
    if (!person) return '<span class="av" aria-hidden="true">?</span>';
    const look = Number(person.avatar) || 0;
    return `<span class="pl-avatar pl-person-${look}" aria-hidden="true">${window.TangAvatar.markup(look, `av${++avatarCount}`)}</span>`;
  }

  function taskCard(t, edit) {
    const owner = live.members.find(m => m.github_id === t.assignee_id);
    const repo = live.repo && live.repo.name ? live.repo.name.split('/').pop() + ' ' : '';
    const mark = '<i class="ring" aria-hidden="true"></i>';
    // Ô chọn trong suốt nằm trên biểu tượng: đổi cột và đổi người được bằng bàn phím hay chạm.
    const move = edit ? `<span class="task-pick">${mark}<select data-live="task-status" data-id="${t.id}" aria-label="Chuyển cột ${esc(t.code)}" title="Chuyển cột">${Object.keys(COLUMNS).map(k => `<option value="${k}" ${k === columnOf(t.progress) ? 'selected' : ''}>${STATUS[k][0]}</option>`).join('')}</select></span>` : mark;
    const who = owner ? owner.name : 'Chưa giao';
    const face = edit ? `<span class="task-pick task-owner" title="Người làm: ${esc(who)}">${personAvatar(owner)}<select data-live="task-owner" data-id="${t.id}" aria-label="Người làm ${esc(t.code)}">${live.members.map(m => `<option value="${esc(m.github_id)}" ${m.github_id === t.assignee_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></span>`
      : `<span class="task-owner" title="Người làm: ${esc(who)}" role="img" aria-label="Người làm: ${esc(who)}">${personAvatar(owner)}</span>`;
    const pulls = (t.pulls || []).map(pr => {
      const name = `PR #${pr.number}${pr.state === 'draft' ? ' nháp' : ''}`;
      return pr.url ? `<a class="task-tag" href="${esc(pr.url)}" target="_blank" rel="noopener" draggable="false">${name}</a>` : `<span class="task-tag">${name}</span>`;
    }).join('');
    const sprint = sprintOf(t.id);
    const sprintTag = sprint ? `<span class="task-tag task-sprint">${esc(sprint.title)}</span>` : '';
    const late = t.progress !== 'done' && Date.parse(t.deadline) < Date.now();
    return `<div class="task" ${sprint ? `style="--sp:${sprint.tone}"` : ''} ${edit ? `draggable="true" data-drag="${t.id}"` : ''}>
      <div class="task-top">${move}<span class="task-ref" title="${esc(repo + t.code)}"><span>${esc(repo.trim())}</span><b>${esc(t.code)}</b></span>${face}</div>
      <div class="task-title" role="button" tabindex="0" data-open-task="${t.id}" aria-haspopup="dialog" aria-label="Xem chi tiết ${esc(t.code)}: ${esc(t.title)}" title="${esc(t.title)}">${esc(t.title)}</div>
      <div class="task-tags">${sprintTag}${pulls}<span class="task-tag ${late ? 'late' : ''}">${late ? 'Quá hạn' : 'Hạn'} ${dueFormat.format(new Date(t.deadline))}</span></div></div>`;
  }

  // Nút GitHub và chuông trên đầu trang mở hộp nhỏ, dùng chung <dialog> với chi tiết task.
  const GITHUB_MARK = '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8Z"/></svg>';
  const BELL = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9Z"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/></svg>';
  const supportsPush = () => window.isSecureContext && 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
  const notifyOn = () => supportsPush() && Notification.permission === 'granted' && Boolean(live && live.push_registered);

  function headActions() {
    const repoState = !live.repo ? ['off', 'chưa kết nối'] : live.repo.access ? ['ok', 'đang theo dõi'] : ['warn', 'cần cấp lại quyền'];
    const icon = (act, label, mark, dot) => `<button type="button" class="head-icon" data-act="${act}" aria-label="${esc(label)}" title="${esc(label)}" aria-haspopup="dialog">${mark}<i class="head-dot ${dot}" aria-hidden="true"></i></button>`;
    return `<div class="head-actions">${icon('repo-open', 'Repo GitHub: ' + repoState[1], GITHUB_MARK, repoState[0])}${icon('notify-open', notifyOn() ? 'Thông báo: đang bật' : 'Thông báo: đang tắt', BELL, notifyOn() ? 'ok' : 'off')}${btn('planning-team', 'Thành viên', 'primary', `aria-expanded="${planningOpen && planningView === 'team'}" aria-controls="planningLive" aria-haspopup="dialog"`)}${btn('planning-pulls', 'Pull request', 'primary', `aria-expanded="${planningOpen && planningView === 'pulls'}" aria-controls="planningLive" aria-haspopup="dialog"`)}</div>`;
  }

  function openSheet(title, body) {
    detail.innerHTML = `<div class="task-dialog-head"><h3 id="taskDialogTitle">${title}</h3><button type="button" class="btn soft small" data-close>Đóng</button></div>${body}`;
    if (!detail.open) detail.showModal();
  }

  function openRepo() {
    if (!joined()) return;
    const repo = live.repo, leader = canEdit(), demo = Boolean(live.profile && live.profile.demo);
    if (!repo) {
      openSheet('Repo GitHub', `<p class="muted">${leader ? 'Chọn repo để đọc pull request và theo dõi task.' : 'Trưởng nhóm sẽ kết nối repo cho đội.'}</p>${leader ? `<div class="task-dialog-actions">${btn('planning-repo', 'Kết nối repo', 'primary small')}</div>` : ''}`);
      return;
    }
    const state = repo.access ? '<span class="side-chip ok">Đang theo dõi</span>' : '<span class="side-chip warn">Cần cấp lại quyền</span>';
    const name = repo.url ? `<a href="${esc(repo.url)}" target="_blank" rel="noopener">${esc(repo.name)}</a>` : esc(repo.name);
    const note = repo.access && !live.webhook && !demo ? '<p class="muted">Chưa nhận được thông báo từ GitHub. Máy chủ ProductPilot tự đọc PR khoảng mỗi 60 giây.</p>' : '';
    const actions = leader ? `<div class="task-dialog-actions">${btn('planning-repo', repo.access ? 'Đổi repo' : 'Cấp quyền lại', 'soft small')}${!demo && repo.access ? btn('repo-refresh', 'Đọc lại PR', 'soft small') : ''}</div><p class="muted" id="sheetMessage" role="status"></p>` : '';
    openSheet('Repo GitHub', `<div class="side-name">${name}</div><p>${state} <span class="muted">Nhánh theo dõi · ${esc(repo.branch)}</span></p>${note}${actions}`);
  }

  function openNotify(message = '') {
    if (!joined()) return;
    let status, actions = '';
    if (!supportsPush()) status = 'Trình duyệt này chưa hỗ trợ thông báo. Mở ProductPilot bằng HTTPS hoặc localhost trên Chrome, Edge hay Firefox.';
    else if (!live.push_key) status = 'Máy chủ đang tắt thông báo trình duyệt.';
    else if (Notification.permission === 'denied') status = 'Trình duyệt đang chặn thông báo của trang này. Bấm biểu tượng cạnh thanh địa chỉ, cho phép Thông báo, rồi tải lại trang.';
    else if (notifyOn()) {
      status = 'Đang bật trên trình duyệt này.';
      actions = btn('notify-test', 'Gửi thử', 'primary small') + btn('notify-off', 'Tắt thông báo', 'soft small');
    } else {
      status = 'Đang tắt. Bấm Bật thông báo, rồi chọn Cho phép khi trình duyệt hỏi.';
      actions = btn('notify-on', 'Bật thông báo', 'primary small');
    }
    openSheet('Thông báo', `<p>${status}</p><p class="muted">Bạn được nhắc khi task của mình còn tối đa 24 giờ và 1 giờ, kể cả khi đã đóng tab. Trình duyệt và máy chủ ProductPilot cần đang chạy.</p>${actions ? `<div class="task-dialog-actions">${actions}</div>` : ''}<p class="muted" id="sheetMessage" role="status">${esc(message)}</p>`);
  }

  async function pushRequest(path, method, data) {
    const response = await fetch(PLANNING_API + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Planning-Request': '1' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body && typeof body.detail === 'string' ? body.detail : 'Chưa cập nhật được thông báo. Thử lại.');
    }
  }

  // Phạm vi /planning nên không dùng serviceWorker.ready (chỉ trả về worker đang điều khiển trang này).
  async function pushRegistration() {
    const registration = await navigator.serviceWorker.register('/planning-sw.js', { scope: '/planning' });
    const worker = registration.installing || registration.waiting;
    if (!registration.active && worker) {
      await new Promise((resolve, reject) => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') resolve();
          if (worker.state === 'redundant') reject(new Error('Chưa cài được bộ nhận thông báo. Tải lại trang rồi thử lại.'));
        });
      });
    }
    return registration;
  }

  async function notifyAction(button, work, done) {
    button.disabled = true;
    let message = done;
    try {
      await work();
    } catch (error) {
      message = error instanceof TypeError ? 'Chưa kết nối được server.' : error.message;
    }
    await loadPlanning(true);
    if (detail.open) openNotify(message);
  }

  function enableNotify(button) {
    // Phải xin quyền ngay trong lượt bấm, trước mọi việc bất đồng bộ khác.
    const asked = Notification.requestPermission();
    notifyAction(button, async () => {
      if (await asked !== 'granted') throw new Error('Bạn chưa cho phép thông báo.');
      const key = Uint8Array.from(atob(live.push_key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const registration = await pushRegistration();
      let subscription = await registration.pushManager.getSubscription();
      const used = new Uint8Array((subscription && subscription.options.applicationServerKey) || new ArrayBuffer(0));
      if (subscription && (used.length !== key.length || used.some((byte, i) => byte !== key[i]))) {
        await subscription.unsubscribe();
        subscription = null;
      }
      try {
        subscription = subscription || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      } catch (e) {
        throw new Error('Trình duyệt chưa đăng ký được dịch vụ thông báo. Với Brave, bật dịch vụ đẩy của Google trong cài đặt quyền riêng tư.');
      }
      const { endpoint, keys } = subscription.toJSON();
      await pushRequest('/push/subscription', 'POST', { endpoint, keys });
    }, 'Đã bật. Bấm Gửi thử để kiểm tra.');
  }

  function disableNotify(button) {
    notifyAction(button, async () => {
      const registration = await navigator.serviceWorker.getRegistration('/planning');
      const subscription = registration && await registration.pushManager.getSubscription();
      await pushRequest('/push/subscription', 'DELETE', { endpoint: subscription ? subscription.endpoint : null });
      if (subscription) await subscription.unsubscribe();
    }, 'Đã tắt thông báo trên trình duyệt này.');
  }

  function testNotify(button) {
    notifyAction(button, () => pushRequest('/push/test', 'POST'),
      'Đã gửi. Chưa thấy thì kiểm tra cài đặt thông báo của hệ điều hành cho trình duyệt.');
  }

  async function refreshRepo(button) {
    if (!canEdit() || !live.repo) return;
    button.disabled = true;
    try {
      const response = await fetch(PLANNING_API + '/repo/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Planning-Request': '1' },
        body: JSON.stringify({ repo_version: live.repo_version })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body && typeof body.detail === 'string' ? body.detail : 'Chưa đọc được PR. Thử lại.');
      }
      sheetMessage('Đã đọc lại PR gần đây.');
      planningFrame.contentWindow?.postMessage({ type: 'tang:planning-reload' }, location.origin);
    } catch (error) {
      sheetMessage(error instanceof TypeError ? 'Chưa kết nối được server.' : error.message);
    } finally {
      button.disabled = false;
      await loadPlanning(true);
    }
  }

  function sheetMessage(text) {
    const box = detail.open && $('#sheetMessage', detail);
    if (box) box.textContent = text; else toast(text);
  }

  function taskBoard() {
    const tasks = liveTasks(), edit = canEdit();
    if (!(live.sprints || []).length) return `<div class="panel">${panelHead('Task')}<p class="col-empty">Đợi tạo sprint</p></div>`;
    const columns = Object.entries(COLUMNS).map(([key, [tone, about]]) => {
      const list = tasks.filter(t => columnOf(t.progress) === key);
      const label = STATUS[key][0];
      const none = (live.sprints || []).length ? 'Trống' : 'Đợi tạo sprint';
      return `<div class="col" data-col="${key}" style="--s:${tone}"><div class="col-head"><h4><i class="ring" aria-hidden="true"></i>${label}<span class="count">${list.length}</span></h4><p>${about}</p></div><div class="col-list">${list.map(t => taskCard(t, edit)).join('') || `<p class="col-empty">${none}</p>`}</div></div>`;
    }).join('');
    const hint = '';
    const rule = 'Trạng thái tự đổi khi có sự kiện pull request nhắc mã task' + (edit ? '. Bạn cũng có thể kéo thẻ sang cột khác' : '');
    return `<div class="panel">${panelHead('Task', `<span class="muted">${rule}</span>`)}${hint}<div class="board">${columns}</div>${edit ? `<p class="muted" id="boardStatus" role="status">${esc(boardStatus)}</p>` : ''}</div>`;
  }

  function saveTask(id, change) {
    const task = liveTasks().find(t => t.id === id);
    if (!task) return;
    const move = Boolean(change.status);
    Object.assign(task, change, move ? { progress: change.status } : {});
    const round = boardRound;
    boardPending++;
    boardStale = true; // đọc lại sau khi lưu để lấy trạng thái server tính từ pull request
    setBoardStatus('Đang lưu…');
    boardQueue = boardQueue.then(async () => {
      if (round !== boardRound || !canEdit()) return;
      const { title, description, criteria, deadline, assignee_id, status } = task;
      const response = await fetch(`${PLANNING_API}/tasks/${id}${move ? '/status' : ''}`, {
        method: move ? 'PUT' : 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Planning-Request': '1' },
        body: JSON.stringify(move ? { repo_version: live.repo_version, status: change.status }
          : { repo_version: live.repo_version, task: { title, description, criteria, deadline, assignee_id, status } })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body && typeof body.detail === 'string' ? body.detail : 'Chưa lưu được task. Thử lại.');
      }
      setBoardStatus('Đã lưu');
      planningFrame.contentWindow?.postMessage({ type: 'tang:planning-reload' }, location.origin);
    }).catch(error => {
      boardRound++;
      const text = error instanceof TypeError ? 'Chưa kết nối được server. Thay đổi vừa rồi chưa được lưu.' : error.message;
      setBoardStatus(text);
      toast(text);
    }).finally(() => {
      boardPending--;
      if (!boardPending) loadPlanning(true);
    });
    if (move) { drawPlanning(); syncProgress(); } // thẻ sang cột mới ngay, lỗi thì lần đọc lại sẽ trả về
  }

  /* Hộp chi tiết chỉ để xem; sửa task ở card Đội, sprint và PR. Dùng <dialog> để có sẵn Esc và giữ focus. */
  const detail = document.createElement('dialog');
  detail.className = 'task-dialog';
  detail.setAttribute('aria-labelledby', 'taskDialogTitle');
  document.body.append(detail);

  function openTask(id) {
    const t = liveTasks().find(task => task.id === id);
    if (!t) return;
    const owner = live.members.find(m => m.github_id === t.assignee_id);
    const due = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(t.deadline));
    const pulls = (t.pulls || []).map(pr => {
      const name = `#${pr.number} ${esc(pr.title || '')}`;
      return `<li>${pr.url ? `<a href="${esc(pr.url)}" target="_blank" rel="noopener">${name}</a>` : name}${pr.note ? `<div class="muted">${esc(pr.note)}</div>` : ''}</li>`;
    }).join('');
    detail.innerHTML = `<div class="task-dialog-head"><span class="muted">${esc(t.code)}</span><button type="button" class="btn soft small" data-close>Đóng</button></div>
      <h3 id="taskDialogTitle">${esc(t.title)}</h3>
      <div class="task-dialog-meta" style="--s:${COLUMNS[columnOf(t.progress)][0]}"><span class="task-tag"><i class="ring" aria-hidden="true"></i>${STATUS[columnOf(t.progress)][0]}</span>${sprintOf(t.id) ? `<span class="task-tag task-sprint" style="--sp:${sprintOf(t.id).tone}">${esc(sprintOf(t.id).title)}</span>` : ''}<span class="task-dialog-owner">${personAvatar(owner)}${esc(owner ? owner.name : 'Chưa giao')}</span><span class="muted">Hạn ${due}</span></div>
      <p class="task-dialog-text">${esc(t.description || 'Chưa có mô tả.')}</p>
      ${(t.criteria || []).length ? `<h4>Tiêu chí hoàn thành</h4><ul>${t.criteria.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
      ${pulls ? `<h4>Pull request</h4><ul>${pulls}</ul>` : ''}
      ${t.can_start ? `<p class="muted">Bắt đầu task sẽ tạo nhánh task/t-${t.id} và một PR nháp đứng tên bạn. GitHub hỏi xác nhận trước.</p>` : ''}
      <div class="task-dialog-actions">${t.can_start ? `<button type="button" class="btn primary small" data-start="${t.id}">Bắt đầu task</button>` : ''}<button type="button" class="btn soft small" data-copy="[${esc(t.code)}]">Chép mã cho PR</button>${canEdit() ? `<button type="button" class="btn soft small danger" data-ask-delete>Xóa task</button>` : ''}</div>
      ${canEdit() ? `<div class="task-dialog-confirm" hidden><p>Xóa ${esc(t.code)}? Không khôi phục được và mã này không dùng lại. PR đang liên kết còn mở sẽ quay về mục cần đối chiếu.</p><div class="task-dialog-actions"><button type="button" class="btn small danger-solid" data-delete="${t.id}">Xóa hẳn</button><button type="button" class="btn soft small" data-keep>Giữ lại</button></div></div>` : ''}`;
    detail.showModal();
  }

  detail.addEventListener('click', e => {
    const button = e.target.closest('button');
    // Bấm vào vùng mờ: sự kiện tới thẳng dialog và nằm ngoài khung hộp.
    const box = detail.getBoundingClientRect();
    const outside = e.target === detail && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom);
    if (outside || button?.hasAttribute('data-close')) detail.close();
    else if (button?.dataset.start) startTask(+button.dataset.start, button);
    else if (button?.hasAttribute('data-ask-delete') || button?.hasAttribute('data-keep')) {
      const asking = button.hasAttribute('data-ask-delete');
      $('.task-dialog-confirm', detail).hidden = !asking;
      $(asking ? '[data-keep]' : '[data-ask-delete]', detail).focus();
    } else if (button?.dataset.delete) {
      button.disabled = true;
      deleteTask(+button.dataset.delete);
    }
    else if (button?.dataset.copy) {
      Promise.resolve(navigator.clipboard?.writeText(button.dataset.copy))
        .then(() => { button.textContent = navigator.clipboard ? 'Đã chép mã' : `Chép tay: ${button.dataset.copy}`; })
        .catch(() => { button.textContent = `Chép tay: ${button.dataset.copy}`; });
    }
  });
  async function startTask(id, button) {
    button.disabled = true;
    try {
      const response = await fetch(`${PLANNING_API}/tasks/${id}/pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Planning-Request': '1' },
        body: JSON.stringify({ repo_version: live.repo_version })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body && typeof body.detail === 'string' ? body.detail : 'Chưa bắt đầu được task. Thử lại.');
      location.assign(body.url);
    } catch (error) {
      button.disabled = false;
      toast(error instanceof TypeError ? 'Chưa kết nối được server.' : error.message);
    }
  }

  async function deleteTask(id) {
    const task = liveTasks().find(item => item.id === id);
    if (!task || !canEdit()) return;
    boardPending++;
    try {
      const response = await fetch(`${PLANNING_API}/tasks/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Planning-Request': '1' },
        body: JSON.stringify({ repo_version: live.repo_version })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body && typeof body.detail === 'string' ? body.detail : 'Chưa xóa được task. Thử lại.');
      }
      detail.close();
      toast(`Đã xóa ${task.code}.`);
      planningFrame.contentWindow?.postMessage({ type: 'tang:planning-reload' }, location.origin);
    } catch (error) {
      toast(error instanceof TypeError ? 'Chưa kết nối được server. Task chưa bị xóa.' : error.message);
      const retry = $('[data-delete]', detail);
      if (retry) retry.disabled = false;
    } finally {
      boardPending--;
      if (!boardPending) await loadPlanning(true);
    }
  }

  // Bấm vào thẻ (trừ ô chọn và liên kết) để xem chi tiết.
  document.addEventListener('click', e => {
    const card = e.target.closest && e.target.closest('.board .task');
    if (!card || e.target.closest('a, select, .task-pick')) return;
    openTask(+card.querySelector('[data-open-task]').dataset.openTask);
  });
  document.addEventListener('keydown', e => {
    const id = e.target.dataset && e.target.dataset.openTask;
    if (id && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTask(+id); }
  });

  /* Kéo thả thẻ giữa các cột (chuột). Bàn phím và màn hình cảm ứng dùng vòng tròn trạng thái trên thẻ. */
  function endDrag() {
    draggedTask = null;
    $$('.col.drop, .task.dragging').forEach(el => el.classList.remove('drop', 'dragging'));
    if (boardStale && !boardPending) loadPlanning();
  }
  const columnAt = e => (draggedTask !== null && e.target.closest ? e.target.closest('[data-col]') : null);
  document.addEventListener('dragstart', e => {
    const card = e.target.closest && e.target.closest('[data-drag]');
    if (!card || !canEdit()) return;
    draggedTask = +card.dataset.drag;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.drag);
    card.classList.add('dragging');
  });
  document.addEventListener('dragover', e => {
    const column = columnAt(e);
    $$('.col.drop').forEach(el => { if (el !== column) el.classList.remove('drop'); });
    if (!column) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    column.classList.add('drop');
  });
  document.addEventListener('drop', e => {
    const column = columnAt(e);
    if (!column) return;
    e.preventDefault();
    const id = draggedTask, status = column.dataset.col;
    const task = liveTasks().find(t => t.id === id);
    draggedTask = null;
    if (task && columnOf(task.progress) !== status) saveTask(id, { status });
    endDrag();
  });
  document.addEventListener('dragend', endDrag);

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
  function pitchHasResponses() {
    return (S.pitch.responses && S.pitch.responses.length > 0) || (dashStats && dashStats.total_responses > 0);
  }
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
      if (!joined()) return 'Thiết lập đội trong tab Planning';
      if (!live.repo) return 'Kết nối repo để lập sprint';
      const tasks = liveTasks(), next = tasks.find(t => t.progress !== 'done');
      return next ? `${next.code} · ${next.title}` : tasks.length ? 'Mọi task đã xong' : 'Chưa có sprint đã giao';
    }
    if (i === 2) {
      const p = S.pitch;
      return !(p.form && p.form.length) && !pitchHasResponses() ? 'Tạo form khảo sát' : !pitchHasResponses() ? 'Thu phản hồi cho form' : !p.overview ? 'Tạo AI overview' : !(p.deckShown && p.deck) ? 'Tạo slide pitching' : !p.ads ? 'Viết bài quảng cáo' : 'Bộ pitching đã đủ';
    }
    if (i > 2 && !mockMode && !joined()) return 'Vào đội ở tab Planning để bắt đầu';
    if (i === 3) {
      const q = S.quality;
      if (!q.metrics.length) return 'Để agent lấy chỉ số từ Canvas';
      if (S.score.metric.text && q.source !== S.score.metric.text) return 'Canvas đã đổi, lấy lại chỉ số';
      if (!q.runs.length) return 'Ghi lần chạy thử đầu tiên';
      return q.runs.some(r => !r.sample) ? `Đã ghi ${q.runs.length} lần chạy` : 'Mới có dữ liệu mẫu, ghi lần chạy thật';
    }
    const due = S.maintain.schedule.slice().sort((a, b) => a.next.localeCompare(b.next))[0];
    return due ? `${due.next <= iso(new Date()) ? 'Đến hạn' : 'Sắp tới'}: ${due.title}` : 'Chưa có lịch';
  }
  const pct = v => Math.round(v * 100) + '%'; // dùng cho chỉ số chất lượng, không dùng cho tiến độ bước

  let site = null, pins = [], shown = 0;
  /* Lúc thiết lập: mô hình 3D hiện đủ màu để người dùng chọn. Thiết lập xong, màu thưa dần về đúng tiến độ thật. */
  let obPreview = false, fadeTimer = 0;
  function fadeModel() {
    clearInterval(fadeTimer);
    if (reduced) { fadeTimer = 0; site.set(progress()); return; }
    let k = 0;
    const steps = 36;
    fadeTimer = setInterval(() => {
      k++;
      const target = progress();
      site.set(target.map(t => 1 - (1 - t) * (k / steps)));
      if (k >= steps) { clearInterval(fadeTimer); fadeTimer = 0; site.set(progress()); }
    }, 50);
  }
  function syncProgress() {
    const v = progress();
    if (site) {
      if (onboarding()) { obPreview = true; clearInterval(fadeTimer); fadeTimer = 0; site.set(v.map(() => 1)); }
      else if (obPreview) { obPreview = false; fadeModel(); }
      else if (!fadeTimer) site.set(v);
    }
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
  /* Làm tròn lên theo đúng độ chính xác hiển thị, để giá mục tiêu không bị hụt biên lãi. */
  const usdUp = v => {
    if (!isFinite(v)) return '?';
    if (v >= 10) return usd(Math.ceil(v));
    if (v >= 1) return usd(Math.ceil(v * 100) / 100);
    if (v <= 0) return usd(v);
    const f = 10 ** (1 - Math.floor(Math.log10(v)));
    return usd(Math.ceil(v * f) / f);
  };
  const usdShort = v => (!isFinite(v) ? '' : String(+(+v).toPrecision(2)).replace('.', ','));
  function fmtK(n) {
    if (n === null || n === undefined || !isFinite(+n)) return '';
    const v = +n, a = Math.abs(v);
    const fmt = (x, sfx) => {
      const r = Math.round(x * 10) / 10;
      return (Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')) + sfx;
    };
    if (a >= 1e6) return fmt(v / 1e6, 'M');
    if (a >= 1e3) return Math.round((a / 1e3) * 10) / 10 >= 1000 ? fmt(v / 1e6, 'M') : fmt(v / 1e3, 'k');
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
  }
  const runCost = (r, c) => ((+r.actTok || 0) * (+c.pricePerM || 0)) / 1e6;
  const COST_KEYS = ['pricePerM', 'apiCalls', 'infra', 'price', 'teams', 'pricePerCall', 'setupFee', 'newCustomers'];
  /* Chi phí và doanh thu tính bằng code từ token thực tế và giả định do đội nhập; không dùng bảng giá của nhà cung cấp nào. */
  function money() {
    const c = Object.fromEntries(COST_KEYS.map(k => [k, +S.quality.cost[k] || 0]));
    const runs = sortedRuns(), priced = c.pricePerM > 0;
    // Chi phí mỗi lượt gọi: trung bình tối đa 3 lần chạy gần nhất có token thực tế và tổng số test.
    const valid = runs.filter(r => +r.total > 0 && num(r.actTok) !== null).slice(-3);
    const perCase = priced && valid.length ? valid.reduce((a, r) => a + runCost(r, c) / +r.total, 0) / valid.length : null;
    const lastKnown = runs.filter(r => num(r.actTok) !== null).pop();
    const lastRun = priced && lastKnown ? runCost(lastKnown, c) : null;
    const aiMonthly = c.apiCalls === 0 && priced ? 0 : perCase === null ? null : perCase * c.apiCalls;
    const totalCost = aiMonthly === null ? null : aiMonthly + c.infra;
    const model = ['sub', 'usage', 'setup'].includes(S.quality.revenueModel) ? S.quality.revenueModel : 'sub';
    const revenue = model === 'usage' ? c.apiCalls * c.pricePerCall : model === 'setup' ? c.setupFee * c.newCustomers : c.teams * c.price;
    const known = totalCost !== null;
    const profit = known ? revenue - totalCost : null;
    const margin = known && revenue > 0 ? profit / revenue : null;
    const breakEven = !known ? null : model === 'usage' ? (c.apiCalls > 0 ? totalCost / c.apiCalls : null)
      : model === 'setup' ? (c.setupFee > 0 ? Math.ceil(totalCost / c.setupFee) : null)
      : (c.price > 0 ? Math.ceil(totalCost / c.price) : null);
    const targetRev = known ? totalCost / (1 - PROFIT.targetMargin) : null;
    const targetPrice = !known ? null : model === 'usage' ? (c.apiCalls > 0 ? targetRev / c.apiCalls : null)
      : model === 'setup' ? (c.newCustomers > 0 ? targetRev / c.newCustomers : null)
      : (c.teams > 0 ? targetRev / c.teams : null);
    return { c, model, priced, perCase, lastRun, aiMonthly, totalCost, revenue, profit, margin, breakEven, targetPrice, known };
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
      overdueDays: late.length ? Math.max(...late) : S.maintain.schedule.length ? 0 : null,
      staleDays: last ? Math.max(0, Math.floor((Date.now() - new Date(last.at)) / 864e5)) : null
    };
  }
  const health = () => window.HEALTH.evaluate(signals());
  /* Chưa có số liệu nào thì không được báo "Bình thường". */
  const noData = h => h.missing.length === Object.keys(RULES).length;
  const healthName = h => (noData(h) ? 'Chưa có dữ liệu' : HNAMES[h.level]);
  const healthColor = h => (noData(h) ? 'var(--mute)' : HCOLOR[h.level]);
  const HCOLOR = { ok: 'var(--green)', warn: 'var(--yellow)', rescue: 'var(--orange)', collapse: 'var(--orange)' };
  const fmtRule = (fmt, v) => (fmt === 'pct' ? Math.round(v * 100) + '%' : fmt === 'days' ? v + ' ngày' : String(v));
  const reasonText = r => `${r.label}: ${fmtRule(r.fmt, r.value)} (ngưỡng ${HNAMES[r.level].toLowerCase()} là ${r.dir === 'below' ? 'dưới' : 'từ'} ${fmtRule(r.fmt, r.threshold)})`;
  let preview = null, lastLevel = null;
  function applyHealth() {
    const h = health(), level = preview || h.level;
    if (site && site.health) site.health('ok');
    const chip = $('#healthChip');
    if (chip) { chip.hidden = true; chip.dataset.level = level; chip.style.setProperty('--c', preview ? HCOLOR[level] : healthColor(h)); chip.innerHTML = `<i></i>${preview ? 'Xem thử' : 'Sức khỏe'}: ${preview ? HNAMES[level] : healthName(h)}`; }
    lastLevel = h.level;
  }
  /* Biểu đồ đường bằng SVG, không cần thư viện. series: [{ name, color, values[], target? }] */
  const PALETTE = ['var(--ink)', 'var(--indigo)', 'var(--blue)', 'var(--green)', 'var(--orange)', 'var(--violet)', 'var(--yellow)'];
  function lineChart(xs, series, label) {
    const W = 640, H = 230, L = 50, R = 26, T = 22, B = 30;
    const vals = series.flatMap(s => [...s.values, s.target]).filter(v => v !== null && v !== undefined && isFinite(v));
    if (!xs.length || !vals.length) return '<p class="muted">Chưa có số liệu để vẽ. Biểu đồ hiện sau khi ghi lần chạy thử.</p>';
    const hi = Math.max(...vals, 0), mag = hi > 0 ? 10 ** Math.floor(Math.log10(hi)) : 1, max = Math.ceil(hi * 1.08 / mag) * mag || 1, min = Math.min(0, ...vals);
    const x = i => L + (xs.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (xs.length - 1));
    const y = v => T + (H - T - B) * (1 - (v - min) / (max - min || 1));
    const every = Math.ceil(xs.length / 7);
    const grid = [0, 0.25, 0.5, 0.75, 1].map(t => min + (max - min) * t).map(v => `<line class="g" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(fmtK(v))}</text>`).join('');
    const xl = xs.map((l, i) => (i % every && i !== xs.length - 1 ? '' : `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(l.split(' ')[0])}</text>`)).join('');
    const placed = [];
    const lines = series.map(s => {
      let d = '', prev = false;
      s.values.forEach((v, i) => { if (v === null || v === undefined || !isFinite(v)) { prev = false; return; } d += `${prev ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; prev = true; });
      const target = s.target !== null && s.target !== undefined && isFinite(s.target) ? `<line class="tg" x1="${L}" x2="${W - R}" y1="${y(s.target).toFixed(1)}" y2="${y(s.target).toFixed(1)}" style="stroke:${s.color}"/>` : '';
      const dots = s.values.map((v, i) => {
        if (v === null || v === undefined || !isFinite(v)) return '';
        const px = x(i), py = y(v);
        const lx = Math.max(L + 2, Math.min(W - 18, px));
        let ly = Math.max(12, Math.min(H - B - 4, py - 8));
        if (placed.some(p => Math.abs(p.x - lx) < 28 && Math.abs(p.y - ly) < 11)) {
          let up = ly - 11;
          while (up >= 12 && placed.some(p => Math.abs(p.x - lx) < 28 && Math.abs(p.y - up) < 11)) up -= 11;
          if (up >= 12) ly = up;
          else {
            const dn = Math.min(H - B - 4, py + 15);
            if (!placed.some(p => Math.abs(p.x - lx) < 28 && Math.abs(p.y - dn) < 11)) ly = dn;
          }
        }
        placed.push({ x: lx, y: ly });
        const fillCol = s.color === 'var(--yellow)' ? 'var(--mute)' : s.color;
        return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.6" style="fill:${s.color}"><title>${esc(s.name)}, ${esc(xs[i])}: ${+(+v).toFixed(2)}</title></circle><text class="val" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" style="fill:${fillCol}">${esc((s.fmt || fmtK)(v))}</text>`;
      }).join('');
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
  /* Tìm gợi ý theo ID; gợi ý cũ chưa có ID thì dùng vị trí. */
  const pickSuggest = (list, b) => (b.dataset.id ? list.find(x => x.id === b.dataset.id) : list[+b.dataset.n]);
  function ruleCadence() {
    const s = signals(), m = money(), have = new Set(S.maintain.schedule.map(x => x.title)), out = [];
    const add = (title, every, why) => { if (!have.has(title)) out.push({ title, every, why }); };
    const low = (s.passRate !== null && s.passRate < RULES.passRate.warn) || (s.passDrop !== null && s.passDrop >= RULES.passDrop.warn);
    add('Chạy bộ kiểm thử và ghi vào Quality', low ? 3 : 7, low ? 'Chất lượng đang giảm, cần đo dày hơn cho tới khi ổn định.' : 'Giữ nhịp đo hằng tuần để thấy xu hướng.');
    if (new Set(S.quality.runs.map(r => r.model)).size > 1) add('Chạy đối chứng mỗi khi đổi model hoặc prompt', 14, 'Đội đã thử nhiều phiên bản. Mỗi lần đổi cần một lần chạy so với bản trước.');
    if (m.known) add('Rà chi phí token và giá bán', m.margin !== null && m.margin < PROFIT.targetMargin ? 7 : 30, m.margin !== null && m.margin < PROFIT.targetMargin ? `Biên lãi ${pct(m.margin)} dưới mục tiêu, cần theo dõi hằng tuần.` : 'Đơn giá token và lượng dùng thay đổi theo thời gian.');
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
  async function copyTextWithFeedback(text, b, okMsg = 'Đã copy link', failMsg = 'Trình duyệt chặn sao chép.') {
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (e) { /* thử fallback textarea */ }
    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.append(ta);
        ta.select();
        copied = document.execCommand('copy');
        ta.remove();
      } catch (e) { copied = false; }
    }
    if (!copied) return toast(failMsg);
    toast(okMsg);
    if (b && b.isConnected) {
      if (!b.dataset.origLabel) b.dataset.origLabel = b.textContent;
      b.textContent = '✓ ' + okMsg;
      b.classList.add('copied');
      clearTimeout(b._copyTimer);
      b._copyTimer = setTimeout(() => {
        if (b.isConnected && b.dataset.origLabel) {
          b.textContent = b.dataset.origLabel;
          b.classList.remove('copied');
        }
      }, 2200);
    }
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
    tasks: teamTasks().map(t => `${t.id} ${t.title} (${t.done ? 'Xong' : t.review ? 'Chờ review' : 'Chưa xong'})`),
    quality: {
      metrics: S.quality.metrics.map(m => `${m.name} (${(KIND[m.kind] || KIND.value)[0]}): hiện trạng ${num(m.baseline) === null ? 'chưa đo' : m.baseline + m.unit}, mục tiêu ${m.target}${m.unit}, cách đo: ${m.method || 'chưa ghi'}`),
      metricTips: checkMetrics(),
      runs: sortedRuns().slice(-5).map(r => `${r.at} ${r.model}: pass ${r.passed}/${r.total}, token dự kiến ${num(r.estTok) === null ? 'chưa khai' : r.estTok} / thực tế ${num(r.actTok) === null ? 'chưa khai' : r.actTok}${r.sample ? ' (dữ liệu mẫu)' : ''}`),
      health: HNAMES[health().level], reasons: health().reasons.map(reasonText)
    },
    chat: S.chat.slice(-14).map(m => `${m.who === 'agent' ? 'Agent' : (member(m.who) || {}).name}: ${m.text}`)
  });
  function why(e) {
    return e && e.code === 'rate_limited' ? 'Claude đang bận.' : e && e.code === 'not_granted' ? 'Bạn chưa cho phép trang gọi Claude.' : 'Chưa gọi được Claude.';
  }
  /* Gọi Claude lấy JSON; nếu không được thì dùng bản dự phòng (luật trong app) và nói rõ. */
  async function generate(task, shape, valid, fallback) {
    await ready;
    if (sample) {
      try {
        const out = await sample.json(`${AGENT}\n\nDữ liệu dự án:\n${context()}\n\nNhiệm vụ: ${task}\nChỉ trả về JSON đúng dạng: ${shape}`, { cache: false });
        if (valid(out)) return out;
        toast('Claude trả về sai định dạng, đang dùng bản dự phòng.');
      } catch (e) { toast(why(e) + ' Đang dùng bản dự phòng.'); }
    } else toast('Chưa kết nối Claude, đang dùng bản dự phòng.');
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
      return `<div class="msg" style="--m:${who ? color(who.color) : 'var(--yellow)'}">${avatar(m.who)}<div class="bubble"><small>${esc(who ? who.name : m.who === 'agent' ? 'Agent AI Builder' : 'Bạn')}</small>${esc(m.text)}</div></div>`;
    }).join('') + (typing ? `<div class="msg" id="typing">${avatar('agent')}<div class="bubble">Đang suy nghĩ...</div></div>` : '');
    // Luồng thật nói bằng tài khoản đã đăng nhập; chỉ chế độ xem demo mới đổi vai.
    $('.speak', chat).innerHTML = !mockMode ? '' : '<span>Bạn đang nói với tư cách</span>' + S.meta.members.map(m =>
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
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
    return res.json();
  }
  function syncScore(canvas) {
    Object.entries(CANVAS_TO_SCORE).forEach(([cell, key]) => {
      const c = canvas && canvas[cell];
      if (c && c.content && S.score[key]) S.score[key].text = c.content;
    });
    save('score');
  }
  /* Câu hỏi gợi ý cho từng ô Canvas, hiện giữa ô khi ô còn trống */
  const CANVAS_HELP = {
    persona: 'Người dùng chính của sản phẩm là ai? Hãy nghĩ tới một người hoặc một nhóm cụ thể.',
    jtbd: 'Họ đang cố hoàn thành việc gì?',
    pain_point: 'Họ đang gặp khó khăn như thế nào khi gặp vấn đề trên?',
    current_workaround: 'Với khó khăn đó, hiện họ đang tạm xoay sở như thế nào?',
    solution: 'Nhóm dự định giải quyết khó khăn đó như thế nào?',
    ai_leverage: 'AI đóng vai trò gì, ở bước nào trong giải pháp đó?',
    mvp_scope: 'Bản đầu tiên làm những gì, và chưa làm gì?',
    metrics: 'Con số nào đánh giá giá trị thành công của sản phẩm?',
    prior_art: 'Sản phẩm của chúng ta đã có ai làm chưa? Điểm nào độc đáo hơn?'
  };

  function renderThink(scrollEnd) {
    if (!$('#tkCanvas')) return;
    const run = tk.run, p = run && run.proposal, canvas = (p && p.canvas) || {};
    const intro = !tk.introDone && !tk.run && !local.think.msgs.length;
    $('#think').classList.toggle('pending', !tk.settled);
    $('#think').classList.toggle('intro', tk.settled && intro);
    $('#tkCanvas').innerHTML = `<div class="tk-head"><h3>AI MVP Canvas</h3></div>
      <div class="tk-grid">${CANVAS.map(([k, label], n) => {
        const cell = canvas[k] || {}, st = cell.status || 'empty', [txt, col] = CELL_STATE[st];
        return `<div class="tk-cell ${st}" style="--c:${col}"><div class="tk-top"><b><span class="tk-no">${n + 1}.</span> ${label}</b>${st === 'empty' ? '' : `<span class="tag" style="--c:${col}">${txt}</span>`}</div>
          ${cell.content ? `<p title="${esc(cell.content)}">${esc(cell.content)}</p>` : `<p class="tk-hint">${CANVAS_HELP[k]}</p>`}${st === 'evidence' ? `<small>${esc(cell.who)} · ${esc(cell.when)}</small>` : ''}</div>`;
      }).join('')}</div>`;

    const status = run && run.status;
    let actions = '<span class="muted">Trả lời câu hỏi của agent để tiếp tục</span>';
    if (status === 'waiting_review') actions = `${btn('think-approve', 'Duyệt Canvas', 'tone small', 'style="--c:var(--green)"')}${btn('think-reject', 'Chưa duyệt', 'soft small')}`;
    if (status === 'approved') actions = '<span class="tag" style="--c:var(--green)">Đã duyệt</span>' + (run.result && run.result.handoff === 'planning' ? btn('tab', 'Sang bước Planning', 'primary small', 'data-id="planning"') : '');
    if (status === 'rejected') actions = '<span class="tag" style="--c:var(--orange)">Chưa duyệt, cần bổ sung</span>';
    const sources = {
      fallback: '<span class="tag" style="--c:var(--orange)">Luật dự phòng</span>',
      demo_cache: '<span class="tag">Kết quả mẫu có sẵn</span>',
      mock: '<span class="tag">Dữ liệu mẫu</span>'
    };
    const src = sources[run && run.source] || '';
    $('#tkEval').innerHTML = p
      ? `<div class="tk-head"><h3>Đánh giá của agent</h3><span class="tk-verdict" style="--c:${VERDICT[p.verdict] || 'var(--mute)'}">${esc(p.verdict)}</span>${src}</div>
         <ul class="tk-reasons">${(p.reasons || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul><div class="tk-actions">${actions}</div>`
      : `<div class="tk-head"><h3>Đánh giá của agent</h3></div><span class="muted">Chưa có đánh giá. Kể ý tưởng của bạn ở khung chat bên phải.</span>`;

    const box = $('#tkMsgs'), msgs = local.think.msgs;
    box.innerHTML = (msgs.length ? '' : '<p class="muted">Gõ ý tưởng thô của bạn để bắt đầu.</p>') +
      msgs.map(m => `<div class="tk-msg ${m.who === 'me' ? 'me' : ''}"><div class="tk-bubble">${esc(m.text)}</div></div>`).join('') +
      (tk.busy ? '<div class="tk-msg"><div class="tk-bubble muted">Đang suy nghĩ...</div></div>' : '');
    const send = $('.tk-compose button');
    if (send) send.disabled = tk.busy;
    if (scrollEnd) box.scrollTop = box.scrollHeight;
  }
  function thinkApplyRun(run) {
    tk.run = run;
    if (run && run.proposal) syncScore(run.proposal.canvas);
    const handoff = !!(run && run.status === 'approved' && run.result && run.result.handoff === 'planning');
    if (Boolean(S.done.product) !== handoff) {
      S.done.product = handoff;
      save('done');
    }
  }
  async function thinkLoad(refresh = false) {
    const session = local.think.session, current = tk.run;
    try {
      const runs = await api(`/runs?session_id=${encodeURIComponent(session)}&has_canvas=true`);
      if (local.think.session !== session || tk.run !== current || (!refresh && tk.busy)) return;
      thinkApplyRun(runs[0] || null);
      tk.offline = false;
    } catch (e) {
      if (local.think.session !== session) return;
      tk.offline = true;
    }
    tk.settled = true;
    renderThink(true);
    syncProgress();
    renderNav();
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
      const run = await api('/runs', { method: 'POST', body: JSON.stringify({ request: text, session_id: t.session }) });
      if (local.think !== t) return;
      tk.offline = false;
      if (run.status === 'blocked') {
        t.msgs.push({ who: 'agent', text: 'Mình không xử lý tin nhắn này: ' + ((run.result || {}).reason || 'bị chặn') + '.' });
        await thinkLoad(true);
      } else if (run.proposal && run.proposal.canvas) {
        thinkApplyRun(run);
        t.msgs.push({ who: 'agent', text: run.proposal.reply });
      } else {
        t.msgs.push({ who: 'agent', text: 'Chưa xử lý được tin nhắn. Bạn thử gửi lại nhé.' });
      }
    } catch (e) {
      tk.offline = true;
      t.msgs.push({ who: 'agent', text: 'Chưa kết nối được backend. Hãy chạy backend (cd backend, uv run uvicorn app.main:app --port 8000) rồi gửi lại.' });
    }
    tk.busy = false; persist(); renderThink(true); syncProgress(); renderNav();
  }
  async function thinkReview(approved) {
    if (!tk.run || tk.busy) return;
    tk.busy = true; renderThink();
    try {
      const run = await api(`/runs/${tk.run.id}/review`, { method: 'POST', body: JSON.stringify({ approved, note: approved ? 'Trưởng nhóm duyệt Canvas' : 'Trưởng nhóm chưa duyệt, cần bổ sung' }) });
      if (run.status === 'approved' || run.status === 'rejected') {
        thinkApplyRun(run);
        const handoff = run.result && run.result.handoff === 'planning';
        if (handoff) toast('Đã duyệt Canvas. Bước Planning đã mở.');
        local.think.msgs.push({ who: 'agent', text: handoff ? 'Đã duyệt Canvas. Bạn có thể sang bước Planning.' : run.status === 'approved' ? 'Đã ghi nhận kết luận. Canvas chưa đủ điều kiện sang Planning.' : 'Đã ghi nhận chưa duyệt. Bạn kể thêm để mình hỏi tiếp nhé.' });
      } else {
        await thinkLoad(true);
        toast('Chưa lưu được quyết định duyệt. Bạn thử lại nhé.');
      }
    } catch (e) {
      if (e.status === 409) {
        tk.run = null;
        await thinkLoad(true);
        toast('Lượt này không còn chờ duyệt. Hãy xem trạng thái Canvas mới nhất.');
      } else {
        toast('Chưa gửi được quyết định duyệt. Bạn thử lại nhé.');
      }
    }
    tk.busy = false; persist(); renderThink(true); syncProgress(); renderNav();
  }
  function thinkReset() {
    if (tk.busy) return;
    local.think = { session: 'th-' + Math.random().toString(36).slice(2, 10), msgs: [] };
    tk.run = null; tk.loaded = true; tk.settled = true; tk.introDone = false;
    S.done.product = false; save('done'); persist();
    renderThink(true); syncProgress(); renderNav();
    toast('Đã làm mới. Bạn có thể bắt đầu lại từ đầu.');
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
  const lockNote = () => '';
  const head = (i, sub, extra = '') => `<div class="view-head"><div><h2>${STEPS[i].name}${stateTag(i, `data-state="${i}"`)}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="head-tools">${finishBtn(i)}${extra}</div></div>${lockNote(i)}`;
  const panelHead = (t, extra = '') => `<div class="panel-head"><h3>${t}</h3>${extra}</div>`;
  const btn = (act, label, cls = 'tone', data = '') => `<button class="btn ${cls}" data-act="${act}" ${data}>${label}</button>`;

  const SLIDE_LAYOUTS = [
    ['auto', 'Tự động'],
    ['hero', 'Bìa mở đầu'],
    ['split', '2 cột điểm nhấn'],
    ['cards', 'Thẻ ngang'],
    ['compare', 'Đối chiếu 2 cột'],
    ['metric', 'Số liệu lớn'],
    ['steps', 'Lộ trình bước']
  ];
  function resolveSlideLayout(s, i, total) {
    const raw = String((s && s.layout) || 'auto').trim().toLowerCase();
    if (['hero', 'split', 'cards', 'compare', 'metric', 'steps'].includes(raw)) return raw;
    if (i === 0) return 'hero';
    const k = String((s && s.kicker) || '').toLowerCase();
    if (i === total - 1 || /bước|kế hoạch|lộ trình|pilot/.test(k)) return 'steps';
    if (/bằng chứng|khảo sát|đo|số liệu/.test(k)) return 'metric';
    if (/mvp|phạm vi|so sánh/.test(k)) return 'compare';
    if (/ai|đòn bẩy|giải pháp|tính năng/.test(k)) return 'cards';
    return ['split', 'cards', 'metric', 'compare', 'steps'][i % 5];
  }
  function parseSlideItems(body) {
    const lines = String(body || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const paras = [];
    const items = [];
    lines.forEach(line => {
      if (/^(?:[-•*]|\d+[.)])\s+/.test(line)) {
        const clean = line.replace(/^(?:[-•*]|\d+[.)])\s+/, '');
        const idx = clean.indexOf(':');
        if (idx > 0 && idx <= 34 && clean.slice(idx + 1).trim()) {
          items.push({ label: clean.slice(0, idx).trim(), text: clean.slice(idx + 1).trim() });
        } else {
          items.push({ label: '', text: clean });
        }
      } else {
        paras.push(line);
      }
    });
    return { paras, items };
  }
  function renderSlideLayoutBody(s, layout) {
    const { paras, items } = parseSlideItems(s.body || '');
    const hl = String(s.highlight || '').trim();
    const listHtml = items.length
      ? `<ul class="slide-list">${items.map(it => `<li>${it.label ? `<b>${esc(it.label)}:</b> ` : ''}${esc(it.text)}</li>`).join('')}</ul>`
      : '';
    const leadHtml = paras.map(p => `<p>${esc(p)}</p>`).join('');

    if (layout === 'hero') {
      const pills = items.slice(0, 3).map(it => `<div class="slide-pill">${it.label ? `<small>${esc(it.label)}</small>` : ''}<span>${esc(it.text)}</span></div>`).join('');
      return `<div class="slide-main"><h3>${esc(s.title)}</h3>${leadHtml}${pills ? `<div class="slide-pills">${pills}</div>` : ''}${hl ? `<div class="slide-callout" style="margin-top:4px"><small>Trọng tâm</small><b>${esc(hl)}</b></div>` : ''}</div>`;
    }
    if (layout === 'cards') {
      const cards = items.length ? items : paras.map(p => ({ label: '', text: p }));
      return `<div class="slide-main"><h3>${esc(s.title)}</h3>${leadHtml && items.length ? leadHtml : ''}
        <div class="slide-cards">${cards.slice(0, 4).map((it, n) => `<div class="slide-card"><span class="slide-card-no">${String(n + 1).padStart(2, '0')}</span>${it.label ? `<b>${esc(it.label)}</b>` : ''}<span>${esc(it.text)}</span></div>`).join('')}</div>
        ${hl ? `<div class="slide-callout"><small>Điểm nhấn</small><b>${esc(hl)}</b></div>` : ''}</div>`;
    }
    if (layout === 'compare') {
      const src = items.length >= 2 ? items : [{ label: 'Hiện trạng / Trọng tâm', text: paras[0] || s.body || '' }, { label: 'Hướng tiếp cận', text: paras[1] || hl || 'Tập trung kiểm chứng thực tế' }];
      const mid = Math.ceil(src.length / 2);
      const colA = src.slice(0, mid), colB = src.slice(mid);
      const renderCol = (arr, accent, fallbackLbl) => `<div class="slide-col${accent ? ' accent' : ''}">${arr.map(it => `<small>${esc(it.label || fallbackLbl)}</small><b>${esc(it.text)}</b>`).join('')}</div>`;
      return `<div class="slide-main"><h3>${esc(s.title)}</h3><div class="slide-compare">${renderCol(colA, false, 'Vế 1')}${renderCol(colB, true, 'Vế 2')}</div>${hl && items.length >= 2 ? `<div class="slide-callout"><small>Chốt phạm vi</small><b>${esc(hl)}</b></div>` : ''}</div>`;
    }
    if (layout === 'metric') {
      const statVal = hl || (items[0] ? items[0].text : s.title);
      return `<div class="slide-metric-grid">
        <aside class="slide-stat"><small>${esc(s.kicker || 'Chỉ số chính')}</small><b>${esc(statVal)}</b></aside>
        <div class="slide-main"><h3>${esc(s.title)}</h3><div class="slide-body-slot">${leadHtml}${listHtml}</div></div>
      </div>`;
    }
    if (layout === 'steps') {
      const steps = items.length ? items : paras.map(p => ({ label: '', text: p }));
      return `<div class="slide-main"><h3>${esc(s.title)}</h3>${leadHtml && items.length ? leadHtml : ''}
        <div class="slide-steps">${steps.slice(0, 4).map((it, n) => `<div class="slide-step"><span class="slide-step-no">${n + 1}</span>${it.label ? `<b>${esc(it.label)}</b>` : ''}<span>${esc(it.text)}</span></div>`).join('')}</div>
        ${hl ? `<div class="slide-callout"><small>Mục tiêu</small><b>${esc(hl)}</b></div>` : ''}</div>`;
    }
    return `<div class="${hl ? 'slide-grid' : 'slide-main'}">
      <div class="slide-main"><h3>${esc(s.title)}</h3><div class="slide-body-slot">${leadHtml}${listHtml}</div></div>
      ${hl ? `<aside class="slide-callout"><small>Điểm nhấn</small><b>${esc(hl)}</b></aside>` : ''}
    </div>`;
  }
  function renderSlideCard(s, i, total, slideTitle) {
    const tone = STEPS[i % STEPS.length].hex;
    const pctW = Math.round(((i + 1) / (total || 1)) * 100);
    const layout = resolveSlideLayout(s, i, total);
    return `<section class="slide is-${layout}" style="--s:${tone}">
      <div class="slide-prog"><span style="width:${pctW}%"></span></div>
      <div class="slide-top">
        <span class="slide-kicker">${esc(s.kicker || ('Slide ' + (i + 1)))}</span>
        <span class="slide-num">${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
      </div>
      ${renderSlideLayoutBody(s, layout)}
      <div class="slide-foot"><span>${esc(slideTitle)}</span></div>
    </section>`;
  }
  function renderSlideEditorBox() {
    const p = S.pitch;
    if (!(p.deckShown && p.deck && p.deck.length)) return '';
    if (activeSlideIdx >= p.deck.length) activeSlideIdx = Math.max(0, p.deck.length - 1);
    const curSlide = p.deck[activeSlideIdx];
    const curLayout = String(curSlide.layout || 'auto');
    const deckBadge = p.deckSource === 'llm'
      ? '<span class="tag" style="--c:var(--green)">AI Gemini</span>'
      : p.deckSource === 'fallback'
        ? '<span class="tag">Từ dữ liệu bài toán</span>'
        : '';
    return `<div class="slide-editor" id="slideEditorBox">
      <div class="row" style="justify-content:space-between;gap:8px">
        <span style="font-size:13px;font-weight:500">Chỉnh slide ${activeSlideIdx + 1}/${p.deck.length} ${deckBadge}</span>
        <div class="row" style="gap:6px">
          <select data-bind="slideLayout" data-id="${activeSlideIdx}" aria-label="Dạng bố cục slide">${SLIDE_LAYOUTS.map(([val, lbl]) => `<option value="${val}" ${curLayout === val ? 'selected' : ''}>Dạng: ${lbl}</option>`).join('')}</select>
          ${p.deck.length < 10 ? btn('addSlide', '+ Thêm slide', 'soft small') : ''}
          ${p.deck.length > 1 ? btn('delSlide', 'Xóa slide này', 'danger small') : ''}
        </div>
      </div>
      <div class="row" style="gap:8px">
        <input style="flex:1 1 160px" data-bind="slideKicker" data-id="${activeSlideIdx}" value="${esc(curSlide.kicker || '')}" placeholder="Nhãn slide">
        <input style="flex:2 1 240px" data-bind="slideTitle" data-id="${activeSlideIdx}" value="${esc(curSlide.title || '')}" placeholder="Tiêu đề slide">
      </div>
      <textarea rows="3" data-bind="slideBody" data-id="${activeSlideIdx}" placeholder="Nội dung slide (dùng '- Nhãn: nội dung' để chia thẻ/bước)">${esc(curSlide.body || '')}</textarea>
      <input data-bind="slideHighlight" data-id="${activeSlideIdx}" value="${esc(curSlide.highlight || '')}" placeholder="Điểm nhấn / số liệu chính (tùy chọn)">
    </div>`;
  }
  /* Task của đội: lấy từ sprint đã giao ở Planning; chế độ xem demo dùng danh sách mẫu. */
  const teamTasks = () => (mockMode
    ? S.tasks.list.map(t => ({ id: t.id, title: t.title, owner: t.owner, done: t.status === 'done', review: t.status === 'review' }))
    : liveTasks().map(t => ({ id: t.code, title: t.title, owner: t.assignee_id, done: t.progress === 'done', review: t.progress === 'review' })));

  /* ---------- Trạng thái trống: icon động, giải thích và nút tạo ở giữa ---------- */
  const ES_ART = {
    sprint: '<g class="es-float"><path d="M48 8c15 11 19 28 16 46H32c-3-18 1-35 16-46z" fill="#fff" stroke="#4d5bf0" stroke-width="3" stroke-linejoin="round"/><circle cx="48" cy="32" r="8" fill="#dfe5ff" stroke="#4d5bf0" stroke-width="3"/><path d="M32 52l-11 11 7 2 4-5zM64 52l11 11-7 2-4-5z" fill="#ff8a1f"/><path class="es-flame" d="M41 58q7 20 14 0z" fill="#ffc21a"/></g><circle class="es-star s1" cx="14" cy="22" r="3" fill="#4d5bf0"/><circle class="es-star s2" cx="82" cy="30" r="2.5" fill="#ff8a1f"/><circle class="es-star s3" cx="78" cy="74" r="3" fill="#14b86a"/>',
    survey: '<g class="es-float"><rect x="22" y="14" width="52" height="68" rx="9" fill="#fff" stroke="#ff8a1f" stroke-width="3"/><rect x="36" y="9" width="24" height="12" rx="5" fill="#ffd9b0" stroke="#ff8a1f" stroke-width="3"/><path class="es-check c1" d="M31 38l4 4 7-8" fill="none" stroke="#14b86a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path class="es-check c2" d="M31 56l4 4 7-8" fill="none" stroke="#14b86a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 38h18M48 56h18" stroke="#cfd6ea" stroke-width="4" stroke-linecap="round"/></g><circle class="es-star s1" cx="12" cy="30" r="3" fill="#ff8a1f"/><circle class="es-star s2" cx="86" cy="22" r="2.5" fill="#4d5bf0"/>',
    deck: '<g class="es-float"><rect x="12" y="18" width="72" height="48" rx="9" fill="#fff" stroke="#ff8a1f" stroke-width="3"/><circle cx="38" cy="40" r="3" fill="#121a33"/><circle cx="58" cy="40" r="3" fill="#121a33"/><path d="M40 50q8 7 16 0" fill="none" stroke="#121a33" stroke-width="3" stroke-linecap="round"/><circle cx="29" cy="48" r="4" fill="#ffb3bd" opacity=".8"/><circle cx="67" cy="48" r="4" fill="#ffb3bd" opacity=".8"/><path d="M48 66v12M36 80h24" stroke="#8b95b8" stroke-width="4" stroke-linecap="round"/></g><circle class="es-star s1" cx="10" cy="14" r="3" fill="#4d5bf0"/><circle class="es-star s3" cx="88" cy="70" r="3" fill="#14b86a"/>',
    ads: '<g class="es-float"><path d="M20 38h14l30-18v52L34 54H20z" fill="#fff" stroke="#ff8a1f" stroke-width="3" stroke-linejoin="round"/><path d="M34 54l6 20h10l-5-17" fill="#ffd9b0" stroke="#ff8a1f" stroke-width="3" stroke-linejoin="round"/></g><path class="es-wave w1" d="M72 36q8 10 0 20" fill="none" stroke="#ff8a1f" stroke-width="3.5" stroke-linecap="round"/><path class="es-wave w2" d="M80 28q14 18 0 36" fill="none" stroke="#ffc21a" stroke-width="3.5" stroke-linecap="round"/>'
  };
  function emptyState(kind, title, text, action) {
    return `<div class="empty-state"><svg class="es-art" viewBox="0 0 96 96" aria-hidden="true" focusable="false">${ES_ART[kind]}</svg>
      <h3>${title}</h3><p>${text}</p>${action ? `<div class="es-action">${action}</div>` : ''}</div>`;
  }

  /* ---------- Sprint: nằm ngay trong tab Planning, thu gọn sẵn, mở ra là Gantt ---------- */
  let ganttOpen = false;
  const DAY_MS = 864e5;
  const dayOf = v => Date.parse(String(v).slice(0, 10));
  const dayFormat = t => dueFormat.format(new Date(t));
  function currentSprint(sprints) {
    const now = Date.now();
    return sprints.find(sp => dayOf(sp.starts_on) <= now && now < dayOf(sp.ends_on) + DAY_MS)
      || sprints.find(sp => sp.tasks.some(t => t.progress !== 'done')) || sprints[sprints.length - 1];
  }
  function ganttChart(sprints) {
    const start = Math.min(...sprints.map(sp => dayOf(sp.starts_on)));
    const end = Math.max(...sprints.map(sp => dayOf(sp.ends_on))) + DAY_MS;
    const span = Math.max(DAY_MS, end - start), pct_ = t => Math.max(0, Math.min(100, ((t - start) / span) * 100));
    const ticks = [];
    for (let t = start; t < end; t += 7 * DAY_MS) ticks.push(`<span style="left:${pct_(t).toFixed(2)}%">${dayFormat(t)}</span>`);
    const now = Date.now(), today = now >= start && now < end ? `<i class="gt-today" style="left:${pct_(now).toFixed(2)}%" title="Hôm nay"></i>` : '';
    const wk = ((7 * DAY_MS) / span * 100).toFixed(3);
    const track = inner => `<div class="gt-track" style="--wk:${wk}%">${today}${inner}</div>`;
    const rows = sprints.map((sp, i) => {
      const tone = SPRINT_TONES[i % SPRINT_TONES.length], a = pct_(dayOf(sp.starts_on)), b = pct_(dayOf(sp.ends_on) + DAY_MS);
      const head = `<div class="gt-row gt-sprint" style="--sp:${tone}"><span class="gt-label"><b>${esc(sp.title)}</b></span>${track(`<i class="gt-bar sprint" style="left:${a.toFixed(2)}%;width:${Math.max(1.5, b - a).toFixed(2)}%" title="${esc(sp.title)}: ${dayFormat(dayOf(sp.starts_on))} đến ${dayFormat(dayOf(sp.ends_on))}"></i>`)}</div>`;
      const tasks = sp.tasks.map(t => {
        const to = Math.max(dayOf(t.deadline) + DAY_MS, dayOf(sp.starts_on) + DAY_MS), w = Math.max(1.5, pct_(to) - a);
        return `<div class="gt-row" style="--sp:${tone}"><span class="gt-label" title="${esc(t.title)}"><span class="muted">${esc(t.code)}</span> ${esc(t.title)}</span>${track(`<i class="gt-bar ${esc(t.progress)}" style="left:${a.toFixed(2)}%;width:${w.toFixed(2)}%" title="${esc(t.code)} · ${esc(STATUS[columnOf(t.progress)][0])} · hạn ${dayFormat(dayOf(t.deadline))}"></i>`)}</div>`;
      }).join('');
      return head + tasks;
    }).join('');
    return `<div class="gantt" role="group" aria-label="Biểu đồ Gantt các sprint"><div class="gt-inner"><div class="gt-row gt-axis"><span class="gt-label"></span><div class="gt-track gt-ticks">${ticks.join('')}</div></div>${rows}</div></div>`;
  }
  function sprintPanel() {
    const sprints = live.sprints || [];
    if (!sprints.length) {
      return `<div class="panel">${panelHead('Sprint')}${emptyState('sprint', 'Tạo sprint tự động',
        'Sprint là một chặng làm việc ngắn, thường 1 đến 2 tuần, có mục tiêu rõ ràng. Agent chia Canvas thành các task nhỏ, nhóm giao người và đặt hạn, hết chặng thì xem task nào đã xong.',
        btn('planning-live', 'Tạo sprint tự động', 'primary big', `aria-haspopup="dialog"`))}</div>`;
    }
    const cur = currentSprint(sprints), total = cur.tasks.length, done = cur.tasks.filter(t => t.progress === 'done').length;
    const ratio = total ? Math.round((done / total) * 100) : 0;
    const toggle = btn('sprint-gantt', ganttOpen ? 'Thu gọn' : 'Xem Gantt', 'soft small', `aria-expanded="${ganttOpen}" aria-controls="ganttBox"`);
    return `<div class="panel">${panelHead('Sprint', `<div class="row" style="gap:6px">${toggle}${btn('planning-live', 'Quản lý sprint', 'ghost small', 'aria-haspopup="dialog"')}</div>`)}
      <div class="sprint-now" style="--sp:${SPRINT_TONES[sprints.indexOf(cur) % SPRINT_TONES.length]}">
        <div><span class="task-tag task-sprint">Sprint hiện tại</span><h3>${esc(cur.title)}</h3><p class="muted">${dayFormat(dayOf(cur.starts_on))} đến ${dayFormat(dayOf(cur.ends_on))}${cur.goal ? ' · ' + esc(cur.goal) : ''}</p></div>
        <div class="sprint-prog"><b>${done}/${total}</b><span class="muted">task xong</span><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ratio}" aria-label="Tiến độ sprint hiện tại"><i style="width:${ratio}%"></i></div></div>
      </div>
      <div id="ganttBox" ${ganttOpen ? '' : 'hidden'}>${ganttOpen ? ganttChart(sprints) : ''}</div></div>`;
  }

  /* ---------- Thiết lập đầu tiên: chọn mô hình, đặt tên nhóm, kết nối GitHub, rồi mới tới bước Thinking ---------- */
  const MODEL_CHOICES = [
    ['house', 'Nhà tầng', 'Công trình đang xây: mỗi task xong thắp sáng thêm một khối.'],
    ['rubik', 'Khối Rubik', 'Các mặt ứng với từng bước, mặt trên tổng hợp tiến độ.'],
    ['uni', 'University', 'Khuôn viên nhiều công trình, mỗi công trình một bước.'],
    ['tree', 'Cây thông', 'Các tầng tán sáng dần theo tiến độ.']
  ];
  const OB_STEPS = ['Mô hình', 'Tên nhóm', 'GitHub'];
  let obStep = 0, obName = '', obTouched = false, obInvite = '';
  /* Chỉ khi chưa đăng nhập và chưa làm thao tác nào. Đang tải trạng thái (live === undefined) thì chưa quyết định. */
  const onboarding = () => !mockMode && live !== undefined && !(live && live.profile) && !started(0) && doneCount() === 0;
  function setupCard() {
    // Đã đặt tên mà chưa đăng nhập GitHub (vd tải lại trang): vào thẳng bước GitHub, bước này bắt buộc.
    if (!obTouched && obStep === 0 && S.meta.name) obStep = 2;
    const dots = OB_STEPS.map((t, i) => `<li class="${i < obStep ? 'done' : i === obStep ? 'now' : ''}"${i === obStep ? ' aria-current="step"' : ''}><span aria-hidden="true">${i < obStep ? '✓' : i + 1}</span>${t}</li>`).join('');
    let body = '';
    if (obStep === 0) {
      body = `<h2>Chọn mô hình hiển thị tiến độ</h2><p>Mô hình 3D sáng dần theo tiến độ của cả đội. Bạn đổi lại được bất cứ lúc nào.</p>
        <div class="ob-models" role="group" aria-label="Mô hình 3D">${MODEL_CHOICES.map(([id, name, note]) =>
          `<button type="button" class="ob-model ${local.model === id ? 'on' : ''}" data-act="ob-model" data-pick="${id}" aria-pressed="${local.model === id}"><b>${name}</b><span>${note}</span></button>`).join('')}</div>
        <div class="ob-actions">${btn('ob-next', 'Tiếp tục', 'primary big')}</div>`;
    } else if (obStep === 1) {
      body = `<h2>Đặt tên nhóm</h2><p>Tên này hiện trên đầu trang và trong các tài liệu nhóm tạo ra.</p>
        <form class="ob-form" data-form="ob-name"><input id="obName" aria-label="Tên nhóm" placeholder="Ví dụ: Chiikawa" maxlength="60" autocomplete="off" value="${esc(obName)}">
        <div class="ob-actions">${btn('ob-back', 'Quay lại', 'soft big', 'type="button"')}<button class="btn primary big">Tiếp tục</button></div></form>`;
    } else {
      body = `<h2>Đăng nhập bằng GitHub</h2><p>Tiến hành đăng nhập để hệ thống theo dõi tiến độ PR của nhóm.</p>
        <details class="ob-invite"${obInvite ? ' open' : ''}><summary>Có mã mời của đội?</summary>
          <label class="field">Mã mời<input id="obInvite" value="${esc(obInvite)}" maxlength="32" placeholder="ABCD-2345" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
          <p class="muted">Nhập mã để vào đội đã có sau khi đăng nhập. Không có mã thì bỏ trống, bạn sẽ lập đội mới.</p></details>
        <div class="ob-actions">${btn('ob-back', 'Quay lại', 'soft big')}${btn('ob-github', 'Đăng nhập bằng GitHub', 'primary big')}</div>`;
    }
    return `<section class="ov-setup" aria-label="Thiết lập nhóm"><ol class="ob-steps" style="--progress:${(obStep / (OB_STEPS.length - 1)) * 100}">${dots}</ol>${body}</section>`;
  }

  /* ---------- Quality (hai tab: Số đo, Chi phí) và Maintaining: gọn, mỗi khối một việc ---------- */
  Object.assign(ES_ART, {
    think: '<g class="es-float"><circle cx="48" cy="40" r="22" fill="#fff" stroke="#0a9cf0" stroke-width="3"/><path d="M41 36q0-8 7-8t7 8q0 5-7 8v3" fill="none" stroke="#0a9cf0" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48" cy="55" r="2.4" fill="#0a9cf0"/><path d="M40 66h16M43 73h10" stroke="#8b95b8" stroke-width="4" stroke-linecap="round"/></g><path class="es-star s1" d="M48 6v7M22 16l5 5M74 16l-5 5M10 40h7M79 40h7" stroke="#ffc21a" stroke-width="3.5" stroke-linecap="round"/><circle class="es-star s3" cx="84" cy="70" r="3" fill="#14b86a"/>',
    metrics: '<g class="es-float"><path d="M16 66a32 32 0 0 1 64 0" fill="none" stroke="#dfe4ff" stroke-width="10" stroke-linecap="round"/><path d="M16 66a32 32 0 0 1 36-31.7" fill="none" stroke="#4d5bf0" stroke-width="10" stroke-linecap="round"/><g class="es-needle"><path d="M48 66L64 42" stroke="#121a33" stroke-width="4" stroke-linecap="round"/></g><circle cx="48" cy="66" r="6" fill="#121a33"/></g><circle class="es-star s1" cx="12" cy="24" r="3" fill="#14b86a"/><circle class="es-star s2" cx="86" cy="30" r="2.5" fill="#ff8a1f"/>',
    history: '<g class="es-float"><circle cx="48" cy="46" r="30" fill="#fff" stroke="#4d5bf0" stroke-width="3"/><path d="M48 46V28" stroke="#121a33" stroke-width="4" stroke-linecap="round"/><g class="es-hand"><path d="M48 46h14" stroke="#4d5bf0" stroke-width="4" stroke-linecap="round"/></g><circle cx="48" cy="46" r="4" fill="#121a33"/><path d="M48 20v4M74 46h-4M48 72v-4M22 46h4" stroke="#c9ceff" stroke-width="3" stroke-linecap="round"/></g><circle class="es-star s2" cx="84" cy="22" r="3" fill="#14b86a"/>',
    calendar: '<g class="es-float"><rect x="16" y="20" width="64" height="58" rx="10" fill="#fff" stroke="#a24ce8" stroke-width="3"/><path d="M16 36h64" stroke="#a24ce8" stroke-width="3"/><path d="M32 14v12M64 14v12" stroke="#a24ce8" stroke-width="4" stroke-linecap="round"/><path class="es-check c1" d="M30 56l7 7 13-15" fill="none" stroke="#14b86a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M58 50h12M58 62h12" stroke="#e6d3fa" stroke-width="4" stroke-linecap="round"/></g><circle class="es-star s1" cx="10" cy="30" r="3" fill="#ff8a1f"/>',
    update: '<g class="es-float"><g class="es-spin"><path d="M70 40A24 24 0 0 0 26 38" fill="none" stroke="#a24ce8" stroke-width="6" stroke-linecap="round"/><path d="M26 56a24 24 0 0 0 44 2" fill="none" stroke="#c68af0" stroke-width="6" stroke-linecap="round"/><path d="M60 38l12 4 2-12z" fill="#a24ce8"/><path d="M36 60l-12-4-2 12z" fill="#c68af0"/></g><circle cx="48" cy="48" r="7" fill="#121a33"/></g><circle class="es-star s3" cx="84" cy="70" r="3" fill="#14b86a"/>'
  });
  let qtab = 'metrics', runFormOpen = false, maintFormOpen = false;
  const REV_MODELS = [['sub', 'Thuê bao theo khách', 'Khách trả phí cố định mỗi tháng.'], ['usage', 'Theo lượt dùng', 'Tính tiền mỗi lượt gọi AI.'], ['setup', 'Gói triển khai', 'Thu một lần khi triển khai cho khách mới.']];

  function qualityMetrics(runs, src) {
    const q = S.quality, editing = q.runs.find(r => r.id === runEdit), samples = q.runs.filter(r => r.sample).length;
    const stale = q.metrics.length && src && q.source !== src;
    const metricsPanel = !q.metrics.length
      ? `<div class="panel">${panelHead('Chỉ số cần đạt')}${emptyState('metrics', 'Chưa có chỉ số', 'Chỉ số cho biết sản phẩm tốt tới mức nào, ví dụ tỉ lệ trả lời đúng từ 80%. Agent đọc Canvas và gợi ý giúp bạn.', btn('metrics', 'Ấn để gợi ý chỉ số tự động', 'primary big'))}</div>`
      : `<div class="panel">${panelHead('Chỉ số cần đạt', `<div class="row" style="gap:6px">${btn('metrics', 'Gợi ý lại', 'soft small')}${btn('addmetric', '+ Thêm chỉ số', 'soft small')}</div>`)}
        ${stale ? '<p class="muted" style="margin-bottom:8px">Canvas đã đổi, ấn Gợi ý lại để cập nhật.</p>' : ''}
        <div class="stack" style="gap:8px">${q.metrics.map(k => { const b = f => `data-bind="qmetric" data-id="${esc(k.id)}" data-field="${f}"`; return `<div class="metric">
          <div class="metric-top"><input class="metric-name" ${b('name')} value="${esc(k.name)}" aria-label="Tên chỉ số">${btn('delmetric', 'Bỏ', 'soft small', `data-id="${esc(k.id)}"`)}</div>
          <div class="goal"><span>Đạt khi</span><select ${b('direction')} aria-label="Ít nhất hay tối đa"><option value="up" ${k.direction !== 'down' ? 'selected' : ''}>ít nhất</option><option value="down" ${k.direction === 'down' ? 'selected' : ''}>tối đa</option></select>
            <input class="goal-num" type="number" step="any" ${b('target')} value="${esc(k.target)}" aria-label="Mục tiêu"><input class="goal-unit" ${b('unit')} value="${esc(k.unit)}" placeholder="đơn vị" aria-label="Đơn vị"></div></div>`; }).join('')}</div></div>`;
    const field = (name, label, value, attrs = 'type="number" min="0" step="any"') => `<label>${label}<input name="${esc(name)}" ${attrs} value="${esc(value)}"></label>`;
    const val = k => (editing ? editing[k] ?? '' : '');
    const formOpen = runFormOpen || Boolean(editing);
    const form = !formOpen ? '' : `<form class="run-simple stack" style="gap:10px;margin-bottom:12px" data-form="run" novalidate><input type="hidden" name="at" value="${esc(editing ? editing.at : nowLocal())}"><div class="cost">
        ${field('model', 'Model hoặc phiên bản', val('model'), 'required maxlength="80" placeholder="Ví dụ: prompt v4"')}
        ${field('passed', 'Số test pass', val('passed'), 'type="number" min="0" step="1"')}
        ${field('total', 'Tổng số test', val('total'), 'type="number" min="0" step="1"')}
        ${q.metrics.map(k => field('m_' + k.id, `${esc(k.name)}${k.unit ? ' (' + esc(k.unit) + ')' : ''}`, editing ? editing.values[k.id] ?? '' : '', 'type="number" step="any"')).join('')}
        ${field('actTok', 'Token thực tế (không bắt buộc)', val('actTok'), 'type="number" min="0" step="1"')}
      </div><div class="row"><button class="btn primary big">${editing ? 'Lưu' : 'Thêm'}</button>${btn('cancelrun', 'Hủy', 'soft big')}</div></form>`;
    const xs = runs.map(r => shortDate(r.at));
    const passSeries = [{ id: 'pass', name: 'Tỉ lệ test pass (%)', color: PALETTE[0], values: runs.map(r => (rate(r) === null ? null : +(rate(r) * 100).toFixed(1))) }];
    const chart = passSeries[0].values.some(v => v !== null) ? `<div style="margin-bottom:12px">${lineChart(xs, passSeries, 'Tỉ lệ test pass theo lần chạy')}</div>` : '';
    const rows = runs.slice().reverse().map(r => `<tr data-row="${esc(r.id)}"><td>${esc(shortDate(r.at))}${r.sample ? ' <span class="tag" style="--c:var(--yellow)">Mẫu</span>' : ''}</td><td>${esc(r.model)}</td>
        <td>${rate(r) === null ? '<span class="muted">Chưa khai</span>' : `${+r.passed}/${+r.total} <span class="muted">(${pct(rate(r))})</span>`}</td>
        <td>${q.metrics.map(k => { const v = num(r.values[k.id]); return v === null ? '' : `${esc(k.name)}: ${+v.toFixed(2)}${esc(k.unit)}${meets(k, v) ? '' : ' <span class="tag" style="--c:var(--orange)">Chưa đạt</span>'}`; }).filter(Boolean).join('<br>') || '<span class="muted">—</span>'}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">${btn('editrun', 'Sửa', 'soft small', `data-id="${esc(r.id)}"`)}${btn('delrun', 'Xóa', 'soft small', `data-id="${esc(r.id)}"`)}</div></td></tr>`).join('');
    const historyBody = !runs.length && !formOpen
      ? emptyState('history', 'Chưa có lần chạy nào', 'Mỗi lần đổi model hoặc prompt là một lần chạy thử. Ghi lại để thấy chất lượng đi lên hay đi xuống.', btn('runform', 'Ghi lần chạy đầu tiên', 'primary big'))
      : form + chart + (runs.length ? `<div class="scroll"><table><thead><tr><th>Thời điểm</th><th>Model</th><th>Pass</th><th>Chỉ số</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '');
    const historyHead = runs.length || formOpen ? panelHead('Lịch sử AI', `<div class="row" style="gap:6px">${samples ? btn('clearsample', 'Xóa dữ liệu mẫu', 'soft small') : ''}${btn('runform', formOpen ? 'Đóng' : '+ Ghi lần chạy', 'soft small')}</div>`) : panelHead('Lịch sử AI');
    return metricsPanel + `<div class="panel">${historyHead}${historyBody}</div>`;
  }

  function qualityCost(runs) {
    const q = S.quality, c = q.cost, m = money(), revModel = m.model;
    const numField = (k, l, step = 'any') => `<label>${l}<input type="number" min="0" step="${step}" data-bind="cost" data-id="${k}" value="${+c[k] || 0}"></label>`;
    const NEED = 'Cần chi phí AI';
    const revInputs = revModel === 'usage' ? numField('pricePerCall', 'Giá mỗi lượt gọi USD')
      : revModel === 'setup' ? numField('setupFee', 'Phí triển khai mỗi khách USD') + numField('newCustomers', 'Số khách mới mỗi tháng', '1')
        : numField('price', 'Giá mỗi khách USD/tháng') + numField('teams', 'Số khách trả phí', '1');
    const beText = !m.known ? NEED : revModel === 'usage' ? (m.breakEven !== null ? `${usd(m.breakEven)} / lượt` : 'Cần số lượt gọi')
      : revModel === 'setup' ? (m.breakEven !== null ? `${m.breakEven.toLocaleString('vi-VN')} khách/tháng` : 'Cần phí triển khai')
        : (m.breakEven !== null ? `${m.breakEven.toLocaleString('vi-VN')} khách` : 'Cần giá bán');
    const tpText = !m.known ? NEED : m.targetPrice === null ? 'Cần số khách hoặc lượt gọi' : `${usdUp(m.targetPrice)} / ${revModel === 'usage' ? 'lượt' : 'khách'}`;
    const tokens = runs.map(r => num(r.actTok));
    const tokenChart = tokens.some(v => v !== null)
      ? `<div style="margin-top:12px">${lineChart(runs.map(r => shortDate(r.at)), [{ name: 'Token thực tế', color: 'var(--blue)', values: tokens }], 'Token thực tế mỗi lần chạy')}</div>` : '';
    return `<div class="panel">${panelHead('Chi phí AI', '<span class="muted">Đơn giá và hạ tầng là giả định của đội</span>')}
        <div class="cost">${numField('pricePerM', 'Đơn giá USD / 1 triệu token')}${numField('apiCalls', 'Số lượt gọi API mỗi tháng', '1')}${numField('infra', 'Hạ tầng USD mỗi tháng')}</div>
        <div class="kpis">${[['Chi phí mỗi lượt gọi', m.perCase], ['Chi phí AI mỗi tháng', m.aiMonthly], ['Tổng chi mỗi tháng', m.totalCost]].map(([l, v]) => `<div class="kpi"><b>${v === null ? '—' : usd(v)}</b><span>${l}</span></div>`).join('')}</div>
        ${m.known ? '' : `<p class="muted" style="margin-top:8px">${m.priced ? 'Cần ít nhất một lần chạy có tổng số test và token thực tế. Ghi ở tab Số đo.' : 'Nhập đơn giá token để tính chi phí.'}</p>`}${tokenChart}</div>
      <div class="panel">${panelHead('Cách thu lợi nhuận', '<span class="muted">Chọn một cách để thử số</span>')}
        <div class="rev-cards" role="group" aria-label="Cách thu tiền">${REV_MODELS.map(([id, name, text]) => `<button type="button" class="rev-card ${revModel === id ? 'on' : ''}" data-act="revpick" data-id="${id}" aria-pressed="${revModel === id}"><b>${name}</b><span>${text}</span></button>`).join('')}</div>
        <div class="cost" style="margin-top:12px">${revInputs}</div>
        <div class="kpis">${[['Doanh thu mỗi tháng', usd(m.revenue), false], ['Lãi hoặc lỗ mỗi tháng', m.known ? usd(m.profit) : NEED, m.known && m.profit < 0], ['Hòa vốn', beText, false], [`Giá để đạt biên ${pct(PROFIT.targetMargin)}`, tpText, false]]
          .map(([l, v, warn]) => `<div class="kpi${warn ? ' is-warn' : ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div></div>`;
  }

  const views = {
    overview() {
      if (!mockMode && live === undefined) return '';
      if (onboarding()) return mobile.matches ? `<div class="stack">${setupCard()}</div>` : setupCard();
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
      const roleMap = mockMode ? S.plan.roles : (joined() && live.board.roles) || {};
      const team = S.meta.members.map(m => {
        const open = teamTasks().filter(t => t.owner === m.id && !t.done).length;
        const roles = ROLES.filter(r => roleMap[r] === m.id).join(', ') || 'Chưa có vai';
        return `<div>${avatar(m.id)}<span>${esc(m.name)}<br><span class="muted">${esc(roles)}, ${open} task mở</span></span></div>`;
      }).join('');
      if (mobile.matches) {
        const late = S.maintain.schedule.filter(x => x.next <= iso(new Date()));
        return `<div class="stack"><div class="view-head"><div><h2>Tổng quan</h2><p>${esc(S.meta.name)}</p></div></div>
          <div class="ov-cards">${cards}</div>
          <div class="panel">${panelHead('Ai đang làm gì')}<div class="ov-team">${team}</div></div>
          <div class="panel">${panelHead('Việc cần để ý')}${health().reasons.slice(0, 2).map(r => `<p>Sức khỏe ${esc(HNAMES[r.level].toLowerCase())}: ${esc(reasonText(r))}</p>`).join('')}${teamTasks().filter(t => t.review).map(t => `<p>${esc(t.id)} đang chờ review: ${esc(t.title)}</p>`).join('')}${late.map(x => `<p>Bảo trì đến hạn: ${esc(x.title)}</p>`).join('') || ''}${!late.length && !teamTasks().some(t => t.review) && !health().reasons.length ? '<p class="muted">Không có việc gấp.</p>' : ''}</div></div>`;
      }
      return `<div class="ov-title"><h2>${STEPS[cur].name}</h2><p>${STEP_HINT[STEPS[cur].id]}</p>${btn('tab', goLabel, 'primary big', `data-id="${STEPS[cur].id}"`)}</div>
        <div class="ov-team">${team}</div>`;
    },

    product() {
      return head(0, '') + `<div class="think" id="think">
        <section class="tk-box tk-intro" id="tkIntro">${emptyState('think', 'Chưa có AI MVP Canvas', 'Trò chuyện với agent để phân tích bài toán, tìm điểm đau của người dùng và hoàn thành AI MVP Canvas (khung phân tích bài toán). Agent cũng giúp bạn quyết định có nên thực hiện dự án hay không.', btn('think-start', 'Bắt đầu trao đổi với agent', 'primary big'))}</section>
        <div class="tk-cols">
          <div class="tk-col1">
            <section class="tk-box tk-eval" id="tkEval"></section>
            <section class="tk-box tk-canvas" id="tkCanvas"></section>
          </div>
          <section class="tk-box tk-chat"><div class="tk-head"><h3>Trao đổi với agent</h3><button type="button" class="btn soft small" data-act="think-reset" title="Xoá cuộc trao đổi và Canvas, bắt đầu lại">Làm mới</button></div><div class="tk-msgs" id="tkMsgs" aria-live="polite"></div>
            <form class="tk-compose" data-form="think"><input aria-label="Tin nhắn" placeholder="Kể ý tưởng của bạn hoặc trả lời câu hỏi của agent" autocomplete="off" maxlength="2000"><button class="btn tone" style="--c:var(--blue)">Gửi</button></form></section>
        </div>
      </div>`;
    },

    planning() {
      const text = '';
      // Chưa đăng nhập hoặc chưa có đội: chỉ còn tiêu đề và phần thiết lập đội bên dưới.
      if (!joined()) return head(1, text);
      return head(1, text, headActions()) + `<div class="stack">
        ${sprintPanel()}
        ${taskBoard()}
      </div>`;
    },

    pitching() {
      const p = S.pitch;
      const list = Array.isArray(surveysCache) ? surveysCache : [];
      const hasSurveys = list.length > 0;
      const curDeckSlug = activeDeckSurveySlug();
      const selSurvey = list.find(x => x.slug === curDeckSlug);
      const deckSourceBox = hasSurveys ? `<div class="deck-source">
        <label for="deckSurveySel" style="font-size:13px;font-weight:500">Dữ liệu khảo sát đưa vào slide</label>
        <select id="deckSurveySel" data-bind="deckSurveySlug" aria-label="Chọn khảo sát đưa vào slide">
          ${list.map(s => `<option value="${esc(s.slug)}" ${curDeckSlug === s.slug ? 'selected' : ''}>${esc(s.title)} (${+s.response_count || 0} phản hồi)</option>`).join('')}
          <option value="__none__" ${curDeckSlug === '__none__' ? 'selected' : ''}>Chỉ dùng Product thinking</option>
        </select>
      </div>` : '';
      const deckVisible = !!(p.deckShown && p.deck && p.deck.length);
      if (deckVisible && activeSlideIdx >= p.deck.length) activeSlideIdx = Math.max(0, p.deck.length - 1);
      const slideTitle = (p.deckTitle || S.meta.name || 'Pitching Deck').trim();
      const deck = deckVisible ? `<div class="deck" tabindex="0">${p.deck.map((s, i) => renderSlideCard(s, i, p.deck.length, slideTitle)).join('')}</div>
        ${renderSlideEditorBox()}
        <div class="slide-nav">
          <div class="row" style="gap:6px">${btn('slide', '← Trang trước', 'soft small', 'data-n="-1"')}${btn('slide', 'Trang sau →', 'soft small', 'data-n="1"')}${btn('fullDeck', 'Toàn màn hình', 'soft small')}</div>
          <div class="row" style="gap:8px">${btn('saveDeck', p.deckSlug ? 'Lưu cập nhật' : 'Lưu & lấy link', 'primary small')}${btn('copy', 'Sao chép HTML', 'soft small', 'data-id="html"')}${btn('download', 'Tải HTML', 'soft small')}</div>
        </div>
        ${p.deckSlug ? `<div class="pub-box" style="margin-top:12px"><div class="row"><input readonly value="${esc(location.origin + '/pitch?slug=' + p.deckSlug)}" aria-label="Link slide">${btn('copyDeckLink', 'Sao chép link', 'tone small')}<a class="btn soft small" style="text-decoration:none" href="/pitch?slug=${encodeURIComponent(p.deckSlug)}" target="_blank" rel="noopener">Mở</a></div></div>` : ''}`
        : emptyState('deck', 'Chưa có Pitching HTML', 'Bộ slide dựng từ Canvas và kết quả khảo sát. Bạn chỉnh từng trang, xem toàn màn hình hoặc xuất ra HTML.', btn('deck', 'Tạo slide', 'primary big'));
      const mainAd = Array.isArray(p.adPosts) && p.adPosts.length ? p.adPosts[0] : null;
      const linkSurveySlug = activeTileSlug();
      const adsCard = `<div class="panel">${panelHead('Bài quảng cáo', mainAd || p.ads ? btn('ads', 'Tạo lại', 'primary small') : '')}${mainAd
        ? `<div class="stack" style="gap:10px">
            ${Array.isArray(mainAd.placeholders) && mainAd.placeholders.length ? `<div class="ph-row">${mainAd.placeholders.map(ph => `<span class="tag">${esc(ph)}</span>`).join('')}</div>` : ''}
            <textarea class="script-edit" data-bind="adFull" data-id="0" aria-label="Nội dung bài quảng cáo">${esc(adFullText(mainAd))}</textarea>
            <div class="row" style="gap:8px">${linkSurveySlug ? btn('insertSurveyInAd', 'Chèn link khảo sát', 'soft small', 'data-id="0"') : ''}${btn('copyAd', 'Sao chép', 'soft small', 'data-id="0"')}</div>
            <p class="muted" style="font-size:13px">Điền các phần còn thiếu trong ngoặc [...] trước khi sao chép và đăng bài lên diễn đàn.</p>
          </div>`
        : p.ads
          ? `<textarea class="script-edit" data-bind="pitchAdsPlain" aria-label="Nội dung bài quảng cáo">${esc(p.ads)}</textarea><p style="margin-top:10px">${btn('copy', 'Sao chép', 'soft small', 'data-id="ads"')}</p><p class="muted" style="font-size:13px;margin-top:6px">Điền các phần còn thiếu trong ngoặc [...] trước khi sao chép và đăng bài lên diễn đàn.</p>`
          : emptyState('ads', 'Chưa có bài quảng cáo', 'Agent soạn bài đăng kèm chỗ trống [...] để bạn điền trước khi đăng lên diễn đàn.', btn('ads', 'Tạo bài quảng cáo', 'primary big'))}</div>`;
      const topActions = hasSurveys
        ? `<div class="row" style="gap:6px">${btn('openSelectedEdit', 'Xem khảo sát', 'tone small')}${btn('openSelectedStats', 'Dashboard', 'soft small')}${btn('copySelectedLink', 'Copy link', 'soft small')}${btn('reloadSurveys', 'Làm mới', 'ghost small')}</div>`
        : `<div class="row" style="gap:6px">${btn('reloadSurveys', 'Làm mới', 'ghost small')}</div>`;
      const bottomBar = hasSurveys ? `<div class="survey-bottom">${btn('openCreateSurvey', '+ Tạo khảo sát', 'primary small')}</div>` : '';
      const hasDeck = !!(p.deck && p.deck.length) || !!p.deckSlug;
      const deckActs = `<div class="row" style="gap:6px">${deckVisible ? btn('hideDeck', 'Thu gọn slide', 'soft small') : (hasDeck ? btn('showDeck', 'Mở slide', 'soft small') : '')}${hasDeck ? btn('clearDeck', 'Xóa slide', 'danger small') + btn('deck', 'Tạo lại slide', 'primary small') : ''}</div>`;
      return head(2, '') + `<div class="stack">
        <div class="panel survey-panel">${panelHead('Khảo sát', topActions)}${publishedPanel()}${bottomBar}</div>
        <div class="panel">${panelHead('Pitching HTML', deckActs)}${deckSourceBox}${deck}</div>
        ${adsCard}</div>`;
    },

    quality() {
      const runs = sortedRuns(), src = S.score.metric.text.trim();
      const tabs = `<div class="seg tabs-big" role="group" aria-label="Khu vực Quality">${[['metrics', 'Số đo'], ['cost', 'Chi phí']].map(([id, n]) => `<button type="button" data-act="qtab" data-id="${id}" class="${qtab === id ? 'on' : ''}" aria-pressed="${qtab === id}">${n}</button>`).join('')}</div>`;
      const intro = head(3, '', tabs), gate = teamGate('Chỉ số và lần chạy thử');
      if (gate) return intro + gate;
      return intro + `<div class="stack">${qtab === 'cost' ? qualityCost(runs) : qualityMetrics(runs, src)}</div>`;
    },

    maintaining() {
      const m = S.maintain, today = iso(new Date()), suggest = m.suggest || [];
      const intro = head(4, ''), gate = teamGate('Lịch bảo trì');
      if (gate) return intro + gate;
      const rows = m.schedule.slice().sort((a, b) => a.next.localeCompare(b.next));
      const form = !maintFormOpen ? '' : `<form class="maint-form stack" style="gap:10px;margin-top:12px" data-form="maint" novalidate><div class="cost">
          <label>Việc cần làm<input name="title" required maxlength="120" placeholder="Ví dụ: Rà lại câu trả lời sai chính sách"></label>
          <label>Chu kỳ (ngày)<input name="every" type="number" min="1" max="365" step="1" value="7" required></label>
          <label>Hạn đầu tiên<input name="next" type="date" value="${today}" required></label>
          <label>Người làm<select name="owner">${options('')}</select></label>
        </div><div class="row"><button class="btn primary big">Thêm</button>${btn('maintform', 'Hủy', 'soft big')}</div></form>`;
      const table = `<div class="scroll"><table><thead><tr><th>Việc</th><th>Hạn tới</th><th>Người làm</th><th></th></tr></thead><tbody>${rows.map(x => `<tr data-row="${esc(x.id)}"><td>${esc(x.title)}<br><span class="muted">Mỗi ${+x.every} ngày, đã làm ${+x.runs || 0} lần</span></td><td><span class="tag" style="--c:var(${x.next <= today ? '--orange' : '--violet'})">${x.next <= today ? 'Đến hạn ' : ''}${esc(x.next.split('-').reverse().join('/'))}</span></td><td><select data-bind="mowner" data-id="${esc(x.id)}" aria-label="Người làm">${options(x.owner)}</select></td><td><div class="row" style="gap:6px;flex-wrap:nowrap">${btn('ran', 'Đã làm', 'tone small', `data-id="${esc(x.id)}"`)}${btn('delmaint', 'Xóa', 'soft small danger', `data-id="${esc(x.id)}"`)}</div></td></tr>`).join('')}</tbody></table></div>`;
      const schedule = !rows.length && !maintFormOpen
        ? emptyState('calendar', 'Chưa có lịch bảo trì', 'Đặt các việc lặp lại như rà câu trả lời hay cập nhật model. Đến hạn là có nhắc.', btn('maintform', 'Thêm việc đầu tiên', 'primary big'))
        : (rows.length ? table : '') + form;
      const scheduleHead = rows.length || maintFormOpen ? panelHead('Lịch bảo trì', btn('maintform', maintFormOpen ? 'Đóng' : '+ Thêm việc', 'soft small')) : panelHead('Lịch bảo trì');
      const suggestBody = suggest.length
        ? `<div class="suggest-list">${suggest.map((x, i) => `<div class="suggest-row"><div class="suggest-info"><div class="row" style="gap:8px"><span>${esc(x.title)}</span><span class="tag" style="--c:var(--violet)">Mỗi ${+x.every} ngày</span></div><span class="muted">${esc(x.why)}</span></div><div class="row" style="gap:6px">${btn('addsuggest', 'Thêm vào lịch', 'soft small', `data-id="${esc(x.id || '')}" data-n="${i}"`)}${btn('dismisssuggest', 'Bỏ qua', 'soft small', `data-id="${esc(x.id || '')}" data-n="${i}"`)}</div></div>`).join('')}</div>`
        : emptyState('update', 'Chưa có gợi ý cập nhật', 'Agent xem số liệu ở Quality rồi gợi ý việc cần làm khi model hoặc giá thay đổi.', btn('cadence', 'Nhận gợi ý', 'primary big'));
      return intro + `<div class="stack"><div class="panel">${scheduleHead}${schedule}</div>
        <div class="panel">${panelHead('Gợi ý cập nhật', suggest.length ? btn('cadence', 'Gợi ý lại', 'soft small') : '')}${suggestBody}</div></div>`;
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
        <span><b>${esc(ctx.project_name)}</b></span>
        ${btn('tab', 'Sửa ở Product thinking', 'soft small', 'data-id="product"')}
      </div>
      <span class="muted" style="margin-top:2px">Đối tượng nhận form</span>
      <div class="row">${roleOptions.map(r => `<button type="button" class="btn small ${curRole === r ? 'tone' : 'soft'}" data-act="pickRole" data-id="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <input data-bind="targetRole" value="${esc(curRole)}" placeholder="Hoặc nhập đối tượng khác">
      <div class="row" style="justify-content:flex-end;margin-top:4px">
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
      ? '<span class="tag">Đang sửa</span>'
      : target.draftSource === 'llm'
        ? '<span class="tag" style="--c:var(--green)">AI Gemini</span>'
        : target.draftSource === 'fallback'
          ? '<span class="tag">Theo Product thinking</span>'
          : '<span class="tag">Bản nháp</span>';
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

    const leftFootBtns = `${btn('addSec', '+ Thêm section', 'soft small')}${btn('addQ', '+ Thêm câu hỏi', 'soft small')}`;
    const saveFootBtn = isEdit ? btn('saveEdit', 'Lưu thay đổi', 'primary') : btn('publishSurvey', 'Lưu khảo sát', 'primary');
    const showSlug = isEdit && (lastSavedSlug === target.slug || target.slug);
    const linkBox = isEdit && showSlug && lastSavedSlug === target.slug
      ? `<div class="pub-box"><div class="row"><input readonly value="${esc(location.origin + '/survey?slug=' + target.slug)}" aria-label="Link khảo sát">${btn('copySlug', 'Sao chép link', 'tone small', `data-id="${esc(target.slug)}"`)}<a class="btn soft small" style="text-decoration:none" href="/survey?slug=${encodeURIComponent(target.slug)}" target="_blank" rel="noopener">Mở</a></div></div>`
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
      <div class="gf-foot-bar"><div class="row" style="gap:8px">${leftFootBtns}</div>${saveFootBtn}</div>
      ${linkBox}
    </div>`;
  }

  const CHART_COLORS = ['#ff8a1f', '#0a9cf0', '#14b86a', '#4d5bf0', '#a24ce8', '#ff4d5e'];
  function pitchCtx() {
    const t = activeEditorTarget();
    const list = Array.isArray(surveysCache) ? surveysCache : [];
    const selSlug = activeDeckSurveySlug();
    const selSurvey = selSlug && selSlug !== '__none__' ? list.find(x => x.slug === selSlug) : null;
    const role = (t.targetRole || S.pitch.targetRole || (selSurvey && selSurvey.target_role) || '').trim();
    const chatNotes = (S.chat || []).filter(m => m.who !== 'agent').slice(-4).map(m => m.text).join(' | ');
    const canvas = (tk.run && tk.run.proposal && tk.run.proposal.canvas) || {};
    const canvasName = String((canvas.solution && canvas.solution.content) || '').trim();
    return {
      // Chưa đặt tên dự án thì lấy Solution của Canvas hiện tại, không mượn tên của khảo sát cũ
      project_name: (sideMode === 'survey' && editSurveyTarget && editSurveyTarget.project_name) || (S.meta.name || '').trim() || canvasName || (selSurvey && selSurvey.project_name) || 'Sản phẩm AI',
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
    if (surveysLoading && !list) return '<div class="empty-note">Đang tải danh sách khảo sát…</div>';
    if (surveysError) return `<div class="empty-note">${esc(surveysError)}</div>`;
    if (!list) return '<div class="empty-note">Đang tải danh sách khảo sát…</div>';
    if (!list.length) return emptyState('survey', 'Chưa có khảo sát', 'Khảo sát giúp bạn hỏi người dùng thật trước khi kể chuyện. Agent soạn câu hỏi từ Canvas, bạn chỉnh rồi phát hành link để thu phản hồi.', btn('openCreateSurvey', 'Tạo khảo sát', 'primary big'));
    const curSel = activeTileSlug();
    return `<div class="survey-grid">${list.map(s => `<button type="button" class="survey-tile${(sideSlug || curSel) === s.slug ? ' on' : ''}" data-act="openSurveySide" data-id="${esc(s.slug)}">
      <span class="survey-tile-title">${esc(s.title)}</span>
      <span class="survey-tile-meta">
        ${s.target_role ? `<span class="tag" style="--c:var(--orange)">${esc(s.target_role)}</span>` : ''}
        <span class="tag" style="--c:var(--ink)"><b data-resp-count="${esc(s.slug)}">${+s.response_count || 0}</b> phản hồi</span>
      </span>
    </button>`).join('')}</div>`;
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
    const list = S.pitch.deck || [];
    const title = (S.pitch.deckTitle || S.meta.name || 'Pitching Deck').trim();
    const slides = list.map((s, i) => renderSlideCard(s, i, list.length, title)).join('\n');
    return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>*{box-sizing:border-box;font-style:normal}:root{--ink:#121a33;--mute:#626d8c;--line:#e7ebf5;--soft:#f4f6fc}body{margin:0;font-family:"Be Vietnam Pro",system-ui,Arial,sans-serif;color:var(--ink);background:#fff;scroll-snap-type:y mandatory;overflow-y:auto;height:100vh}.slide{height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:space-between;gap:24px;padding:clamp(28px,6vw,72px);background:radial-gradient(circle at 95% 6%,color-mix(in srgb,var(--s) 13%,#fff),#fff 56%);border-bottom:1px solid var(--line)}.slide.is-hero{background:radial-gradient(circle at 88% 12%,color-mix(in srgb,var(--s) 24%,#fff),#fff 64%)}.slide-prog{height:4px;background:var(--line);border-radius:99px;overflow:hidden}.slide-prog>span{display:block;height:100%;background:var(--s)}.slide-top{display:flex;justify-content:space-between;align-items:center}.slide-kicker{display:inline-flex;align-items:center;gap:8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:500;background:color-mix(in srgb,var(--s) 14%,#fff);padding:5px 14px;border-radius:99px}.slide-kicker::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--s)}.slide-num{font-size:14px;color:var(--mute);font-variant-numeric:tabular-nums}.slide-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(240px,.85fr);gap:32px;align-items:center}.slide-main{display:grid;gap:16px}h3{font-weight:500;font-size:clamp(26px,4vw,48px);margin:0;letter-spacing:-0.025em;line-height:1.15}.is-hero h3{font-size:clamp(32px,4.8vw,56px)}p{font-size:clamp(16px,1.7vw,22px);color:#475569;line-height:1.6;max-width:48ch;margin:0}.slide-list{margin:0;padding:0;list-style:none;display:grid;gap:12px}.slide-list li{position:relative;padding-left:22px;font-size:clamp(16px,1.7vw,22px);line-height:1.55}.slide-list li::before{content:"";position:absolute;left:0;top:.62em;width:8px;height:8px;border-radius:50%;background:var(--s)}.slide-callout{border-left:4px solid var(--s);background:color-mix(in srgb,var(--s) 8%,#fff);border-radius:0 16px 16px 0;padding:20px 24px;display:grid;gap:6px}.slide-callout small,.slide-stat small,.slide-col small,.slide-pill small{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mute)}.slide-callout b,.slide-stat b{font-size:clamp(18px,2vw,26px);font-weight:500;line-height:1.35}.slide-pills{display:flex;flex-wrap:wrap;gap:12px}.slide-pill{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 16px;font-size:16px;display:grid;gap:3px}.slide-cards,.slide-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.slide-card,.slide-step{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;display:grid;gap:8px;align-content:start}.slide-card{border-top:4px solid var(--s)}.slide-card-no{font-size:12px;font-weight:600;color:var(--s)}.slide-step-no{width:30px;height:30px;border-radius:50%;background:var(--s);color:#fff;font-size:14px;font-weight:600;display:grid;place-items:center}.slide-card b,.slide-step b{font-size:18px;font-weight:500}.slide-card span,.slide-step span{font-size:16px;color:var(--mute);line-height:1.5}.slide-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.slide-col{border:1px solid var(--line);border-radius:16px;padding:22px;background:var(--soft);display:grid;gap:8px;align-content:start}.slide-col.accent{background:color-mix(in srgb,var(--s) 8%,#fff);border-color:color-mix(in srgb,var(--s) 35%,var(--line))}.slide-col b{font-size:19px;font-weight:500;line-height:1.45}.slide-metric-grid{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.4fr);gap:28px;align-items:center}.slide-stat{background:color-mix(in srgb,var(--s) 10%,#fff);border:1px solid color-mix(in srgb,var(--s) 35%,var(--line));border-radius:18px;padding:26px;display:grid;gap:8px}.slide-stat b{font-size:clamp(26px,3.2vw,42px)}.slide-foot{display:flex;justify-content:space-between;font-size:13px;color:var(--mute);border-top:1px solid var(--line);padding-top:14px}@media(max-width:760px){.slide-grid,.slide-compare,.slide-metric-grid{grid-template-columns:1fr}}</style></head><body>\n${slides}\n<script>const s=[...document.querySelectorAll('.slide')];let i=0;document.addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown',' '].includes(e.key)){e.preventDefault();i=Math.min(s.length-1,i+1);s[i]?.scrollIntoView({behavior:'smooth'});}else if(['ArrowLeft','ArrowUp'].includes(e.key)){e.preventDefault();i=Math.max(0,i-1);s[i]?.scrollIntoView({behavior:'smooth'});}});</script></body></html>`;
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
      await copyTextWithFeedback(location.origin + '/survey?slug=' + created.slug, null, 'Đã lưu và copy link khảo sát', 'Đã lưu. Trình duyệt chặn copy, hãy sao chép link ở ô bên dưới.');
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
      await copyTextWithFeedback(location.origin + '/survey?slug=' + updated.slug, null, 'Đã lưu và copy link khảo sát', 'Đã lưu. Trình duyệt chặn copy, hãy sao chép link ở ô bên dưới.');
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
          highlight: String(s.highlight || '').trim(),
          layout: s.layout || 'auto'
        })),
        script: '',
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
        save('pitch');
        toast(out.source === 'llm' ? 'Đã tạo bài quảng cáo kèm placeholder bằng Gemini' : 'Đã tạo bài quảng cáo kèm placeholder');
        return ['pitch', () => rise($$('#view [data-bind="adFull"]'))];
      } catch (e) {
        toast('Không kết nối được backend để tạo bài quảng cáo.');
        return ['pitch', () => {}];
      }
    },
    async cadence() {
      const have = S.maintain.schedule.map(x => x.title);
      const out = await generate(`Gợi ý tối đa 4 việc bảo trì định kỳ cho sản phẩm, dựa trên tình trạng chất lượng và chi phí trong dữ liệu dự án. Không lặp các việc đã có: ${have.join('; ')}. every là số ngày giữa hai lần làm, từ 1 đến 180. why nói rõ dựa trên số liệu nào.`,
        '{"items":[{"title":"","every":7,"why":""}]}', o => o && Array.isArray(o.items) && o.items.length && o.items.every(t => str(t.title) && str(t.why) && +t.every >= 1),
        ruleCadence);
      const fresh = out.items.filter(t => !have.includes(t.title)).slice(0, 5).map(t => ({ title: String(t.title).slice(0, 120), every: Math.max(1, Math.min(180, Math.round(+t.every))), why: String(t.why).slice(0, 240), id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }));
      if (!fresh.length) toast('Lịch hiện tại đã bao gồm các gợi ý.');
      S.maintain.suggest = fresh; save('maintain');
      return ['maintain', () => rise($$('#view .suggest-row'))];
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
      S.quality.source = src;
      S.quality.nature = NATURE[out.nature] ? out.nature : natureOf(S.score.problem.text);
      save('quality');
      toast(`Đã lấy ${next.length} chỉ số từ scorecard${out.rule ? ' bằng luật tách số' : ''}.`);
      return ['quality', () => rise($$('#view .metric'))];
    }
  };

  /* ---------- Điều hướng và bố cục ---------- */
  let tab = 'overview', going = 0, stageAnim = null;
  const stage = $('#stage'), view = $('#view'), overlay = $('#overlay'), ws = $('#workspace');
  const planningFrame = $('#planningFrame');
  const planningLive = $('#planningLive');
  const viewContent = $('#viewContent');
  // Cỡ vùng nội dung đổi khi đổi cửa sổ, ẩn hiện mô hình hay xoay màn hình.
  if (view) new ResizeObserver(() => { if (tab === 'planning') fitBoard(); }).observe(view);
  const PLANNING_PARAMS = ['github', 'github_setup', 'setup_action', 'installation_id', 'task'];

  // Khung cao bằng nội dung nên cuộn cùng trang. Khung cần biết vùng đang thấy để đặt hộp thoại.
  let viewportFrame = 0;
  function sendPlanningViewport() {
    if (!planningLive || viewportFrame || planningLive.hidden) return;
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = 0;
      const drawer = planningLive.classList.contains('as-drawer');
      const frame = planningFrame.getBoundingClientRect(), box = (drawer ? $('#planningBody') : view).getBoundingClientRect();
      const start = Math.max(0, box.top) - frame.top;
      const end = Math.min(frame.height, Math.min(box.bottom, innerHeight - (mobile.matches && !drawer ? 64 : 0)) - frame.top);
      const height = Math.min(frame.height, Math.max(320, end - Math.max(0, start)));
      const top = Math.min(Math.max(0, start), Math.max(0, frame.height - height));
      planningFrame.contentWindow?.postMessage({ type: 'tang:planning-viewport', top, height }, location.origin);
    });
  }
  addEventListener('scroll', sendPlanningViewport, { capture: true, passive: true });
  addEventListener('resize', sendPlanningViewport);

  // Đã có đội thì phần đội, sprint và PR ẩn sẵn, bấm nút mới mở. Chưa có đội thì phải hiện để đăng nhập.
  let planningOpen = false;
  function updatePlanningPanel(visible) {
    const asDrawer = joined();
    const shown = visible && (asDrawer ? planningOpen : live !== undefined);
    const open = shown && asDrawer;
    // Chỉ đổi class và thuộc tính. Chuyển khung sang chỗ khác trong DOM sẽ làm khung tải lại.
    planningLive.hidden = !shown;
    planningLive.classList.toggle('as-drawer', asDrawer);
    $('#planningBackdrop').hidden = !open;
    view.classList.toggle('drawer-open', open);
    if (open) { planningLive.setAttribute('role', 'dialog'); planningLive.setAttribute('aria-modal', 'true'); }
    else { planningLive.removeAttribute('role'); planningLive.removeAttribute('aria-modal'); }
    ['.top', '#stage', '#viewContent', '#sideToggle'].forEach(selector => { const el = $(selector); if (el) el.inert = open; });
    sendPlanningViewport();
  }

  const PLANNING_TITLES = { board: 'Đội, sprint và PR', team: 'Thành viên', pulls: 'Pull request' };
  let planningView = 'board';
  function sendPlanningView() { planningFrame.contentWindow?.postMessage({ type: 'tang:planning-view', view: planningView }, location.origin); }
  planningFrame?.addEventListener('load', sendPlanningView);
  function setPlanningOpen(next, nextView = 'board') {
    if (!joined()) return;
    if (next) {
      planningView = nextView;
      $('#planningTitle').textContent = PLANNING_TITLES[nextView];
      planningLive.dataset.view = nextView;
      sendPlanningView();
    }
    if (planningOpen === next) return;
    planningOpen = next;
    updatePlanningPanel(tab === 'planning');
    drawPlanning();
    (next ? $('#planningClose') : $(`[data-act="planning-${planningView === 'board' ? 'live' : planningView}"]`, view))?.focus({ preventScroll: true });
  }

  function showPlanning(visible) {
    updatePlanningPanel(visible);
    const url = new URL(location.href);
    if (url.searchParams.get('tab') === 'planning') url.searchParams.delete('tab');
    if (visible) {
      if (!planningFrame.hasAttribute('src')) {
        const query = new URLSearchParams({ embed: 'workstation' });
        for (const name of PLANNING_PARAMS) {
          const value = url.searchParams.get(name);
          if (value !== null) query.set(name, value);
          url.searchParams.delete(name);
        }
        if (query.size > 1) {
          // Vừa quay về từ GitHub hoặc mở từ thông báo: mở sẵn để thấy kết quả.
          planningOpen = true;
          updatePlanningPanel(visible);
          planningFrame.addEventListener('load', () => planningLive.scrollIntoView({ block: 'start' }), { once: true });
        }
        planningFrame.src = '/planning?' + query;
      }
    }
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !planningFrame || event.source !== planningFrame.contentWindow) return;
    const data = event.data;
    if (data?.type === 'tang:planning-changed') loadPlanning();
    if (data?.type === 'tang:planning-close') setPlanningOpen(false);
    if (data?.type === 'tang:planning-height' && Number.isFinite(data.height)) {
      planningFrame.style.height = Math.min(20000, Math.max(200, Math.ceil(data.height))) + 'px';
      sendPlanningViewport();
    }
  });


  function renderTeam() {
    $('#teamBar').innerHTML = S.meta.members.map(m => avatar(m.id)).join('');
    const prof = live && live.profile;
    $('#accountBar').innerHTML = prof ? `${prof.demo ? '<span class="tag">Dữ liệu mẫu</span>' : ''}<span class="account-name" title="Tài khoản GitHub">@${esc(prof.login)}</span><button type="button" class="btn soft small" data-act="logout">Đăng xuất</button>` : '';
    $('#projectName').placeholder = 'Đặt tên dự án';
    if (document.activeElement !== $('#projectName')) $('#projectName').value = S.meta.name;
  }
  function renderNav() {
    $('#nav').innerHTML = TABS.map(t => `<button class="nav-item ${t.id === tab ? 'on' : ''}" style="--c:${t.hex}" data-act="tab" data-id="${t.id}" aria-current="${t.id === tab}"><span class="long">${t.name}</span><span class="short">${t.short}</span></button>`).join('');
  }
  let deckScrollTimer = null, ignoreDeckScrollUntil = 0;
  function syncSlideEditorBox() {
    const box = $('#slideEditorBox', view);
    if (box) box.outerHTML = renderSlideEditorBox();
  }
  function bindDeckScroll() {
    const d = $('.deck', view);
    const list = S.pitch.deck || [];
    if (!d || !list.length) return;
    const step = (d.clientWidth || 0) + 12;
    if (step > 12 && activeSlideIdx > 0) {
      ignoreDeckScrollUntil = Date.now() + 120;
      d.scrollLeft = activeSlideIdx * step;
    }
    const updateFromScroll = () => {
      if (Date.now() < ignoreDeckScrollUntil) return;
      const curStep = (d.clientWidth || 0) + 12;
      if (curStep <= 12) return;
      const nextIdx = Math.max(0, Math.min(list.length - 1, Math.round(d.scrollLeft / curStep)));
      if (nextIdx !== activeSlideIdx) {
        activeSlideIdx = nextIdx;
        syncSlideEditorBox();
      }
    };
    d.addEventListener('scroll', () => {
      clearTimeout(deckScrollTimer);
      deckScrollTimer = setTimeout(updateFromScroll, 65);
    }, { passive: true });
    d.addEventListener('scrollend', updateFromScroll, { passive: true });
  }
  function render() {
    const t = TABS.find(x => x.id === tab);
    view.style.setProperty('--c', t.hex);
    view.dataset.tab = tab;
    const desktopOverview = tab === 'overview' && !mobile.matches;
    showPlanning(tab === 'planning');
    if (desktopOverview) { overlay.innerHTML = views.overview(); viewContent.innerHTML = ''; }
    else { viewContent.innerHTML = views[tab](); overlay.innerHTML = ''; }
    if (tab === 'product') thinkMount();
    if (tab === 'planning') fitBoard();
    if (tab === 'pitching') {
      if (!tk.loaded) { tk.loaded = true; thinkLoad(); } // Pitching cần Canvas đã duyệt dù chưa mở tab Thinking
      loadPublishedSurveys(); renderSidePanel(); bindDeckScroll();
    }
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
      if (animate && canAnim && Math.abs(from - h) > 1) stageAnim = M.animate(from, h, { duration: 0.8, ease: EASE, onUpdate: v => stage.style.setProperty('--sh', v + 'px') });
      else stage.style.setProperty('--sh', h + 'px');
      return;
    }
    const side = Math.min(361, Math.max(276, innerWidth * 0.247)); // nhỏ hơn 5% so với 380 / 290 / 26%
    const target = over ? ws.clientWidth : hidden ? 0 : side;
    const from = stage.offsetWidth;
    const apply = v => ws.style.setProperty('--stage', v + 'px');
    const settle = () => { if (over) ws.style.setProperty('--stage', '100%'); else apply(target); };
    if (animate && canAnim && Math.abs(from - target) > 1) stageAnim = M.animate(from, target, { duration: 0.85, ease: [0.7, 0, 0.2, 1], onUpdate: apply, onComplete: settle });
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
      anim($$('#viewContent > .view-head, #viewContent > .stack > .panel, #viewContent > .panel, #viewContent > .think, #viewContent > .stack > .cols', view).slice(0, 8), { opacity: [0, 1], y: [10, 0] }, { duration: 0.28, ease: EASE, delay: canAnim ? M.stagger(0.035) : 0 });
    }
    anim($$('.grow', view), { scaleX: [0, 1] }, { duration: 0.8, ease: EASE, delay: 0.3 });
  }
  /* Địa chỉ tab theo tên hiển thị (#thinking). Mã nội bộ của Thinking là "product"; link cũ #product vẫn mở đúng tab. */
  const SLUG = { product: 'thinking' };
  const slugOf = id => SLUG[id] || id;
  const tabFromHash = hash => { const h = String(hash || '').replace(/^#/, ''); const id = Object.keys(SLUG).find(k => SLUG[k] === h) || h; return TABS.some(t => t.id === id) ? id : 'overview'; };
  async function go(id, fromHistory = false) {
    if (!TABS.some(t => t.id === id) || id === tab) return;
    const n = ++going;
    closeDrawer(true);
    closeSurveySide(true);
    anim($('#pins'), { opacity: 0 }, { duration: 0.2 });
    await done(anim(tab === 'overview' && !mobile.matches ? overlay : view, { opacity: [1, 0] }, { duration: 0.1 }));
    if (n !== going) return;
    tab = id;
    if (id === 'planning') local.collapsed = false;
    if (!fromHistory) history.pushState(null, '', '#' + slugOf(id));
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
        const visible = tab === 'overview' && !onboarding();
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
    if (id === 'planning') local.collapsed = false;
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
  function enter(id = 'overview') { location.href = '/workstation' + (id && id !== 'overview' ? '#' + slugOf(id) : ''); }
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
    const a = instant ? null : anim(sidePanel, { x: [0, 760] }, { duration: 0.24, ease: 'easeIn' });
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
        </div>
        <div class="row" style="gap:6px">${btn('form', p.draftSource ? 'AI gợi ý lại' : 'AI gợi ý câu hỏi', 'tone small')}${btn('publishSurvey', 'Lưu', 'primary small')}${btn('closeSurveySide', 'Đóng', 'soft small')}</div>
      </div>
      <div class="side-body">
        ${renderRolePick(p)}
        ${p.form ? renderSurveyEditor(p, false) : '<div class="empty-note">Chọn đối tượng rồi bấm <b>AI gợi ý câu hỏi</b>.</div>'}
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
        <div class="panel">${panelHead('AI overview từ form', hasResp ? btn('summary', S.pitch.overview ? 'Phân tích lại' : 'Phân tích phản hồi', 'tone small') : '')}${S.pitch.overview ? `<div class="prose">${esc(S.pitch.overview)}</div>` : `<div class="empty-note">${hasResp ? 'Bấm phân tích để tóm tắt tín hiệu.' : 'Cần ít nhất một phản hồi.'}</div>`}</div>`;
    } else {
      const rows = activeSurveyDetail && activeSurveyDetail.slug === sideSlug ? activeSurveyDetail.responses : null;
      bodyHtml = !rows
        ? '<p class="muted">Đang tải…</p>'
        : !rows.length
          ? '<div class="empty-note">Chưa có phản hồi nào.</div>'
          : `<div class="resp-drawer">${rows.map(r => `<div class="resp-item"><div class="row" style="justify-content:space-between"><strong>${esc(r.respondent_role || editSurveyTarget.targetRole || 'Ẩn danh')}</strong><span class="muted">${esc((r.created_at || '').slice(0, 16).replace('T', ' '))}${r.is_sample ? ' · Mẫu' : ''}</span></div>
            ${(editSurveyTarget.form || []).map(q => { const a = (r.answers || {})[q.id]; return `<div><span class="muted">${esc(q.q)}:</span> ${esc(Array.isArray(a) ? a.join(' · ') : (a || '—'))}</div>`; }).join('')}</div>`).join('')}</div>`;
    }
    sideWrap.hidden = false;
    sidePanel.innerHTML = `<div class="side-head">
      <div style="min-width:0;flex:1 1 220px">
        <h3>${esc(editSurveyTarget.formTitle || surveyObj.title || sideSlug)}</h3>
        ${editSurveyTarget.targetRole ? `<div class="row" style="margin-top:6px"><span class="tag" style="--c:var(--orange)">${esc(editSurveyTarget.targetRole)}</span></div>` : ''}
      </div>
      <div class="row" style="gap:6px">
        ${btn('saveEdit', 'Lưu', 'primary small', 'title="Lưu thay đổi và copy link khảo sát"')}
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
    if (wasClosed) anim(sidePanel, { x: [760, 0] }, { type: 'spring', stiffness: 280, damping: 30 });
    if (nextTab === 'stats') refreshDashStats(true);
  }

  /* Vẽ lại tab hiện tại, giữ vị trí cuộn */
  function rerender() { const y = view.scrollTop; render(); view.scrollTop = y; syncProgress(); }
  /* ---------- Sự kiện ---------- */
  const actions = {
    enter: () => enter(),
    home,
    'sprint-gantt'() { ganttOpen = !ganttOpen; drawPlanning(); },
    'ob-model'(b) {
      local.model = b.dataset.pick; persist();
      if (site) site.mode(local.model);
      rerender();
    },
    'ob-next'() { obTouched = true; obStep = 1; rerender(); setTimeout(() => { const i = $('#obName'); if (i) i.focus(); }, 0); },
    'ob-back'() { obTouched = true; obStep = Math.max(0, obStep - 1); rerender(); },
    // Đăng nhập thẳng. Chỉ khi máy chủ chưa có GitHub App thì mới sang tab Planning để tạo kết nối trước.
    'ob-github'() {
      const code = ($('#obInvite') ? $('#obInvite').value : '').trim().toUpperCase();
      obInvite = code;
      // Planning đọc mã này sau khi đăng nhập xong để mở sẵn form vào đội.
      try { if (code) localStorage.setItem('tang.invite', code); else localStorage.removeItem('tang.invite'); } catch (e) { /* không có localStorage */ }
      if (live && live.setup && live.setup.needed) go('planning'); else location.href = PLANNING_API + '/auth/github'; },
    tab: b => go(b.dataset.id),
    async logout(b) {
      b.disabled = true;
      try { await fetch(PLANNING_API + '/auth/logout', { method: 'POST', headers: { 'X-Planning-Request': '1' } }); } catch (e) { toast('Chưa đăng xuất được. Bạn thử lại nhé.'); }
      await loadPlanning(true);
      showWorkspace();
    },
    'planning-live': () => setPlanningOpen(true, 'board'),
    'planning-team': () => setPlanningOpen(true, 'team'),
    'planning-pulls': () => setPlanningOpen(true, 'pulls'),
    'repo-open': openRepo,
    'notify-open': () => openNotify(),
    'notify-on': enableNotify,
    'notify-off': disableNotify,
    'notify-test': testNotify,
    'planning-repo'() {
      if (detail.open) detail.close();
      setPlanningOpen(true);
      planningFrame.contentWindow?.postMessage({ type: 'tang:planning-repo' }, location.origin);
    },
    'repo-refresh': refreshRepo,
    'planning-close': () => setPlanningOpen(false),
    collapse() { local.collapsed = !local.collapsed; persist(); layout(true); },
    drawer: toggleDrawer,
    me(b) { local.me = b.dataset.id; persist(); renderChat(); anim($('.speak .me', chat), { scale: [0.6, 1] }, { type: 'spring' }); },
    quick: b => send(b.textContent),
    'think-approve': () => thinkReview(true),
    'think-reject': () => thinkReview(false),
    // Landing: người đã có mã mời đi thẳng tới đăng nhập, bỏ qua bước chọn mô hình và đặt tên nhóm (của trưởng nhóm).
    'invite-open'(b) {
      const form = b.parentElement.querySelector('.invite-join');
      form.hidden = !form.hidden;
      b.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) $('input', form).focus();
    },
    'think-start'() { tk.introDone = true; renderThink(); const i = $('.tk-compose input'); if (i) i.focus(); },
    'think-reset': () => { if (tk.busy) return; if ((local.think.msgs.length || tk.run) && !confirm('Làm mới sẽ xoá cuộc trao đổi và Canvas hiện tại. Tiếp tục?')) return; thinkReset(); },
    finish(b) { if (stepState(STEPS.findIndex(x => x.id === b.dataset.id)) !== 'doing') return; S.done[b.dataset.id] = true; save('done'); rerender(); renderNav(); toast('Đã hoàn thành bước. Bước tiếp theo đã mở.'); },
    reopen(b) { const i = STEPS.findIndex(x => x.id === b.dataset.id); STEPS.slice(i).forEach(x => { S.done[x.id] = false; }); save('done'); rerender(); renderNav(); },
    openCreateSurvey() {
      const wasClosed = !sideMode;
      sideMode = 'create';
      sideSlug = '';
      editSurveyTarget = null;
      lastSavedSlug = '';
      rerender();
      if (wasClosed) anim(sidePanel, { x: [760, 0] }, { type: 'spring', stiffness: 280, damping: 30 });
    },
    openSelectedEdit() { openSideForSlug(activeTileSlug(), 'edit'); },
    openSelectedStats() { openSideForSlug(activeTileSlug(), 'stats'); },
    async copySelectedLink(b) {
      const slug = activeTileSlug();
      if (!slug) return toast('Chưa có khảo sát nào để sao chép link.');
      await copyTextWithFeedback(location.origin + '/survey?slug=' + slug, b, 'Đã copy link');
    },
    async openSurveySide(b) { openSideForSlug(b.dataset.id, 'edit'); },
    closeSurveySide() { closeSurveySide(false); },
    hideDeck() { S.pitch.deckShown = false; save('pitch'); rerender(); },
    showDeck() { if (S.pitch.deck && S.pitch.deck.length) { S.pitch.deckShown = true; save('pitch'); rerender(); } },
    async clearDeck(b) {
      if (!twice(b, 'clearDeck', 'Bấm lần nữa để xóa')) return;
      const slug = S.pitch.deckSlug;
      if (slug) {
        try {
          const res = await fetch('/api/v1/pitching/decks/' + encodeURIComponent(slug), { method: 'DELETE' });
          if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
        } catch (e) {
          return toast('Không xóa được link slide trên server.');
        }
      }
      S.pitch.deck = null;
      S.pitch.deckShown = false;
      S.pitch.deckSlug = '';
      S.pitch.deckTitle = '';
      S.pitch.deckSource = '';
      activeSlideIdx = 0;
      save('pitch');
      syncProgress();
      rerender();
      toast('Đã xóa bộ slide');
    },
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
    reloadSurveys() { loadPublishedSurveys(true).then(() => toast(surveysError ? 'Chưa tải được danh sách khảo sát. Thử lại sau.' : 'Đã làm mới danh sách khảo sát.')); },
    async copySurveyLink(b) {
      if (!S.pitch.publishedSlug) return;
      await copyTextWithFeedback(location.origin + '/survey?slug=' + S.pitch.publishedSlug, b, 'Đã copy link');
    },
    async copySlug(b) {
      await copyTextWithFeedback(location.origin + '/survey?slug=' + b.dataset.id, b, 'Đã copy link');
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
    'ws-retry': () => loadPlanning(true),
    dot(b) { const s = S.score[b.dataset.id], n = +b.dataset.n; s.score = s.score === n ? n - 1 : n; save('score'); rerender(); anim($$(`.score[data-key="${b.dataset.id}"] .dots .on`, view), { scaleY: [2.2, 1] }, { type: 'spring', delay: canAnim ? M.stagger(0.04) : 0 }); },
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
      syncSlideEditorBox();
      if (d) {
        ignoreDeckScrollUntil = Date.now() + 450;
        d.scrollTo({ left: activeSlideIdx * ((d.clientWidth || 0) + 12), behavior: reduced ? 'auto' : 'smooth' });
      }
    },
    fullDeck() {
      const d = $('.deck', view);
      if (!d) return;
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
      if (d.requestFullscreen) d.requestFullscreen().then(() => { d.scrollLeft = activeSlideIdx * (d.clientWidth + 12); }).catch(() => toast('Trình duyệt không cho phép bật toàn màn hình.'));
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
    async copyDeckLink(b) {
      if (!S.pitch.deckSlug) return;
      await copyTextWithFeedback(location.origin + '/pitch?slug=' + S.pitch.deckSlug, b, 'Đã copy link');
    },
    async copyAd(b) {
      const ad = S.pitch.adPosts && S.pitch.adPosts[+b.dataset.id];
      if (!ad) return;
      await copyTextWithFeedback(adFullText(ad), b, 'Đã copy bài');
    },
    async copyAllAds(b) {
      const text = (S.pitch.adPosts || []).map(ad => `【${ad.channel}】\n${adFullText(ad)}`).join('\n\n---\n\n');
      if (!text) return;
      await copyTextWithFeedback(text, b, 'Đã copy tất cả');
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
      save('pitch'); rerender(); toast('Đã chèn link khảo sát vào bài');
    },
    async copy(b) {
      const text = b.dataset.id === 'html' ? deckHTML() : S.pitch[b.dataset.id];
      await copyTextWithFeedback(text, b, 'Đã copy');
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
    qtab(b) { qtab = b.dataset.id === 'cost' ? 'cost' : 'metrics'; rerender(); },
    runform() { runFormOpen = !runFormOpen; runEdit = null; rerender(); const f = $('[data-form="run"]', view); if (f) f.elements.model.focus(); },
    maintform() { maintFormOpen = !maintFormOpen; rerender(); const f = $('[data-form="maint"]', view); if (f) f.elements.title.focus(); },
    revpick(b) { S.quality.revenueModel = ['sub', 'usage', 'setup'].includes(b.dataset.id) ? b.dataset.id : 'sub'; save('quality'); rerender(); },
    editrun(b) { runEdit = b.dataset.id; runFormOpen = true; rerender(); const f = $('[data-form="run"]', view); if (f) { f.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); f.elements.model.focus(); } },
    cancelrun() { runEdit = null; runFormOpen = false; rerender(); },
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
      const list = S.maintain.suggest || [], x = pickSuggest(list, b);
      if (!x) return toast('Gợi ý này đã thay đổi. Xem lại danh sách.');
      const id = 'm' + Date.now().toString(36);
      S.maintain.schedule.push({ id, title: x.title, every: x.every, next: inDays(Math.min(7, x.every)), owner: '', runs: 0 });
      S.maintain.suggest = list.filter(y => y !== x);
      save('maintain'); rerender(); anim($(`[data-row="${id}"]`, view), { opacity: [0, 1], x: [-30, 0] }, { duration: 0.6 }); toast(`Đã thêm vào lịch, chu kỳ ${x.every} ngày`);
    },
    dismisssuggest(b) {
      const list = S.maintain.suggest || [], x = pickSuggest(list, b);
      S.maintain.suggest = list.filter(y => y !== x);
      save('maintain'); rerender();
    },
    delmaint(b) {
      if (!twice(b, 'maint' + b.dataset.id, 'Bấm lần nữa để xóa')) return;
      S.maintain.schedule = S.maintain.schedule.filter(x => x.id !== b.dataset.id);
      save('maintain'); rerender(); toast('Đã xóa khỏi lịch bảo trì');
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
    if (kind === 'think') { const i = $('input', f); thinkSend(i.value); i.value = ''; }
    if (kind === 'invite') {
      const code = $('input', f).value.trim().toUpperCase();
      if (!code) return;
      try { localStorage.setItem('tang.invite', code); } catch (err) { /* không có localStorage */ }
      // Chưa có GitHub App thì không đăng nhập được: vào Workstation để làm bước kết nối trước.
      fetch(PLANNING_API + '/state', { cache: 'no-store' }).then(r => r.json()).then(s => {
        location.href = s && s.setup && s.setup.needed ? '/workstation#planning' : PLANNING_API + '/auth/github';
      }).catch(() => { location.href = PLANNING_API + '/auth/github'; });
    }
    if (kind === 'ob-name') {
      const name = $('input', f).value.trim();
      if (!name) return toast('Nhập tên nhóm để tiếp tục.');
      obName = name; S.meta.name = name; save('meta'); renderTeam();
      obStep = 2; rerender();
    }
    if (kind === 'chat') { const i = $('input', f); if (typing) return toast('Đợi agent trả lời xong đã.'); send(i.value); i.value = ''; }
    if (kind === 'run') {
      const g = n => (f.elements[n] ? String(f.elements[n].value).trim() : '');
      const nn = n => (g(n) === '' || !isFinite(+g(n)) ? null : Math.max(0, +g(n)));
      const est = nn('estTok'), act = nn('actTok');
      const run = { at: g('at') || nowLocal(), model: g('model').slice(0, 80), values: {}, passed: nn('passed'), total: nn('total'), estTok: est === null ? null : Math.round(est), actTok: act === null ? null : Math.round(act), note: g('note').slice(0, 300) };
      if (!run.model) return toast('Nhập tên model hoặc phiên bản.');
      if (run.passed !== null) run.passed = Math.round(run.passed);
      if (run.total !== null) run.total = Math.round(run.total);
      if (run.passed !== null && run.total !== null && run.passed > run.total) return toast('Số test pass không được lớn hơn tổng số test.');
      S.quality.metrics.forEach(k => { const v = g('m_' + k.id); if (v !== '' && isFinite(+v)) run.values[k.id] = +v; });
      const old = S.quality.runs.find(r => r.id === runEdit);
      if (old) { Object.assign(old, run); delete old.inTok; delete old.outTok; }
      else S.quality.runs.push(Object.assign({ id: 'r' + Date.now().toString(36) }, run));
      S.quality.runs = S.quality.runs.slice(-200);
      toast(old ? 'Đã lưu lần chạy' : 'Đã thêm lần chạy');
      runEdit = null; runFormOpen = false; save('quality'); rerender();
      anim($$('.chart .ln', view), { opacity: [0, 1] }, { duration: 0.6 });
    }
    if (kind === 'maint') {
      const title = f.elements.title.value.trim().slice(0, 120);
      if (!title) return toast('Nhập tên việc cần làm.');
      const everyRaw = Number(f.elements.every.value);
      if (!Number.isInteger(everyRaw) || everyRaw < 1 || everyRaw > 365) return toast('Chu kỳ phải là số nguyên từ 1 đến 365 ngày.');
      const next = f.elements.next.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return toast('Chọn hạn đầu tiên hợp lệ.');
      const owner = f.elements.owner.value || '';
      const id = 'm' + Date.now().toString(36);
      S.maintain.schedule.push({ id, title, every: everyRaw, next, owner, runs: 0 });
      maintFormOpen = false; save('maintain'); rerender();
      anim($(`[data-row="${id}"]`, view), { opacity: [0, 1], x: [-30, 0] }, { duration: 0.6 });
      toast('Đã thêm vào lịch bảo trì');
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
          const slideTitle = (S.pitch.deckTitle || S.meta.name || 'Pitching Deck').trim();
          card.outerHTML = renderSlideCard(s, +id, S.pitch.deck.length, slideTitle);
        }
      }
      return true;
    }
    return false;
  }
  document.addEventListener('input', e => {
    const t = e.target;
    if (t && t.id === 'obName') obName = t.value;
    if (t && t.dataset && t.dataset.bind) bindPitchText(t, false);
  });
  document.addEventListener('change', e => {
    const t = e.target, k = t.dataset.bind, id = t.dataset.id;
    if (t.id === 'projectName') { S.meta.name = t.value.trim() || 'Dự án chưa đặt tên'; save('meta'); return; }
    if (t.dataset.live) { editTask(t); return; }
    if (!k) return;
    const v = t.value;
    if (k === 'score') { S.score[id].text = v; if (!v.trim()) S.score[id].score = 0; save('score'); }
    if (k === 'cost') {
      S.quality.cost[id] = Math.max(0, +v || 0); save('quality'); rerender();
    }
    if (k === 'revmodel') {
      S.quality.revenueModel = ['sub', 'usage', 'setup'].includes(v) ? v : 'sub';
      save('quality'); rerender();
    }
    if (k === 'qmetric') {
      const x = S.quality.metrics.find(x => x.id === id), fl = t.dataset.field;
      if (x && fl === 'name') x.kind = kindOf(v);
      if (x) x[fl] = fl === 'target' ? (+v || 0) : fl === 'baseline' ? num(v) : fl === 'direction' ? (v === 'down' ? 'down' : 'up') : fl === 'kind' ? (KIND[v] ? v : 'value') : v.trim().slice(0, { unit: 12, name: 60 }[fl] || 200);
      save('quality'); rerender();
    }
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
    if (k === 'slideLayout') {
      const s = S.pitch.deck && S.pitch.deck[+id];
      if (s) {
        s.layout = v;
        save('pitch');
        const card = $$('#view .deck .slide')[+id];
        if (card) card.outerHTML = renderSlideCard(s, +id, S.pitch.deck.length, (S.pitch.deckTitle || S.meta.name || 'Pitching Deck').trim());
      }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); setPlanningOpen(false); closeSurveySide(); } });
  document.addEventListener('focusout', () => setTimeout(() => { if (boardStale && !boardPending && !editingBoard()) loadPlanning(); }));
  addEventListener('focus', () => { if (inApp) loadPlanning(); });
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
  /* Mục quy trình: mỗi bước là một đảo nổi, cuộn xuống tới đâu đảo hiện tới đó */
  /* Mỗi đảo là một cảnh làm việc nhỏ có người và chuyển động, đúng với việc của bước đó */
  const SHIRT = ['#ff4d5e', '#a24ce8', '#0a9cf0', '#14b86a', '#ff8a1f', '#4d5bf0'];
  const person = (x, shirt, hair, y = 0, delay = 0, extra = '') => `<g class="ppl" style="animation-delay:${delay}s" transform="translate(0 ${y})">
    <rect x="${x - 5}" y="150" width="4" height="9" rx="2" fill="#4a5578"/><rect x="${x + 1}" y="150" width="4" height="9" rx="2" fill="#4a5578"/>
    <rect x="${x - 7}" y="132" width="14" height="20" rx="6" fill="${shirt}"/><circle cx="${x}" cy="125" r="7" fill="#ffd9b8"/>
    <path d="M${x - 7} 124q7-10 14 0" fill="${hair}"/><circle cx="${x - 2.5}" cy="126" r="1" fill="#121a33"/><circle cx="${x + 2.5}" cy="126" r="1" fill="#121a33"/>${extra}</g>`;
  const gear = (cx, cy, r, color, cls) => `<g class="${cls}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${r * .4}" stroke-dasharray="${(r * 0.32).toFixed(1)} ${(r * 0.3).toFixed(1)}"/><circle cx="${cx}" cy="${cy}" r="${r * .78}" fill="${color}"/><circle cx="${cx}" cy="${cy}" r="${r * .32}" fill="#fff"/></g>`;
  const SCENES = [
    // Thinking: bảng Canvas dán giấy nhớ, bóng đèn ý tưởng, hai bạn đang bàn
    () => {
      const col = ['#ffd34d', '#ff9ec0', '#9bdcff', '#b8f0c8', '#ffd34d', '#d9c2ff'];
      const notes = col.map((c, k) => `<rect class="scn-pulse" style="animation-delay:${(k * .45).toFixed(2)}s" x="${76 + (k % 3) * 30}" y="${70 + Math.floor(k / 3) * 22}" width="26" height="17" rx="3" fill="${c}"/>`).join('');
      return `<path d="M82 122l-6 24M158 122l6 24" stroke="#8b95b8" stroke-width="3" stroke-linecap="round"/><rect x="68" y="58" width="104" height="66" rx="7" fill="#fff" stroke="#c3cdf0" stroke-width="2"/>${notes}
        <g class="scn-glow"><circle cx="120" cy="36" r="13" fill="#ffd34d"/><path d="M120 16v-5M104 22l-4-4M136 22l4-4M98 38h-6M142 38h6" stroke="#ffc21a" stroke-width="3" stroke-linecap="round"/></g>
        ${person(88, SHIRT[0], '#4a3b32', 0, 0)}${person(154, SHIRT[2], '#2a2a40', 0, -1.1, '<path d="M147 138l-9-12" stroke="#ffd9b8" stroke-width="4" stroke-linecap="round"/>')}`;
    },
    // Planning: bảng kanban, một thẻ trượt sang cột bên cạnh
    () => `<rect x="62" y="56" width="116" height="72" rx="8" fill="#fff" stroke="#bfeed6" stroke-width="2"/>
      <path d="M101 62v60M140 62v60" stroke="#e1e7f5" stroke-width="2"/>
      <rect x="68" y="62" width="28" height="7" rx="3" fill="#14b86a"/><rect x="107" y="62" width="28" height="7" rx="3" fill="#0a9cf0"/><rect x="146" y="62" width="28" height="7" rx="3" fill="#a24ce8"/>
      <rect x="68" y="75" width="28" height="14" rx="3" fill="#d9f5e6"/><rect x="68" y="93" width="28" height="14" rx="3" fill="#d9f5e6"/>
      <rect x="146" y="75" width="28" height="14" rx="3" fill="#ead7fb"/><rect class="scn-card" x="68" y="111" width="28" height="14" rx="3" fill="#14b86a"/>
      <path d="M170 56V28" stroke="#8b95b8" stroke-width="3"/><path d="M170 28l20 7-20 7z" fill="#ff4d5e"/>
      ${person(48, SHIRT[4], '#4a3b32', 0, 0)}${person(192, SHIRT[1], '#2a2a40', 0, -1.2)}`,
    // Pitching: màn hình biểu đồ, người thuyết trình và khán giả
    () => `<rect x="62" y="40" width="96" height="62" rx="8" fill="#fff" stroke="#ffd0a3" stroke-width="2"/>
      <rect class="scn-bar" style="animation-delay:0s" x="74" y="72" width="14" height="22" rx="3" fill="#ffb066"/><rect class="scn-bar" style="animation-delay:.3s" x="94" y="60" width="14" height="34" rx="3" fill="#ff8a1f"/><rect class="scn-bar" style="animation-delay:.6s" x="114" y="50" width="14" height="44" rx="3" fill="#ff8a1f"/><circle cx="142" cy="56" r="8" fill="#ffc21a"/>
      <path d="M110 102v8M96 110h28" stroke="#8b95b8" stroke-width="3" stroke-linecap="round"/>
      <g class="scn-bubble"><rect x="168" y="84" width="40" height="20" rx="9" fill="#fff" stroke="#ffd0a3" stroke-width="2"/><path d="M178 104l-3 8 10-8" fill="#fff" stroke="#ffd0a3" stroke-width="2" stroke-linejoin="round"/><circle cx="180" cy="94" r="2.5" fill="#ff8a1f"/><circle cx="188" cy="94" r="2.5" fill="#ff8a1f"/><circle cx="196" cy="94" r="2.5" fill="#ff8a1f"/></g>
      ${person(78, SHIRT[3], '#4a3b32', 0, 0)}${person(104, SHIRT[0], '#2a2a40', 0, -.8)}${person(184, SHIRT[5], '#4a3b32', 0, -1.5, '<path d="M177 138l-12-10" stroke="#ffd9b8" stroke-width="4" stroke-linecap="round"/>')}`,
    // Quality: bảng đo, các cột lớn dần, dấu kiểm, người cầm kính lúp
    () => `<rect x="62" y="48" width="100" height="66" rx="8" fill="#fff" stroke="#c9ceff" stroke-width="2"/>
      <path d="M72 106h80" stroke="#e1e7f5" stroke-width="2"/>
      <rect class="scn-bar" style="animation-delay:0s" x="76" y="84" width="14" height="22" rx="3" fill="#a9b2ff"/><rect class="scn-bar" style="animation-delay:.3s" x="98" y="70" width="14" height="36" rx="3" fill="#7d89ff"/><rect class="scn-bar" style="animation-delay:.6s" x="120" y="58" width="14" height="48" rx="3" fill="#4d5bf0"/>
      <g class="scn-badge"><circle cx="150" cy="56" r="14" fill="#14b86a" stroke="#fff" stroke-width="3"/><path d="M143 56l5 5 9-10" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g>
      ${person(58, SHIRT[4], '#2a2a40', 0, 0)}${person(180, SHIRT[1], '#4a3b32', 0, -1, '<path d="M173 138l-8-8" stroke="#ffd9b8" stroke-width="4" stroke-linecap="round"/><circle cx="162" cy="126" r="8" fill="#e8f0ff" fill-opacity=".7" stroke="#4d5bf0" stroke-width="3"/>')}`,
    // Maintaining: bánh răng quay, lịch bảo trì, người cầm cờ lê
    () => `${gear(120, 92, 24, '#a24ce8', 'scn-spin')}${gear(152, 66, 13, '#c68af0', 'scn-spin rev')}
      <rect x="58" y="62" width="40" height="44" rx="7" fill="#fff" stroke="#e1c9fa" stroke-width="2"/><rect x="58" y="62" width="40" height="11" rx="6" fill="#a24ce8"/>
      <path class="scn-check" d="M68 88l5 5 9-11" fill="none" stroke="#14b86a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M68 100h22" stroke="#e1e7f5" stroke-width="3" stroke-linecap="round"/>
      ${person(70, SHIRT[3], '#4a3b32', 0, 0, '<path d="M77 138l10-6" stroke="#ffd9b8" stroke-width="4" stroke-linecap="round"/><rect x="85" y="126" width="4" height="16" rx="2" fill="#8b95b8" transform="rotate(25 87 134)"/>')}${person(176, SHIRT[0], '#2a2a40', 0, -1.3)}`
  ];
  function islandSVG(i) {
    const tree = (x, y, r) => `<rect x="${x - 2}" y="${y}" width="4" height="${r}" fill="#9aa3bd"/><circle cx="${x}" cy="${y}" r="${r}" fill="#14b86a"/><circle cx="${x + r * .6}" cy="${y + r * .4}" r="${r * .6}" fill="#34d18a"/>`;
    return `<svg class="isle-art" viewBox="0 -30 240 270" aria-hidden="true" focusable="false">
      <ellipse class="isle-shadow" cx="120" cy="232" rx="52" ry="7"/>
      <path class="isle-rock" d="M30 160Q120 196 210 160L186 190Q168 210 148 216L130 232Q120 238 110 232L92 216Q72 210 54 190Z"/>
      <path class="isle-rock2" d="M110 232L92 216Q72 210 54 190L30 160Q62 182 98 188Q112 204 110 232Z"/>
      <path class="pad-side" d="M20 150v10a100 30 0 0 0 200 0v-10z"/>
      <ellipse class="pad-top" cx="120" cy="150" rx="100" ry="30"/>
      <ellipse class="pad-ring" cx="120" cy="150" rx="84" ry="23"/>
      ${tree(30, 134, 10)}${tree(212, 136, 11)}
      <g class="scene">${SCENES[i]()}</g>
      <g class="isle-cloud c1"><ellipse cx="30" cy="20" rx="20" ry="8"/><ellipse cx="42" cy="14" rx="12" ry="8"/></g>
      <g class="isle-cloud c2"><ellipse cx="208" cy="2" rx="16" ry="6"/><ellipse cx="198" cy="-2" rx="9" ry="6"/></g>
    </svg>`;
  }
  function initIslands() {
    const list = $('#isles');
    if (!list) return;
    list.innerHTML = STEPS.map((s, i) => `<li class="isle-row ${i % 2 ? 'rev' : ''}" style="--c:${s.hex};--i:${i}">
      <div class="isle" aria-hidden="true">${islandSVG(i)}</div>
      <article class="isle-card">
        <h3><span class="n">${i + 1}:</span> ${s.name} <span class="fde">- ${s.tag}</span></h3>
        <p class="isle-lead">${s.lead}</p>
        <ul class="isle-does">${s.does.map(x => `<li>${x}</li>`).join('')}</ul>
        <button type="button" class="g-open" data-step="${s.id}">Mở ${s.name}</button>
      </article></li>`).join('');
    $$('#isles [data-step]').forEach(b => b.addEventListener('click', () => enter(b.dataset.step)));
    if (reduced || !('IntersectionObserver' in window)) return;
    const rows = $$('#isles .isle-row');
    rows.forEach(r => r.classList.add('armed'));
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting && e.boundingClientRect.bottom > 0) return;
      io.unobserve(e.target);
      e.target.classList.add('in');
    }), { threshold: 0.25 });
    rows.forEach(r => io.observe(r));
  }
  function landing() {
    initIslands();
    if (window.Scenes) {
      try {
        const card = $('#floorCard');
        heroScene = window.Scenes.hero($('#heroCanvas'), FLOORS, i => {
          card.classList.toggle('on', i >= 0);
          if (i < 0) return;
          const f = FLOORS[i];
          card.style.setProperty('--c', `var(--${f.color})`);
          $('.floor-no', card).textContent = `Tầng ${i + 1}`;
          $('h2', card).textContent = f.name;
          $('p', card).textContent = f.text;
        }, (x, y) => {
          // Card nằm bên trái tầng đang chọn, không tràn khỏi khung
          const box = card.offsetParent;
          if (!box) return;
          const left = Math.max(16, Math.min(box.clientWidth - card.offsetWidth - 16, x - card.offsetWidth - 12));
          const top = Math.max(16, Math.min(box.clientHeight - card.offsetHeight - 16, y - card.offsetHeight / 2));
          card.style.setProperty('--x', `${Math.round(left)}px`);
          card.style.setProperty('--y', `${Math.round(top)}px`);
        });
        replay();
      } catch (e) {
        const card = $('#floorCard');
        card.classList.add('on');
        $('.floor-no', card).textContent = '';
        $('h2', card).textContent = 'Chưa hiển thị được 3D';
        $('p', card).textContent = 'Thiết bị này không chạy được mô hình. Bạn vẫn truy cập được không gian làm việc.';
      }
    }
  }

  if ($('#landing')) landing();
  if ($('#app')) {
    // GitHub và thông báo quay về bằng ?tab=planning; chuyển tab trong trang dùng #tab.
    const h = new URLSearchParams(location.search).get('tab') === 'planning' ? 'planning' : location.hash.slice(1);
    startApp(tabFromHash(h));
    loadPlanning();
    // Back, Forward hoặc dán link khác tab: đổi tab theo địa chỉ, không thêm mục lịch sử
    const follow = () => go(tabFromHash(location.hash), true);
    addEventListener('popstate', follow);
    addEventListener('hashchange', follow);
  }
  connect().catch(() => {});
  ready.then(() => { if (inApp && tab === 'pitching') rerender(); });
})();

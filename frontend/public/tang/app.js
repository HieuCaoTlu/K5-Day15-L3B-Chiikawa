/* Ứng dụng: điều hướng, bốn bước, agent, dữ liệu dùng chung và chuyển động. */
(function () {
  const { STEPS, FLOORS, SCORE, ROLES, STATUS, SAMPLE_SCORE, SEED, AGENT, inDays, iso } = window.DATA;
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
    if (!changed) return;
    drawPlanning();
    syncProgress();
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
    return `<div class="head-actions">${icon('repo-open', 'Repo GitHub: ' + repoState[1], GITHUB_MARK, repoState[0])}${icon('notify-open', notifyOn() ? 'Thông báo: đang bật' : 'Thông báo: đang tắt', BELL, notifyOn() ? 'ok' : 'off')}${btn('planning-live', 'Đội, sprint và PR', 'primary small', `aria-expanded="${planningOpen}" aria-controls="planningLive" aria-haspopup="dialog"`)}</div>`;
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
    const note = repo.access && !live.webhook && !demo ? '<p class="muted">Chưa nhận được thông báo từ GitHub. Máy chủ Tầng tự đọc PR khoảng mỗi 60 giây.</p>' : '';
    const actions = leader ? `<div class="task-dialog-actions">${btn('planning-repo', repo.access ? 'Đổi repo' : 'Cấp quyền lại', 'soft small')}${!demo && repo.access ? btn('repo-refresh', 'Đọc lại PR', 'soft small') : ''}</div><p class="muted" id="sheetMessage" role="status"></p>` : '';
    openSheet('Repo GitHub', `<div class="side-name">${name}</div><p>${state} <span class="muted">Nhánh theo dõi · ${esc(repo.branch)}</span></p>${note}${actions}`);
  }

  function openNotify(message = '') {
    if (!joined()) return;
    let status, actions = '';
    if (!supportsPush()) status = 'Trình duyệt này chưa hỗ trợ thông báo. Mở Tầng bằng HTTPS hoặc localhost trên Chrome, Edge hay Firefox.';
    else if (!live.push_key) status = 'Máy chủ đang tắt thông báo trình duyệt.';
    else if (Notification.permission === 'denied') status = 'Trình duyệt đang chặn thông báo của trang này. Bấm biểu tượng cạnh thanh địa chỉ, cho phép Thông báo, rồi tải lại trang.';
    else if (notifyOn()) {
      status = 'Đang bật trên trình duyệt này.';
      actions = btn('notify-test', 'Gửi thử', 'primary small') + btn('notify-off', 'Tắt thông báo', 'soft small');
    } else {
      status = 'Đang tắt. Bấm Bật thông báo, rồi chọn Cho phép khi trình duyệt hỏi.';
      actions = btn('notify-on', 'Bật thông báo', 'primary small');
    }
    openSheet('Thông báo', `<p>${status}</p><p class="muted">Bạn được nhắc khi task của mình còn tối đa 24 giờ và 1 giờ, kể cả khi đã đóng tab. Trình duyệt và máy chủ Tầng cần đang chạy.</p>${actions ? `<div class="task-dialog-actions">${actions}</div>` : ''}<p class="muted" id="sheetMessage" role="status">${esc(message)}</p>`);
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
    const columns = Object.entries(COLUMNS).map(([key, [tone, about]]) => {
      const list = tasks.filter(t => columnOf(t.progress) === key);
      const label = STATUS[key][0];
      return `<div class="col" data-col="${key}" style="--s:${tone}"><div class="col-head"><h4><i class="ring" aria-hidden="true"></i>${label}<span class="count">${list.length}</span></h4><p>${about}</p></div><div class="col-list">${list.map(t => taskCard(t, edit)).join('')}</div></div>`;
    }).join('');
    const hint = tasks.length ? '' : `<p class="muted" style="margin-bottom:10px">Chưa có task. ${live.repo ? 'Bấm Đội, sprint và PR để lập kế hoạch sprint. Task hiện ở đây sau khi áp dụng.' : 'Bấm Đội, sprint và PR để kết nối repo và lập kế hoạch sprint.'}</p>`;
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

  /* ---------- Tiến độ ---------- */
  const filled = () => SCORE.filter(([k]) => S.score[k] && S.score[k].text.trim()).length;
  function planningShare() {
    if (!joined() || !live.repo) return 0;
    const tasks = liveTasks();
    return tasks.filter(t => t.progress === 'done').length / (tasks.length || 1);
  }
  function progress() {
    const p = S.pitch, sc = S.maintain.schedule;
    return [
      filled() / SCORE.length,
      planningShare(),
      [p.form, p.responses.length, p.overview, p.deck, p.script, p.ads].filter(Boolean).length / 6,
      sc.filter(x => x.runs > 0).length / (sc.length || 1)
    ].map(v => Math.max(0, Math.min(1, v)));
  }
  function nextAction(i) {
    if (i === 0) { const m = SCORE.find(([k]) => !S.score[k].text.trim()); return m ? `Còn thiếu mục ${m[1]} trong scorecard` : 'Scorecard đã đủ 7 mục'; }
    if (i === 1) {
      if (!joined()) return 'Thiết lập đội trong tab Planning';
      if (!live.repo) return 'Kết nối repo để lập sprint';
      const tasks = liveTasks(), next = tasks.find(t => t.progress !== 'done');
      return next ? `${next.code} · ${next.title}` : tasks.length ? 'Mọi task đã xong' : 'Chưa có sprint đã giao';
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
      const text = 'Chia việc theo sprint và theo dõi tiến độ từ pull request.';
      // Chưa đăng nhập hoặc chưa có đội: chỉ còn tiêu đề và phần thiết lập đội bên dưới.
      if (!joined()) return head(1, text);
      return head(1, text, headActions()) + `<div class="stack">
        ${taskBoard()}
      </div>`;
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

    maintaining() {
      const m = S.maintain, today = iso(new Date());
      return head(3, 'Sản phẩm AI cần được canh chừng. Việc đến hạn nằm trên cùng.') + `<div class="stack">
        <div class="panel">${panelHead('Gợi ý cập nhật công nghệ', btn('tech', 'Agent gợi ý mới', 'tone small'))}<div class="cards">${m.tech.map((t, i) => `<div class="card"><span class="tag" style="--c:var(--${['red', 'orange', 'blue'].includes(t.color) ? t.color : 'blue'})">Ưu tiên ${esc(t.level)}</span><span>${esc(t.title)}</span><span class="muted">${esc(t.why)}</span>${t.added ? '<span class="muted">Đã có trong lịch</span>' : btn('schedule', 'Thêm vào lịch', 'soft small', `data-n="${i}"`)}</div>`).join('')}</div></div>
        <div class="panel">${panelHead('Lịch bảo trì')}<div class="scroll"><table><thead><tr><th>Việc</th><th>Chu kỳ</th><th>Hạn tới</th><th>Người làm</th><th></th></tr></thead><tbody>${m.schedule.slice().sort((a, b) => a.next.localeCompare(b.next)).map(x => `<tr data-row="${esc(x.id)}"><td>${esc(x.title)}<br><span class="muted">Đã làm ${+x.runs || 0} lần</span></td><td>${+x.every} ngày</td><td><span class="tag" style="--c:var(${x.next <= today ? '--red' : '--violet'})">${x.next <= today ? 'Đến hạn ' : ''}${esc(x.next.split('-').reverse().join('/'))}</span></td><td><select data-bind="mowner" data-id="${esc(x.id)}" aria-label="Người làm">${options(x.owner)}</select></td><td>${btn('ran', 'Đã làm', 'tone small', `data-id="${esc(x.id)}"`)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    }
  };

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
  const planningFrame = $('#planningFrame');
  const planningLive = $('#planningLive');
  const viewContent = $('#viewContent');
  // Cỡ vùng nội dung đổi khi đổi cửa sổ, ẩn hiện mô hình hay xoay màn hình.
  new ResizeObserver(() => { if (tab === 'planning') fitBoard(); }).observe(view);
  const PLANNING_PARAMS = ['github', 'github_setup', 'setup_action', 'installation_id', 'task'];

  // Khung cao bằng nội dung nên cuộn cùng trang. Khung cần biết vùng đang thấy để đặt hộp thoại.
  let viewportFrame = 0;
  function sendPlanningViewport() {
    if (viewportFrame || planningLive.hidden) return;
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
    ['.top', '#stage', '#viewContent', '#fab', '#reveal'].forEach(selector => { $(selector).inert = open; });
    sendPlanningViewport();
  }

  function setPlanningOpen(next) {
    if (!joined() || planningOpen === next) return;
    planningOpen = next;
    updatePlanningPanel(tab === 'planning');
    drawPlanning();
    (next ? $('#planningClose') : $('[data-act="planning-live"]', view))?.focus({ preventScroll: true });
  }

  function showPlanning(visible) {
    updatePlanningPanel(visible);
    const url = new URL(location.href);
    if (visible) {
      url.searchParams.set('tab', 'planning');
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
    } else if (url.searchParams.get('tab') === 'planning') {
      url.searchParams.delete('tab');
    }
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== planningFrame.contentWindow) return;
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
    showPlanning(tab === 'planning');
    if (desktopOverview) { overlay.innerHTML = views.overview(); viewContent.innerHTML = ''; }
    else { viewContent.innerHTML = views[tab](); overlay.innerHTML = ''; }
    if (tab === 'product') { $('#chatSlot').append(chat); renderChat(); }
    if (tab === 'planning') fitBoard();
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
      rise($$('#viewContent > .view-head, #viewContent > .mind, #view .panel, #view .over-step', view).slice(0, 14), 0.1);
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
    if (id === 'planning') local.collapsed = false;
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
    if (id === 'planning') local.collapsed = false;
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
    showPlanning(false);
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
  /* ---------- Sự kiện ---------- */
  let resetArmed = 0;
  const actions = {
    enter: () => enter(),
    home,
    replay: () => replay(),
    flow: () => $('#flow').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }),
    tab: b => go(b.dataset.id),
    'planning-live': () => setPlanningOpen(true),
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
    collapse() { local.collapsed = !local.collapsed; persist(); layout(true); if (!local.collapsed) anim($('#floorInfo'), { opacity: [0, 1] }, { delay: 0.4 }); },
    drawer: toggleDrawer,
    me(b) { local.me = b.dataset.id; persist(); renderChat(); anim($('.speak .me', chat), { scale: [0.6, 1] }, { type: 'spring' }); },
    quick: b => send(b.textContent),
    reset(b) {
      if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); b.textContent = db ? 'Bấm lần nữa: đặt lại cho cả đội' : 'Bấm lần nữa để đặt lại'; setTimeout(() => { b.textContent = 'Đặt lại demo'; }, 4000); return; }
      S = SEED(); resetArmed = 0; b.textContent = 'Đặt lại demo';
      save(...Object.keys(S)); renderTeam(); renderChat(); rerender(); enterContent(); toast('Đã đặt lại dữ liệu demo');
    },
    dot(b) { const s = S.score[b.dataset.id], n = +b.dataset.n; s.score = s.score === n ? n - 1 : n; save('score'); rerender(); anim($$(`.score[data-key="${b.dataset.id}"] .dots .on`, view), { scaleY: [2.2, 1] }, { type: 'spring', delay: canAnim ? M.stagger(0.04) : 0 }); },
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
    if (t.dataset.live) { editTask(t); return; }
    if (!k) return;
    const v = t.value;
    if (k === 'score') { S.score[id].text = v; if (!v.trim()) S.score[id].score = 0; save('score'); }
    if (k === 'mowner') { const x = S.maintain.schedule.find(x => x.id === id); if (x) x.owner = v; save('maintain'); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); setPlanningOpen(false); } });
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
  loadPlanning();
  if (new URLSearchParams(location.search).get('tab') === 'planning') enter('planning');
  connect().catch(() => {});
  ready.then(() => { if (inApp && tab === 'pitching') rerender(); });
})();

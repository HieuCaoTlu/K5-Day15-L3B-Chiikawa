'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Empty, ErrorBox, Loading } from '@/components/kit/ui';
import { RepoAccess } from '@/components/planning/Access';
import { DraftEditor, PlanForm, SprintBoard, START_RESULTS, TaskDetail } from '@/components/planning/Board';
import { ConnectGitHub, Steps } from '@/components/planning/Connect';
import { PullRequests, Repository } from '@/components/planning/Integrations';
import { Avatar, InviteCard, JoinForm, TeamForm, TeamList } from '@/components/planning/Team';
import { planning, type Mutate, type PlanningState } from '@/lib/planning';

type View = 'board' | 'team' | 'pulls';
const TABS: { value: View; label: string }[] = [
  { value: 'board', label: 'Sprint' }, { value: 'team', label: 'Thành viên' }, { value: 'pulls', label: 'Pull request' },
];
const RETURN_MESSAGES: Record<string, string> = {
  config: 'Cần kết nối GitHub trước khi đăng nhập.',
  ready: 'Đã kết nối GitHub. Bước tiếp theo là đăng nhập.',
  configured: 'Máy chủ đã kết nối GitHub. Đăng nhập để tiếp tục.',
  setup_failed: 'GitHub chưa trả về kết nối. Bấm Kết nối GitHub để thử lại.',
  denied: 'Cần cấp quyền đăng nhập trên GitHub để tiếp tục.',
  state: 'Phiên xác nhận GitHub đã hết. Bấm đăng nhập để thử lại.',
  account: 'Chọn đúng tài khoản GitHub đang mở Planning.',
  repos: 'Cần kiểm tra quyền truy cập repo trên GitHub.',
  discovered: 'Đã tải các repo được cấp quyền.',
};
const SUCCESS_RETURNS = new Set(['discovered', 'ready', 'configured']);

function message(error: unknown) {
  return error instanceof Error && error.message !== 'Failed to fetch'
    ? error.message : 'Chưa kết nối được với ProductPilot. Thử lại sau ít phút.';
}

export function Planning() {
  const [embedded, setEmbedded] = useState(false);
  const [joining, setJoining] = useState(false);
  const sharedTeam = useRef('');
  const shell = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PlanningState | null>(null);
  const [view, setView] = useState<View>('board');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [showRepo, setShowRepo] = useState(false);
  const [editTeam, setEditTeam] = useState(false);
  const [compose, setCompose] = useState(false);
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const requestId = useRef(0);
  const working = useRef(false);
  const installReturn = useRef(false);
  const [justConnected, setJustConnected] = useState(false);
  const [startResult, setStartResult] = useState<{ task: number; code: string } | null>(null);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    const next = await planning.state();
    if (id === requestId.current) setState(next);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (window.parent === window) {
      url.pathname = '/workstation';
      url.hash = 'planning';
      url.searchParams.delete('embed');
      url.searchParams.set('tab', 'planning');
      window.location.replace(url.toString());
      return;
    }
    try {
      if (url.searchParams.get('embed') !== 'workstation' || window.parent.location.origin !== url.origin) return;
    } catch {
      return;
    }
    // Workstation báo vừa lưu nội dung tab Planning.
    const acceptReload = (event: MessageEvent) => {
      if (event.origin !== url.origin || event.source !== window.parent) return;
      if (event.data?.type === 'tang:planning-reload') void reload().catch(() => {});
      // Nút Đổi repo nằm ngoài trang: mở phần chọn repo trong khung.
      if (event.data?.type === 'tang:planning-repo') { setShowRepo(true); setEditTeam(false); setView('board'); }
      if (event.data?.type === 'tang:planning-viewport') {
        const { top, height } = event.data;
        if (!Number.isFinite(top) || !Number.isFinite(height)) return;
        document.documentElement.style.setProperty('--pl-view-top', top + 'px');
        document.documentElement.style.setProperty('--pl-view-height', height + 'px');
      }
    };
    window.addEventListener('message', acceptReload);
    setEmbedded(true);
    const github = url.searchParams.get('github');
    const setup = url.searchParams.has('github_setup') || url.searchParams.has('setup_action');
    // Có kèm task thì đây là kết quả của nút Bắt đầu task: hiện trong hộp chi tiết của task đó.
    const startedTask = Number(url.searchParams.get('task'));
    const fromStart = Boolean(github && START_RESULTS[github] && startedTask > 0);
    if (fromStart && github) setStartResult({ task: startedTask, code: github });
    if (setup || github === 'discovered' || github === 'repos' || (github === 'account' && !fromStart)) setShowRepo(true);
    if (setup && !github) installReturn.current = true;
    if (github === 'ready') setJustConnected(true);
    if (!fromStart && github && RETURN_MESSAGES[github]) {
      if (SUCCESS_RETURNS.has(github)) setNotice(RETURN_MESSAGES[github]);
      else setError(RETURN_MESSAGES[github]);
    } else if (setup) {
      setNotice('Tải repo đã cấp quyền để hoàn tất kết nối.');
    }
    const task = Number(url.searchParams.get('task'));
    if (Number.isSafeInteger(task) && task > 0) setSelectedTask(task);
    for (const name of ['github', 'github_setup', 'setup_action', 'installation_id', 'task']) url.searchParams.delete(name);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    void reload().catch((err) => setError(message(err)));
    return () => window.removeEventListener('message', acceptReload);
  }, [reload]);

  // Phím Esc bấm trong khung không tới được trang ngoài. Không có hộp thoại nào thì nhờ trang ngoài đóng card.
  useEffect(() => {
    if (!embedded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.d-modal')) return;
      window.parent.postMessage({ type: 'tang:planning-close' }, window.location.origin);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [embedded]);

  // Báo chiều cao nội dung để khung bên ngoài không phải cuộn riêng.
  useEffect(() => {
    const node = shell.current;
    if (!embedded || !node) return;
    const observer = new ResizeObserver(() => {
      window.parent.postMessage({ type: 'tang:planning-height', height: node.getBoundingClientRect().height }, window.location.origin);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [embedded]);

  // Báo Workstation đọc lại dữ liệu khi phiên, đội, repo hoặc task thay đổi.
  useEffect(() => {
    if (!embedded || !state) return;
    const next = JSON.stringify([state.profile, state.role, state.members, state.board, state.repo, state.sprints]);
    if (next === sharedTeam.current) return;
    sharedTeam.current = next;
    window.parent.postMessage({ type: 'tang:planning-changed' }, window.location.origin);
  }, [embedded, state]);

  useEffect(() => {
    if (!state?.role) return;
    const refresh = () => { if (!working.current) void reload().catch(() => {}); };
    const timer = window.setInterval(refresh, 8000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [reload, state?.role]);

  // Vừa cài app trên GitHub xong: tự tải danh sách repo.
  useEffect(() => {
    if (!installReturn.current || !state) return;
    installReturn.current = false;
    if (state.role === 'leader' && !state.profile?.demo && state.install_url) {
      (window.top ?? window).location.assign(planning.discover);
    }
  }, [state]);

  const mutate: Mutate = async (action, success) => {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      await action();
      await reload();
      if (success) setNotice(success);
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    } finally {
      setBusy(false);
      working.current = false;
    }
  };

  async function signOut() {
    if (await mutate(planning.logout)) {
      setView('board');
      setShowRepo(false);
      setEditTeam(false);
      setCompose(false);
      setSelectedTask(null);
      setJoining(false);
    }
  }

  const profile = state?.profile;
  const leader = state?.role === 'leader';
  const tasks = state?.sprints.flatMap((sprint) => sprint.tasks) ?? [];
  const activeTask = tasks.find((task) => task.id === selectedTask);
  const toBoard = () => { setEditTeam(false); setView('board'); };
  const openTask = (id: number) => { setError(null); setSelectedTask(id); setView('board'); };

  const needsRepo = Boolean(state && (!state.repo || !state.repo.access || showRepo));

  if (!embedded) return null;

  return (
    <div className="pl-shell" ref={shell}>
      {(state?.role || profile) && <header className="pl-top">
        {state?.role && (
          <nav className="pl-tabs" aria-label="Khu vực Planning">
            {TABS.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={view === value}
                onClick={() => { setEditTeam(false); setView(value); }}>
                <span aria-hidden="true" />{label}
              </button>
            ))}
          </nav>
        )}
        {profile && <div className="pl-account pl-row">
          {profile.demo && <span className="d-chip d-info">Dữ liệu mẫu</span>}
          <span className="d-muted text-sm pl-break">@{profile.login}</span>
          <button className="d-btn d-b2" type="button" disabled={busy} onClick={() => void signOut()}>Đăng xuất</button>
        </div>}
      </header>}
      <main className="pl-page" aria-label="Đội, sprint và pull request">
        <ErrorBox message={error} />
        {notice && <p className="d-alert info" role="status">{notice}</p>}
        {!state ? (
          <section className="d-card">{error
            ? <button className="d-btn d-b2" type="button" onClick={() => void mutate(() => Promise.resolve())}>Thử lại</button>
            : <Loading />}</section>
        ) : !profile ? (
          <section className="d-card pl-sign-in">
            <div className="max-w-[600px] flex flex-col gap-4 min-w-0">
              <h2 className="pl-intro-title">Lên sprint cùng đội</h2>
              <p className="d-muted">Thêm đội, chia task và theo dõi tiến độ từ repo GitHub của bạn.</p>
              {state.setup.needed ? (
                <>
                  <Steps current={1} />
                  <ConnectGitHub codeRequired={state.setup.code_required} busy={busy} mutate={mutate} />
                </>
              ) : justConnected && <Steps current={2} />}
              <div className="pl-row">
                {state.github_enabled && <a className="d-btn d-b1" href={planning.login} target="_top">Đăng nhập bằng GitHub</a>}
                {state.demo_enabled && <button className="d-btn d-b2" type="button" disabled={busy}
                  onClick={() => void mutate(planning.demo)}>Dùng thử với dữ liệu mẫu</button>}
              </div>
            </div>
            <div className="pl-login-avatars" aria-hidden="true">
              <Avatar styleIndex={0} /><Avatar styleIndex={1} /><Avatar styleIndex={2} /><Avatar styleIndex={3} />
            </div>
          </section>
        ) : !state.role ? (
          <>
            {!profile.demo && !joining && <Steps current={2} />}
            <div className="pl-row" role="group" aria-label="Cách vào đội">
              <button type="button" className={'d-btn ' + (joining ? 'd-b2' : 'd-b1')} aria-pressed={!joining}
                onClick={() => setJoining(false)}>Tạo đội mới</button>
              <button type="button" className={'d-btn ' + (joining ? 'd-b1' : 'd-b2')} aria-pressed={joining}
                onClick={() => setJoining(true)}>Nhập mã để vào đội</button>
            </div>
            {joining ? <JoinForm key={profile.github_id} profile={profile} busy={busy} mutate={mutate} onComplete={toBoard} />
              : <TeamForm key={profile.github_id} profile={profile} members={state.members} busy={busy} mutate={mutate} onComplete={toBoard} />}
          </>
        ) : (
          <>
            {view === 'team' ? (
              <>
                {leader && <div className="pl-row d-card"><h2 className="text-lg">Thành viên của đội</h2>
                  <button type="button" className="d-btn d-b2" onClick={() => setEditTeam(!editTeam)}>{editTeam ? 'Đóng chỉnh sửa' : 'Sửa thành viên'}</button></div>}
                {editTeam && leader ? <TeamForm profile={profile} members={state.members} busy={busy} mutate={mutate} onComplete={() => setEditTeam(false)} />
                  : <TeamList members={state.members} busy={busy} mutate={leader ? mutate : undefined} />}
                {leader && !editTeam && <InviteCard code={state.invite_code} busy={busy} mutate={mutate} />}
                {leader && !editTeam && !profile.demo && state.repo && <RepoAccess members={state.members} />}
              </>
            ) : (
              <div className={'pl-layout' + (!state.repo ? ' pl-repo-first' : '') + (needsRepo ? '' : ' pl-single')}>
                <div className="pl-board">
                  {view === 'pulls' ? <PullRequests state={state} tasks={tasks} busy={busy} mutate={mutate} /> : (
                    <>
                      {state.repo && leader && state.draft && (
                        <DraftEditor key={state.draft.id} draft={state.draft} members={state.members} repoVersion={state.repo_version}
                          busy={busy} mutate={mutate} showRegenerate={() => setCompose(!compose)} />
                      )}
                      {state.repo && leader && (compose || (!state.draft && !state.sprints.length)) && (
                        <PlanForm key={state.repo_version + ':' + (state.draft?.id ?? '')} initial={state.draft?.brief}
                          sprints={state.sprints} repoVersion={state.repo_version} busy={busy} mutate={mutate}
                          draftExists={Boolean(state.draft)} onCancel={compose ? () => setCompose(false) : undefined} />
                      )}
                      {state.repo && leader && !!state.sprints.length && !state.draft && !compose && (
                        <section className="d-card pl-between">
                          <div><h2 className="text-lg">Lên kế hoạch tiếp</h2><p className="d-muted text-sm">Thêm sprint sau mốc hiện tại.</p></div>
                          <button type="button" className="d-btn d-b1" onClick={() => setCompose(true)}>Lập thêm sprint</button>
                        </section>
                      )}
                      {!!state.sprints.length
                        ? <SprintBoard key={profile.github_id + ':' + state.repo_version} sprints={state.sprints}
                          members={state.members} me={profile.github_id} leader={leader} onOpen={openTask} />
                        : (!state.repo || !leader) && <section className="d-card">
                          <h2 className="text-lg">Sprint</h2>
                          <Empty>{state.repo ? 'Sprint sẽ hiện ở đây sau khi trưởng nhóm áp dụng kế hoạch.' : 'Đội có thể lập sprint sau khi kết nối repo.'}</Empty>
                        </section>}
                    </>
                  )}
                </div>
                {/* Repo và thông báo mở từ nút trên đầu trang; trong khung chỉ hiện repo khi cần chọn hoặc cấp quyền. */}
                {needsRepo && <aside className="pl-aside">
                  <Repository key={state.repo_version} state={state} showPicker={showRepo}
                    togglePicker={() => setShowRepo(!showRepo)} busy={busy} mutate={mutate} />
                </aside>}
              </div>
            )}
            {activeTask && <TaskDetail key={activeTask.id} task={activeTask} members={state.members} leader={leader}
              repoVersion={state.repo_version} repoUrl={state.repo?.url ?? null}
              result={startResult?.task === activeTask.id ? startResult.code : null}
              busy={busy} error={error} mutate={mutate} onClose={() => { setSelectedTask(null); setStartResult(null); }} />}
          </>
        )}
      </main>
    </div>
  );
}

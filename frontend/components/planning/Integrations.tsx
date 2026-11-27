'use client';

import { useState, type FormEvent } from 'react';
import { Empty, Field, Icon, useConfirm } from '@/components/kit/ui';
import { Steps } from '@/components/planning/Connect';
import { planning, type Mutate, type PlanningState, type Pull, type PullState, type Task } from '@/lib/planning';

export function Repository({ state, showPicker, togglePicker, busy, mutate }: {
  state: PlanningState; showPicker: boolean; togglePicker: () => void; busy: boolean; mutate: Mutate;
}) {
  const [confirm, ask] = useConfirm();
  const [pickedId, setPickedId] = useState('');
  const { repo, role, choices, repo_version: repoVersion } = state;
  const choice = choices?.find((row) => row.id === pickedId) ?? choices?.find((row) => row.id === repo?.id) ?? choices?.[0];
  const isLeader = role === 'leader';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!choice) return;
    const replace = Boolean(repo && repo.id !== choice.id);
    if (replace && !await ask({
      title: 'Đổi repo đang theo dõi?',
      body: 'Sprint, task, lịch sử PR và lịch nhắc của repo hiện tại sẽ bị xóa. Repo mới mở với bảng Planning trống.',
      confirmLabel: 'Đổi repo và xóa tiến độ',
      danger: true,
    })) return;
    if (await mutate(
      () => planning.chooseRepo(choice.id, repoVersion, replace),
      replace ? 'Đã mở Planning cho repo mới.' : 'Đã kết nối repo.',
    ) && showPicker) togglePicker();
  }

  return (
    <section className="d-card min-w-0 flex flex-col gap-3">
      <div className="pl-between">
        <h2 className="text-lg">Repo GitHub</h2>
        {repo?.access && <span className="d-chip d-ok">Đang theo dõi</span>}
      </div>
      {repo ? (
        <div className="pl-break">
          {repo.url
            ? <a href={repo.url} target="_blank" rel="noopener noreferrer" className="text-brand">{repo.name}</a>
            : <span>{repo.name}</span>}
          <p className="d-muted text-sm">Nhánh theo dõi · {repo.branch}</p>
          {!repo.access && <p className="d-alert err mt-3" role="status">Cần cấp lại quyền đọc PR cho repo này.</p>}
        </div>
      ) : <p className="d-muted text-sm">{isLeader ? 'Chọn repo để đọc pull request và theo dõi các task của đội.' : 'Trưởng nhóm sẽ kết nối repo cho đội.'}</p>}
      {isLeader && !repo && !state.profile?.demo && <Steps current={3} />}
      {repo?.access && !state.webhook && !state.profile?.demo && <p className="d-muted text-sm">
        Địa chỉ này chưa nhận được thông báo từ GitHub. Máy chủ ProductPilot tự đọc PR khoảng mỗi 60 giây, kể cả khi bạn không mở trang.
      </p>}

      {isLeader && repo && (
        <div className="pl-row">
          <button type="button" className="d-btn d-b2" disabled={busy} onClick={togglePicker}>
            {showPicker ? 'Đóng chọn repo' : repo.access ? 'Đổi repo' : 'Cấp quyền lại'}
          </button>
          {!state.profile?.demo && repo.access && <button type="button" className="d-btn d-b2" disabled={busy}
            onClick={() => void mutate(() => planning.refreshRepo(repoVersion), 'Đã đọc lại PR gần đây.')}>
            <Icon name="refresh" /> Đọc lại PR
          </button>}
        </div>
      )}

      {isLeader && (!repo || showPicker) && (
        <>
          {state.install_url && !choices?.length && <p className="d-muted text-sm">
            Bấm Cấp quyền trên GitHub và chọn repo cần theo dõi. Khi bạn quay lại, ProductPilot tự tải danh sách repo.
          </p>}
          {state.install_url && <div className="pl-row">
            <a className={'d-btn ' + (choices?.length ? 'd-b2' : 'd-b1')} href={state.install_url} target="_top">Cấp quyền trên GitHub</a>
            <a className="d-btn d-b2" href={planning.discover} target="_top">Tải repo đã cấp quyền</a>
          </div>}
          {choices?.length ? (
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <Field label={state.profile?.demo ? 'Repo mẫu' : 'Repo đã cấp quyền'}>
                <select className="d-sel" aria-label="Chọn repo" value={choice?.id ?? ''} onChange={(event) => setPickedId(event.target.value)}>
                  {choices.map((row) => <option key={row.id} value={row.id}>{row.name}{row.private ? ' · riêng tư' : ''}</option>)}
                </select>
              </Field>
              <button type="submit" className="d-btn d-b1 self-start" disabled={busy || !choice}>Kết nối repo đã chọn</button>
            </form>
          ) : choices && state.install_url ? (
            <p className="d-alert info">Hãy chọn repo trong phần cài GitHub App, rồi tải lại danh sách.</p>
          ) : !state.install_url && !state.profile?.demo ? (
            <p className="d-alert info">GitHub App của máy chủ chưa đủ thông tin để đọc repo. Người quản lý máy chủ cần bổ sung.</p>
          ) : null}
        </>
      )}
      {confirm}
    </section>
  );
}

const PR_STATES: [PullState, string][] = [
  ['draft', 'PR nháp'], ['open', 'Mở để duyệt'], ['merged', 'Đã merge'], ['closed', 'Đã đóng, chưa merge'],
];

function PendingPull({ pull, tasks, repoVersion, busy, mutate }: {
  pull: Pull; tasks: Task[]; repoVersion: number; busy: boolean; mutate: Mutate;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const task = tasks.find((item) => item.id === (selected ?? pull.task_id));
  function submit(event: FormEvent) {
    event.preventDefault();
    if (task) void mutate(() => planning.link(pull.number, task.id, repoVersion), 'Đã liên kết PR với ' + task.code + '.');
  }

  return (
    <article className="bg-soft rounded-xl flex flex-col gap-3 p-3">
      <div className="pl-break">
        {pull.url
          ? <a href={pull.url} target="_blank" rel="noopener noreferrer" className="text-brand">#{pull.number} {pull.title}</a>
          : <p>#{pull.number} {pull.title}</p>}
        <p className="d-muted text-sm">{pull.author_login ? '@' + pull.author_login + ' · ' : ''}{PR_STATES.find(([key]) => key === pull.state)?.[1]}</p>
        {pull.note && <p className="text-rust text-sm mt-1">{pull.note}</p>}
      </div>
      <form className="pl-row" onSubmit={submit}>
        <select className="d-sel pl-task-picker" aria-label={'Task cho PR #' + pull.number} value={task?.id ?? ''} required
          onChange={(event) => setSelected(Number(event.target.value))}>
          <option value="">Chọn task</option>
          {tasks.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
        </select>
        <button type="submit" className="d-btn d-b2" disabled={busy || !task}>Chọn làm PR chính</button>
        <button type="button" className="d-btn d-b2" disabled={busy}
          onClick={() => void mutate(() => planning.link(pull.number, null, repoVersion), 'Đã bỏ qua PR.')}>Bỏ qua</button>
      </form>
    </article>
  );
}

function SimulatePull({ state, tasks, busy, mutate }: { state: PlanningState; tasks: Task[]; busy: boolean; mutate: Mutate }) {
  const [number, setNumber] = useState('1');
  const [title, setTitle] = useState(tasks[0] ? '[' + tasks[0].code + '] ' + tasks[0].title : '');
  const [author, setAuthor] = useState(tasks[0]?.assignee_id ?? state.profile?.github_id ?? '');
  const [status, setStatus] = useState<PullState>('open');

  function submit(event: FormEvent) {
    event.preventDefault();
    void mutate(() => planning.simulate(Number(number), title, author, status, state.repo_version), 'Đã đồng bộ PR mẫu.');
  }

  return (
    <form className="d-card flex flex-col gap-3" onSubmit={submit}>
      <div>
        <h2 className="text-lg">Giả lập pull request</h2>
        <p className="d-muted text-sm">Dùng lại số PR để chuyển từ mở sang merge. Đổi người mở để thử ghi chú.</p>
      </div>
      <div className="pl-fields">
        <Field label="Số PR"><input className="d-inp" type="number" aria-label="Số PR" value={number} required min={1} max={99999}
          onChange={(event) => setNumber(event.target.value)} /></Field>
        <Field label="Trạng thái PR"><select className="d-sel" aria-label="Trạng thái PR" value={status}
          onChange={(event) => setStatus(event.target.value as PullState)}>
          {PR_STATES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></Field>
      </div>
      <Field label="Tiêu đề có mã task">
        <input className="d-inp" aria-label="Tiêu đề PR" value={title} required maxLength={240}
          placeholder="[T-…] Tên việc đã làm" onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Người mở PR">
        <select className="d-sel" aria-label="Người mở PR" value={author} required onChange={(event) => setAuthor(event.target.value)}>
          {state.members.map((member) => <option key={member.github_id} value={member.github_id}>{member.name} · @{member.login}</option>)}
        </select>
      </Field>
      <button className="d-btn d-b1 self-start" type="submit" disabled={busy}>Gửi PR mẫu</button>
    </form>
  );
}

export function PullRequests({ state, tasks, busy, mutate }: { state: PlanningState; tasks: Task[]; busy: boolean; mutate: Mutate }) {
  const leader = state.role === 'leader';
  const linked = tasks.flatMap((task) => task.pulls
    .filter((pull) => pull.linkage !== 'pending').map((pull) => ({ task, pull }))).sort((a, b) => b.pull.number - a.pull.number);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {leader && <section className="d-card min-w-0 flex flex-col gap-3">
        <h2 className="text-lg">PR cần đối chiếu{state.inbox.length > 0 && ' · ' + state.inbox.length}</h2>
        {state.inbox.length ? state.inbox.map((pull) => <PendingPull key={state.repo_version + ':' + pull.number}
          pull={pull} tasks={tasks} repoVersion={state.repo_version} busy={busy} mutate={mutate} />)
          : <Empty>{state.repo?.access ? 'Các PR đã khớp sẽ hiện trên task.' : 'Kết nối repo để đọc pull request.'}</Empty>}
      </section>}
      {leader && state.profile?.demo && state.repo?.access && <SimulatePull key={state.repo_version + ':' + (tasks[0]?.id ?? '')}
        state={state} tasks={tasks} busy={busy} mutate={mutate} />}
      <section className="d-card flex flex-col gap-3">
        <h2 className="text-lg">PR đã liên kết</h2>
        {linked.length ? linked.map(({ task, pull }) => <div key={pull.number} className="bg-soft rounded-xl pl-between p-3">
          <div className="min-w-0 pl-break">
            <p className="text-sm d-muted">{task.code} · {PR_STATES.find(([key]) => key === pull.state)?.[1]}</p>
            {pull.url ? <a className="text-brand" href={pull.url} target="_blank" rel="noopener noreferrer">#{pull.number} {pull.title}</a>
              : <span>#{pull.number} {pull.title}</span>}
            {pull.note && <p className="text-rust text-sm">{pull.note}</p>}
          </div>
        </div>) : <Empty>Đặt mã task trong tiêu đề PR để ProductPilot tìm việc tương ứng.</Empty>}
      </section>
    </div>
  );
}

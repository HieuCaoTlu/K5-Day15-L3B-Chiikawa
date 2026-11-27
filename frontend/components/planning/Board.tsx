'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { Empty, ErrorBox, Field, Icon, Modal, Seg, StatusChip, useConfirm } from '@/components/kit/ui';
import { Avatar } from '@/components/planning/Team';
import {
  after, day, localDateTime, planning, time, today, type Brief, type Draft, type Member, type Mutate, type Plan,
  type Status, type Sprint, type Task, type TaskInput,
} from '@/lib/planning';

const STATUS: [Status, string][] = [
  ['todo', 'Cần làm'], ['doing', 'Đang làm'], ['review', 'Chờ duyệt PR'], ['done', 'Hoàn thành'],
];
const lines = (value: string) => value.split(/\n/).map((item) => item.trim()).filter(Boolean);
const cleanTask = (task: TaskInput) => ({ ...task, criteria: task.criteria.map((item) => item.trim()).filter(Boolean) });

function TaskFields<T extends TaskInput>({ task, members, onChange }: {
  task: T; members: Member[]; onChange: (task: T) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Tên task">
        <input aria-label="Tên task" className="d-inp" value={task.title} maxLength={160} required
          onChange={(event) => onChange({ ...task, title: event.target.value })} />
      </Field>
      <Field label="Mô tả">
        <textarea aria-label="Mô tả task" className="d-ta" rows={2} value={task.description} maxLength={1400} required
          onChange={(event) => onChange({ ...task, description: event.target.value })} />
      </Field>
      <Field label="Tiêu chí hoàn thành · mỗi dòng một tiêu chí">
        <textarea aria-label="Tiêu chí hoàn thành" className="d-ta" rows={3} value={task.criteria.join('\n')} required maxLength={2165}
          onChange={(event) => onChange({ ...task, criteria: event.target.value.split('\n') })} />
      </Field>
      <div className="pl-fields">
        <Field label="Người phụ trách">
          <select aria-label="Người phụ trách" className="d-sel" required value={task.assignee_id ?? ''}
            onChange={(event) => onChange({ ...task, assignee_id: event.target.value || null })}>
            <option value="">Chọn người</option>
            {members.map((member) => <option value={member.github_id} key={member.github_id}>{member.name}</option>)}
          </select>
        </Field>
        <Field label="Hạn · giờ Việt Nam">
          <input aria-label="Hạn theo giờ Việt Nam" type="datetime-local" className="d-inp" value={localDateTime(task.deadline)} required
            onChange={(event) => onChange({ ...task, deadline: event.target.value ? event.target.value + ':00+07:00' : '' })} />
        </Field>
      </div>
      <Field label="Trạng thái">
        <select aria-label="Trạng thái task" className="d-sel" value={task.status}
          onChange={(event) => onChange({ ...task, status: event.target.value as Status })}>
          {STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
    </div>
  );
}

export function PlanForm({ initial, sprints, repoVersion, busy, mutate, onCancel, draftExists }: {
  initial?: Brief; sprints: Sprint[]; repoVersion: number; busy: boolean; mutate: Mutate; onCancel?: () => void;
  draftExists: boolean;
}) {
  const previous = sprints.at(-1)?.ends_on;
  const firstDate = previous && previous >= today() ? after(previous, 1) : today();
  const [overview, setOverview] = useState(initial?.overview ?? '');
  const [stories, setStories] = useState(initial?.stories.join('\n') ?? '');
  const [start, setStart] = useState(initial?.starts_on ?? firstDate);
  const [end, setEnd] = useState(initial?.ends_on ?? after(firstDate, 6));
  function submit(event: FormEvent) {
    event.preventDefault();
    void mutate(() => planning.draft({
      overview, stories: lines(stories), starts_on: start, ends_on: end,
    }, repoVersion), 'Đã tạo bản nháp để duyệt.').then((ok) => { if (ok) onCancel?.(); });
  }

  return (
    <form onSubmit={submit} className="d-card flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Lên sprint cho đội</h2>
        <p className="d-muted text-sm">Nhập kết quả cần bàn giao và khoảng thời gian thực hiện.</p>
      </div>
      <Field label="Tổng quan dự án">
        <textarea className="d-ta" aria-label="Tổng quan dự án" rows={3} value={overview} onChange={(event) => setOverview(event.target.value)}
          placeholder="Ra mắt bản thử nghiệm để người dùng xem trạng thái đơn hàng" required minLength={5} maxLength={2000} />
      </Field>
      <Field label="User story · mỗi dòng một nhu cầu">
        <textarea className="d-ta" aria-label="User story" rows={3} value={stories} onChange={(event) => setStories(event.target.value)}
          placeholder="Là khách mua hàng, tôi muốn tra cứu đơn bằng mã đơn" maxLength={5040} />
      </Field>
      <div className="pl-fields">
        <Field label="Bắt đầu">
          <input type="date" className="d-inp" aria-label="Ngày bắt đầu dự án" value={start} required
            min={previous ? after(previous, 1) : undefined} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="Hạn dự án">
          <input type="date" className="d-inp" aria-label="Ngày kết thúc dự án" value={end} required min={start}
            max={start ? after(start, 83) : undefined} onChange={(event) => setEnd(event.target.value)} />
        </Field>
      </div>
      <div className="pl-row">
        <button type="submit" className={'d-btn ' + (draftExists ? 'd-b2' : 'd-b1')} disabled={busy}>
          {busy ? 'Đang xử lý…' : draftExists ? 'Tạo lại bản nháp' : 'Tự động giao task'}
        </button>
        {onCancel && <button type="button" className="d-btn d-b2" onClick={onCancel} disabled={busy}>Đóng</button>}
      </div>
    </form>
  );
}

export function DraftEditor({ draft, members, repoVersion, busy, mutate, showRegenerate }: {
  draft: Draft; members: Member[]; repoVersion: number; busy: boolean; mutate: Mutate; showRegenerate: () => void;
}) {
  const [plan, setPlan] = useState<Plan>(draft.plan);
  const [formError, setFormError] = useState<string | null>(null);
  const update = (index: number, sprint: Plan['sprints'][number]) =>
    setPlan((old) => ({ sprints: old.sprints.map((item, position) => position === index ? sprint : item) }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      sprints: plan.sprints.map((sprint) => ({
        ...sprint, tasks: sprint.tasks.map((task) => ({ ...task, ...cleanTask(task) })),
      })),
    };
    if (payload.sprints.some((sprint) => sprint.tasks.some((task) => task.criteria.length === 0 || task.criteria.length > 6))) {
      setFormError('Mỗi task cần từ một đến sáu tiêu chí hoàn thành.');
      return;
    }
    setFormError(null);
    await mutate(() => planning.apply(draft.id, payload, repoVersion), 'Đã giao task cho đội.');
  }

  return (
    <form onSubmit={submit} className="d-card min-w-0 flex flex-col gap-4" aria-label="Duyệt kế hoạch sprint">
      <div className="pl-between">
        <div>
          <h2 className="text-lg">Duyệt kế hoạch</h2>
          <p className="d-muted text-sm">{draft.source === 'llm' ? 'Gemini đã đề xuất sprint.' : 'Đề xuất được tạo theo quy tắc phân việc.'} Mở từng task để sửa trước khi giao.</p>
        </div>
        <StatusChip status="waiting_review" />
      </div>
      {plan.sprints.map((sprint, index) => (
        <section key={index} className="bg-soft rounded-[20px] p-4 flex flex-col gap-3">
          <div className="pl-fields">
            <Field label="Tên sprint">
              <input className="d-inp" aria-label={'Tên sprint ' + (index + 1)} value={sprint.title} maxLength={120} required
                onChange={(event) => update(index, { ...sprint, title: event.target.value })} />
            </Field>
            <Field label="Mục tiêu sprint">
              <input className="d-inp" aria-label={'Mục tiêu sprint ' + (index + 1)} value={sprint.goal} maxLength={500} required
                onChange={(event) => update(index, { ...sprint, goal: event.target.value })} />
            </Field>
          </div>
          <div className="pl-fields">
            <Field label="Bắt đầu">
              <input type="date" className="d-inp" aria-label={'Bắt đầu sprint ' + (index + 1)} value={sprint.starts_on} required
                min={draft.brief.starts_on} max={sprint.ends_on}
                onChange={(event) => update(index, { ...sprint, starts_on: event.target.value })} />
            </Field>
            <Field label="Kết thúc">
              <input type="date" className="d-inp" aria-label={'Kết thúc sprint ' + (index + 1)} value={sprint.ends_on} required
                min={sprint.starts_on} max={draft.brief.ends_on}
                onChange={(event) => update(index, { ...sprint, ends_on: event.target.value })} />
            </Field>
          </div>
          {sprint.tasks.map((task, position) => (
            <details key={position} className="bg-white rounded-xl pl-draft-task">
              <summary>
                <span className="pl-break">{task.title}</span>
                <span className="d-muted text-sm pl-break">{members.find((member) => task.assignee_id === member.github_id)?.name ?? 'Chọn người'}{task.deadline && ' · ' + time(task.deadline)}</span>
              </summary>
              <div className="p-3 pt-1">
                <TaskFields task={task} members={members} onChange={(next) => update(index, {
                  ...sprint, tasks: sprint.tasks.map((item, p) => p === position ? next : item),
                })} />
              </div>
            </details>
          ))}
        </section>
      ))}
      {formError && <p className="d-alert err" role="alert">{formError}</p>}
      <div className="pl-row">
        <button type="submit" className="d-btn d-b1" disabled={busy}>Áp dụng kế hoạch</button>
        <button type="button" className="d-btn d-b2" onClick={showRegenerate} disabled={busy}>Sửa đầu vào</button>
      </div>
    </form>
  );
}

function TaskCard({ task, members, onOpen }: { task: Task; members: Member[]; onOpen: () => void }) {
  const owner = members.find((member) => member.github_id === task.assignee_id);
  const due = new Date(task.deadline).getTime() - Date.now();
  return (
    <article className="pl-task" data-avatar={owner?.avatar}>
      <div className="pl-between">
        <span className="d-muted text-sm font-medium">{task.code}</span>
        <StatusChip status={task.progress === 'review' ? 'waiting_review' : task.progress} />
      </div>
      <button type="button" className="pl-task-title pl-break" onClick={onOpen}>{task.title}</button>
      <div className="pl-row text-sm d-muted">
        {owner && <span className="pl-row gap-1.5"><Avatar styleIndex={owner.avatar} /><span className="pl-break">{owner.name}</span></span>}
        <span className={task.progress !== 'done' && due <= 86400000 ? 'text-rust' : undefined}>
          {task.progress !== 'done' && due < 0 ? 'Quá hạn · ' : 'Hạn '}{time(task.deadline)}
        </span>
      </div>
      {task.pulls.some((pull) => pull.linkage === 'pending') && <span className="text-rust text-sm">Có PR cần đối chiếu</span>}
    </article>
  );
}

// Cùng thứ tự màu với SPRINT_TONES trong public/tang/app.js.
const SPRINT_TONES = ['var(--indigo)', 'var(--orange)', 'var(--violet)', 'var(--blue)', 'var(--red)', 'var(--green)', 'var(--yellow)'];

export function SprintBoard({ sprints, members, me, leader, onOpen }: {
  sprints: Sprint[]; members: Member[]; me: string; leader: boolean; onOpen: (id: number) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'mine'>(leader ? 'all' : 'mine');
  if (!sprints.length) return null;
  const ownTaskCount = sprints.reduce((sum, sprint) => sum + sprint.tasks.filter((task) => task.assignee_id === me).length, 0);
  return (
    <section className="d-card flex min-w-0 flex-col gap-4">
      <div className="pl-between">
        <h2 className="text-lg">Sprint đã giao</h2>
        <Seg label="Lọc task" value={filter} onChange={setFilter}
          options={[{ value: 'all', label: 'Tất cả' }, { value: 'mine', label: 'Của tôi' }]} />
      </div>
      {filter === 'mine' && ownTaskCount === 0 && <Empty>Bạn chưa có task được giao.</Empty>}
      {sprints.map((sprint, index) => {
        const tasks = sprint.tasks.filter((task) => filter === 'all' || task.assignee_id === me);
        if (!tasks.length) return null;
        const done = tasks.filter((task) => task.progress === 'done').length;
        const late = tasks.filter((task) => task.progress !== 'done' && Date.parse(task.deadline) < Date.now()).length;
        // <details> tự giữ trạng thái mở khi dữ liệu được đọc lại, và dùng được bằng bàn phím.
        return (
          <details key={sprint.id} className="pl-sprint" style={{ '--sp': SPRINT_TONES[index % SPRINT_TONES.length] } as CSSProperties}>
            <summary>
              <span className="pl-sprint-name">
                <h3 className="pl-break">{sprint.title}</h3>
                <span className="d-muted text-sm">{day(sprint.starts_on)} – {day(sprint.ends_on)}</span>
              </span>
              <span className="pl-sprint-count text-sm">
                {late > 0 && <span className="text-rust">{late} quá hạn</span>}
                <span className="d-muted">{done}/{tasks.length} task xong</span>
              </span>
            </summary>
            <div className="pl-sprint-body">
              <p className="d-muted text-sm pl-break">{sprint.goal}</p>
              <div className="pl-task-grid mt-3">{tasks.map((task) => (
                <TaskCard task={task} members={members} onOpen={() => onOpen(task.id)} key={task.id} />
              ))}</div>
            </div>
          </details>
        );
      })}
    </section>
  );
}

// Kết quả khi GitHub chuyển về sau nút Bắt đầu task.
export const START_RESULTS: Record<string, string> = {
  pr_created: 'Đã tạo nhánh và PR nháp đứng tên bạn.',
  pr_exists: 'Nhánh của task đã có PR đang mở. ProductPilot đã liên kết PR đó.',
  pr_permission: 'Chưa tạo được PR vì thiếu quyền ghi. Bạn cần được thêm vào repo và đã chấp nhận lời mời, còn GitHub App cần quyền ghi Contents và Pull requests.',
  pr_empty: 'Nhánh đang theo dõi chưa có commit nào. Tạo commit đầu tiên trên GitHub rồi thử lại.',
  pr_draft: 'Repo này không hỗ trợ PR nháp. Nhánh đã được tạo; bạn tự mở PR trên GitHub khi sẵn sàng.',
  pr_failed: 'GitHub chưa tạo được PR. Thử lại sau ít phút.',
  pr_stale: 'Task hoặc repo vừa thay đổi nên chưa tạo gì trên GitHub. Xem lại task rồi thử lại.',
  account: 'Chọn đúng tài khoản GitHub đang mở Planning rồi thử lại.',
  denied: 'Cần xác nhận trên GitHub để tạo PR.',
};

export function TaskDetail({ task, members, leader, repoVersion, repoUrl, result, busy, error, mutate, onClose }: {
  task: Task; members: Member[]; leader: boolean; repoVersion: number; repoUrl: string | null; result: string | null;
  busy: boolean; error: string | null; mutate: Mutate; onClose: () => void;
}) {
  const [edit, setEdit] = useState<TaskInput | null>(null);
  const [copied, setCopied] = useState(false);
  const owner = members.find((member) => member.github_id === task.assignee_id);
  const startEdit = () => setEdit({
    title: task.title, description: task.description, criteria: task.criteria, deadline: task.deadline,
    assignee_id: task.assignee_id, status: task.status,
  });
  const [confirm, ask] = useConfirm();
  const branch = 'task/t-' + task.id;
  const commands = ['git fetch origin', 'git switch ' + branch];
  const succeeded = result === 'pr_created' || result === 'pr_exists';
  function start() {
    void mutate(async () => {
      const next = await planning.startTask(task.id, repoVersion);
      (window.top ?? window).location.assign(next.url); // GitHub không cho nhúng trong khung
    });
  }
  async function remove() {
    if (!await ask({
      title: 'Xóa ' + task.code + '?',
      body: 'Không khôi phục được và mã này không dùng lại. PR đang liên kết còn mở sẽ quay về mục cần đối chiếu.',
      confirmLabel: 'Xóa hẳn',
      danger: true,
    })) return;
    if (await mutate(() => planning.removeTask(task.id, repoVersion), 'Đã xóa ' + task.code + '.')) onClose();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (edit && await mutate(() => planning.task(task.id, cleanTask(edit), repoVersion), 'Đã cập nhật task.')) setEdit(null);
  }
  return (
    <>
    <Modal title={task.code + ' · ' + task.title} onClose={onClose}>
      {edit ? (
        <form className="flex flex-col gap-4" onSubmit={save}>
          <TaskFields task={edit} members={members} onChange={setEdit} />
          <ErrorBox message={error} />
          <div className="pl-row">
            <button type="submit" className="d-btn d-b1" disabled={busy}>Lưu task</button>
            <button type="button" className="d-btn d-b2" onClick={() => setEdit(null)} disabled={busy}>Huỷ</button>
          </div>
        </form>
      ) : (
        <>
          <div className="pl-row"><StatusChip status={task.progress === 'review' ? 'waiting_review' : task.progress} /><span className="d-muted text-sm">{owner?.name} · Hạn {time(task.deadline)}</span></div>
          {result && START_RESULTS[result] && <div className={'d-alert ' + (succeeded ? 'info' : 'err')} role="status">
            <p>{START_RESULTS[result]}</p>
            {result === 'pr_permission' && repoUrl && <p><a className="text-brand" href={repoUrl + '/invitations'} target="_blank" rel="noopener noreferrer">Mở lời mời vào repo</a>. Nếu không có lời mời, nhờ trưởng nhóm xem mục Quyền trên GitHub ở tab Thành viên.</p>}
          </div>}
          {succeeded && <div className="flex flex-col gap-2">
            <h3 className="text-base">Lấy nhánh về máy</h3>
            {commands.map((command) => <code key={command} className="pl-code">{command}</code>)}
            <p className="d-muted text-sm">Đẩy code lên nhánh này. Khi xong, bấm Ready for review trên GitHub.</p>
          </div>}
          <p className="pl-break whitespace-pre-wrap">{task.description}</p>
          <div>
            <h3 className="text-base">Tiêu chí hoàn thành</h3>
            <ul className="list-disc pl-5 text-sm d-muted">{task.criteria.map((item, index) => <li key={index} className="pl-break">{item}</li>)}</ul>
          </div>
          {(task.pulls.length > 0) && (
            <div className="flex flex-col gap-2">
              <h3 className="text-base">Pull request</h3>
              {task.pulls.map((pull) => <div key={pull.number} className="bg-soft rounded-xl p-3 pl-break">
                {pull.url ? <a className="text-brand" href={pull.url} target="_blank" rel="noopener noreferrer">#{pull.number} {pull.title}</a> : <span>#{pull.number} {pull.title}</span>}
                {pull.note && <p className="text-rust text-sm mt-1">{pull.note}</p>}
              </div>)}
            </div>
          )}
          {task.can_start && <p className="d-muted text-sm">Bắt đầu task sẽ tạo nhánh {branch} và một PR nháp đứng tên bạn. GitHub hỏi xác nhận trước.</p>}
          <div className="pl-row">
            {task.can_start && <button type="button" className="d-btn d-b1" disabled={busy} onClick={start}>Bắt đầu task</button>}
            {leader && <button type="button" className="d-btn d-b2" onClick={startEdit}>Sửa task</button>}
            {leader && <button type="button" className="d-btn d-b2 text-danger" disabled={busy} onClick={() => void remove()}>Xóa task</button>}
            <button type="button" className="d-btn d-b2"
              onClick={() => void navigator.clipboard?.writeText('[' + task.code + ']').then(() => setCopied(true), () => setCopied(false))}>
              {copied ? 'Đã chép mã' : 'Chép mã cho PR'}
            </button>
          </div>
        </>
      )}
    </Modal>
    {confirm}
    </>
  );
}

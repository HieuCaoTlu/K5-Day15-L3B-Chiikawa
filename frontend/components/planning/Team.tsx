'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import '../../public/tang/avatar.js';
import { Field, Icon, useConfirm } from '@/components/kit/ui';
import { planning, type Member, type MemberInput, type Mutate, type Profile } from '@/lib/planning';

type AvatarArt = { names: string[]; markup: (look: number, uid: string) => string; track: (doc: Document) => void };
const art = () => (globalThis as unknown as { TangAvatar: AvatarArt }).TangAvatar;
const SKILLS: [string, RegExp][] = [
  ['Frontend', /\b(frontend|react|next(\.js)?|vue|angular|svelte|html|css|tailwind)\b/i],
  ['Backend', /\b(backend|fastapi|django|flask|nestjs|node\.js|spring|laravel)\b/i],
  ['API', /\b(api|rest|graphql|fastapi)\b/i],
  ['Python', /\b(python|fastapi|django|flask|pandas)\b/i],
  ['TypeScript', /\b(typescript|tsx|ts)\b/i],
  ['JavaScript', /\b(javascript|react|vue|node\.js)\b/i],
  ['Thiết kế', /\b(figma|ui|ux|design)\b|thiết kế/i],
  ['Dữ liệu', /\b(sql|postgres|mysql|pandas|data)\b|dữ liệu/i],
  ['AI', /\b(ai|llm|langgraph|gemini|rag|prompt|machine learning)\b/i],
  ['DevOps', /\b(devops|docker|kubernetes|ci\/cd|gh actions|github actions|terraform)\b/i],
  ['Kiểm thử', /\b(test|testing|pytest|playwright|qa)\b|kiểm thử/i],
  ['Sản phẩm', /\b(product|research|pm)\b|sản phẩm|nghiên cứu/i],
];

type EditorRow = MemberInput & { key: string; removed: string[]; extra: string };

function inferred(experience: string) {
  return SKILLS.filter(([, expression]) => expression.test(experience)).map(([skill]) => skill);
}

function visibleTags(row: EditorRow): string[] {
  const tags = new Map(row.tags.map((tag) => [tag.toLocaleLowerCase('vi'), tag] as const));
  inferred(row.experience).forEach((tag) => {
    const normalized = tag.toLocaleLowerCase('vi');
    if (!tags.has(normalized) && !row.removed.includes(normalized)) tags.set(normalized, tag);
  });
  return [...tags.values()].slice(0, 10);
}

export function Avatar({ styleIndex }: { styleIndex: number }) {
  const uid = 'av' + useId().replace(/[^a-zA-Z0-9]/g, '');
  useEffect(() => art().track(document), []);
  const html = useMemo(() => art().markup(styleIndex, uid), [styleIndex, uid]);
  // Hình do avatar.js dựng từ dữ liệu cố định trong file, không chứa nội dung người dùng nhập.
  return <span className={'pl-avatar pl-person-' + styleIndex} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

function MemberCard({ row, index, verified, onChange, onRemove, busy, joining }: {
  row: EditorRow; index: number; verified: boolean; onChange: (next: EditorRow) => void; onRemove?: () => void; busy: boolean;
  joining?: boolean;
}) {
  const tags = visibleTags(row);
  const addTag = () => {
    const tag = row.extra.trim();
    if (!tag || tags.length >= 10) return;
    const normalized = tag.toLocaleLowerCase('vi');
    onChange({
      ...row, extra: '', removed: row.removed.filter((old) => old !== normalized),
      tags: tags.some((old) => old.toLocaleLowerCase('vi') === normalized) ? row.tags : [...row.tags, tag],
    });
  };
  return (
    <section className="pl-member-editor bg-soft rounded-[20px] p-4" aria-label={'Hồ sơ ' + (row.name || (index + 1))}>
      <div className="pl-between">
        <div className="pl-row">
          <Avatar styleIndex={row.avatar} />
          <div className="min-w-0">
            <p className="text-base pl-break">{row.name || 'Thành viên mới'}</p>
            {(row.login || verified) && <p className="d-muted text-sm pl-break">{index === 0 && !joining ? 'Trưởng nhóm · ' : ''}{row.login && '@' + row.login}</p>}
          </div>
        </div>
        {onRemove && (
          <button type="button" className="d-btn d-b2 d-ib" onClick={onRemove} disabled={busy} aria-label="Bỏ thành viên mới">
            <Icon name="trash" />
          </button>
        )}
      </div>
      <div className="pl-fields mt-3">
        <Field label="Tên hiển thị">
          <input aria-label={'Tên thành viên ' + (index + 1)} className="d-inp" value={row.name} maxLength={80} required
            onChange={(event) => onChange({ ...row, name: event.target.value })} />
        </Field>
        <Field label="Tên GitHub">
          <input aria-label={'GitHub thành viên ' + (index + 1)} className="d-inp" value={row.login} required readOnly={verified}
            pattern="[A-Za-z0-9](?:[A-Za-z0-9\-]{0,37}[A-Za-z0-9])?" maxLength={39} autoCapitalize="off" spellCheck={false}
            onChange={(event) => onChange({ ...row, login: event.target.value.trim().replace(/^@/, '') })} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Kinh nghiệm đã làm">
          <textarea className="d-ta" aria-label={'Kinh nghiệm thành viên ' + (index + 1)} rows={2} required maxLength={700}
            placeholder="Đã làm API FastAPI và dựng giao diện React"
            value={row.experience} onChange={(event) => onChange({ ...row, experience: event.target.value })} />
        </Field>
      </div>
      <div className="pl-tag-row mt-3" aria-label="Thẻ kỹ năng">
        {tags.map((tag) => (
          <button key={tag} type="button" className="d-chip d-info pl-tag"
            aria-label={'Bỏ thẻ ' + tag}
            onClick={() => onChange({
              ...row, tags: row.tags.filter((old) => old !== tag), removed: [...row.removed, tag.toLocaleLowerCase('vi')],
            })}>
            {tag}<span aria-hidden="true">×</span>
          </button>
        ))}
        <div className="pl-extra-tag">
          <input className="d-inp" aria-label="Thêm thẻ kỹ năng" placeholder="Thêm thẻ" maxLength={25} value={row.extra}
            disabled={tags.length >= 10} onChange={(event) => onChange({ ...row, extra: event.target.value })}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } }} />
          <button type="button" aria-label="Lưu thẻ kỹ năng" className="d-btn d-b2 d-ib" onClick={addTag}
            disabled={!row.extra.trim() || tags.length >= 10}><Icon name="plus" /></button>
        </div>
      </div>
      <div className="mt-3 pl-avatar-options" role="group" aria-label="Chọn avatar 3D">
        {art().names.map((caption, avatar) => (
          <button key={caption} type="button" className="pl-avatar-option" aria-label={caption}
            aria-pressed={row.avatar === avatar} onClick={() => onChange({ ...row, avatar })}>
            <Avatar styleIndex={avatar} />
          </button>
        ))}
      </div>
    </section>
  );
}

function draftRow(data: MemberInput, key: string): EditorRow {
  const saved = new Set(data.tags.map((tag) => tag.toLocaleLowerCase('vi')));
  const removed = data.github_id
    ? inferred(data.experience).map((tag) => tag.toLocaleLowerCase('vi')).filter((tag) => !saved.has(tag))
    : [];
  return { ...data, key, removed, extra: '' };
}

export function TeamForm({ profile, members, busy, mutate, onComplete }: {
  profile: Profile; members: Member[]; busy: boolean; mutate: Mutate; onComplete?: () => void;
}) {
  const sequence = useRef(0);
  const [rows, setRows] = useState<EditorRow[]>(() => members.length
    ? members.map((item) => draftRow(item, item.github_id))
    : [draftRow({ github_id: profile.github_id, login: profile.login, name: profile.name, experience: '', tags: [], avatar: 0 }, profile.github_id)]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const roster = rows.map((row) => ({
      github_id: row.github_id, login: row.login, name: row.name, experience: row.experience,
      tags: visibleTags(row), avatar: row.avatar,
    }));
    if (await mutate(() => planning.roster(roster), 'Đã lưu hồ sơ đội.')) onComplete?.();
  };
  const fillDemo = () => {
    setRows([
      { ...rows[0], experience: 'Thiết kế luồng sản phẩm trên Figma, dựng UI với React.' },
      draftRow({ name: 'Minh', login: 'minh-demo', experience: 'Dựng API bằng FastAPI và làm việc với Postgres.', tags: [], avatar: 2 }, 'demo-minh'),
      draftRow({ name: 'Lan', login: 'lan-demo', experience: 'Kiểm thử với Playwright và triển khai bằng Docker.', tags: [], avatar: 3 }, 'demo-lan'),
    ]);
  };
  return (
    <form className="d-card flex min-w-0 flex-col gap-4" onSubmit={submit}>
      <div className="pl-between">
        <div>
          <h2 className="text-lg">{members.length ? 'Cập nhật đội' : 'Thiết lập đội'}</h2>
          <p className="d-muted text-sm">Hồ sơ kinh nghiệm giúp Tầng đề xuất người phù hợp cho từng task.</p>
        </div>
        {profile.demo && !members.length && <button type="button" className="d-btn d-b2" onClick={fillDemo}>Điền đội mẫu</button>}
      </div>
      <div className="pl-team-grid">
        {rows.map((row, index) => <MemberCard key={row.key} row={row} index={index} verified={Boolean(row.github_id)} busy={busy}
          onChange={(next) => setRows((items) => items.map((item) => item.key === next.key ? next : item))}
          onRemove={row.github_id ? undefined : () => setRows((items) => items.filter((item) => item.key !== row.key))} />)}
      </div>
      <div className="pl-row">
        <button className="d-btn d-b1" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu đội'}</button>
        <button className="d-btn d-b2" type="button" disabled={busy || rows.length >= 16}
          onClick={() => {
            sequence.current += 1;
            const key = 'new-' + sequence.current;
            setRows((items) => [...items, draftRow({ login: '', name: '', experience: '', tags: [], avatar: items.length % 8 }, key)]);
          }}><Icon name="plus" /> Thêm thành viên</button>
      </div>
    </form>
  );
}

export function JoinForm({ profile, busy, mutate, onComplete }: {
  profile: Profile; busy: boolean; mutate: Mutate; onComplete: () => void;
}) {
  const [code, setCode] = useState('');
  const [row, setRow] = useState<EditorRow>(() => draftRow({
    github_id: profile.github_id, login: profile.login, name: profile.demo ? '' : profile.name, experience: '', tags: [], avatar: 1,
  }, profile.github_id));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const member = { name: row.name, experience: row.experience, tags: visibleTags(row), avatar: row.avatar };
    if (await mutate(() => planning.join(code, member), 'Bạn đã vào đội.')) onComplete();
  }

  return (
    <form className="d-card flex min-w-0 flex-col gap-4" onSubmit={submit}>
      <div>
        <h2 className="text-lg">Nhập mã để vào đội</h2>
        <p className="d-muted text-sm">Trưởng nhóm lấy mã ở tab Thành viên. Vào đội xong, bạn xem được sprint, task và pull request.</p>
      </div>
      <Field label="Mã mời">
        <input className="d-inp pl-invite-input" aria-label="Mã mời" value={code} required maxLength={32} placeholder="ABCD-2345"
          autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(event) => setCode(event.target.value)} />
      </Field>
      <MemberCard row={row} index={0} verified joining busy={busy} onChange={setRow} />
      <button className="d-btn d-b1 self-start" type="submit" disabled={busy}>{busy ? 'Đang vào…' : 'Vào đội'}</button>
    </form>
  );
}

export function InviteCard({ code, busy, mutate }: { code: string | null; busy: boolean; mutate: Mutate }) {
  const [confirm, ask] = useConfirm();
  const [copied, setCopied] = useState('');
  const shown = code ? code.slice(0, 4) + '-' + code.slice(4) : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied('Đã sao chép mã.');
    } catch {
      setCopied('Trình duyệt chưa cho sao chép. Bôi đen mã để chép tay.');
    }
  }
  async function change(off: boolean) {
    if (code && !await ask({
      title: off ? 'Tắt mã mời?' : 'Đổi mã mời?',
      body: 'Mã hiện tại sẽ không dùng được nữa. Người đã vào đội vẫn ở lại.',
      confirmLabel: off ? 'Tắt mã' : 'Đổi mã',
    })) return;
    setCopied('');
    await mutate(off ? planning.inviteOff : planning.invite, off ? 'Đã tắt mã mời.' : 'Đã tạo mã mời mới.');
  }

  return (
    <section className="d-card flex min-w-0 flex-col gap-3">
      <h2 className="text-lg">Mã mời</h2>
      <p className="d-muted text-sm">
        Người khác đăng nhập bằng tài khoản của họ, chọn Nhập mã để vào đội. Ai có mã đều vào được và xem được tiến độ của đội.
      </p>
      {code && <p className="pl-invite-code">{shown}</p>}
      <div className="pl-row">
        {code ? (
          <>
            <button type="button" className="d-btn d-b1" onClick={() => void copy()}>Sao chép mã</button>
            <button type="button" className="d-btn d-b2" disabled={busy} onClick={() => void change(false)}>Đổi mã</button>
            <button type="button" className="d-btn d-b2" disabled={busy} onClick={() => void change(true)}>Tắt mã</button>
          </>
        ) : <button type="button" className="d-btn d-b1" disabled={busy} onClick={() => void change(false)}>Tạo mã mời</button>}
      </div>
      <p className="d-muted text-sm" role="status">{copied}</p>
      {confirm}
    </section>
  );
}

export function TeamList({ members, busy, mutate }: { members: Member[]; busy?: boolean; mutate?: Mutate }) {
  const [confirm, ask] = useConfirm();

  async function remove(member: Member) {
    if (!mutate || !await ask({
      title: 'Xóa ' + member.name + ' khỏi đội?',
      body: 'Người này mất quyền xem Planning của đội ngay. Hãy đổi mã mời nếu không muốn họ vào lại.',
      confirmLabel: 'Xóa khỏi đội',
      danger: true,
    })) return;
    await mutate(() => planning.removeMember(member.github_id), 'Đã xóa ' + member.name + ' khỏi đội.');
  }

  return (
    <>
      <div className="pl-team-grid">{members.map((member) => (
        <article key={member.github_id} className="d-card min-w-0">
          <div className="pl-row">
            <Avatar styleIndex={member.avatar} />
            <div className="min-w-0">
              <h3 className="pl-break text-lg">{member.name}</h3>
              <p className="d-muted text-sm pl-break">@{member.login}{member.leader ? ' · Trưởng nhóm' : ''}</p>
            </div>
          </div>
          <p className="d-muted text-sm mt-3 pl-break">{member.experience}</p>
          <div className="pl-tag-row mt-3">{member.tags.map((tag) => <span className="d-chip d-info" key={tag}>{tag}</span>)}</div>
          {mutate && !member.leader && <button type="button" className="d-btn d-b2 mt-3" disabled={busy}
            aria-label={'Xóa ' + member.name + ' khỏi đội'} onClick={() => void remove(member)}>Xóa khỏi đội</button>}
        </article>
      ))}</div>
      {confirm}
    </>
  );
}

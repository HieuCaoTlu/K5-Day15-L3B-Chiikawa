'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorBox, Loading } from '@/components/kit/ui';
import { planning, type Member, type RepoAccessInfo } from '@/lib/planning';

const LABELS = {
  yes: ['d-ok', 'Đã có quyền ghi'],
  no: ['d-info', 'Chưa có quyền ghi'],
  unknown: ['d-info', 'Chưa rõ quyền'],
} as const;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone('Đã chép');
    } catch {
      setDone('Chép tay: ' + value);
    }
  }
  return <button type="button" className="d-btn d-b2 pl-break" onClick={() => void copy()}>{done ?? label}</button>;
}

/** Mã mời của ProductPilot không cấp quyền trên GitHub: phần này cho trưởng nhóm biết ai còn thiếu và cách thêm. */
export function RepoAccess({ members }: { members: Member[] }) {
  const [info, setInfo] = useState<RepoAccessInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const roster = members.map((member) => member.github_id).join(',');

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInfo(await planning.repoAccess());
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Chưa kết nối được với ProductPilot.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void check(); }, [check, roster]);

  if (info && !info.available) return null;
  const missing = info?.available ? info.members.filter((row) => row.write !== true) : [];

  return (
    <section className="d-card flex min-w-0 flex-col gap-3">
      <div className="pl-between">
        <h2 className="text-lg">Quyền trên GitHub</h2>
        <button type="button" className="d-btn d-b2" disabled={loading} onClick={() => void check()}>
          {loading ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
        </button>
      </div>
      <p className="d-muted text-sm">
        Mã mời chỉ đưa người vào đội. Muốn đẩy code và dùng nút Bắt đầu task, mỗi người cần quyền ghi vào repo.
      </p>
      <ErrorBox message={error} />
      {!info && !error && <Loading />}
      {info?.available && (
        <>
          {info.app_can_write !== true && (
            <div className="pl-access-help">
              <p><strong>{info.app_can_write === false ? 'GitHub App chưa có quyền ghi.' : 'Chưa rõ quyền của GitHub App.'}</strong></p>
              <ol>
                <li><a href={info.app_url} target="_blank" rel="noopener noreferrer" className="text-brand">Mở trang quyền của app</a> (app của tổ chức thì mở trong cài đặt tổ chức).</li>
                <li>Ở Repository permissions, đặt Contents và Pull requests thành Read and write, rồi lưu.</li>
                <li><a href="https://github.com/settings/installations" target="_blank" rel="noopener noreferrer" className="text-brand">Mở trang app đã cài</a> và chấp nhận quyền mới.</li>
              </ol>
            </div>
          )}
          <ul className="pl-access-list">
            {info.members.map((row) => {
              const [tone, label] = LABELS[row.write === true ? 'yes' : row.write === false ? 'no' : 'unknown'];
              return <li key={row.github_id} className="pl-between">
                <span className="pl-break">{members.find((member) => member.github_id === row.github_id)?.name} · @{row.login}</span>
                <span className={'d-chip ' + tone}>{label}</span>
              </li>;
            })}
          </ul>
          {missing.length > 0 && (
            <div className="pl-access-help">
              <p><strong>Thêm thành viên vào repo</strong></p>
              <ol>
                <li><a href={info.settings_url} target="_blank" rel="noopener noreferrer" className="text-brand">Mở trang quyền truy cập repo</a> rồi bấm Add people. Repo tổ chức thì chọn mức Write trở lên.</li>
                <li>Dán tên GitHub của từng người:
                  <div className="pl-row mt-2">{missing.map((row) => <CopyButton key={row.login} value={row.login} label={'Chép @' + row.login} />)}</div>
                </li>
                <li>Gửi họ link nhận lời mời. Họ phải tự đăng nhập và bấm chấp nhận:
                  <div className="pl-row mt-2"><CopyButton value={info.invitations_url} label="Chép link nhận lời mời" /></div>
                </li>
              </ol>
              <p className="d-muted text-sm">Xong thì bấm Kiểm tra lại.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import { Field } from '@/components/kit/ui';
import { planning, type Mutate } from '@/lib/planning';

const STEPS = ['Tạo kết nối GitHub', 'Đăng nhập và lưu đội', 'Chọn repo'];

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="pl-steps" aria-label="Các bước kết nối GitHub">
      {STEPS.map((label, index) => {
        const done = index + 1 < current;
        return (
          <li key={label} className={done ? 'done' : ''} aria-current={index + 1 === current ? 'step' : undefined}>
            <span aria-hidden="true">{done ? '✓' : index + 1}</span>
            {label}
            {done && <span className="sr-only"> (đã xong)</span>}
          </li>
        );
      })}
    </ol>
  );
}

// GitHub không cho nhúng trong khung, nên form phải mở ở cửa sổ chính.
function postToGitHub(action: string, manifest: string) {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = action;
  form.target = '_top';
  const field = document.createElement('input');
  field.type = 'hidden';
  field.name = 'manifest';
  field.value = manifest;
  form.append(field);
  document.body.append(form);
  form.submit();
  form.remove();
}

export function ConnectGitHub({ codeRequired, busy, mutate }: { codeRequired: boolean; busy: boolean; mutate: Mutate }) {
  const [code, setCode] = useState('');
  const [organization, setOrganization] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    void mutate(async () => {
      const next = await planning.setupStart(code.trim(), organization.trim());
      postToGitHub(next.action, next.manifest);
    });
  }

  return (
    <form className="pl-connect" onSubmit={submit}>
      <p className="d-muted">
        Chỉ làm một lần cho cả máy chủ. GitHub sẽ hỏi bạn xác nhận tạo một app chỉ đọc pull request, rồi đưa bạn về ProductPilot.
        Bạn không cần chép khóa nào.
      </p>
      {codeRequired && (
        <>
          <Field label="Mã cài đặt">
            <input className="d-inp" aria-label="Mã cài đặt" aria-describedby="pl-code-help" value={code} required maxLength={64}
              autoComplete="off" spellCheck={false} onChange={(event) => setCode(event.target.value)} />
          </Field>
          <p id="pl-code-help" className="d-muted text-sm">
            Người quản lý máy chủ lấy mã mới nhất bằng lệnh <code className="pl-code">docker compose logs backend</code>
          </p>
        </>
      )}
      <details>
        <summary className="text-sm">Repo thuộc một tổ chức GitHub?</summary>
        <div className="mt-3">
          <Field label="Tên tổ chức (để trống nếu dùng tài khoản cá nhân)">
            <input className="d-inp" aria-label="Tên tổ chức GitHub" value={organization} maxLength={39}
              pattern="[A-Za-z0-9](?:[A-Za-z0-9\-]{0,37}[A-Za-z0-9])?" title="Tên tổ chức như trên đường dẫn GitHub"
              autoComplete="off" spellCheck={false} onChange={(event) => setOrganization(event.target.value)} />
          </Field>
        </div>
      </details>
      <button type="submit" className="d-btn d-b1 self-start" disabled={busy}>Kết nối GitHub</button>
    </form>
  );
}

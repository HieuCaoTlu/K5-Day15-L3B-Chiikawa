'use client';

// Bộ component dùng chung (đóng gói từ P-020 components/dash/ui.tsx). Style: app/components.css (d-*).
// Thêm component mới → đặt ở đây hoặc components/kit/, dùng class d-* sẵn có, KHÔNG tự đặt màu hex.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const nf = new Intl.NumberFormat('vi-VN');
export const fmtInt = (n: number) => nf.format(Math.round(n));
export const fmtUsd = (n: number) => `$${n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;
export const fmtVnd = (usd: number, rate: number) => `${nf.format(Math.round(usd * rate))}đ`;
export const fmtTokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace('.', ',')}K` : String(n);
export const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1).replace('.', ',')}%`;

// Icon nét mảnh (path trong khung 20×20). Thêm icon: thêm một dòng path.
const ICONS: Record<string, string> = {
  trend: 'M3 13l4-4 3 3 7-7M13 5h4v4',
  speed: 'M3.5 14a6.5 6.5 0 1113 0M10 14l3.5-4.5M3.5 14h2M14.5 14h2',
  check: 'M4 10.5l4 4 8-9',
  log: 'M5 3h10v14H5zM8 7h4M8 10h4M8 13h2',
  user: 'M10 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3.5 17c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5',
  grid: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z',
  chat: 'M4 4h12v9H8l-4 3z',
  gear: 'M10 7a3 3 0 100 6 3 3 0 000-6zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4',
  plus: 'M10 4v12M4 10h12',
  back: 'M12 4l-6 6 6 6M6 10h10',
  search: 'M9 15a6 6 0 100-12 6 6 0 000 12zM13.5 13.5L17 17',
  trash: 'M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10',
  edit: 'M4 16h3l8.5-8.5-3-3L4 13zM11.5 5.5l3 3',
  home: 'M3 9l7-5 7 5v8H3z',
  refresh: 'M16 10a6 6 0 11-1.8-4.3M16 3.5v3h-3',
  wallet: 'M3 6h12a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 6l9-2.5V6M13 11.5h2',
};

export function Icon({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Kpi({ label, value, change, note }: { label: string; value: string; change?: number | null; note?: string }) {
  return (
    <div className="d-kpi">
      <div className="d-ov">{label}</div>
      <div className="v">{value}</div>
      <div className="flex flex-wrap items-center gap-2">
        {change !== undefined && change !== null && <span className={change >= 0 ? 'd-up' : 'd-down'}>{fmtPct(change)}</span>}
        {note && <span className="d-faint text-xs">{note}</span>}
      </div>
    </div>
  );
}

export function Seg<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="d-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Trạng thái → [nhãn, class màu]. Thêm trạng thái mới của đề tài ở đây (một chỗ duy nhất).
const STATUS: Record<string, [string, string]> = {
  waiting_review: ['Chờ duyệt', 'd-info'],
  approved: ['Đã duyệt', 'd-ok'],
  rejected: ['Từ chối', 'd-mute'],
  blocked: ['Bị chặn', 'd-lock'],
  error: ['Lỗi', 'd-lock'],
  running: ['Đang chạy', 'd-violet'],
  todo: ['Cần làm', 'd-mute'],
  doing: ['Đang làm', 'd-info'],
  done: ['Xong', 'd-ok'],
};

export function StatusChip({ status }: { status: string }) {
  const [label, cls] = STATUS[status] || [status, 'd-mute'];
  return <span className={`d-chip w ${cls}`}>{label}</span>;
}

export function Bars({ rows, unit }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty>Chưa có dữ liệu.</Empty>;
  return (
    <div className="flex flex-col gap-3.5">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-sm"><span>{r.label}</span><span className="d-muted">{fmtInt(r.value)}{unit ? ` ${unit}` : ''}</span></div>
          <div className="d-bar"><i style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="d-empty">{children}</div>;
}

export function Loading() {
  return <div className="d-empty inline-flex w-full items-center justify-center gap-2"><span className="d-spin" />Đang tải…</div>;
}

export function ErrorBox({ message }: { message: string | null }) {
  return message ? <div className="d-alert err" role="alert">{message}</div> : null;
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="d-fld">
      <label>{label}</label>
      {children}
      {error && <span className="d-err">{error}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Gắn thẳng vào <body>: nằm trong khung có transform / sticky thì "fixed" chỉ phủ khung đó.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="d-modal-back fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,26,36,.35)] p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="d-modal d-card flex max-h-[90vh] w-full max-w-[520px] flex-col gap-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg">{title}</div>
          <button type="button" className="d-xbtn" onClick={onClose} aria-label="Đóng" title="Đóng">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmOptions { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean }

/** Hộp xác nhận thay window.confirm: `const [confirmNode, ask] = useConfirm();` render `{confirmNode}`,
 *  rồi `if (await ask({ title, body, danger: true })) …`. */
export function useConfirm(): [ReactNode, (o: ConfirmOptions) => Promise<boolean>] {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = (o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve }));
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const node = state && (
    <Modal title={state.title} onClose={() => close(false)}>
      <div className="d-muted text-[15px] leading-relaxed">{state.body}</div>
      <div className="flex justify-end gap-2">
        <button type="button" className="d-btn d-b2" onClick={() => close(false)}>Huỷ</button>
        <button type="button" className={`d-btn ${state.danger ? 'd-bd' : 'd-b1'}`} onClick={() => close(true)} autoFocus>
          {state.confirmLabel || 'Đồng ý'}
        </button>
      </div>
    </Modal>
  );
  return [node, ask];
}

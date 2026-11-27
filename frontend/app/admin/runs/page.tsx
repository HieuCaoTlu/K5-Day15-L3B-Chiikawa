'use client';

import { useState } from 'react';
import { api, type Run, type RunStatus } from '@/lib/api';
import { fmtTime, useLoad } from '@/lib/hooks';
import { Shell } from '@/components/kit/Shell';
import { Empty, ErrorBox, Icon, Loading, Modal, Seg, StatusChip } from '@/components/kit/ui';

const FILTERS: { value: RunStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'waiting_review', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Từ chối' },
  { value: 'blocked', label: 'Bị chặn' },
];

export default function RunsPage() {
  const runs = useLoad(() => api.runs());
  const [filter, setFilter] = useState<RunStatus | 'all'>('all');
  const [open, setOpen] = useState<Run | null>(null);
  const rows = (runs.data || []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <Shell title="Lượt chạy agent" actions={<button type="button" className="d-btn d-b2" onClick={runs.reload}><Icon name="refresh" />Tải lại</button>}>
      <ErrorBox message={runs.error} />
      <div className="d-card flex flex-col gap-4">
        <Seg label="Lọc theo trạng thái" options={FILTERS} value={filter} onChange={setFilter} />
        {runs.loading ? <Loading /> : !rows.length ? <Empty>Không có lượt chạy nào.</Empty> : (
          <div className="d-tbl-wrap">
            <table className="d-tbl">
              <thead><tr><th>Yêu cầu</th><th>Đề xuất</th><th>Nguồn</th><th>Trạng thái</th><th>Lúc</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="click" onClick={() => setOpen(r)}>
                    <td className="max-w-[320px] truncate">{r.request}</td>
                    <td className="d-muted max-w-[280px] truncate">{r.proposal?.title || '—'}</td>
                    <td className="d-faint text-[15px]">{r.source || '—'}</td>
                    <td><StatusChip status={r.status} /></td>
                    <td className="d-faint whitespace-nowrap text-[15px]">{fmtTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && (
        <Modal title="Chi tiết lượt chạy" onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-3 text-[15px]">
            <div className="flex items-center gap-2"><StatusChip status={open.status} /><span className="d-faint">{open.id}</span></div>
            <div><div className="d-ov">Yêu cầu</div>{open.request}</div>
            {open.proposal && <div><div className="d-ov">Đề xuất</div><pre className="m-0 whitespace-pre-wrap rounded-xl bg-soft p-3 text-[14px]">{JSON.stringify(open.proposal, null, 2)}</pre></div>}
            {open.result && <div><div className="d-ov">Kết quả</div><pre className="m-0 whitespace-pre-wrap rounded-xl bg-soft p-3 text-[14px]">{JSON.stringify(open.result, null, 2)}</pre></div>}
          </div>
        </Modal>
      )}
    </Shell>
  );
}

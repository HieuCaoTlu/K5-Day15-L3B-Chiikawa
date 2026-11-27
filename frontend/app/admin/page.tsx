'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { fmtTime, useLoad } from '@/lib/hooks';
import { Shell } from '@/components/kit/Shell';
import { Bars, Empty, ErrorBox, Icon, Kpi, Loading, StatusChip, fmtInt } from '@/components/kit/ui';

const SOURCE_LABEL: Record<string, string> = { llm: 'Gemini', demo_cache: 'Dữ liệu demo', fallback: 'Luật dự phòng', mock: 'Mock' };

export default function AdminHome() {
  const stats = useLoad(api.stats);
  const runs = useLoad(() => api.runs());
  const health = useLoad(api.health);
  const s = stats.data;

  return (
    <Shell title="Tổng quan" actions={
      <button type="button" className="d-btn d-b2" onClick={() => { stats.reload(); runs.reload(); health.reload(); }}><Icon name="refresh" />Tải lại</button>
    }>
      <ErrorBox message={stats.error || runs.error} />
      {health.data && (
        <div className={`d-alert ${health.data.llm === 'gemini' ? 'ok' : 'info'}`}>
          Backend: DB {health.data.db} · LLM {health.data.llm === 'gemini' ? 'Gemini' : 'mock (chưa đặt GOOGLE_API_KEY)'}
          {health.data.demo_mode && ' · DEMO_MODE bật'}{health.data.mock_nodes && ` · MOCK_NODES=${health.data.mock_nodes}`}
        </div>
      )}
      {!s ? <Loading /> : (
        <div className="d-grid4">
          <Kpi label="Lượt chạy agent" value={fmtInt(s.runs_total)} />
          <Kpi label="Chờ duyệt" value={fmtInt(s.waiting_review)} note={s.waiting_review ? 'Cần xử lý' : 'Không còn tồn đọng'} />
          <Kpi label="Tỉ lệ duyệt" value={s.approval_rate === null ? '—' : `${Math.round(s.approval_rate * 100)}%`} note="Trên số đề xuất đã xử lý" />
          <Kpi label="Phiên chat" value={fmtInt(s.sessions_total)} note={`${fmtInt(s.items_total)} bản ghi mẫu`} />
        </div>
      )}
      <div className="d-grid2">
        <div className="d-card flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg">Lượt chạy gần đây</div>
            <Link href="/admin/runs" className="d-link">Xem tất cả</Link>
          </div>
          {runs.loading ? <Loading /> : !runs.data?.length ? <Empty>Chưa có lượt chạy. Mở khung chat để thử.</Empty> : (
            <div className="d-tbl-wrap">
              <table className="d-tbl">
                <thead><tr><th>Yêu cầu</th><th>Trạng thái</th><th>Lúc</th></tr></thead>
                <tbody>
                  {runs.data.slice(0, 6).map((r) => (
                    <tr key={r.id}>
                      <td className="max-w-[380px] truncate">{r.request}</td>
                      <td><StatusChip status={r.status} /></td>
                      <td className="d-faint whitespace-nowrap text-[15px]">{fmtTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="d-card flex flex-col gap-4">
          <div className="text-lg">Nguồn đề xuất</div>
          {s ? <Bars rows={Object.entries(s.runs_by_source).map(([k, v]) => ({ label: SOURCE_LABEL[k] || k, value: v }))} unit="lượt" /> : <Loading />}
          <div className="text-lg">Theo trạng thái</div>
          {s ? <Bars rows={Object.entries(s.runs_by_status).map(([k, v]) => ({ label: k, value: v }))} unit="lượt" /> : <Loading />}
        </div>
      </div>
    </Shell>
  );
}

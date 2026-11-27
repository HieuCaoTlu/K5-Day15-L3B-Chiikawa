'use client';

// Phiên chat: mỗi phiên = các câu hỏi cùng session_id (khung chat tự sinh, lưu localStorage). Bấm để xem lại hội thoại.
import { useState } from 'react';
import { api, type ChatSession, type Run } from '@/lib/api';
import { fmtTime, useLoad } from '@/lib/hooks';
import { Shell } from '@/components/kit/Shell';
import { Empty, ErrorBox, Icon, Loading, Modal, StatusChip, fmtInt, fmtTokens, fmtUsd } from '@/components/kit/ui';

export default function SessionsPage() {
  const list = useLoad(api.sessions);
  const [open, setOpen] = useState<ChatSession | null>(null);

  return (
    <Shell title="Phiên chat" actions={<button type="button" className="d-btn d-b2" onClick={list.reload}><Icon name="refresh" />Tải lại</button>}>
      <ErrorBox message={list.error} />
      <div className="d-card">
        {list.loading ? <Loading /> : !list.data?.length ? <Empty>Chưa có phiên chat nào.</Empty> : (
          <div className="d-tbl-wrap">
            <table className="d-tbl">
              <thead><tr><th>Phiên</th><th>Câu hỏi gần nhất</th><th>Lượt</th><th>Chờ duyệt</th><th>Token</th><th>Chi phí</th><th>Hoạt động</th></tr></thead>
              <tbody>
                {list.data.map((s) => (
                  <tr key={s.id} className="click" onClick={() => setOpen(s)}>
                    <td className="d-faint font-mono text-[14px]">{s.id.slice(0, 8)}</td>
                    <td className="max-w-[360px] truncate">{s.last_request || '—'}</td>
                    <td className="tabular-nums">{fmtInt(s.turns)}</td>
                    <td>{s.waiting_review ? <span className="d-chip d-info">{s.waiting_review}</span> : <span className="d-faint">0</span>}</td>
                    <td className="tabular-nums">{fmtTokens(s.tokens)}</td>
                    <td className="tabular-nums">{fmtUsd(s.cost_usd)}</td>
                    <td className="d-faint whitespace-nowrap text-[15px]">{fmtTime(s.last_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <Transcript session={open} onClose={() => setOpen(null)} />}
    </Shell>
  );
}

function Transcript({ session, onClose }: { session: ChatSession; onClose: () => void }) {
  const runs = useLoad<Run[]>(() => api.session(session.id));
  return (
    <Modal title={`Phiên ${session.id.slice(0, 8)} · ${session.turns} lượt`} onClose={onClose}>
      {runs.loading ? <Loading /> : <ErrorBox message={runs.error} />}
      <div className="flex flex-col gap-3">
        {runs.data?.map((r) => (
          <div key={r.id} className="flex flex-col gap-2">
            <div className="max-w-[88%] self-end whitespace-pre-line rounded-[18px_18px_4px_18px] bg-ink px-3.5 py-2.5 text-[15px] text-white">{r.request}</div>
            <div className="flex max-w-[94%] flex-col gap-1.5 self-start rounded-[18px_18px_18px_4px] bg-soft px-3.5 py-2.5 text-[15px]">
              <div className="flex flex-wrap items-center gap-2"><StatusChip status={r.status} /><span className="d-faint text-[13px]">{fmtTime(r.created_at)} · {r.source || '—'}</span></div>
              {r.proposal ? <div>{r.proposal.title}</div> : r.result?.reason ? <div className="text-rust">{r.result.reason}</div> : null}
              {r.result?.note && <div className="d-muted">Ghi chú duyệt: {r.result.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

'use client';

// Hàng chờ duyệt (bước HITL cho người duyệt riêng, ngoài khung chat).
import { api } from '@/lib/api';
import { fmtTime, useLoad } from '@/lib/hooks';
import { Shell } from '@/components/kit/Shell';
import { ProposalCard } from '@/components/kit/ProposalCard';
import { Empty, ErrorBox, Icon, Loading } from '@/components/kit/ui';

export default function ReviewPage() {
  const queue = useLoad(() => api.runs('waiting_review'));
  return (
    <Shell title="Hàng chờ duyệt" actions={<button type="button" className="d-btn d-b2" onClick={queue.reload}><Icon name="refresh" />Tải lại</button>}>
      <ErrorBox message={queue.error} />
      {queue.loading ? <Loading /> : !queue.data?.length ? (
        <div className="d-card"><Empty>Không có đề xuất nào đang chờ duyệt.</Empty></div>
      ) : (
        <div className="d-grid2e">
          {queue.data.map((run) => (
            <div key={run.id} className="d-card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="d-ov">Yêu cầu</div>
                  <div className="text-[17px] leading-snug">{run.request}</div>
                </div>
                <span className="d-faint whitespace-nowrap text-[14px]">{fmtTime(run.created_at)}</span>
              </div>
              <ProposalCard compact run={run} onDone={(done) => queue.setData((q) => (q || []).filter((r) => r.id !== done.id))} />
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

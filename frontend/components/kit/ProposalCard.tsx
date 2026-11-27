'use client';

// Thẻ đề xuất của AI + nút duyệt (bước HITL). Dùng chung ở khung chat và /admin/review.
import { useState } from 'react';
import { api, type Run } from '@/lib/api';

const SOURCE_LABEL: Record<string, string> = { llm: 'Gemini', demo_cache: 'Dữ liệu demo', fallback: 'Luật dự phòng', mock: 'Mock' };

export function ProposalCard({ run, onDone, compact = false }: { run: Run; onDone: (run: Run) => void; compact?: boolean }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = run.proposal;
  if (!p) return null;
  const pending = run.status === 'waiting_review';

  const decide = async (approved: boolean) => {
    setBusy(approved ? 'approve' : 'reject');
    setError(null);
    try {
      onDone(await api.review(run.id, approved, note.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không gửi được quyết định');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`flex flex-col gap-3 rounded-[18px_18px_18px_4px] border border-line bg-white ${compact ? 'p-4' : 'px-4 py-3.5'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="d-ov">Đề xuất của AI</span>
        {run.source && <span className="d-chip d-info !py-0.5 !text-[13px]">{SOURCE_LABEL[run.source] || run.source}</span>}
        <span className="d-faint ml-auto text-[13px] tabular-nums">Độ tự tin {Math.round(p.confidence * 100)}%</span>
      </div>
      <div className="text-[19px] leading-snug">{p.title}</div>
      <p className="d-muted m-0 text-[15px] leading-relaxed">{p.summary}</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {p.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] leading-snug">
            <span className="inline-flex size-[22px] flex-none items-center justify-center rounded-full bg-pale text-[12px] tabular-nums text-brand-dark">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      {pending && (
        <>
          <div className="h-px bg-line-soft" />
          <input className="d-inp !h-10 !text-[15px]" placeholder="Ghi chú cho quyết định (không bắt buộc)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="d-btn d-bgo d-sm" disabled={!!busy} aria-busy={busy === 'approve'} onClick={() => decide(true)}>
              {busy === 'approve' ? <span className="d-spin !border-white/40 !border-t-white" /> : <Check />}Duyệt
            </button>
            <button type="button" className="d-btn d-b2 d-sm" disabled={!!busy} aria-busy={busy === 'reject'} onClick={() => decide(false)}>
              Từ chối
            </button>
          </div>
          {error && <div className="d-alert err !py-2 !text-[15px]">{error}</div>}
        </>
      )}
    </div>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

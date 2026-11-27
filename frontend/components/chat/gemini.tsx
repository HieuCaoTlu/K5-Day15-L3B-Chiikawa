'use client';

// Hiệu ứng phần chat (đóng gói từ P-020 components/trial/gemini.tsx): biểu tượng lấp lánh, khối các bước xử lý có
// hình minh họa, câu trả lời hiện dần từng cụm chữ. Đổi các bước cho khớp graph: sửa AGENT_STEPS + STEP_AT_MS.
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export function Sparkle({ spinning = false, size = 18 }: { spinning?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`flex-none ${spinning ? 'gm-spin' : ''}`}>
      <defs>
        <linearGradient id="gm-sparkle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2C6AB0" />
          <stop offset=".55" stopColor="#7B6FD6" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path d="M12 2c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10Z" fill="url(#gm-sparkle)" />
    </svg>
  );
}

/** Các chặng người dùng thấy (khớp node trong backend/app/agent/graph.py). API trả một lần nên chặng đang chạy là ước
 * lượng theo thời gian (STEP_AT_MS). */
export const AGENT_STEPS: { title: string; hint: string; art: number }[] = [
  { title: 'Kiểm tra yêu cầu', hint: 'Độ dài, nội dung an toàn', art: 0 },
  { title: 'Soạn đề xuất', hint: 'Gemini viết theo khung có sẵn', art: 2 },
  { title: 'Chuẩn bị để bạn duyệt', hint: 'Bạn quyết định trước khi chạy', art: 3 },
];
export const STEP_AT_MS = [0, 700, 5000];

const LOOP = { repeat: Infinity, ease: 'easeInOut' } as const;

function StepArt({ step }: { step: number }) {
  return (
    <svg viewBox="0 0 120 56" width="100%" height="56" aria-hidden="true" className="block">
      {step === 0 && (
        <>
          <rect x="10" y="8" width="64" height="16" rx="8" fill="#dce8f5" />
          <motion.rect x="10" y="8" width="64" height="16" rx="8" fill="#2c6ab0" style={{ transformBox: 'fill-box', transformOrigin: 'left center' }}
            initial={{ scaleX: 0.125 }} animate={{ scaleX: [0.125, 1, 0.125] }} transition={{ duration: 2.4, ...LOOP }} />
          <rect x="46" y="31" width="64" height="16" rx="8" fill="#e3f1ea" />
          <motion.rect x="46" y="31" width="44" height="16" rx="8" fill="#2e7d5b" style={{ transformBox: 'fill-box', transformOrigin: 'left center' }}
            initial={{ scaleX: 0.18 }} animate={{ scaleX: [0.18, 1, 0.18] }} transition={{ duration: 2.4, delay: 0.5, ...LOOP }} />
        </>
      )}
      {step === 2 && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.circle key={i} cx="60" cy="30" r="8" fill="none" stroke="#2c6ab0" strokeWidth="1.5" style={{ transformOrigin: '60px 30px' }}
              initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: [0.4, 3.2], opacity: [0.9, 0] }} transition={{ duration: 2.4, delay: i * 0.8, repeat: Infinity, ease: 'easeOut' }} />
          ))}
          <circle cx="60" cy="30" r="5" fill="#2c6ab0" />
          {[[26, 18, '#e07b3c'], [92, 20, '#e07b3c'], [86, 44, '#2e7d5b'], [34, 44, '#2e7d5b']].map(([x, y, c], i) => (
            <motion.circle key={i} cx={x as number} cy={y as number} r="3.5" fill={c as string} initial={{ opacity: 0.2 }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 2.4, delay: 0.3 + i * 0.3, repeat: Infinity }} />
          ))}
        </>
      )}
      {step >= 3 && (
        <>
          {[[22, 22, '#9aaab9'], [48, 34, '#2e7d5b'], [74, 14, '#2c6ab0']].map(([x, h, c], i) => (
            <motion.rect key={i} x={x as number} y={50 - (h as number)} width="20" height={h as number} rx="3" fill={c as string} style={{ transformOrigin: `${(x as number) + 10}px 50px` }}
              initial={{ scaleY: 0.1 }} animate={{ scaleY: [0.1, 1, 1, 0.1] }} transition={{ duration: 2.6, delay: i * 0.2, ...LOOP }} />
          ))}
          <path d="M98 14l2.3 4.6 5 .7-3.6 3.5.9 5-4.6-2.4-4.6 2.4.9-5-3.6-3.5 5-.7L98 14Z" fill="#e0a43c" />
        </>
      )}
    </svg>
  );
}

/** Khối "đang xử lý": các bước dễ hiểu, bước đang chạy có hình minh họa, vòng xoay và số giây đã chờ. */
export function AgentSteps() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setMs(Date.now() - started), 250);
    return () => window.clearInterval(id);
  }, []);
  const at = Math.max(0, STEP_AT_MS.filter((t) => ms >= t).length - 1);
  const secs = Math.floor(ms / 1000);
  const step = AGENT_STEPS[at];
  return (
    <div className="flex w-[260px] max-w-[88%] flex-col self-start rounded-[18px_18px_18px_4px] border border-line bg-white px-4 py-3.5"
      role="status" aria-live="polite" aria-label={`Bước ${at + 1}/${AGENT_STEPS.length}: ${step.title}`}>
      <div className="mb-2 overflow-hidden rounded-xl bg-soft px-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={at} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
            <StepArt step={step.art} />
          </motion.div>
        </AnimatePresence>
      </div>
      <ol className="relative m-0 flex list-none flex-col gap-2 p-0">
        {AGENT_STEPS.map((s, i) => {
          const state = i < at ? 'done' : i === at ? 'run' : 'wait';
          return (
            <li key={s.title} className={`flex items-start gap-2.5 transition-opacity duration-300 ${state === 'wait' ? 'opacity-45' : ''}`}>
              <span className="relative inline-flex size-[19px] flex-none items-center justify-center">
                {state === 'done' ? (
                  <svg width="19" height="19" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#2E7D5B" /><path d="m4 7.2 2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : state === 'run' ? (
                  <span className="size-[17px] animate-spin rounded-full border-2 border-pale border-t-brand" />
                ) : (
                  <span className="inline-flex size-[19px] items-center justify-center rounded-full border border-line-strong bg-white text-[12px] tabular-nums text-subtle">{i + 1}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={`text-[15px] leading-[1.35] ${state === 'run' ? 'gm-shimmer-text font-medium' : state === 'done' ? 'text-ink' : 'text-muted'}`}>{s.title}</span>
                {state === 'run' && <span className="text-[13px] leading-[1.35] text-subtle">{secs >= 10 ? 'Sắp xong rồi, cảm ơn bạn đã chờ' : s.hint}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {secs >= 3 && <div className="mt-2 text-right text-[12px] tabular-nums text-subtle">{secs} s</div>}
    </div>
  );
}

/** Hiện câu trả lời dần từng cụm chữ (API chưa stream nên mô phỏng phía client). Giảm chuyển động → hiện ngay. */
export function RevealText({ text, render, onDone }: { text: string; render: (t: string) => ReactNode; onDone?: () => void }) {
  const tokens = text.match(/\S+\s*|\s+/g) ?? [];
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(tokens.length); onDone?.(); return; }
    let n = 0;
    const step = Math.max(1, Math.ceil(tokens.length / 90));
    const id = window.setInterval(() => {
      n = Math.min(tokens.length, n + step);
      setShown(n);
      if (n >= tokens.length) { window.clearInterval(id); onDone?.(); }
    }, 28);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const done = shown >= tokens.length;
  return (
    <>
      <span aria-hidden={!done}>{render(tokens.slice(0, shown).join(''))}</span>
      {!done && <span className="gm-caret" aria-hidden="true" />}
      {!done && <span className="sr-only">{text}</span>}
    </>
  );
}

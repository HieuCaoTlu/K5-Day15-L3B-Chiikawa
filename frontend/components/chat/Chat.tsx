'use client';

// Khung chat nối thẳng agent: gửi câu → POST /api/v1/agent/runs → thẻ đề xuất + nút duyệt (HITL) ngay trong chat.
// Bố cục & hiệu ứng theo khung chat P-020: màn chào có gợi ý, bubble người dùng màu ink, bubble trợ lý màu soft,
// ô nhập viền gradient khi bận, nút gửi thành nút dừng. Lịch sử lưu localStorage (mất cũng không sao).
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api, type Health, type Run } from '@/lib/api';
import { ProposalCard } from '@/components/kit/ProposalCard';
import { AgentSteps, RevealText, Sparkle } from './gemini';

type Msg =
  | { kind: 'user'; text: string }
  | { kind: 'bot'; text: string; tone?: 'error' | 'muted'; fresh?: boolean }
  | { kind: 'run'; run: Run }
  | { kind: 'result'; run: Run };

const STORE_KEY = 'chat-session-v1';
const SESSION_KEY = 'chat-session-id';

/** Mã phiên chat: sinh một lần, lưu localStorage; "Cuộc trò chuyện mới" → mã mới. Admin xem theo mã này. */
function sessionId(renew = false): string {
  const fresh = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).split('-').join('').slice(0, 32);
  try {
    let id = renew ? null : window.localStorage.getItem(SESSION_KEY);
    if (!id) { id = fresh(); window.localStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch {
    return fresh();
  }
}

// Gợi ý ở màn chào — đổi theo đề tài. Câu đầu khớp demo_cache.json để demo chạy kể cả khi không có mạng.
const SUGGESTIONS = [
  'Lên kế hoạch onboarding cho nhân viên mới trong tuần đầu',
  'Chuẩn bị buổi demo sản phẩm 2 phút cho ban giám khảo',
  'Chia việc cho nhóm 5 người trong 36 giờ hackathon',
];

function load(): Msg[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Msg[]).map((m) => (m.kind === 'bot' ? { ...m, fresh: false } : m)) : [];
  } catch {
    return [];
  }
}

function save(msgs: Msg[]) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-60)));
  } catch {
    /* private mode / hết chỗ: bỏ qua */
  }
}

function botReply(run: Run): Msg[] {
  if (run.status === 'blocked') return [{ kind: 'bot', tone: 'error', fresh: true, text: `Mình không xử lý được yêu cầu này: ${run.result?.reason || 'nội dung không hợp lệ'}. Bạn thử diễn đạt lại nhé.` }];
  if (run.status === 'error') return [{ kind: 'bot', tone: 'error', fresh: true, text: 'Có lỗi khi xử lý. Bạn thử lại sau ít phút nhé.' }];
  if (run.status === 'waiting_review') return [
    { kind: 'bot', fresh: true, text: 'Mình đã soạn một đề xuất bên dưới. Bạn xem và bấm Duyệt hoặc Từ chối.' },
    { kind: 'run', run },
  ];
  return [{ kind: 'result', run }];
}

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMsgs(load());
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);
  useEffect(() => save(msgs), [msgs]);

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setText('');
    setMsgs((m) => [...m, { kind: 'user', text: q }]);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const run = await api.startRun(q, sessionId(), ctrl.signal);
      setMsgs((m) => [...m, ...botReply(run)]);
    } catch (e) {
      const stopped = ctrl.signal.aborted;
      setMsgs((m) => [...m, stopped
        ? { kind: 'bot', tone: 'muted', text: 'Đã dừng.' }
        : { kind: 'bot', tone: 'error', fresh: true, text: e instanceof Error ? e.message : 'Không kết nối được máy chủ' }]);
    } finally {
      setBusy(false);
      abort.current = null;
      inputRef.current?.focus();
    }
  };

  const onReviewed = (run: Run) =>
    setMsgs((m) => [...m.map((x) => (x.kind === 'run' && x.run.id === run.id ? { ...x, run } : x)), { kind: 'result', run }]);

  const submit = (e: FormEvent) => { e.preventDefault(); if (busy) abort.current?.abort(); else send(text); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); }
  };
  const reset = () => { abort.current?.abort(); setMsgs([]); setText(''); sessionId(true); };

  const welcome = msgs.length === 0 && !busy;
  const status = health === null ? 'Đang kết nối…' : health.llm === 'gemini' ? 'Gemini đang trực tuyến' : 'Chế độ mock (chưa có GOOGLE_API_KEY)';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft py-3.5 pl-5 pr-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <Sparkle size={22} spinning={busy} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="m-0 text-base font-medium">Trợ lý AI</h2>
            <div className="flex items-center gap-1.5 truncate text-xs text-muted">
              <span className={`size-1.5 flex-none rounded-full ${health?.llm === 'gemini' ? 'bg-go' : 'bg-warn'}`} />{status}
            </div>
          </div>
        </div>
        {!welcome && (
          <button type="button" onClick={reset} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới"
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-soft transition-[background-color,transform] duration-200 hover:bg-soft-hover active:scale-90">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
          </button>
        )}
      </div>

      {welcome ? (
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-auto px-5 py-10 sm:px-8">
          <div className="my-auto flex w-full max-w-[880px] flex-col items-center gap-8">
            <div className="rise-in flex flex-col items-center gap-3 text-center">
              <h3 className="m-0 text-[clamp(28px,3vw,44px)] font-normal leading-[1.1] tracking-[-.025em]">Bạn cần trợ lý làm gì hôm nay?</h3>
              <p className="m-0 max-w-[620px] text-[clamp(15px,1.2vw,18px)] leading-[1.55] text-muted">
                Mô tả việc cần làm. Trợ lý soạn đề xuất, bạn duyệt trước khi áp dụng.
              </p>
            </div>
            <div className="rise-in flex w-full flex-col items-center gap-3" style={{ ['--d' as string]: '.12s' }}>
              <div className="text-[13px] uppercase tracking-[.14em] text-subtle">Gợi ý để bắt đầu</div>
              <div className="grid w-fit max-w-full gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}
                    className="group flex w-full cursor-pointer items-start gap-2.5 rounded-2xl border border-line bg-white px-4 py-3 text-left text-[17px] leading-[1.4] text-ink transition-colors hover:border-brand hover:bg-soft">
                    <span className="mt-0.5 text-brand transition-transform duration-300 group-hover:translate-x-0.5">→</span>{s}
                  </button>
                ))}
              </div>
            </div>
            <Composer big text={text} setText={setText} busy={busy} onSubmit={submit} onKey={onKey} inputRef={inputRef} />
          </div>
        </div>
      ) : (
        <>
          <div className="thin-scroll flex min-h-0 flex-1 flex-col-reverse overflow-auto overscroll-contain px-4 py-[18px] sm:px-[18px]">
            <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3.5">
              {msgs.map((m, i) => <Message key={i} m={m} onReviewed={onReviewed} />)}
              {busy && <AgentSteps />}
            </div>
          </div>
          <div className="mx-auto w-full max-w-[860px]">
            <Composer text={text} setText={setText} busy={busy} onSubmit={submit} onKey={onKey} inputRef={inputRef} />
          </div>
        </>
      )}
    </div>
  );
}

function Message({ m, onReviewed }: { m: Msg; onReviewed: (run: Run) => void }) {
  if (m.kind === 'user') {
    return (
      <div className="msg-in flex max-w-[88%] origin-bottom-right self-end whitespace-pre-line rounded-[18px_18px_4px_18px] bg-ink px-3.5 py-3 text-sm leading-normal text-white">
        {m.text}
      </div>
    );
  }
  if (m.kind === 'bot') {
    const cls = m.tone === 'error' ? 'bg-warn-bg text-rust' : m.tone === 'muted' ? 'bg-soft text-muted italic' : 'bg-soft';
    return (
      <div className={`msg-in max-w-[94%] origin-bottom-left self-start whitespace-pre-line rounded-[18px_18px_18px_4px] px-3.5 py-3 text-sm leading-normal ${cls}`}>
        {m.fresh ? <RevealText text={m.text} render={(t) => t} /> : m.text}
      </div>
    );
  }
  if (m.kind === 'run') {
    return <div className="msg-in w-full max-w-[560px] self-start"><ProposalCard run={m.run} onDone={onReviewed} /></div>;
  }
  const r = m.run.result;
  if (m.run.status === 'approved') {
    return (
      <div className="msg-in flex w-[min(100%,420px)] origin-bottom-left flex-col gap-2.5 self-start rounded-[18px_18px_18px_4px] bg-go-bg px-4 py-3.5 text-sm leading-normal text-go">
        <div className="flex items-center gap-2 text-[16px] font-medium">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="flex-none"><circle cx="10" cy="10" r="10" fill="#2E7D5B" /><path d="M5.6 10.4 8.7 13.3 14.4 6.9" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Đã duyệt: {r?.title}
        </div>
        {r?.note && <div className="opacity-80">Ghi chú: {r.note}</div>}
      </div>
    );
  }
  return (
    <div className="msg-in max-w-[94%] self-start rounded-[18px_18px_18px_4px] bg-soft px-3.5 py-3 text-sm italic text-muted">
      Đã từ chối đề xuất “{r?.title}”{r?.note ? ` — ${r.note}` : ''}. Bạn mô tả lại yêu cầu để mình soạn đề xuất khác nhé.
    </div>
  );
}

function Composer({ big = false, text, setText, busy, onSubmit, onKey, inputRef }: {
  big?: boolean; text: string; setText: (v: string) => void; busy: boolean;
  onSubmit: (e: FormEvent) => void; onKey: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text, inputRef]);
  return (
    <div className={big ? 'flex w-full max-w-[640px] flex-col gap-2' : 'flex flex-col gap-1.5 border-t border-line-soft px-3 pb-3 pt-2'}>
      <form onSubmit={onSubmit} className="w-full">
        <label htmlFor="chat-ask" className="sr-only">Nhập yêu cầu</label>
        <div className={`gm-input flex items-end gap-1.5 border border-line-strong bg-white transition-colors focus-within:border-brand ${busy ? 'gm-busy' : ''} ${big ? 'rounded-[26px] px-2 py-1.5' : 'rounded-[22px] px-1.5 py-1'}`}>
          <textarea id="chat-ask" ref={inputRef} rows={1} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
            placeholder="Mô tả việc bạn cần, Enter để gửi" autoFocus={big}
            className={`min-w-0 flex-1 resize-none self-center border-0 bg-transparent leading-[1.45] text-ink outline-0 placeholder:truncate placeholder:text-subtle ${big ? 'px-3 py-2 text-[17px]' : 'px-2.5 py-1.5 text-[15px]'}`} />
          <button type="submit" disabled={!busy && !text.trim()} aria-label={busy ? 'Dừng' : 'Gửi'} title={busy ? 'Dừng' : 'Gửi'}
            className={`relative inline-flex ${big ? 'size-9' : 'size-8'} mb-0.5 flex-none cursor-pointer items-center justify-center rounded-full border-0 transition-[background-color,opacity] duration-300 disabled:cursor-default disabled:opacity-40 ${busy ? 'bg-ink' : 'bg-brand hover:bg-brand-dark'}`}>
            {busy && <span aria-hidden="true" className="send-ring absolute -inset-[3px] rounded-full" />}
            {busy ? <span className="block size-3 rounded-[3px] bg-white" /> : (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 16V4M5 9l5-5 5 5" /></svg>
            )}
          </button>
        </div>
      </form>
      {big && <div className="text-center text-[13px] text-subtle">Trợ lý có thể sai. Mọi đề xuất đều cần bạn duyệt.</div>}
    </div>
  );
}

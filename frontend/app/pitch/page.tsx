'use client';

// Trang trình chiếu & chia sẻ Pitching HTML công khai (/pitch?slug=...).
import { useCallback, useEffect, useState } from 'react';
import { api, type PitchDeck } from '@/lib/api';
import { ErrorBox, Icon, Loading } from '@/components/kit/ui';

function escHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

function buildStandaloneHtml(deck: PitchDeck): string {
  const sections = deck.slides
    .map(
      (s, idx) =>
        `<section><small>${escHtml(s.kicker || `Slide ${idx + 1}`)}</small><h1>${escHtml(s.title)}</h1><p>${escHtml(
          s.body,
        )}</p>${s.highlight ? `<div class="hl">${escHtml(s.highlight)}</div>` : ''}</section>`,
    )
    .join('\n');
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(
    deck.title,
  )}</title><style>*{box-sizing:border-box}body{margin:0;font-family:"Familjen Grotesk",Arial,sans-serif;color:#111a24;background:#e9eff5;scroll-snap-type:y mandatory;overflow-y:auto;height:100vh}section{min-height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:center;gap:16px;padding:8vw;background:#fff;border-bottom:6px solid #2c6ab0}small{font-size:14px;text-transform:uppercase;letter-spacing:.14em;color:#2c6ab0}h1{font-weight:400;font-size:clamp(28px,5vw,56px);margin:0;letter-spacing:-0.03em}p{font-size:clamp(18px,2vw,26px);line-height:1.55;max-width:34em;white-space:pre-wrap;color:#4a5664;margin:0}.hl{align-self:flex-start;background:#dce8f5;color:#1f5a9e;padding:6px 14px;border-radius:999px;font-size:15px}</style></head><body>\n${sections}\n</body></html>`;
}

export default function PublicPitchPage() {
  const [slug, setSlug] = useState<string | null>(null);
  const [deck, setDeck] = useState<PitchDeck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'present' | 'all'>('present');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('slug')?.trim() || '';
    setSlug(param);
    if (!param) {
      setLoading(false);
      setError('Thiếu mã bộ slide trên đường dẫn (?slug=...).');
      return;
    }
    api
      .deck(param)
      .then((data) => {
        setDeck(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Không tải được bộ slide'))
      .finally(() => setLoading(false));
  }, []);

  const slideCount = deck?.slides.length || 0;
  const safeIdx = slideCount ? Math.min(idx, slideCount - 1) : 0;

  const stepSlide = useCallback(
    (delta: number) => {
      if (!slideCount) return;
      setIdx((cur) => Math.max(0, Math.min(slideCount - 1, cur + delta)));
    },
    [slideCount],
  );

  useEffect(() => {
    if (viewMode !== 'present' || !slideCount) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        stepSlide(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepSlide(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewMode, slideCount, stepSlide]);

  const copyLink = async () => {
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pitch?slug=${slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError('Trình duyệt chặn sao chép tự động, hãy chép đường dẫn trên thanh địa chỉ.');
    }
  };

  const downloadHtml = () => {
    if (!deck) return;
    const blob = new Blob([buildStandaloneHtml(deck)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.slug || 'pitching'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const current = deck?.slides[safeIdx];

  return (
    <main className="mx-auto flex min-h-screen max-w-[1040px] flex-col gap-3 px-3 py-5">
      <div className="d-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="d-ov">Pitching HTML</span>
            {deck && <span className="d-chip d-info">{deck.slides.length} slide</span>}
          </div>
          {deck && <h1 className="d-h1 text-[28px]">{deck.title}</h1>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deck && (
            <>
              <div className="d-seg" role="group" aria-label="Chế độ xem">
                <button
                  type="button"
                  className={viewMode === 'present' ? 'on' : ''}
                  onClick={() => setViewMode('present')}
                >
                  Trình chiếu
                </button>
                <button type="button" className={viewMode === 'all' ? 'on' : ''} onClick={() => setViewMode('all')}>
                  Tất cả slide
                </button>
              </div>
              <button type="button" className="d-btn d-b2 d-sm" onClick={copyLink}>
                <Icon name={copied ? 'check' : 'link'} size={16} />
                {copied ? 'Đã sao chép link' : 'Sao chép link'}
              </button>
              <button type="button" className="d-btn d-b1 d-sm" onClick={downloadHtml}>
                Tải HTML
              </button>
            </>
          )}
          <a href="/" className="d-btn d-b2 d-sm">
            <Icon name="back" size={16} />
            Về Tầng
          </a>
        </div>
      </div>

      {loading ? (
        <div className="d-card">
          <Loading />
        </div>
      ) : !deck ? (
        <div className="d-card flex flex-col gap-3">
          <ErrorBox message={error || 'Không tìm thấy bộ slide pitching.'} />
        </div>
      ) : (
        <>
          <ErrorBox message={error} />

          {viewMode === 'present' && current ? (
            <section className="d-card flex min-h-[420px] flex-col justify-between gap-6 border-b-4 border-brand p-8">
              <div className="flex items-center justify-between gap-2">
                <span className="d-ov text-brand">{current.kicker || `Slide ${safeIdx + 1}`}</span>
                <span className="d-faint text-sm tabular-nums">
                  {safeIdx + 1} / {deck.slides.length}
                </span>
              </div>

              <div className="flex flex-col gap-4">
                <h2 className="m-0 text-[34px] leading-tight tracking-tight">{current.title}</h2>
                <p className="d-muted m-0 max-w-[46ch] whitespace-pre-wrap text-[20px] leading-relaxed">
                  {current.body}
                </p>
                {current.highlight ? <span className="d-chip d-info self-start">{current.highlight}</span> : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Chọn nhanh slide">
                  {deck.slides.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setIdx(i)}
                      aria-label={`Slide ${i + 1}`}
                      aria-selected={i === safeIdx}
                      className={`h-2.5 cursor-pointer rounded-full border-0 transition-all ${
                        i === safeIdx ? 'w-7 bg-brand' : 'w-2.5 bg-pale hover:bg-mist'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="d-btn d-b2 d-sm"
                    disabled={safeIdx <= 0}
                    onClick={() => stepSlide(-1)}
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    className="d-btn d-b1 d-sm"
                    disabled={safeIdx >= deck.slides.length - 1}
                    onClick={() => stepSlide(1)}
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {deck.slides.map((s, i) => (
                <section key={s.id} className="d-card flex flex-col justify-between gap-3 border-b-4 border-brand">
                  <div className="flex items-center justify-between gap-2">
                    <span className="d-ov text-brand">{s.kicker || `Slide ${i + 1}`}</span>
                    <span className="d-faint text-xs tabular-nums">
                      {i + 1} / {deck.slides.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <h2 className="m-0 text-xl">{s.title}</h2>
                    <p className="d-muted m-0 whitespace-pre-wrap text-[16px] leading-relaxed">{s.body}</p>
                  </div>
                  {s.highlight ? <span className="d-chip d-info self-start">{s.highlight}</span> : null}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

'use client';

// Trang trình chiếu & chia sẻ Pitching HTML công khai (/pitch?slug=...).
import { useCallback, useEffect, useState } from 'react';
import { api, type PitchDeck, type PitchSlide } from '@/lib/api';
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

type ParsedSlideItem = { label: string; text: string };

function resolveSlideLayout(s: PitchSlide, idx: number, total: number): string {
  const raw = (s.layout || 'auto').trim().toLowerCase();
  if (['hero', 'split', 'cards', 'compare', 'metric', 'steps'].includes(raw)) return raw;
  if (idx === 0) return 'hero';
  const k = (s.kicker || '').toLowerCase();
  if (idx === total - 1 || /bước|kế hoạch|lộ trình|pilot/.test(k)) return 'steps';
  if (/bằng chứng|khảo sát|đo|số liệu/.test(k)) return 'metric';
  if (/mvp|phạm vi|so sánh/.test(k)) return 'compare';
  if (/ai|đòn bẩy|giải pháp|tính năng/.test(k)) return 'cards';
  return ['split', 'cards', 'metric', 'compare', 'steps'][idx % 5];
}

function parseSlideItems(body: string): { paragraphs: string[]; items: ParsedSlideItem[] } {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items: ParsedSlideItem[] = [];
  const paragraphs: string[] = [];
  for (const line of lines) {
    if (/^(?:[-•*]|\d+[.)])\s+/.test(line)) {
      const clean = line.replace(/^(?:[-•*]|\d+[.)])\s+/, '');
      const colon = clean.indexOf(':');
      if (colon > 0 && colon <= 34 && clean.slice(colon + 1).trim()) {
        items.push({ label: clean.slice(0, colon).trim(), text: clean.slice(colon + 1).trim() });
      } else {
        items.push({ label: '', text: clean });
      }
    } else {
      paragraphs.push(line);
    }
  }
  return { paragraphs, items };
}

function renderSlideBody(body: string) {
  const { paragraphs, items } = parseSlideItems(body);
  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((p, idx) => (
        <p key={`p-${idx}`} className="d-muted m-0 max-w-[54ch] text-[18px] leading-relaxed">
          {p}
        </p>
      ))}
      {items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {items.map((it, idx) => (
            <li key={`b-${idx}`} className="flex items-start gap-2.5 text-[17px] leading-relaxed text-ink">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <span>
                {it.label ? <strong className="font-medium">{it.label}: </strong> : null}
                {it.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function renderPresentSlideBody(slide: PitchSlide, idx: number, total: number) {
  const layout = resolveSlideLayout(slide, idx, total);
  const { paragraphs, items } = parseSlideItems(slide.body);
  const hl = (slide.highlight || '').trim();

  if (layout === 'hero') {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="m-0 text-[38px] leading-tight tracking-tight">{slide.title}</h2>
        {paragraphs.map((p, k) => (
          <p key={k} className="d-muted m-0 max-w-[54ch] text-[19px] leading-relaxed">
            {p}
          </p>
        ))}
        {items.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {items.slice(0, 3).map((it, k) => (
              <div key={k} className="rounded-xl border border-hair bg-pale p-3.5">
                {it.label ? (
                  <div className="text-[11px] font-medium uppercase tracking-wider text-mute">{it.label}</div>
                ) : null}
                <div className="mt-0.5 text-[15px] font-medium text-ink">{it.text}</div>
              </div>
            ))}
          </div>
        )}
        {hl ? (
          <div className="self-start rounded-r-xl border-l-4 border-brand bg-pale px-4 py-2.5 text-sm font-medium text-ink">
            {hl}
          </div>
        ) : null}
      </div>
    );
  }

  if (layout === 'cards') {
    const cards = items.length ? items : paragraphs.map((p) => ({ label: '', text: p }));
    return (
      <div className="flex flex-col gap-5">
        <h2 className="m-0 text-[30px] leading-tight tracking-tight">{slide.title}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {cards.slice(0, 4).map((it, k) => (
            <div key={k} className="flex flex-col gap-1.5 rounded-xl border border-hair border-t-4 border-t-brand p-4">
              <span className="text-xs font-medium tracking-wider text-brand tabular-nums">
                {String(k + 1).padStart(2, '0')}
              </span>
              {it.label ? <strong className="text-[16px] font-medium text-ink">{it.label}</strong> : null}
              <p className="d-muted m-0 text-[15px] leading-relaxed">{it.text}</p>
            </div>
          ))}
        </div>
        {hl ? (
          <aside className="rounded-r-xl border-l-4 border-brand bg-pale px-4 py-3 text-[15px] font-medium text-ink">
            {hl}
          </aside>
        ) : null}
      </div>
    );
  }

  if (layout === 'compare') {
    const src =
      items.length >= 2
        ? items
        : [
            { label: 'Hiện trạng / Trọng tâm', text: paragraphs[0] || slide.body },
            { label: 'Hướng tiếp cận', text: paragraphs[1] || hl || 'Tập trung kiểm chứng thực tế' },
          ];
    const mid = Math.ceil(src.length / 2);
    const colA = src.slice(0, mid);
    const colB = src.slice(mid);
    return (
      <div className="flex flex-col gap-5">
        <h2 className="m-0 text-[30px] leading-tight tracking-tight">{slide.title}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl border border-hair bg-pale p-5">
            {colA.map((it, k) => (
              <div key={k} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-mute">{it.label || 'Vế 1'}</span>
                <p className="m-0 text-[16px] font-medium leading-relaxed text-ink">{it.text}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-hair border-t-4 border-t-brand p-5">
            {colB.map((it, k) => (
              <div key={k} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-brand">{it.label || 'Vế 2'}</span>
                <p className="m-0 text-[16px] font-medium leading-relaxed text-ink">{it.text}</p>
              </div>
            ))}
          </div>
        </div>
        {hl && items.length >= 2 ? (
          <aside className="rounded-r-xl border-l-4 border-brand bg-pale px-4 py-2.5 text-sm font-medium text-ink">
            {hl}
          </aside>
        ) : null}
      </div>
    );
  }

  if (layout === 'metric') {
    const statVal = hl || (items[0] ? items[0].text : slide.title);
    return (
      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[minmax(200px,0.8fr)_minmax(0,1.4fr)]">
        <aside className="flex flex-col gap-2 rounded-2xl border border-hair bg-pale p-6">
          <span className="text-[11px] font-medium uppercase tracking-wider text-mute">
            {slide.kicker || 'Chỉ số chính'}
          </span>
          <strong className="text-[28px] font-medium leading-tight text-ink tabular-nums">{statVal}</strong>
        </aside>
        <div className="flex flex-col gap-4">
          <h2 className="m-0 text-[30px] leading-tight tracking-tight">{slide.title}</h2>
          {renderSlideBody(slide.body)}
        </div>
      </div>
    );
  }

  if (layout === 'steps') {
    const steps = items.length ? items : paragraphs.map((p) => ({ label: '', text: p }));
    return (
      <div className="flex flex-col gap-5">
        <h2 className="m-0 text-[30px] leading-tight tracking-tight">{slide.title}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {steps.slice(0, 4).map((it, k) => (
            <div key={k} className="flex flex-col gap-2 rounded-xl border border-hair p-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-medium text-white tabular-nums">
                {k + 1}
              </span>
              {it.label ? <strong className="text-[16px] font-medium text-ink">{it.label}</strong> : null}
              <p className="d-muted m-0 text-[15px] leading-relaxed">{it.text}</p>
            </div>
          ))}
        </div>
        {hl ? (
          <aside className="self-start rounded-r-xl border-l-4 border-brand bg-pale px-4 py-2.5 text-sm font-medium text-ink">
            {hl}
          </aside>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={
        hl
          ? 'grid grid-cols-1 items-center gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.85fr)]'
          : 'flex flex-col gap-4'
      }
    >
      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[32px] leading-tight tracking-tight">{slide.title}</h2>
        {renderSlideBody(slide.body)}
      </div>
      {hl ? (
        <aside className="flex flex-col gap-1.5 rounded-r-xl border-l-4 border-brand bg-pale p-5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-mute">Điểm nhấn</span>
          <strong className="text-[17px] font-medium leading-snug text-ink">{hl}</strong>
        </aside>
      ) : null}
    </div>
  );
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
            <section className="d-card flex min-h-[440px] flex-col justify-between gap-6 p-8">
              <div className="flex flex-col gap-3">
                <div className="h-1 w-full overflow-hidden rounded-full bg-pale">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${((safeIdx + 1) / deck.slides.length) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="inline-flex items-center gap-2 rounded-full bg-pale px-3 py-1 text-xs font-medium uppercase tracking-wider text-ink">
                    <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
                    {current.kicker || `Slide ${safeIdx + 1}`}
                  </span>
                  <span className="d-faint text-sm tabular-nums">
                    {String(safeIdx + 1).padStart(2, '0')} / {String(deck.slides.length).padStart(2, '0')}
                  </span>
                </div>
              </div>

              {renderPresentSlideBody(current, safeIdx, deck.slides.length)}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-4">
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {deck.slides.map((s, i) => (
                <section key={s.id} className="d-card flex flex-col justify-between gap-4 border-t-4 border-brand">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-pale px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-ink">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                      {s.kicker || `Slide ${i + 1}`}
                    </span>
                    <span className="d-faint text-xs tabular-nums">
                      {String(i + 1).padStart(2, '0')} / {String(deck.slides.length).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <h2 className="m-0 text-xl leading-snug">{s.title}</h2>
                    {renderSlideBody(s.body)}
                  </div>
                  {s.highlight ? (
                    <div className="rounded-r-lg border-l-4 border-brand bg-pale px-3.5 py-2.5 text-sm font-medium text-ink">
                      {s.highlight}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

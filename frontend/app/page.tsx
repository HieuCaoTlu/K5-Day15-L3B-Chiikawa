// Landing page. Thay nội dung trong CONTENT theo đề tài — bố cục, khoảng cách, hiệu ứng giữ nguyên (DESIGN.md).
import Link from 'next/link';
import { Header } from '@/components/landing/Header';
import { Reveal } from '@/components/motion/Reveal';
import { SITE } from '@/lib/site';

const CONTENT = {
  eyebrow: 'Trợ lý AI cho <người dùng cụ thể>',
  heroA: 'Làm <việc khó>',
  heroAccent: 'nhanh gấp 10 lần',
  heroB: 'mà vẫn do bạn quyết.',
  sub: 'Mô tả vấn đề bằng một câu. Agent soạn đề xuất có cấu trúc, bạn duyệt trước khi áp dụng. Không đoán mò, không mất cả tuần.',
  stats: [
    { v: '2 phút', l: 'từ câu hỏi tới đề xuất' },
    { v: '100%', l: 'đề xuất có người duyệt' },
    { v: '0đ', l: 'để bắt đầu dùng thử' },
  ],
  problems: [
    { t: 'Mất thời gian', d: 'Một việc lặp lại tốn hàng giờ mỗi tuần, làm tay và dễ sai.' },
    { t: 'Thông tin rời rạc', d: 'Dữ liệu nằm ở nhiều nơi, không ai có bức tranh đầy đủ.' },
    { t: 'Khó kiểm chứng', d: 'Công cụ AI chung chung trả lời trơn tru nhưng không biết đúng sai.' },
  ],
  steps: [
    { t: 'Bạn mô tả', d: 'Một câu tiếng Việt bình thường.' },
    { t: 'Agent kiểm tra', d: 'Chặn yêu cầu không an toàn, giới hạn độ dài.' },
    { t: 'Gemini soạn đề xuất', d: 'Đúng khung JSON có sẵn, không bịa số.' },
    { t: 'Bạn duyệt', d: 'Đồng ý hoặc từ chối, kèm ghi chú.' },
  ],
  faq: [
    { q: 'Khác gì hỏi ChatGPT?', a: 'Agent làm theo quy trình cố định, có dữ liệu riêng và luôn dừng lại để bạn duyệt trước khi áp dụng.' },
    { q: 'Dữ liệu của tôi có an toàn không?', a: 'Dữ liệu chỉ dùng để xử lý yêu cầu của bạn, không dùng để huấn luyện mô hình.' },
    { q: 'Nếu AI sai thì sao?', a: 'Mọi đề xuất đều qua bước người duyệt. Bạn từ chối là agent không làm gì thêm.' },
  ],
};

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1440px] flex-col gap-3 px-3 pb-3">
        {/* Hero */}
        <section className="card relative overflow-hidden px-6 pb-10 pt-16 sm:px-12 sm:pt-24 lg:px-16">
          <div className="flex max-w-[980px] flex-col gap-7">
            <div className="lbl rise-in">{CONTENT.eyebrow}</div>
            <h1 className="m-0 text-[clamp(44px,6.4vw,96px)] font-normal leading-[1.02] tracking-[-.04em]">
              {[CONTENT.heroA].map((w) => <span key={w} className="word-mask"><span className="word-up">{w}</span></span>)}{' '}
              <span className="word-mask"><span className="word-up text-brand" style={{ ['--d' as string]: '.08s' }}>{CONTENT.heroAccent}</span></span>{' '}
              <span className="word-mask"><span className="word-up" style={{ ['--d' as string]: '.16s' }}>{CONTENT.heroB}</span></span>
            </h1>
            <p className="rise-in m-0 max-w-[640px] text-[clamp(17px,1.4vw,21px)] leading-[1.55] text-muted" style={{ ['--d' as string]: '.3s' }}>{CONTENT.sub}</p>
            <div className="rise-in flex flex-wrap gap-2.5" style={{ ['--d' as string]: '.4s' }}>
              <Link href="/chat" className="btn btn-fx bg-brand text-white hover:bg-brand-dark hover:text-white">Dùng thử ngay <span className="arrow">→</span></Link>
              <a href="#cach-hoat-dong" className="btn bg-soft text-ink hover:bg-soft-hover hover:text-ink">Xem cách hoạt động</a>
            </div>
          </div>
          <div className="mt-16 grid gap-3 sm:grid-cols-3">
            {CONTENT.stats.map((s, i) => (
              <div key={s.l} className="rise-in flex flex-col gap-2 rounded-[20px] bg-soft p-5" style={{ ['--d' as string]: `${0.5 + i * 0.08}s` }}>
                <div className="num text-[44px] leading-none">{s.v}</div>
                <div className="text-[15px] text-muted">{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Vấn đề */}
        <section id="van-de" className="card flex flex-col gap-10 px-6 py-14 sm:px-12 lg:px-16">
          <Reveal className="flex max-w-[760px] flex-col gap-4">
            <div className="lbl">01 · Vấn đề</div>
            <h2 className="h2 text-[clamp(32px,3.6vw,54px)]">Hiện nay mọi thứ vẫn làm bằng tay.</h2>
          </Reveal>
          <div className="grid gap-3 md:grid-cols-3">
            {CONTENT.problems.map((p, i) => (
              <Reveal key={p.t} delay={i * 0.08} className="flex flex-col gap-3 rounded-[20px] border border-line p-6">
                <span className="idx">0{i + 1}</span>
                <div className="text-[22px] tracking-[-.01em]">{p.t}</div>
                <p className="m-0 text-[16px] leading-relaxed text-muted">{p.d}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Cách hoạt động */}
        <section id="cach-hoat-dong" className="card flex flex-col gap-10 px-6 py-14 sm:px-12 lg:px-16">
          <Reveal className="flex max-w-[760px] flex-col gap-4">
            <div className="lbl">02 · Cách hoạt động</div>
            <h2 className="h2 text-[clamp(32px,3.6vw,54px)]">Bốn bước, một lần bấm duyệt.</h2>
          </Reveal>
          <div className="relative grid gap-3 lg:grid-cols-4">
            <div aria-hidden="true" className="pointer-events-none absolute left-[22px] top-0 h-full w-px bg-line lg:left-0 lg:top-[22px] lg:h-px lg:w-full">
              <span className="flow-dot absolute size-2 rounded-full bg-brand lg:-top-[3.5px]" style={{ left: -3.5 }} />
            </div>
            {CONTENT.steps.map((s, i) => (
              <Reveal key={s.t} delay={i * 0.08} className="relative flex gap-4 lg:flex-col">
                <span className="relative z-10 inline-flex size-11 flex-none items-center justify-center rounded-full bg-ink text-[15px] text-white">{i + 1}</span>
                <div className="flex flex-col gap-1.5 pt-1.5 lg:pt-0">
                  <div className="text-[20px]">{s.t}</div>
                  <p className="m-0 text-[16px] text-muted">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Hỏi đáp */}
        <section id="hoi-dap" className="card grid gap-10 px-6 py-14 sm:px-12 lg:grid-cols-[1fr_1.4fr] lg:px-16">
          <Reveal className="flex flex-col gap-4">
            <div className="lbl">03 · Hỏi đáp</div>
            <h2 className="h2 text-[clamp(32px,3.6vw,54px)]">Câu hỏi hay gặp.</h2>
          </Reveal>
          <div className="flex flex-col">
            {CONTENT.faq.map((f) => (
              <details key={f.q} className="group border-b border-line py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[20px]">
                  {f.q}
                  <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-soft transition-transform duration-300 group-open:rotate-45">+</span>
                </summary>
                <p className="m-0 mt-3 max-w-[640px] text-[16px] leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="flex flex-col items-start gap-6 rounded-[28px] bg-ink px-6 py-16 text-white sm:px-12 lg:px-16">
          <h2 className="h2 max-w-[860px] text-[clamp(34px,4.4vw,68px)]">Thử với việc của bạn, ngay bây giờ.</h2>
          <Link href="/chat" className="btn btn-fx bg-white text-ink hover:text-ink" style={{ ['--fx' as string]: 'rgb(44 106 176 / .18)' }}>Mở trợ lý <span className="arrow">→</span></Link>        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 px-4 py-6 text-[15px] text-subtle">
          <span>© {new Date().getFullYear()} {SITE.name}</span>
          <span>Làm trong 36 giờ hackathon</span>
        </footer>
      </main>
    </>
  );
}

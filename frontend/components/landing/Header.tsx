'use client';

// Header dính: trong suốt ở đầu trang, nền mờ khi đã cuộn (.site-header[data-scrolled]).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SITE } from '@/lib/site';

const NAV = [
  { href: '/#van-de', label: 'Vấn đề' },
  { href: '/#cach-hoat-dong', label: 'Cách hoạt động' },
  { href: '/#hoi-dap', label: 'Hỏi đáp' },
];

export function Header({ app = false }: { app?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className="site-header sticky top-0 z-40" data-scrolled={scrolled || app}>
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[.02em] text-ink no-underline">
          <img src="/icon.svg" alt="" width={28} height={28} />
          {SITE.name}
        </Link>
        {!app && (
          <nav className="hidden items-center gap-8 md:flex" aria-label="Điều hướng chính">
            {NAV.map((n) => <a key={n.href} href={n.href} className="nav-link">{n.label}</a>)}
          </nav>
        )}
        <div className="flex items-center gap-2">
          <Link href="/admin" className="nav-link hidden px-2 sm:inline">Quản trị</Link>
          {!app && (
            <Link href="/chat" className="btn btn-fx min-h-10 bg-ink px-[18px] text-[16px] text-white hover:text-white">
              Dùng thử <span className="arrow">→</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

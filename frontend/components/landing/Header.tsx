'use client';

import Link from 'next/link';
import { SITE } from '@/lib/site';

export function Header() {
  return (
    <header className="site-header sticky top-0 z-40" data-scrolled="true">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[.02em] text-ink no-underline">
          <img src="/icon.svg" alt="" width={28} height={28} />
          {SITE.name}
        </a>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="nav-link hidden px-2 sm:inline">Quản trị</Link>
        </div>
      </div>
    </header>
  );
}

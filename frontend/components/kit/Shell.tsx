'use client';

// Khung trang quản trị: thanh bên trắng bo 24px + tiêu đề dính (đóng gói từ P-020 components/dash/Shell.tsx).
// CHƯA có đăng nhập — thêm guard trước khi đưa link /admin cho người ngoài.
import { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE } from '@/lib/site';
import { Icon } from './ui';

type Item = { href: string; label: string; icon: string };
type Group = { title: string; items: Item[] };

// Thêm trang admin: tạo app/admin/<ten>/page.tsx rồi thêm một dòng ở đây.
const MENU: Group[] = [
  {
    title: 'Phân tích',
    items: [
      { href: '/admin', label: 'Tổng quan', icon: 'trend' },
      { href: '/admin/usage', label: 'Chi phí & token', icon: 'wallet' },
    ],
  },
  {
    title: 'Vận hành',
    items: [
      { href: '/admin/review', label: 'Hàng chờ duyệt', icon: 'check' },
      { href: '/admin/sessions', label: 'Phiên chat', icon: 'chat' },
      { href: '/admin/runs', label: 'Lượt chạy agent', icon: 'log' },
      { href: '/admin/items', label: 'Dữ liệu mẫu', icon: 'grid' },
    ],
  },
];

export function Shell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const current = MENU.flatMap((g) => g.items)
    .filter((i) => path === i.href || path.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <div className="d-page">
      <aside className="d-side">
        <div className="flex flex-col gap-1 px-2.5">
          <a href="/" className="text-base font-semibold tracking-[.02em] text-ink no-underline">{SITE.name}</a>
          <div className="d-ov !text-[12px]">Trang quản trị · /admin</div>
        </div>
        {MENU.map((group) => (
          <nav key={group.title} aria-label={group.title} className="flex flex-col gap-0.5">
            <div className="d-ov px-3 pb-1.5 !text-[12px]">{group.title}</div>
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={`d-nav ${current === item.href ? 'on' : ''}`} aria-current={current === item.href ? 'page' : undefined}>
                <Icon name={item.icon} />{item.label}
              </Link>
            ))}
          </nav>
        ))}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line-soft pt-3.5">
          <Link href="/chat" className="d-nav"><Icon name="chat" />Mở khung chat</Link>
          <Link href="/" className="d-nav"><Icon name="home" />Trang giới thiệu</Link>
        </div>
      </aside>
      <main className="d-main">
        <div key={path} className="d-enter">
          <header className="d-sticky-head -mt-3 flex flex-wrap items-end justify-between gap-4 bg-page px-[18px] pb-3 pt-4">
            <h1 className="d-h1">{title}</h1>
            {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}

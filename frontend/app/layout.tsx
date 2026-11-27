import type { Metadata, Viewport } from 'next';
import { Familjen_Grotesk, Instrument_Serif } from 'next/font/google';
import { SITE, SITE_URL } from '@/lib/site';
import './globals.css';
import './components.css';

// Font của nhóm: Familjen Grotesk (mọi chữ) + Instrument Serif (CHỈ tên thương hiệu cỡ lớn để trang trí — DESIGN.md).
const grotesk = Familjen_Grotesk({ subsets: ['latin', 'latin-ext', 'vietnamese'], weight: ['400', '500', '600'], variable: '--font-grotesk', display: 'swap' });
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-instrument', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE.title,
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { type: 'website', locale: 'vi_VN', url: '/', siteName: SITE.name, title: SITE.title, description: SITE.description },
};

export const viewport: Viewport = { themeColor: '#E9EFF5', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${grotesk.variable} ${instrument.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// Production: xuất HTML tĩnh (out/) cho Caddy phục vụ — VPS không chạy Node. API cùng domain (/api → FastAPI qua Caddy).
// Dev: `npm run dev` chuyển /api, /health, /docs sang backend (mặc định uvicorn ở máy).
// Muốn dùng backend trên VPS khi dev: API_URL=https://app.ten-mien.com npm run dev
const DEFAULT_API = 'http://127.0.0.1:8000';

export default function config(phase: string): NextConfig {
  const base: NextConfig = { reactStrictMode: true, trailingSlash: false, images: { unoptimized: true } };
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    const api = process.env.API_URL || DEFAULT_API;
    const backend = ['/api/:path*', '/health', '/docs', '/openapi.json'];
    return {
      ...base,
      // Agent gọi LLM có thể > 30 s (mặc định của proxy dev) → nâng lên 3 phút.
      experimental: { proxyTimeout: 180_000 },
      rewrites: async () => backend.map((source) => ({ source, destination: `${api}${source}` })),
    };
  }
  return { ...base, output: 'export' };
}

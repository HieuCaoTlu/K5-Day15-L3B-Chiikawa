// Gọi backend cùng domain (/api → FastAPI qua Caddy; khi dev, next.config.ts chuyển tiếp sang API_URL).
// Kiểu dữ liệu khớp backend/app/schemas.py — đổi schema thì sửa cả hai.

export type RunStatus = 'running' | 'blocked' | 'waiting_review' | 'approved' | 'rejected' | 'error';

export type Proposal = { title: string; summary: string; steps: string[]; confidence: number };

export type Run = {
  id: string;
  session_id: string | null;
  request: string;
  status: RunStatus;
  source: 'llm' | 'demo_cache' | 'fallback' | 'mock' | null;
  proposal: Proposal | null;
  result: { status?: string; title?: string; steps?: string[]; note?: string; reason?: string; error?: string } | null;
  created_at: string;
  updated_at: string;
};

export type Item = { id: number; title: string; description: string; status: 'todo' | 'doing' | 'done'; created_at: string };

export type Health = { status: string; env: string; db: string; llm: 'gemini' | 'mock'; demo_mode: boolean; mock_nodes: string | null };

export type Stats = {
  runs_total: number;
  runs_by_status: Record<string, number>;
  runs_by_source: Record<string, number>;
  waiting_review: number;
  approval_rate: number | null;
  items_total: number;
  sessions_total: number;
};

export type UsageRow = { key: string; calls: number; tokens: number; cost_usd: number };
export type LlmCall = {
  id: number; run_id: string | null; node: string; model: string; input_tokens: number; output_tokens: number;
  cost_usd: number; latency_ms: number; ok: boolean; error: string | null; created_at: string;
};
export type Usage = {
  days: number;
  totals: { calls: number; errors: number; input_tokens: number; output_tokens: number; cost_usd: number; avg_latency_ms: number };
  by_day: UsageRow[];
  by_model: UsageRow[];
  by_node: UsageRow[];
  recent: LlmCall[];
  budget: { daily_usd: number; spent_today_usd: number; usd_to_vnd: number };
  prices: Record<string, [number, number]>;
};
export type ChatSession = {
  id: string; turns: number; started_at: string; last_at: string; waiting_review: number; blocked: number;
  last_request: string | null; tokens: number; cost_usd: number;
};

async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === 'string' ? body.detail : `Lỗi ${res.status}`;
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  health: () => request<Health>('/health'),
  stats: () => request<Stats>('/api/v1/admin/stats'),
  items: () => request<Item[]>('/api/v1/items'),
  createItem: (body: { title: string; description?: string; status?: Item['status'] }) =>
    request<Item>('/api/v1/items', { method: 'POST', body: JSON.stringify(body) }),
  deleteItem: (id: number) => request<void>(`/api/v1/items/${id}`, { method: 'DELETE' }),
  usage: (days = 7) => request<Usage>(`/api/v1/admin/usage?days=${days}`),
  sessions: () => request<ChatSession[]>('/api/v1/admin/sessions'),
  session: (id: string) => request<Run[]>(`/api/v1/admin/sessions/${encodeURIComponent(id)}`),
  startRun: (text: string, sessionId: string, signal?: AbortSignal) =>
    request<Run>('/api/v1/agent/runs', { method: 'POST', body: JSON.stringify({ request: text, session_id: sessionId }), signal }),
  runs: (status?: RunStatus) => request<Run[]>(`/api/v1/agent/runs${status ? `?status=${status}` : ''}`),
  review: (id: string, approved: boolean, note = '') =>
    request<Run>(`/api/v1/agent/runs/${id}/review`, { method: 'POST', body: JSON.stringify({ approved, note }) }),
};

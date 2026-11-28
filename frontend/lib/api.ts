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

export type ProblemContext = {
  project_name: string;
  target_role: string;
  persona: string;
  problem: string;
  leverage: string;
  scope: string;
  metric: string;
  overview: string;
};

export type SurveyQuestionType = 'scale' | 'choice' | 'multi' | 'text';

export type SurveySection = {
  id: string;
  title: string;
  description: string;
};

export type SurveyQuestion = {
  id: string;
  section_id?: string;
  type: SurveyQuestionType;
  q: string;
  options: string[];
  required: boolean;
};

export type SurveyDraft = {
  title: string;
  description: string;
  target_role: string;
  sections?: SurveySection[];
  questions: SurveyQuestion[];
  source: 'llm' | 'fallback';
};

export type Survey = {
  id: string;
  slug: string;
  project_name: string;
  target_role: string;
  problem_context: Record<string, unknown>;
  title: string;
  description: string;
  sections?: SurveySection[];
  questions: SurveyQuestion[];
  published: boolean;
  response_count: number;
  created_at: string;
  updated_at: string;
};

export type SurveyResponseItem = {
  id: number;
  survey_id: string;
  respondent_role: string;
  answers: Record<string, string | string[]>;
  is_sample: boolean;
  created_at: string;
};

export type SurveyOptionStat = {
  label: string;
  count: number;
  pct: number;
};

export type SurveyQuestionStat = {
  id: string;
  type: SurveyQuestionType;
  q: string;
  answered: number;
  avg: number | null;
  options: SurveyOptionStat[];
  texts: string[];
};

export type SurveyStats = {
  survey_id: string;
  slug: string;
  title: string;
  target_role: string;
  total_responses: number;
  real_responses: number;
  sample_responses: number;
  last_response_at: string | null;
  questions: SurveyQuestionStat[];
};

export type PitchSlide = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  highlight: string;
  layout?: string;
};

export type PitchAdPost = {
  id: string;
  channel: string;
  hook: string;
  body: string;
  cta: string;
  placeholders: string[];
};

export type PitchDeckDraft = {
  title: string;
  survey_slug: string;
  slides: PitchSlide[];
  source: 'llm' | 'fallback';
};

export type PitchDeck = {
  id: string;
  slug: string;
  project_name: string;
  survey_slug: string;
  title: string;
  slides: PitchSlide[];
  script?: string;
  ads: PitchAdPost[];
  created_at: string;
  updated_at: string;
};

export type PitchAssets = {
  script?: string;
  ads: PitchAdPost[];
  source: 'llm' | 'fallback';
};

export type PitchOverview = {
  overview: string;
  total_responses: number;
  real_responses: number;
  sample_responses: number;
  source: 'llm' | 'fallback';
};

export async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
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
    request<Run>('/api/v1/agent/runs', {
      method: 'POST',
      headers: { 'X-Planning-Request': '1' },
      body: JSON.stringify({ request: text, session_id: sessionId }),
      signal,
    }),
  runs: (status?: RunStatus, sessionId?: string) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (sessionId) params.set('session_id', sessionId);
    const query = params.toString();
    return request<Run[]>(`/api/v1/agent/runs${query ? `?${query}` : ''}`);
  },
  review: (id: string, approved: boolean, note = '') =>
    request<Run>(`/api/v1/agent/runs/${id}/review`, {
      method: 'POST',
      headers: { 'X-Planning-Request': '1' },
      body: JSON.stringify({ approved, note }),
    }),
  generateSurvey: (ctx: ProblemContext) =>
    request<SurveyDraft>('/api/v1/pitching/surveys/generate', { method: 'POST', body: JSON.stringify(ctx) }),
  publishSurvey: (body: {
    project_name: string;
    target_role: string;
    problem_context: ProblemContext;
    title: string;
    description: string;
    sections?: SurveySection[];
    questions: SurveyQuestion[];
  }) => request<Survey>('/api/v1/pitching/surveys', { method: 'POST', body: JSON.stringify(body) }),
  surveys: () => request<Survey[]>('/api/v1/pitching/surveys'),
  survey: (slug: string) => request<Survey>(`/api/v1/pitching/surveys/${encodeURIComponent(slug)}`),
  updateSurvey: (
    slug: string,
    body: {
      project_name: string;
      target_role: string;
      problem_context: ProblemContext;
      title: string;
      description: string;
      sections?: SurveySection[];
      questions: SurveyQuestion[];
    },
  ) => request<Survey>(`/api/v1/pitching/surveys/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSurvey: (slug: string) => request<void>(`/api/v1/pitching/surveys/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  submitSurveyResponse: (slug: string, body: { respondent_role?: string; answers: Record<string, string | string[]>; is_sample?: boolean }) =>
    request<SurveyResponseItem>(`/api/v1/pitching/surveys/${encodeURIComponent(slug)}/responses`, { method: 'POST', body: JSON.stringify(body) }),
  surveyResponses: (slug: string) => request<SurveyResponseItem[]>(`/api/v1/pitching/surveys/${encodeURIComponent(slug)}/responses`),
  surveyStats: (slug: string) => request<SurveyStats>(`/api/v1/pitching/surveys/${encodeURIComponent(slug)}/stats`),
  seedSurveySamples: (slug: string) =>
    request<SurveyStats>(`/api/v1/pitching/surveys/${encodeURIComponent(slug)}/samples`, { method: 'POST' }),
  generateDeck: (body: { context: ProblemContext; survey_slug?: string; slide_count?: number }) =>
    request<PitchDeckDraft>('/api/v1/pitching/decks/generate', { method: 'POST', body: JSON.stringify(body) }),
  publishDeck: (body: {
    project_name: string;
    survey_slug?: string;
    title: string;
    slides: PitchSlide[];
    script?: string;
    ads?: PitchAdPost[];
  }) => request<PitchDeck>('/api/v1/pitching/decks', { method: 'POST', body: JSON.stringify(body) }),
  decks: () => request<PitchDeck[]>('/api/v1/pitching/decks'),
  deck: (slug: string) => request<PitchDeck>(`/api/v1/pitching/decks/${encodeURIComponent(slug)}`),
  updateDeck: (
    slug: string,
    body: {
      project_name: string;
      survey_slug?: string;
      title: string;
      slides: PitchSlide[];
      script?: string;
      ads?: PitchAdPost[];
    },
  ) => request<PitchDeck>(`/api/v1/pitching/decks/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteDeck: (slug: string) => request<void>(`/api/v1/pitching/decks/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  generateAssets: (body: { context: ProblemContext; survey_slug?: string }) =>
    request<PitchAssets>('/api/v1/pitching/assets/generate', { method: 'POST', body: JSON.stringify(body) }),
  generateOverview: (body: { context: ProblemContext; survey_slug?: string }) =>
    request<PitchOverview>('/api/v1/pitching/overview', { method: 'POST', body: JSON.stringify(body) }),
};

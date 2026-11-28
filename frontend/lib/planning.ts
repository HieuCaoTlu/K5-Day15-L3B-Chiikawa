import { request } from '@/lib/api';

export type Status = 'todo' | 'doing' | 'review' | 'done';
export type PullState = 'draft' | 'open' | 'merged' | 'closed';
export type Profile = { github_id: string; name: string; login: string; demo: boolean };
export type MemberInput = { github_id?: string; login: string; name: string; experience: string; tags: string[]; avatar: number };
export type Member = MemberInput & { github_id: string; leader: boolean };
export type Repo = { id: string; name: string; branch: string; access: boolean; url: string | null };
export type RepoChoice = Pick<Repo, 'id' | 'name' | 'branch'> & { private: boolean };
export type Brief = { overview: string; stories: string[]; starts_on: string; ends_on: string };
export type TaskInput = {
  title: string; description: string; criteria: string[]; deadline: string; assignee_id: string | null; status: Status;
};
export type ProposedTask = TaskInput & { skills: string[] };
export type ProposedSprint = { title: string; goal: string; starts_on: string; ends_on: string; tasks: ProposedTask[] };
export type Plan = { sprints: ProposedSprint[] };
export type Draft = { id: string; source: 'llm' | 'fallback'; brief: Brief; plan: Plan };
export type Pull = {
  number: number; title: string; author_login: string; state: PullState; task_id: number | null; note: string | null;
  linkage: 'auto' | 'confirmed' | 'pending'; url: string | null;
};
export type Task = TaskInput & { id: number; code: string; progress: Status; pulls: Pull[]; can_start: boolean };
export type RepoAccessInfo = { available: false } | {
  available: true; app_can_write: boolean | null; members: { github_id: string; login: string; write: boolean | null }[];
  settings_url: string; invitations_url: string; app_url: string;
};
export type Sprint = Omit<ProposedSprint, 'tasks'> & { id: number; tasks: Task[] };
export type Board = {
  overview: string; stories: string[]; roles: Record<string, string>; links: Record<string, string>;
  stack: { layer: string; choice: string; reason: string }[]; cost: Record<string, number>; revenue: string; version: number;
};
export type JoinProfile = Pick<MemberInput, 'name' | 'experience' | 'tags' | 'avatar'>;
export type PlanningState = {
  github_enabled: boolean; demo_enabled: boolean; profile: Profile | null; role: 'leader' | 'member' | null;
  members: Member[]; repo: Repo | null; repo_version: number; choices: RepoChoice[] | null; install_url: string | null;
  sprints: Sprint[]; inbox: Pull[]; draft: Draft | null; push_key: string | null; push_registered: boolean;
  auto_plan: boolean;
  setup: { needed: boolean; code_required: boolean }; webhook: boolean;
  board: Board | null; invite_code: string | null; log: { id: number; at: string; message: string }[];
};
export type Mutate = (action: () => Promise<unknown>, success?: string) => Promise<boolean>;

const root = '/api/v1/planning';
function write<T = void>(path: string, method: string, data?: unknown) {
  return request<T>(root + path, {
    method, headers: { 'X-Planning-Request': '1' }, body: data === undefined ? undefined : JSON.stringify(data),
  });
}

export const planning = {
  login: root + '/auth/github',
  discover: root + '/auth/github?intent=repos',
  state: () => request<PlanningState>(root + '/state', { cache: 'no-store' }),
  demo: () => write('/auth/demo', 'POST'),
  setupStart: (setup_code: string, organization: string) => write<{ action: string; manifest: string }>('/setup/start', 'POST', {
    setup_code: setup_code || undefined, organization: organization || undefined,
  }),
  logout: () => write('/auth/logout', 'POST'),
  roster: (members: MemberInput[]) => write('/members', 'PUT', { members }),
  join: (code: string, profile: JoinProfile) => write('/join', 'POST', { code, ...profile }),
  invite: () => write('/invite', 'POST'),
  inviteOff: () => write('/invite', 'DELETE'),
  removeMember: (githubId: string) => write('/members/' + encodeURIComponent(githubId), 'DELETE'),
  chooseRepo: (repo_id: string, repo_version: number, reset_confirmed: boolean) =>
    write('/repo', 'PUT', { repo_id, repo_version, reset_confirmed }),
  refreshRepo: (repo_version: number) => write<{ count: number }>('/repo/refresh', 'POST', { repo_version }),
  draft: (brief: Brief, repo_version: number) => write<Draft>('/draft', 'POST', { brief, repo_version }),
  discardDraft: (draft_id: string, repo_version: number) => write('/draft', 'DELETE', { draft_id, repo_version }),
  apply: (draft_id: string, plan: Plan, repo_version: number) => write('/apply', 'POST', { draft_id, plan, repo_version }),
  task: (id: number, task: TaskInput, repo_version: number) => write('/tasks/' + id, 'PATCH', { task, repo_version }),
  startTask: (id: number, repo_version: number) => write<{ url: string }>('/tasks/' + id + '/pr', 'POST', { repo_version }),
  repoAccess: () => request<RepoAccessInfo>(root + '/repo/access', { cache: 'no-store' }),
  removeTask: (id: number, repo_version: number) => write('/tasks/' + id, 'DELETE', { repo_version }),
  link: (number: number, task_id: number | null, repo_version: number) =>
    write('/pulls/' + number + '/link', 'PUT', { task_id, repo_version }),
  simulate: (number: number, title: string, author_id: string, state: PullState, repo_version: number) =>
    write('/demo/pull', 'POST', { number, title, author_id, state, repo_version }),
};

const shortDate = new Intl.DateTimeFormat('vi-VN', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
});
const VN_OFFSET = 7 * 60 * 60 * 1000;
export const today = () => new Date(Date.now() + VN_OFFSET).toISOString().slice(0, 10);
export const day = (value: string) => shortDate.format(new Date(value + 'T00:00:00+07:00'));
export const time = (value: string) => dateTime.format(new Date(value));
export const after = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

export function localDateTime(value: string) {
  return value ? new Date(new Date(value).getTime() + VN_OFFSET).toISOString().slice(0, 16) : '';
}

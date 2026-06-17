// Demo data used as a fallback until the broker exposes the matching endpoints.
// Shapes mirror the reference mission-control backend (skills_marketplace / boards / tasks).

export const DEMO_SKILLS = [
  {
    id: 'deep-research', name: 'Deep Research', category: 'Research',
    summary: 'Fan-out web search, fetch sources, adversarially verify, synthesize a cited report.',
    tags: ['web', 'research', 'citations'], author: 'Cognio', installs: 1284, rating: 4.8,
    status: 'available', sourceUrl: 'https://github.com/Cognio-so/skills/tree/main/deep-research',
  },
  {
    id: 'seo-content-sprint', name: 'SEO Content Sprint', category: 'Marketing',
    summary: 'Keyword clustering, brief generation, and draft scoring for a full content sprint.',
    tags: ['seo', 'content', 'marketing'], author: 'algohype', installs: 642, rating: 4.6,
    status: 'installed', sourceUrl: 'https://github.com/algohype/skills/tree/main/seo-sprint',
  },
  {
    id: 'competitor-intel', name: 'Competitor Intel', category: 'Research',
    summary: 'Continuously monitor competitors and brief the team on positioning shifts.',
    tags: ['intel', 'monitoring'], author: 'Cognio', installs: 489, rating: 4.5,
    status: 'available', sourceUrl: 'https://github.com/Cognio-so/skills/tree/main/competitor-intel',
  },
  {
    id: 'pr-reviewer', name: 'PR Reviewer', category: 'Engineering',
    summary: 'Review diffs for correctness bugs and reuse/simplification cleanups with adversarial verification.',
    tags: ['code', 'review', 'github'], author: 'Cognio', installs: 2310, rating: 4.9,
    status: 'available', sourceUrl: 'https://github.com/Cognio-so/skills/tree/main/pr-reviewer',
  },
  {
    id: 'data-extractor', name: 'Data Extractor', category: 'Data',
    summary: 'Extract structured records from messy documents into typed JSON with schema validation.',
    tags: ['data', 'etl', 'json'], author: 'community', installs: 877, rating: 4.4,
    status: 'available', sourceUrl: 'https://github.com/community/skills/tree/main/data-extractor',
  },
  {
    id: 'social-composer', name: 'Social Composer', category: 'Marketing',
    summary: 'Turn a brief into platform-tuned posts with hooks, threads, and scheduling suggestions.',
    tags: ['social', 'content'], author: 'algohype', installs: 530, rating: 4.3,
    status: 'installed', sourceUrl: 'https://github.com/algohype/skills/tree/main/social-composer',
  },
]

export const DEMO_PACKS = [
  {
    id: 'cognio-core', name: 'Cognio Core', packLabel: 'cognio/skills',
    description: 'The official starter pack for research, review, and data skills maintained by the Cognio team.',
    sourceUrl: 'https://github.com/Cognio-so/skills', skillCount: 12, status: 'published',
  },
  {
    id: 'algohype-growth', name: 'AlgoHype Growth', packLabel: 'algohype/skills',
    description: 'Marketing and growth skills: SEO sprints, social composition, and competitor intel.',
    sourceUrl: 'https://github.com/algohype/skills', skillCount: 7, status: 'published',
  },
  {
    id: 'community-data', name: 'Community Data', packLabel: 'community/skills',
    description: 'Community-contributed data engineering and extraction skills.',
    sourceUrl: 'https://github.com/community/skills', skillCount: 9, status: 'draft',
  },
]

export const DEMO_BOARDS = [
  {
    id: 'launch-q3', name: 'Q3 Product Launch', group: 'Marketing',
    description: 'Coordinate research, content, and GTM for the Q3 launch.',
    counts: { inbox: 3, in_progress: 2, review: 1, done: 4 },
  },
  {
    id: 'growth-engine', name: 'Growth Engine', group: 'Marketing',
    description: 'Always-on SEO + social content pipeline.',
    counts: { inbox: 2, in_progress: 3, review: 2, done: 8 },
  },
  {
    id: 'platform', name: 'Platform Hardening', group: 'Engineering',
    description: 'Reliability, security review, and infra work.',
    counts: { inbox: 5, in_progress: 1, review: 1, done: 6 },
  },
]

export const DEMO_TASKS = {
  'launch-q3': [
    { id: 't1', title: 'Competitive landscape research', status: 'inbox', priority: 'high', assignee: 'Research', tags: [{ id: 'a', name: 'research', color: '2563eb' }] },
    { id: 't2', title: 'Draft launch announcement blog', status: 'inbox', priority: 'medium', assignee: 'Writer', tags: [{ id: 'b', name: 'content', color: '16a34a' }] },
    { id: 't3', title: 'Pricing page copy', status: 'inbox', priority: 'low', assignee: 'Writer' },
    { id: 't4', title: 'SEO keyword plan', status: 'in_progress', priority: 'high', assignee: 'SEO', tags: [{ id: 'c', name: 'seo', color: 'd97706' }] },
    { id: 't5', title: 'Demo video script', status: 'in_progress', priority: 'medium', assignee: 'Writer' },
    { id: 't6', title: 'Launch email sequence', status: 'review', priority: 'high', assignee: 'Marketing', approvalsPendingCount: 1 },
    { id: 't7', title: 'Logo + hero assets', status: 'done', priority: 'medium', assignee: 'Design' },
    { id: 't8', title: 'Audience segmentation', status: 'done', priority: 'low', assignee: 'Data' },
    { id: 't9', title: 'Landing page wireframe', status: 'done', priority: 'medium', assignee: 'Design' },
    { id: 't10', title: 'Press list', status: 'done', priority: 'low', assignee: 'Marketing' },
  ],
  'growth-engine': [
    { id: 'g1', title: 'Topic cluster: agent frameworks', status: 'inbox', priority: 'high', assignee: 'SEO' },
    { id: 'g2', title: 'Repurpose webinar into thread', status: 'in_progress', priority: 'medium', assignee: 'Social', isBlocked: true, blockedByCount: 1 },
    { id: 'g3', title: 'Weekly performance digest', status: 'review', priority: 'low', assignee: 'Data', approvalsPendingCount: 2 },
  ],
  platform: [
    { id: 'p1', title: 'Rate-limit the gateway RPC', status: 'inbox', priority: 'high', assignee: 'Eng' },
    { id: 'p2', title: 'Security review of auth refresh', status: 'in_progress', priority: 'high', assignee: 'Security' },
    { id: 'p3', title: 'Add health probe alerting', status: 'review', priority: 'medium', assignee: 'Ops' },
  ],
}

export const DEMO_CRON = [
  {
    id: 'daily-seo',
    name: 'Daily SEO audit',
    schedule: '0 9 * * *',
    timezone: 'Asia/Kolkata',
    agent: 'SEO Analyst',
    status: 'active',
    nextRun: 'Tomorrow 09:00',
    lastRun: 'Today 09:00',
    runCount: 42,
    successCount: 39,
    failureCount: 3,
    runs: [
      {
        id: 'run_daily_42',
        status: 'success',
        startedAt: 'Today 09:00',
        finishedAt: 'Today 09:03',
        durationMs: 182000,
        output: 'Checked 128 pages, found 7 stale titles, 3 missing meta descriptions, and 12 internal-link opportunities.',
      },
      { id: 'run_daily_41', status: 'success', startedAt: 'Yesterday 09:00', durationMs: 171000 },
      { id: 'run_daily_40', status: 'failed', startedAt: 'Jun 15, 09:00', durationMs: 42000, error: 'Search provider timeout.' },
    ],
  },
  {
    id: 'weekly-digest',
    name: 'Weekly performance digest',
    schedule: '0 8 * * 1',
    timezone: 'Asia/Kolkata',
    agent: 'Main',
    status: 'paused',
    nextRun: '-',
    lastRun: 'Mon 08:00',
    runCount: 11,
    successCount: 11,
    failureCount: 0,
    lastStatus: 'success',
    durationMs: 241000,
    lastOutput: 'Prepared weekly digest with traffic, ranking movement, lead quality, and pending content tasks.',
  },
]

export const DEMO_GATEWAYS = [
  { id: 'local-broker', name: 'Local VPS Broker', url: '/api', connected: true, scopes: ['operator.read', 'operator.write'] },
]

export const BOARD_COLUMNS = [
  { key: 'inbox', label: 'Inbox', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' },
  { key: 'in_progress', label: 'In Progress', dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
  { key: 'review', label: 'Review', dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700' },
  { key: 'done', label: 'Done', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
]

// Fallback board agents (used only if no real broker agents are loaded).
export const DEMO_BOARD_AGENTS = [
  { id: 'lead', name: 'Lead Agent', role: 'Board lead', status: 'online' },
  { id: 'backend', name: 'Backend Engineer', role: 'Generalist', status: 'busy' },
  { id: 'docs-qa', name: 'Docs+Frontend QA', role: 'Generalist', status: 'online' },
]

export const DEMO_BOARD_CHAT = [
  {
    id: 'm1', source: 'Lead Agent', role: 'Board lead', created_at: 'Feb 15, 01:12 AM',
    content:
      '@Abhimanyu - approval raised for **2f2fc011**.\n\n- Approval ID: 87bf...c0f (action_type=review_task, status=pending)\n- PR: mission-control/pull/126 is already MERGED to main.\n\nOnce you approve, I will proceed directly to marking the task done.',
  },
  {
    id: 'm2', source: 'Backend Engineer', role: 'Generalist', created_at: 'Feb 15, 01:14 AM',
    content:
      '@lead added the approval-accelerator details to 2f2fc011 task comments. Includes: PR link + CI success summary, before/after repro steps, and an example 409 response payload.',
  },
]

export const DEMO_FEED = [
  {
    id: 'f1', event_type: 'task.comment', author: 'Backend Engineer', role: 'Generated',
    title: 'mission-control PR #136: ci(policy): enforce one DB migration per PR',
    created_at: 'Feb 15, 01:16 AM',
    message: 'Update: Picked up the #136 webhook triage. Next: adjust scripts/ci/one_migration_per_pr.sh to count only added migration files (per Copilot review comment).',
  },
  {
    id: 'f2', event_type: 'task.status_changed', author: 'Lead Agent', role: 'Board lead',
    title: 'Fix blocked task transition — should return 409', created_at: 'Feb 15, 01:09 AM',
    message: 'Moved to Review · waiting for lead review.',
  },
  {
    id: 'f3', event_type: 'agent.online', author: 'Docs+Frontend QA', role: 'Generalist',
    title: 'Docs+Frontend QA came online', created_at: 'Feb 15, 01:02 AM', message: null,
  },
]

// event_type -> { label, pill classes } for the live feed badges.
export const FEED_EVENTS = {
  'task.comment': { label: 'Comment', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  'task.created': { label: 'Created', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  'task.status_changed': { label: 'Status', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  'board.chat': { label: 'Chat', cls: 'border-teal-200 bg-teal-50 text-teal-700' },
  'agent.created': { label: 'Agent', cls: 'border-violet-200 bg-violet-50 text-violet-700' },
  'agent.online': { label: 'Online', cls: 'border-lime-200 bg-lime-50 text-lime-700' },
  'agent.offline': { label: 'Offline', cls: 'border-slate-300 bg-slate-100 text-slate-700' },
  'run.error': { label: 'Error', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  default: { label: 'Event', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
}

export const ORCH_ID = 'orchestrator'

export const ICONS = ['OC', 'MKT', 'SEO', 'RES', 'WRT', 'DAT', 'ENG', 'OPS', 'QA', 'SEC', 'AI', 'UX']

let _seq = 0
export const newId = (prefix = 'agent') =>
  prefix + '_' + (Date.now().toString(36) + (++_seq).toString(36)).toLowerCase()

export function slugAgentId(name) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || newId('agent')
}

export function fallbackOrchestrator() {
  return {
    id: ORCH_ID,
    name: 'Orchestrator',
    icon: 'OC',
    role: 'Plans work and delegates to managed agents',
    instructions:
      'Break the user request into steps, delegate to managed specialist agents when useful, and synthesize the final answer.',
    sessionKey: 'main',
    managedByOrchestrator: false,
    builtin: true,
    pinned: true,
    createdAt: 0,
    updatedAt: 0,
  }
}

export function normalizeAgent(agent, mainSession = 'main') {
  const base = agent && typeof agent === 'object' ? agent : {}
  const isOrch = base.id === ORCH_ID
  return {
    id: String(base.id || (isOrch ? ORCH_ID : newId())),
    name: String(base.name || (isOrch ? 'Orchestrator' : 'Untitled agent')),
    icon: String(base.icon || (isOrch ? 'OC' : 'AI')),
    role: String(base.role || (isOrch ? 'Plans work and delegates to managed agents' : 'Specialist agent')),
    instructions: String(base.instructions || ''),
    sessionKey: isOrch ? mainSession : String(base.sessionKey || ('agent_' + base.id)),
    managedByOrchestrator: isOrch ? false : base.managedByOrchestrator !== false,
    builtin: isOrch ? true : !!base.builtin,
    pinned: isOrch ? true : !!base.pinned,
    // live presence reported by the broker, if any (online | busy | offline | …)
    status: base.status ? String(base.status) : (base.presence ? String(base.presence) : null),
    skills: Array.isArray(base.skills) ? base.skills : [],
    tools: Array.isArray(base.tools) ? base.tools : [],
    createdAt: base.createdAt || Date.now(),
    updatedAt: base.updatedAt || base.createdAt || Date.now(),
  }
}

export function normalizeAgents(list, mainSession = 'main') {
  const input = Array.isArray(list) ? list : []
  const normalized = input.map(agent => normalizeAgent(agent, mainSession))
  const orch = normalized.find(a => a.id === ORCH_ID) || fallbackOrchestrator()
  const rest = normalized
    .filter(a => a.id !== ORCH_ID)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  return [{ ...fallbackOrchestrator(), ...orch, sessionKey: mainSession }, ...rest]
}

export function sessionKeyFor(agent, mainSession = 'main') {
  if (!agent) return mainSession
  if (agent.id === ORCH_ID) return mainSession
  return agent.sessionKey || ('agent_' + agent.id)
}

export function buildSessionMap(agents, mainSession = 'main') {
  const map = {}
  for (const a of agents) {
    const key = sessionKeyFor(a, mainSession)
    map[normalizeSession(key)] = a.id
  }
  return map
}

export function normalizeSession(key) {
  if (!key) return ''
  let k = String(key).trim()
  const parts = k.split(':')
  if (parts.length >= 2 && parts[0] === 'agent') k = parts[parts.length - 1]
  return k.toLowerCase()
}

export function resolveAgentId(sessionMap, sessionKey) {
  return sessionMap[normalizeSession(sessionKey)] || null
}

export function newAgentTemplate() {
  return {
    id: '',
    name: '',
    icon: 'AI',
    role: '',
    instructions: '',
    sessionKey: '',
    skills: [],
    tools: [],
    managedByOrchestrator: true,
    builtin: false,
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

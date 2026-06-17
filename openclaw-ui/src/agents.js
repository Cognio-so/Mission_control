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
  const orchLike = isOrch || base.kind === 'orchestrator'
  return {
    id: String(base.id || (isOrch ? ORCH_ID : newId())),
    name: String(base.name || (isOrch ? 'Orchestrator' : 'Untitled agent')),
    icon: String(base.icon || (isOrch ? 'OC' : 'AI')),
    role: String(base.role || (isOrch ? 'Plans work and delegates to managed agents' : 'Specialist agent')),
    instructions: String(base.instructions || ''),
    // Each specialist gets its OWN session — never share the orchestrator's `main`.
    sessionKey: isOrch
      ? mainSession
      : orchLike
        ? String(base.sessionKey || mainSession)
        : base.sessionKey && base.sessionKey !== mainSession
          ? String(base.sessionKey)
          : 'agent_' + base.id,
    managedByOrchestrator: isOrch ? false : base.managedByOrchestrator !== false,
    builtin: isOrch ? true : !!base.builtin,
    pinned: isOrch ? true : !!base.pinned,
    // live presence reported by the broker, if any (online | busy | offline | …)
    status: base.status ? String(base.status) : (base.presence ? String(base.presence) : null),
    skills: Array.isArray(base.skills) ? base.skills : [],
    tools: Array.isArray(base.tools) ? base.tools : [],
    // team / hierarchy (from the broker: kind = orchestrator|specialist, team, parentId)
    kind: isOrch ? 'orchestrator' : (base.kind === 'orchestrator' ? 'orchestrator' : 'specialist'),
    team: base.team ? String(base.team) : (isOrch ? String(base.team || base.name || 'Main') : ''),
    parentId: base.parentId || null,
    createdAt: base.createdAt || Date.now(),
    updatedAt: base.updatedAt || base.createdAt || Date.now(),
  }
}

// Group a flat agent list into teams: each orchestrator + the specialists under it.
// Specialists with no team/parent fall under the primary (built-in) Orchestrator.
export function buildTeams(agents) {
  const list = Array.isArray(agents) ? agents : []
  const orchestrators = list.filter((a) => a.kind === 'orchestrator')
  const claimed = new Set()
  const isUnder = (a, o) =>
    a.parentId === o.id || (!!a.team && !!o.team && a.team === o.team)
  const teams = orchestrators.map((o) => {
    claimed.add(o.id)
    let members = list.filter((a) => a.kind !== 'orchestrator' && isUnder(a, o))
    members.forEach((m) => claimed.add(m.id))
    return { id: o.id, name: o.team || o.name, orchestrator: o, members }
  })
  // any specialist not claimed by a team → attach to the primary Orchestrator
  const orphans = list.filter((a) => a.kind !== 'orchestrator' && !claimed.has(a.id))
  if (orphans.length) {
    const primary = teams.find((t) => t.orchestrator.id === ORCH_ID) || teams[0]
    if (primary) { primary.members = primary.members.concat(orphans); orphans.forEach((o) => claimed.add(o.id)) }
  }
  return teams
}

export function normalizeAgents(list, mainSession = 'main') {
  const input = Array.isArray(list) ? list : []
  let normalized = input.map((agent) => normalizeAgent(agent, mainSession))

  // The broker may register its primary orchestrator under a generated id (agt_…),
  // but the UI's chat convention is id `orchestrator` + session `main`. Alias the
  // primary orchestrator to that convention (and repoint its specialists) so the
  // tree groups correctly AND chat routing stays on `main`. Secondary orchestrators
  // (e.g. a Marketing team) keep their real ids.
  const primary =
    normalized.find((a) => a.id === ORCH_ID) ||
    normalized.find((a) => a.kind === 'orchestrator' && a.sessionKey === mainSession) ||
    normalized.find((a) => a.kind === 'orchestrator')
  if (primary && primary.id !== ORCH_ID) {
    const realId = primary.id
    normalized = normalized.map((a) => {
      if (a.id === realId) return { ...a, id: ORCH_ID, kind: 'orchestrator', sessionKey: mainSession, team: a.team || a.name || 'Main', parentId: null }
      if (a.parentId === realId) return { ...a, parentId: ORCH_ID }
      return a
    })
  }
  if (!normalized.some((a) => a.id === ORCH_ID)) normalized = [fallbackOrchestrator(), ...normalized]

  const orch = normalized.find((a) => a.id === ORCH_ID)
  const rest = normalized
    .filter((a) => a.id !== ORCH_ID)
    .sort((a, b) => {
      const ao = a.kind === 'orchestrator', bo = b.kind === 'orchestrator'
      if (ao !== bo) return ao ? -1 : 1
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

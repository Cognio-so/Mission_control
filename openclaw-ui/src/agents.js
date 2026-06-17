export const ORCH_ID = 'main'

export const ICONS = ['CG', 'OC', 'MKT', 'SEO', 'RES', 'WRT', 'DAT', 'ENG', 'OPS', 'QA', 'SEC', 'AI', 'UX']

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
    name: 'Main',
    icon: 'CG',
    role: 'Central controller with access to every team and agent',
    instructions:
      'Understand the user request, coordinate with the right teams and agents, and synthesize the final answer.',
    sessionKey: 'main',
    managedByOrchestrator: false,
    builtin: true,
    pinned: true,
    kind: 'main',
    team: 'Main',
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

export function normalizeAgent(agent, mainSession = 'main') {
  const base = agent && typeof agent === 'object' ? agent : {}
  const isMain = base.id === ORCH_ID || base.kind === 'main'
  const isLead = base.kind === 'orchestrator'
  const id = String(base.id || (isMain ? ORCH_ID : newId()))
  const kind = isMain ? 'main' : isLead ? 'orchestrator' : 'specialist'

  return {
    id,
    name: String(base.name || (isMain ? 'Main' : isLead ? 'Team lead' : 'Untitled agent')),
    icon: String(base.icon || (isMain ? 'CG' : isLead ? 'OC' : 'AI')),
    role: String(base.role || (isMain ? 'Central controller with access to every team and agent' : isLead ? 'Team lead' : 'Specialist agent')),
    instructions: String(base.instructions || ''),
    sessionKey: isMain
      ? mainSession
      : base.sessionKey && base.sessionKey !== mainSession
        ? String(base.sessionKey)
        : 'agent_' + id,
    managedByOrchestrator: kind === 'specialist' ? base.managedByOrchestrator !== false : false,
    builtin: isMain ? true : !!base.builtin,
    pinned: isMain ? true : !!base.pinned,
    status: base.status ? String(base.status) : (base.presence ? String(base.presence) : null),
    skills: Array.isArray(base.skills) ? base.skills : [],
    tools: Array.isArray(base.tools) ? base.tools : [],
    kind,
    team: base.team ? String(base.team) : (isMain ? 'Main' : isLead ? String(base.name || 'Team') : ''),
    parentId: base.parentId || base.parent_id || null,
    createdAt: base.createdAt || base.created_at || Date.now(),
    updatedAt: base.updatedAt || base.updated_at || base.createdAt || base.created_at || Date.now(),
  }
}

export function buildTeams(agents) {
  const list = (Array.isArray(agents) ? agents : []).filter((a) => a.id !== ORCH_ID)
  const orchestrators = list.filter((a) => a.kind === 'orchestrator')
  const claimed = new Set()
  const isUnder = (a, o) =>
    a.parentId === o.id || (!!a.team && !!o.team && a.team === o.team)
  const teams = orchestrators.map((o) => {
    claimed.add(o.id)
    const members = list.filter((a) => a.kind !== 'orchestrator' && isUnder(a, o))
    members.forEach((m) => claimed.add(m.id))
    return { id: o.id, name: o.team || o.name, team: o.team || o.name, orchestrator: o, members }
  })

  const orphans = list.filter((a) => a.kind !== 'orchestrator' && !claimed.has(a.id))
  if (orphans.length) {
    const primary = teams[0]
    if (primary) {
      primary.members = primary.members.concat(orphans)
      orphans.forEach((o) => claimed.add(o.id))
    }
  }
  return teams
}

export function normalizeTeamResponse(data, mainSession = 'main') {
  const teamsIn = Array.isArray(data?.teams) ? data.teams : []
  const teams = teamsIn
    .map((team, index) => {
      const orchestrator = team.orchestrator ? normalizeAgent({ ...team.orchestrator, kind: 'orchestrator', team: team.team || team.orchestrator.team }, mainSession) : null
      if (!orchestrator) return null
      const name = String(team.team || team.name || orchestrator.team || orchestrator.name || `Team ${index + 1}`)
      const members = (Array.isArray(team.members) ? team.members : []).map((member) =>
        normalizeAgent({ ...member, kind: member.kind || 'specialist', parentId: member.parentId || member.parent_id || orchestrator.id, team: member.team || name }, mainSession),
      )
      return { id: orchestrator.id, name, team: name, orchestrator: { ...orchestrator, team: name }, members }
    })
    .filter(Boolean)

  const ungrouped = (Array.isArray(data?.ungrouped) ? data.ungrouped : []).map((agent) => normalizeAgent(agent, mainSession))
  return { teams, ungrouped }
}

export function flattenTeams(teamTree) {
  if (!teamTree) return []
  const out = []
  for (const team of teamTree.teams || []) {
    if (team.orchestrator) out.push(team.orchestrator)
    out.push(...(team.members || []))
  }
  out.push(...(teamTree.ungrouped || []))
  const seen = new Set()
  return out.filter((agent) => {
    if (!agent?.id || seen.has(agent.id)) return false
    seen.add(agent.id)
    return true
  })
}

export function normalizeAgents(list, mainSession = 'main') {
  const input = Array.isArray(list) ? list : []
  const normalized = input
    .filter((agent) => agent?.id !== ORCH_ID && agent?.kind !== 'main')
    .map((agent) => normalizeAgent(agent, mainSession))
    .sort((a, b) => {
      const ao = a.kind === 'orchestrator', bo = b.kind === 'orchestrator'
      if (ao !== bo) return ao ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  return [{ ...fallbackOrchestrator(), sessionKey: mainSession }, ...normalized]
}

export function formatSessionKey(agentId = ORCH_ID, threadId = 'main') {
  const id = String(agentId || ORCH_ID)
  const thread = String(threadId || 'main')
  if (thread.startsWith('agent:')) return thread
  return `agent:${id}:${thread}`
}

function threadIdFromLegacyKey(agentId, key, mainSession = 'main') {
  const value = String(key || '').trim()
  if (!value) return agentId === ORCH_ID ? mainSession : 'agent_' + agentId
  if (value.startsWith('agent:')) {
    const parts = value.split(':')
    return parts.slice(2).join(':') || mainSession
  }
  return value
}

export function sessionKeyFor(agent, mainSession = 'main') {
  const id = agent?.id === ORCH_ID || agent?.kind === 'main' || !agent ? ORCH_ID : String(agent.id)
  const raw = id === ORCH_ID ? mainSession : (agent?.sessionKey && agent.sessionKey !== mainSession ? agent.sessionKey : 'agent_' + id)
  if (String(raw || '').startsWith('agent:')) return String(raw)
  return formatSessionKey(id, threadIdFromLegacyKey(id, raw, mainSession))
}

export function buildSessionMap(agents, mainSession = 'main') {
  const map = {}
  for (const a of agents) {
    const key = sessionKeyFor(a, mainSession)
    map[normalizeSession(key)] = a.id
    map[String(key).toLowerCase()] = a.id
  }
  const mainKey = sessionKeyFor({ id: ORCH_ID, kind: 'main' }, mainSession)
  map[normalizeSession(mainSession)] = ORCH_ID
  map[String(mainSession).toLowerCase()] = ORCH_ID
  map[normalizeSession(mainKey)] = ORCH_ID
  map[String(mainKey).toLowerCase()] = ORCH_ID
  return map
}

export function normalizeSession(key) {
  if (!key) return ''
  let k = String(key).trim()
  const parts = k.split(':')
  if (parts.length >= 3 && parts[0] === 'agent') k = parts.slice(2).join(':')
  return k.toLowerCase()
}

export function resolveAgentId(sessionMap, sessionKey) {
  return sessionMap[normalizeSession(sessionKey)] || null
}

export function newAgentTemplate(overrides = {}) {
  return {
    id: '',
    name: '',
    icon: 'AI',
    role: '',
    instructions: '',
    sessionKey: '',
    skills: [],
    tools: [],
    kind: 'specialist',
    team: '',
    parentId: null,
    managedByOrchestrator: true,
    builtin: false,
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

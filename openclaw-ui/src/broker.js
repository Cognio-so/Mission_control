function textOf(m) {
  if (m == null) return ''
  if (typeof m === 'string') return m
  if (Array.isArray(m)) return m.map(textOf).filter(Boolean).join('')
  if (typeof m === 'object') {
    if (typeof m.text === 'string') return m.text
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) {
      return m.content.map(c => (typeof c === 'string' ? c : (c && c.text) || '')).join('')
    }
  }
  return ''
}

function shortJson(v) {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    return s.length > 600 ? s.slice(0, 600) + '...' : s
  } catch {
    return String(v)
  }
}

function subBadge(s) {
  const v = String(s || '').toLowerCase()
  if (!v) return ''
  if (/(done|complete|completed|delivered|finished|success|succeeded)/.test(v)) return 'done'
  // Only real failure words — NOT "closed"/"stuck"/"stalled", which are normal
  // substream-lifecycle terms and were falsely flagging working agents as errored.
  if (/(error|fail|timeout|abort|crash|exception|fatal)/.test(v)) return 'error'
  if (/(run|active|stream|progress|working|started|thinking|spawn|delegat)/.test(v)) return 'running'
  if (/(queue|pending|created|idle|ready|waiting)/.test(v)) return 'queued'
  return ''
}

function words(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value) {
  const v = words(value)
  return v ? v.replace(/\b\w/g, c => c.toUpperCase()) : ''
}

function cleanDetail(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(cleanDetail).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    if (typeof value.progressText === 'string') return value.progressText.trim()
    if (typeof value.message === 'string') return value.message.trim()
    if (typeof value.text === 'string') return value.text.trim()
    if (typeof value.content === 'string') return value.content.trim()
    if (typeof value.query === 'string') return value.query.trim()
    if (typeof value.url === 'string') return value.url.trim()
    if (typeof value.path === 'string') return value.path.trim()
    if (typeof value.command === 'string') return value.command.trim()
    if (typeof value.prompt === 'string') return value.prompt.trim()
    if (typeof value.title === 'string' && value.title.toLowerCase() !== 'preamble') return value.title.trim()
  }
  return ''
}

function findPublicDetail(value, depth = 0) {
  if (!value || depth > 4) return ''
  if (typeof value !== 'object') return ''
  const direct = cleanDetail(value)
  if (direct) return direct
  const keys = ['query', 'q', 'url', 'href', 'path', 'file', 'command', 'prompt', 'message', 'text', 'input', 'args', 'parameters']
  for (const key of keys) {
    const found = cleanDetail(value[key])
    if (found) return found
  }
  for (const key of Object.keys(value)) {
    const child = value[key]
    if (!child || typeof child !== 'object') continue
    const found = findPublicDetail(child, depth + 1)
    if (found) return found
  }
  return ''
}

function publicDetailFromPayload(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
  return (
    cleanDetail(data.progressText) ||
    cleanDetail(data.deltaText) ||
    cleanDetail(data.message) ||
    cleanDetail(data.text) ||
    cleanDetail(data.title && data.title.toLowerCase() !== 'preamble' ? data.title : '') ||
    cleanDetail(payload?.message) ||
    findPublicDetail(data.args || data.input || data.parameters || payload?.args || payload?.input || payload?.parameters || payload)
  )
}

function opSessionKey(payload) {
  const d = payload?.data || {}
  return d.sessionKey || payload.sessionKey || payload.brokerSessionKey || ''
}

function normalizeOperationPayload(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
  const stream = String(payload?.stream || payload?.event || payload?.type || '').trim()
  const phase = String(data.phase || payload?.phase || payload?.status || '').trim()
  const rawKind = String(data.kind || payload?.kind || payload?.type || payload?.operation || '').trim()
  const detail = publicDetailFromPayload(payload)

  if (payload?.isHeartbeat) return null
  const lifecycle = /lifecycle/i.test(stream)
  const noisyLifecycle = new Set(['thread_ready', 'turn_starting', 'startup', 'start', 'started', 'completed', 'end', 'done'])
  if (!detail && lifecycle && noisyLifecycle.has(phase.toLowerCase())) return null
  if (!detail && !data.tool && !data.toolName && noisyLifecycle.has(phase.toLowerCase())) return null

  let kind = 'operation'
  const hay = stream + ' ' + rawKind + ' ' + phase + ' ' + detail
  if (detail && !data.tool && !data.toolName && /hook|lifecycle|userMessage/i.test(stream + ' ' + rawKind)) kind = 'agent'
  else if (/skill/i.test(hay)) kind = 'skill'
  else if (/plugin/i.test(hay)) kind = 'plugin'
  else if (/tool|pretool|posttool|command|shell/i.test(hay)) kind = 'tool'
  if (!detail && kind !== 'tool' && kind !== 'skill' && kind !== 'plugin' && !payload?.name) return null

  const label =
    cleanDetail(data.tool || data.toolName || payload?.tool || payload?.name) ||
    (phase && !noisyLifecycle.has(phase.toLowerCase()) ? titleCase(phase) : '') ||
    cleanDetail(data.title && data.title.toLowerCase() !== 'preamble' ? data.title : '') ||
    (kind === 'tool' ? 'Tool activity' : 'Agent activity')

  return {
    kind,
    label,
    detail,
    phase,
    stream,
    sessionKey: opSessionKey(payload),
    status: /error|failed|aborted/i.test(phase) ? 'error' : /complete|done|end/i.test(phase) ? 'done' : 'running',
  }
}

function trim(u) {
  return (u || '').trim().replace(/\/+$/, '')
}

function authHeaders(secret, json = false) {
  const h = {}
  if (json) h['Content-Type'] = 'application/json'
  if (secret) h.Authorization = 'Bearer ' + secret
  return h
}

function unwrapAgents(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.agents)) return data.agents
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data?.agents)) return data.data.agents
  if (Array.isArray(data?.data?.items)) return data.data.items
  return []
}

function unwrapTeams(data) {
  if (Array.isArray(data?.teams)) return data
  if (Array.isArray(data?.data?.teams)) return data.data
  return { teams: [], ungrouped: [] }
}

function notifyUnauthorized(response) {
  if (response?.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('cognio-auth-change'))
  }
}

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.ok === false) {
    notifyUnauthorized(response)
    throw new Error(data?.error || data?.message || ('HTTP ' + response.status + ' ' + response.statusText))
  }
  return data
}

export function brokerHost(u) {
  try { return new URL(u).host } catch { return u }
}

export async function fetchBrokerAgents({ base, secret }) {
  const response = await fetch(trim(base) + '/agents', {
    headers: authHeaders(secret),
    credentials: 'include',
    cache: 'no-store',
  })
  return unwrapAgents(await readJsonResponse(response))
}

export async function fetchBrokerTeams({ base, secret }) {
  const response = await fetch(trim(base) + '/teams', {
    headers: authHeaders(secret),
    credentials: 'include',
    cache: 'no-store',
  })
  return unwrapTeams(await readJsonResponse(response))
}

export async function createBrokerAgent({ base, secret }, agent) {
  const response = await fetch(trim(base) + '/agents', {
    method: 'POST',
    headers: authHeaders(secret, true),
    credentials: 'include',
    body: JSON.stringify(agent),
  })
  const data = await readJsonResponse(response)
  return data.agent || data.item || data.data || data
}

export async function updateBrokerAgent({ base, secret }, id, patch) {
  const response = await fetch(trim(base) + '/agents/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: authHeaders(secret, true),
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  const data = await readJsonResponse(response)
  return data.agent || data.item || data.data || data
}

export async function deleteBrokerAgent({ base, secret }, id) {
  const response = await fetch(trim(base) + '/agents/' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: authHeaders(secret),
    credentials: 'include',
  })
  return readJsonResponse(response)
}

export class BrokerClient {
  constructor(cfg, dispatch) {
    this.cfg = cfg
    this.d = dispatch
    this.es = null
    this.connected = false
    this.pendingAgent = cfg.orchId || 'main'
    this.streamSessionKey = null
  }

  setResolver(fn) { this.cfg.resolveAgent = fn }
  raw(kind, line) { this.d({ type: 'raw', kind, line }) }
  status(s) { this.d({ type: 'conn', status: s }) }

  who(sessionKey) {
    const r = this.cfg.resolveAgent && this.cfg.resolveAgent(sessionKey)
    return r || this.pendingAgent
  }

  async connect(sessionKey = this.cfg.session || 'main') {
    this.close(true)
    const base = trim(this.cfg.base)
    if (!base) {
      this.status('off')
      return
    }

    this.status('connecting')
    this.raw('sys', 'broker ' + base + ' / checking /health')
    try {
      const r = await fetch(base + '/health', { credentials: 'include', cache: 'no-store' })
      notifyUnauthorized(r)
      const h = await r.json()
      const g = h.gateway || {}
      this.raw('sys', 'health: gateway ' + (g.connected ? 'connected' : 'down') + ' / scopes=' + JSON.stringify(g.scopes || []) + ' / server ' + (g.serverVersion || '?'))
    } catch (e) {
      this.raw('err', '/health failed: ' + e.message)
    }

    const params = new URLSearchParams()
    if (sessionKey) params.set('sessionKey', sessionKey)
    if (this.cfg.secret) params.set('token', this.cfg.secret)
    const url = base + '/stream' + (params.toString() ? '?' + params.toString() : '')
    let es
    try {
      es = new EventSource(url, { withCredentials: true })
    } catch (err) {
      this.raw('err', 'EventSource failed: ' + err.message)
      this.status('off')
      return
    }

    this.es = es
    this.streamSessionKey = sessionKey
    es.onopen = () => {
      this.connected = true
      this.status('live')
      this.raw('sys', 'SSE stream open')
    }
    es.onerror = () => {
      this.raw('err', 'SSE error or closed')
      this.connected = false
      this.status('off')
    }
    es.addEventListener('ready', e => {
      this.connected = true
      this.status('live')
      this.raw('sys', 'stream ready ' + (e.data || ''))
    })
    es.addEventListener('chat', e => {
      this.raw('in', '< chat ' + String(e.data).slice(0, 300))
      this.onChat(e.data)
    })
    es.addEventListener('tool', e => {
      this.raw('in', '< tool ' + String(e.data).slice(0, 300))
      this.onTool(e.data)
    })
    es.addEventListener('session.tool', e => {
      this.raw('in', '< session.tool ' + String(e.data).slice(0, 300))
      this.onTool(e.data)
    })
    es.addEventListener('session.operation', e => {
      this.raw('in', '< session.operation ' + String(e.data).slice(0, 300))
      this.onOperation(e.data)
    })
    es.addEventListener('agent', e => {
      this.raw('in', '< agent ' + String(e.data).slice(0, 300))
      this.onOperation(e.data)
    })
    es.addEventListener('subagent', e => {
      this.raw('in', '< subagent ' + String(e.data).slice(0, 300))
      this.onSubagent(e.data)
    })
    es.onmessage = e => {
      this.raw('in', '< ' + String(e.data).slice(0, 300))
      this.onChat(e.data)
    }
  }

  close(silent) {
    if (this.es) {
      this.es.onerror = null
      this.es.close()
      this.es = null
    }
    this.connected = false
    this.streamSessionKey = null
    if (!silent) this.status('off')
  }

  onChat(data) {
    let obj
    try { obj = JSON.parse(data) } catch { return }
    const p = (obj && obj.payload && typeof obj.payload === 'object') ? obj.payload : obj
    if (!p || typeof p !== 'object' || !('state' in p)) return

    // The gateway prefixes session keys (e.g. agent:main:main__x) — the broker now
    // sends a normalized `brokerSessionKey` (prefix stripped) for exact matching.
    const sk = p.brokerSessionKey || obj.brokerSessionKey || p.sessionKey

    const isChild = !!p.spawnedBy
    if (isChild) {
      const key = sk || ('child_' + (p.runId || ''))
      const parent = this.who(p.spawnedBy) || this.pendingAgent
      const name = p.displayName || p.subagentRole || undefined
      if (p.state === 'delta') {
        this.d({ type: 'sub.delta', key, parent, name, text: p.deltaText || '', replace: p.replace === true })
      } else if (p.state === 'final') {
        // Capture the subagent's final output too — many specialists send their whole
        // result as one 'final' message rather than streamed deltas; without this their
        // output was dropped and only the status survived.
        const finalText = textOf(p.message)
        if (finalText) this.d({ type: 'sub.delta', key, parent, name, text: finalText, replace: true })
        this.d({ type: 'sub.status', key, status: 'done' })
      } else if (p.state === 'error' || p.state === 'aborted') {
        const errText = textOf(p.message)
        if (errText) this.d({ type: 'sub.delta', key, parent, name, text: errText, replace: true })
        this.d({ type: 'sub.status', key, status: 'error' })
      }
      return
    }

    const agent = this.who(sk)
    if (p.state === 'delta') {
      this.d({ type: 'assistant.delta', agent, text: p.deltaText || '', replace: p.replace === true })
    } else if (p.state === 'final') {
      this.d({ type: 'assistant.final', agent, text: textOf(p.message) })
      this.d({ type: 'run.end', agent, status: 'ok' })
    } else if (p.state === 'aborted') {
      this.d({ type: 'assistant.final', agent, text: textOf(p.message) })
      this.d({ type: 'node', node: { cls: 'error', head: 'Run aborted', sub: p.stopReason || '' } })
      this.d({ type: 'run.end', agent })
    } else if (p.state === 'error') {
      this.d({ type: 'assistant.final', agent, text: textOf(p.message) })
      this.d({ type: 'node', node: { cls: 'error', head: 'Agent error', sub: p.errorMessage || textOf(p.message) || 'chat error' } })
      this.d({ type: 'run.end', agent, status: 'error' })
    }
  }

  onTool(data) {
    let p
    try { p = JSON.parse(data) } catch { return }
    const payload = (p && p.payload) || p
    const tool = payload.tool || payload.name || payload.toolName || 'tool'
    const hay = [tool, payload.type, payload.kind, payload.phase].join(' ')
    const kind = /plugin/i.test(hay) ? 'plugin' : /skill/i.test(hay) ? 'skill' : 'tool'
    const args = payload.args || payload.input || payload.parameters || {}
    const detail =
      cleanDetail(payload.summary) ||
      cleanDetail(payload.result) ||
      findPublicDetail(args) ||
      cleanDetail(payload.error)
    const status = /error|failed/i.test(String(payload.phase || payload.status || payload.error || ''))
      ? 'error'
      : /result|done|final|complete/i.test(String(payload.phase || payload.status || ''))
        ? 'done'
        : 'running'
    this.d({
      type: 'node',
      node: {
        cls: kind === 'tool' ? 'tool' : kind,
        head: titleCase(tool),
        tag: kind,
        sub: detail,
        status,
        op: { kind, label: titleCase(tool), detail, status, sessionKey: opSessionKey(payload), phase: String(payload.phase || payload.status || ''), stream: 'tool' },
      },
    })
  }

  onOperation(data) {
    let p
    try { p = JSON.parse(data) } catch { return }
    const payload = (p && p.payload) || p
    const op = normalizeOperationPayload(payload)
    if (!op) return
    this.d({
      type: 'node',
      node: {
        cls: op.kind === 'tool' ? 'tool' : op.kind,
        head: op.label,
        tag: op.kind,
        sub: op.detail,
        status: op.status,
        op,
      },
    })
  }

  onSubagent(data) {
    let p
    try { p = JSON.parse(data) } catch { return }
    const key = p.brokerSessionKey || p.sessionKey
    if (!key) return
    const parent = this.who(p.spawnedBy || p.spawnedByRaw) || this.pendingAgent
    const name = p.displayName || p.subagentRole || key
    const badge = subBadge(p.status)
    // create or enrich the child node (sub.spawn upserts in the reducer)
    this.d({ type: 'sub.spawn', key, name, parent, task: p.subagentRole || '', status: badge || 'queued' })
    if (badge === 'done' || badge === 'error') this.d({ type: 'sub.status', key, status: badge })
  }

  async uploadFiles(files, opts = {}) {
    const selected = Array.from(files || []).filter(Boolean)
    if (!selected.length) return []

    const base = trim(this.cfg.base)
    const sessionKey = opts.sessionKey || this.cfg.session || 'main'
    const fd = new FormData()
    for (const file of selected) fd.append('file', file)
    if (opts.agentId) fd.append('agentId', opts.agentId)
    if (sessionKey) fd.append('sessionKey', sessionKey)

    const headers = authHeaders(this.cfg.secret)
    if (sessionKey) headers['X-Session-Key'] = sessionKey
    const r = await fetch(base + '/uploads', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: fd,
    })
    const j = await r.json().catch(() => ({}))
    notifyUnauthorized(r)
    if (!r.ok || j.ok === false) throw new Error(j.error || j.message || ('HTTP ' + r.status + ' ' + r.statusText))
    return Array.isArray(j.files) ? j.files : []
  }

  // Ask the broker to abort a run. Pass { sessionKey } to stop a chat + its whole
  // subagent subtree (server-side cascade), { runId } for one run, or { all: true }
  // to panic-stop everything. The UI soft-stop is handled by the store.
  async stopRun(body = {}) {
    const base = trim(this.cfg.base)
    if (!base) return { ok: false, error: 'no broker configured' }
    try {
      const r = await fetch(base + '/chat/stop', {
        method: 'POST',
        headers: authHeaders(this.cfg.secret, true),
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      notifyUnauthorized(r)
      if (!r.ok || j.ok === false) throw new Error((j && j.error) || ('HTTP ' + r.status + ' ' + r.statusText))
      this.raw('sys', 'POST /chat/stop ok / scope=' + (j.scope || '?') + ' / aborted=' + (j.count != null ? j.count : '?'))
      return j
    } catch (err) {
      this.raw('err', 'POST /chat/stop failed: ' + err.message)
      throw err
    }
  }

  async sendMessage(text, opts = {}) {
    const base = trim(this.cfg.base)
    const sessionKey = opts.sessionKey || this.cfg.session || 'main'
    const agent = opts.agentId || this.pendingAgent
    this.pendingAgent = agent
    if (this.streamSessionKey !== sessionKey || !this.es) await this.connect(sessionKey)
    this.d({ type: 'run.start', agent, title: (opts.label || sessionKey), query: text })
    this.d({ type: 'assistant.start', agent })

    try {
      const r = await fetch(base + '/chat', {
        method: 'POST',
        headers: authHeaders(this.cfg.secret, true),
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          agentId: agent,
          sessionKey,
          effort: opts.effort,
          attachments: opts.attachments,
        }),
      })
      const j = await r.json().catch(() => ({}))
      notifyUnauthorized(r)
      if (!r.ok || j.ok === false) throw new Error((j && j.error) || ('HTTP ' + r.status + ' ' + r.statusText))
      this.raw('sys', 'POST /chat ok / agent=' + agent + ' / session=' + sessionKey + ' / runId=' + (j.runId || '?'))
      if (j.runId) this.d({ type: 'run.tag', agent, runId: j.runId })
    } catch (err) {
      this.raw('err', 'POST /chat failed: ' + err.message)
      this.d({ type: 'node', node: { cls: 'error', head: 'Send failed', sub: err.message } })
      this.d({ type: 'assistant.final', agent, text: 'Send failed: ' + err.message })
      this.d({ type: 'run.end', agent, status: 'error' })
    }
  }
}

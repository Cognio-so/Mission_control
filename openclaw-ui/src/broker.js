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

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.ok === false) {
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
    cache: 'no-store',
  })
  return unwrapAgents(await readJsonResponse(response))
}

export async function createBrokerAgent({ base, secret }, agent) {
  const response = await fetch(trim(base) + '/agents', {
    method: 'POST',
    headers: authHeaders(secret, true),
    body: JSON.stringify(agent),
  })
  const data = await readJsonResponse(response)
  return data.agent || data.item || data.data || data
}

export async function updateBrokerAgent({ base, secret }, id, patch) {
  const response = await fetch(trim(base) + '/agents/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: authHeaders(secret, true),
    body: JSON.stringify(patch),
  })
  const data = await readJsonResponse(response)
  return data.agent || data.item || data.data || data
}

export async function deleteBrokerAgent({ base, secret }, id) {
  const response = await fetch(trim(base) + '/agents/' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: authHeaders(secret),
  })
  return readJsonResponse(response)
}

export class BrokerClient {
  constructor(cfg, dispatch) {
    this.cfg = cfg
    this.d = dispatch
    this.es = null
    this.connected = false
    this.pendingAgent = cfg.orchId || 'orchestrator'
  }

  setResolver(fn) { this.cfg.resolveAgent = fn }
  raw(kind, line) { this.d({ type: 'raw', kind, line }) }
  status(s) { this.d({ type: 'conn', status: s }) }

  who(sessionKey) {
    const r = this.cfg.resolveAgent && this.cfg.resolveAgent(sessionKey)
    return r || this.pendingAgent
  }

  async connect() {
    this.close(true)
    const base = trim(this.cfg.base)
    if (!base) {
      this.status('off')
      return
    }

    this.status('connecting')
    this.raw('sys', 'broker ' + base + ' / checking /health')
    try {
      const r = await fetch(base + '/health', { cache: 'no-store' })
      const h = await r.json()
      const g = h.gateway || {}
      this.raw('sys', 'health: gateway ' + (g.connected ? 'connected' : 'down') + ' / scopes=' + JSON.stringify(g.scopes || []) + ' / server ' + (g.serverVersion || '?'))
    } catch (e) {
      this.raw('err', '/health failed: ' + e.message)
    }

    const url = base + '/stream?token=' + encodeURIComponent(this.cfg.secret || '')
    let es
    try {
      es = new EventSource(url)
    } catch (err) {
      this.raw('err', 'EventSource failed: ' + err.message)
      this.status('off')
      return
    }

    this.es = es
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
      if (p.state === 'delta') this.d({ type: 'sub.delta', key, parent, text: p.deltaText || '', replace: p.replace === true })
      else if (p.state === 'final') this.d({ type: 'sub.status', key, status: 'done' })
      else if (p.state === 'error' || p.state === 'aborted') this.d({ type: 'sub.status', key, status: 'error' })
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
    this.d({ type: 'node', node: { cls: 'tool', head: 'Tool / ' + tool, tag: 'event', sub: shortJson(payload) } })
  }

  async sendMessage(text, opts = {}) {
    const base = trim(this.cfg.base)
    const sessionKey = opts.sessionKey || this.cfg.session || 'main'
    const agent = opts.agentId || this.pendingAgent
    this.pendingAgent = agent
    this.d({ type: 'run.start', agent, title: (opts.label || sessionKey) })
    this.d({ type: 'assistant.start', agent })

    try {
      const r = await fetch(base + '/chat', {
        method: 'POST',
        headers: authHeaders(this.cfg.secret, true),
        body: JSON.stringify({
          message: text,
          agentId: agent,
          sessionKey,
          agents: opts.agents || [],
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.ok === false) throw new Error((j && j.error) || ('HTTP ' + r.status + ' ' + r.statusText))
      this.raw('sys', 'POST /chat ok / agent=' + agent + ' / session=' + sessionKey + ' / runId=' + (j.runId || '?'))
    } catch (err) {
      this.raw('err', 'POST /chat failed: ' + err.message)
      this.d({ type: 'node', node: { cls: 'error', head: 'Send failed', sub: err.message } })
      this.d({ type: 'assistant.final', agent, text: 'Send failed: ' + err.message })
      this.d({ type: 'run.end', agent, status: 'error' })
    }
  }
}

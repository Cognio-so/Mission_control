import { useEffect, useState, useCallback } from 'react'
import {
  DEMO_BOARDS, DEMO_TASKS, DEMO_GATEWAYS, DEMO_CRON,
} from './demoData.js'
import { cleanChatText } from './chatText.js'

const BASE = (import.meta.env.VITE_BROKER_URL || '/api').replace(/\/+$/, '')
const SECRET = import.meta.env.VITE_BROKER_SECRET || ''
// Demo fallback is OFF by default now — set VITE_USE_DEMO_DATA=1 to preview with seed data.
const USE_DEMO = import.meta.env.VITE_USE_DEMO_DATA === '1'

function headers(json = false) {
  const h = {}
  if (json) h['Content-Type'] = 'application/json'
  if (SECRET) h.Authorization = 'Bearer ' + SECRET
  return h
}

async function brokerGet(path) {
  const r = await fetch(BASE + path, { headers: headers(), credentials: 'include', cache: 'no-store' })
  if (r.status === 401) window.dispatchEvent(new Event('cognio-auth-change'))
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

async function brokerSend(path, method, body, raw = false) {
  const r = await fetch(BASE + path, {
    method,
    headers: headers(!raw),
    credentials: 'include',
    body: body == null ? undefined : raw ? body : JSON.stringify(body),
  })
  if (r.status === 401) window.dispatchEvent(new Event('cognio-auth-change'))
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.error || 'HTTP ' + r.status)
  }
  return r.json().catch(() => ({}))
}

const unwrap = (data, key) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.[key])) return data[key]
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data)) return data.data
  return null
}

function messageText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(messageText).filter(Boolean).join('')
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text
    if (typeof value.content === 'string') return value.content
    if (typeof value.output_text === 'string') return value.output_text
    if (value.message) return messageText(value.message)
    if (value.content) return messageText(value.content)
    if (value.parts) return messageText(value.parts)
  }
  return ''
}

// loader(realFetch, demoData) — returns { data, source }.
// source: 'broker' (live) | 'demo' (fallback on) | 'unavailable' (no endpoint, demo off)
async function load(realFetch, demoData) {
  try {
    const arr = await realFetch()
    if (arr) return { data: arr, source: 'broker' }
  } catch { /* fall through */ }
  if (USE_DEMO) return { data: demoData, source: 'demo' }
  return { data: Array.isArray(demoData) ? [] : null, source: 'unavailable' }
}

export const Api = {
  // Skills/plugins are always the broker's REAL data, never hardcoded demo catalog data.
  skills() {
    return load(async () => unwrap(await brokerGet('/skills'), 'skills'), [])
  },
  plugins() {
    return load(async () => unwrap(await brokerGet('/plugins'), 'plugins'), [])
  },
  boards() { return load(async () => unwrap(await brokerGet('/boards'), 'boards'), DEMO_BOARDS) },
  gateways() { return load(async () => unwrap(await brokerGet('/gateways'), 'gateways'), DEMO_GATEWAYS) },
  cron: {
    list() {
      return load(async () => unwrap(await brokerGet('/cron'), 'jobs'), DEMO_CRON)
    },
    create(job) {
      return brokerSend('/cron', 'POST', job)
    },
    run(id) {
      return brokerSend('/cron/' + encodeURIComponent(id) + '/run', 'POST')
    },
    remove(id) {
      return brokerSend('/cron/' + encodeURIComponent(id), 'DELETE')
    },
    enable(id) {
      return brokerSend('/cron/' + encodeURIComponent(id) + '/enable', 'POST')
    },
    disable(id) {
      return brokerSend('/cron/' + encodeURIComponent(id) + '/disable', 'POST')
    },
  },

  async board(id) {
    try {
      const data = await brokerGet('/boards/' + encodeURIComponent(id))
      const tasks = unwrap(data, 'tasks') || unwrap(await brokerGet('/boards/' + encodeURIComponent(id) + '/tasks'), 'tasks')
      if (tasks) return { data: { board: data.board || data, tasks }, source: 'broker' }
    } catch { /* fall through */ }
    if (USE_DEMO) {
      const board = DEMO_BOARDS.find((b) => b.id === id) || DEMO_BOARDS[0]
      return { data: { board, tasks: DEMO_TASKS[board.id] || [] }, source: 'demo' }
    }
    return { data: { board: null, tasks: [] }, source: 'unavailable' }
  },

  installSkill(id, gatewayId) {
    return brokerSend('/skills/marketplace/' + encodeURIComponent(id) + '/install', 'POST', { gatewayId })
  },
  // Add a skill. payload: { type: 'source'|'file'|'describe', ... }
  addSkill(payload) {
    return brokerSend('/skills/add', 'POST', payload)
  },
  // LLM-write an agent's instructions from a brief. { name, role, brief } -> { instructions }
  draftInstructions(brief) {
    return brokerSend('/agents/draft-instructions', 'POST', brief)
  },
  moveTask(boardId, taskId, status) {
    return brokerSend('/boards/' + encodeURIComponent(boardId) + '/tasks/' + encodeURIComponent(taskId), 'PATCH', { status })
  },
  createTask(boardId, task) {
    return brokerSend('/boards/' + encodeURIComponent(boardId) + '/tasks', 'POST', task)
  },
  deleteTask(boardId, taskId) {
    return brokerSend('/boards/' + encodeURIComponent(boardId) + '/tasks/' + encodeURIComponent(taskId), 'DELETE')
  },
  createBoard(board) {
    return brokerSend('/boards', 'POST', board)
  },
  deleteBoard(id) {
    return brokerSend('/boards/' + encodeURIComponent(id), 'DELETE')
  },

  // Server-side conversation history for a session (cross-device resume).
  async chatHistory(sessionKey) {
    const data = await brokerGet('/chat/history?sessionKey=' + encodeURIComponent(sessionKey) + '&limit=50')
    const arr = unwrap(data, 'messages') || []
    // broker returns 200 {messages:[], error} on a transient RPC failure — treat that
    // as a failure so the caller can retry later (and keep the local copy meanwhile).
    if (!arr.length && data && data.error) throw new Error(data.error)
    return arr.map((m, i) => {
      const role = m.role === 'user' ? 'user' : 'assistant'
      return {
        id: m.id || 'h_' + i,
        role,
        text: cleanChatText(messageText(m.content) || messageText(m.text) || messageText(m.message), role),
        ts: typeof m.ts === 'number' ? m.ts : (m.created_at ? Date.parse(m.created_at) || 0 : 0),
      }
    }).filter((m) => m.role !== 'user' || m.text.trim())
  },
  // Server-side run history (graph + per-agent/subagent output) for a session — the
  // cross-device source of truth. Returns [] if the broker doesn't expose it yet.
  async chatRuns(sessionKey, days = 15) {
    try {
      const data = await brokerGet('/chat/runs?sessionKey=' + encodeURIComponent(sessionKey) + '&days=' + days)
      return unwrap(data, 'runs') || []
    } catch { return [] }
  },
  chatSessions() {
    return brokerGet('/chat/sessions').then((data) => unwrap(data, 'sessions') || [])
  },
  deleteChatSession(sessionKey) {
    return brokerSend('/chat/sessions?sessionKey=' + encodeURIComponent(sessionKey), 'DELETE')
  },

  // ---- Credentials / secrets (write-only; GET returns key names only, never values) ----
  secrets: {
    async list() {
      const data = await brokerGet('/secrets')
      return { file: data.file || 'global.env', keys: Array.isArray(data.keys) ? data.keys : [] }
    },
    add(key, value) {
      return brokerSend('/secrets', 'POST', { key, value })
    },
    remove(key) {
      return brokerSend('/secrets/' + encodeURIComponent(key), 'DELETE')
    },
  },

  // ---- Agent memory / files (live, per the VPS broker REST shapes) ----
  agentFiles: {
    async list(agentId) {
      const data = await brokerGet('/agents/' + encodeURIComponent(agentId) + '/files')
      return unwrap(data, 'files') || []
    },
    async get(agentId, name) {
      const data = await brokerGet('/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(name))
      return typeof data?.content === 'string' ? data.content : ''
    },
    put(agentId, name, content) {
      return brokerSend('/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(name), 'PUT', { content })
    },
  },
  skillFiles(id) {
    return brokerGet('/skills/' + encodeURIComponent(id) + '/files')
  },
  skillFile(id, path = 'SKILL.md') {
    return brokerGet('/skills/' + encodeURIComponent(id) + '/file?path=' + encodeURIComponent(path))
  },
  capabilityFiles(kind, id) {
    if (kind !== 'skill') {
      return {
        async list() { return [] },
        async get() { return '' },
      }
    }
    return {
      async list() {
        const data = await Api.skillFiles(id)
        return unwrap(data, 'files') || []
      },
      async get(path) {
        const data = await Api.skillFile(id, path)
        return typeof data?.content === 'string' ? data.content : ''
      },
    }
  },
}

export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, source: null, loading: true, error: '' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    try {
      const { data, source } = await run()
      setState({ data, source, loading: false, error: '' })
    } catch (err) {
      setState({ data: null, source: null, loading: false, error: err.message || 'Failed to load' })
    }
  }, [run])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

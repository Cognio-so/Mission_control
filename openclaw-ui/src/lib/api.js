import { useEffect, useState, useCallback } from 'react'
import {
  DEMO_BOARDS, DEMO_TASKS, DEMO_GATEWAYS, DEMO_CRON,
} from './demoData.js'

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
  const r = await fetch(BASE + path, { headers: headers(), cache: 'no-store' })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

async function brokerSend(path, method, body, raw = false) {
  const r = await fetch(BASE + path, {
    method,
    headers: headers(!raw),
    body: body == null ? undefined : raw ? body : JSON.stringify(body),
  })
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
  // skills/packs are always the broker's REAL data — never hardcoded (empty demo list).
  skills() { return load(async () => unwrap(await brokerGet('/skills/marketplace'), 'skills'), []) },
  packs() { return load(async () => unwrap(await brokerGet('/skills/packs'), 'packs'), []) },
  boards() { return load(async () => unwrap(await brokerGet('/boards'), 'boards'), DEMO_BOARDS) },
  gateways() { return load(async () => unwrap(await brokerGet('/gateways'), 'gateways'), DEMO_GATEWAYS) },
  cron() { return load(async () => unwrap(await brokerGet('/cron'), 'jobs'), DEMO_CRON) },

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
  // Add a skill to OpenClaw. payload: { type: 'source'|'file'|'describe', ... }
  addSkill(payload) {
    return brokerSend('/skills/add', 'POST', payload)
  },
  // LLM-write an agent's instructions from a brief. { name, role, brief } -> { instructions }
  draftInstructions(brief) {
    return brokerSend('/agents/draft-instructions', 'POST', brief)
  },
  runCron(id) {
    return brokerSend('/cron/' + encodeURIComponent(id) + '/run', 'POST')
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
    const data = await brokerGet('/chat/history?sessionKey=' + encodeURIComponent(sessionKey))
    const arr = unwrap(data, 'messages') || []
    // broker returns 200 {messages:[], error} on a transient RPC failure — treat that
    // as a failure so the caller can retry later (and keep the local copy meanwhile).
    if (!arr.length && data && data.error) throw new Error(data.error)
    return arr.map((m, i) => ({
      id: m.id || 'h_' + i,
      role: m.role === 'user' ? 'user' : 'assistant',
      text: typeof m.content === 'string' ? m.content : m.text || '',
      ts: typeof m.ts === 'number' ? m.ts : (m.created_at ? Date.parse(m.created_at) || 0 : 0),
    }))
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

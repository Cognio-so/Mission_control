import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  BrokerClient,
  fetchBrokerAgents, fetchBrokerTeams, createBrokerAgent, updateBrokerAgent, deleteBrokerAgent,
} from '../broker.js'
import { runDemo } from '../demo.js'
import { Api } from '../lib/api.js'
import {
  ORCH_ID, fallbackOrchestrator, normalizeAgents, sessionKeyFor, formatSessionKey,
  buildSessionMap, resolveAgentId, normalizeSession, buildTeams,
  normalizeTeamResponse, flattenTeams, slugAgentId,
} from '../agents.js'
import { reducer, initial, getT, dedupeMessages } from './reducer.js'

const DEFAULT_BROKER = import.meta.env.VITE_BROKER_URL || '/api'
const DEFAULT_SECRET = import.meta.env.VITE_BROKER_SECRET || ''
const DEFAULT_SESSION = import.meta.env.VITE_ORCHESTRATOR_SESSION || 'main'
const DEFAULT_DEMO = import.meta.env.VITE_DEMO === '1'

function loadSettings() {
  return { demo: DEFAULT_DEMO, base: DEFAULT_BROKER, secret: DEFAULT_SECRET, session: DEFAULT_SESSION }
}

// --- conversation persistence (resume across refresh) ---
const THREADS_KEY = 'oc_threads_v1'
const ACTIVE_KEY = 'oc_active_v1'
const ACTIVE_DEFAULT_KEY = 'mc_main_default_v2'
const SESSIONS_KEY = 'oc_sessions_v1'
const SAVED_KEY = 'oc_saved_v1'

function loadSavedChats() {
  try {
    const arr = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function loadSessionOverrides() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}') || {}
    const out = {}
    for (const [id, key] of Object.entries(parsed)) {
      // drop specialist overrides that point at the orchestrator's `main` lineage
      // (old contamination) — they'd reload `main`'s conversation otherwise.
      if (id !== ORCH_ID && typeof key === 'string' && key.startsWith('main')) continue
      out[id] = key
    }
    return out
  } catch {
    return {}
  }
}

function loadThreads() {
  try {
    const parsed = JSON.parse(localStorage.getItem(THREADS_KEY) || '{}')
    const orchSig = JSON.stringify((parsed[ORCH_ID]?.messages || []).map((m) => m.text))
    const out = {}
    for (const [id, t] of Object.entries(parsed)) {
      const msgs = Array.isArray(t?.messages) ? t.messages : []
      if (!msgs.length) continue
      // drop specialist threads that are an exact copy of the orchestrator's
      // conversation (old cross-session contamination); keep real ones + the orchestrator.
      if (id !== ORCH_ID && orchSig !== '[]' && JSON.stringify(msgs.map((m) => m.text)) === orchSig) continue
      out[id] = { messages: dedupeMessages(msgs.map((m) => ({ ...m, streaming: false }))), running: false, curAssistant: null }
    }
    return out
  } catch {
    return {}
  }
}

function saveThreads(threads) {
  try {
    const out = {}
    for (const [id, t] of Object.entries(threads || {})) {
      if (t?.messages?.length) out[id] = { messages: dedupeMessages(t.messages).slice(-200).map((m) => ({ id: m.id, role: m.role, text: m.text, ts: m.ts })) }
    }
    localStorage.setItem(THREADS_KEY, JSON.stringify(out))
  } catch { /* quota / disabled — ignore */ }
}

const MissionContext = createContext(null)
export const useMission = () => useContext(MissionContext)

export function MissionProvider({ children }) {
  const [settings] = useState(loadSettings)
  const [agents, setAgents] = useState(() => normalizeAgents([], loadSettings().session))
  const [activeId, setActiveId] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_KEY)
      const migrated = localStorage.getItem(ACTIVE_DEFAULT_KEY)
      if (!migrated || saved === 'orchestrator') {
        localStorage.setItem(ACTIVE_DEFAULT_KEY, '1')
        localStorage.setItem(ACTIVE_KEY, ORCH_ID)
        return ORCH_ID
      }
      return saved || ORCH_ID
    } catch { return ORCH_ID }
  })
  const [state, dispatch] = useReducer(reducer, initial, (init) => ({
    ...init,
    threads: loadThreads(), // resume the conversation from last session
    conn: settings.demo ? 'demo' : settings.base ? 'connecting' : 'off',
  }))
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentsError, setAgentsError] = useState('')
  const [agentStatus, setAgentStatus] = useState(null)
  const [agentSaving, setAgentSaving] = useState(false)
  const [teamTree, setTeamTree] = useState(null)
  // per-agent active session key — a "New chat" points an agent at a fresh session id
  const [sessionOverrides, setSessionOverrides] = useState(loadSessionOverrides)
  // archived past conversations (one agent can have many) — shown in "Recent"
  const [savedChats, setSavedChats] = useState(loadSavedChats)

  const clientRef = useRef(null)
  const sessionMapRef = useRef({})
  const loadedRef = useRef(false)
  const historyLoadedRef = useRef(new Set())

  // Persist conversations + active agent + session overrides so a refresh resumes.
  useEffect(() => { saveThreads(state.threads) }, [state.threads])
  useEffect(() => { try { localStorage.setItem(ACTIVE_KEY, activeId) } catch { /* ignore */ } }, [activeId])
  useEffect(() => { try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessionOverrides)) } catch { /* ignore */ } }, [sessionOverrides])
  useEffect(() => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedChats)) } catch { /* ignore */ } }, [savedChats])

  const agentsById = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a])), [agents])
  const orchestrator = agentsById[ORCH_ID]
  const roster = useMemo(() => agents.filter((a) => a.id !== ORCH_ID), [agents])
  const managed = useMemo(() => roster.filter((a) => a.managedByOrchestrator), [roster])
  const teams = useMemo(() => teamTree?.teams?.length ? teamTree.teams : buildTeams(agents), [teamTree, agents])
  const anyRunning = Object.values(state.threads).some((t) => t.running)

  // the session key currently in use for an agent (its New-chat override, or the default)
  const currentSessionKey = useCallback(
    (agentId) => {
      const id = agentId === 'orchestrator' ? ORCH_ID : (agentId || ORCH_ID)
      const override = sessionOverrides[id]
      if (override) return override.startsWith('agent:') ? override : formatSessionKey(id, override)
      return sessionKeyFor(agentsById[id] || (id === ORCH_ID ? { id: ORCH_ID, kind: 'main' } : { id }), settings.session)
    },
    [sessionOverrides, agentsById, settings.session],
  )

  // resolver map (incoming SSE → agent) must know the override sessions too
  useEffect(() => {
    const map = buildSessionMap(agents, settings.session)
    for (const [agentId, key] of Object.entries(sessionOverrides)) {
      const formatted = String(key || '').startsWith('agent:') ? String(key) : formatSessionKey(agentId, key)
      map[normalizeSession(key)] = agentId
      map[String(key).toLowerCase()] = agentId
      map[normalizeSession(formatted)] = agentId
      map[String(formatted).toLowerCase()] = agentId
    }
    sessionMapRef.current = map
  }, [agents, settings.session, sessionOverrides])

  // silent = background poll (no loading UI, keep existing roster on failure)
  const loadBrokerAgents = useCallback(async (silent = false) => {
    if (settings.demo || !settings.base) {
      setAgents(normalizeAgents([], settings.session))
      setTeamTree(null)
      loadedRef.current = true
      return
    }
    if (!silent) setAgentsLoading(true)
    setAgentsError('')
    try {
      const list = await fetchBrokerAgents(settings)
      let tree = null
      try {
        tree = normalizeTeamResponse(await fetchBrokerTeams(settings), settings.session)
      } catch {
        tree = null
      }
      const merged = new Map()
      for (const agent of list || []) if (agent?.id) merged.set(agent.id, agent)
      for (const agent of flattenTeams(tree)) if (agent?.id) merged.set(agent.id, agent)
      setAgents(normalizeAgents(Array.from(merged.values()), settings.session))
      setTeamTree(tree)
      loadedRef.current = true
    } catch (err) {
      if (!silent) {
        setAgentsError(err.message || 'Could not load agents')
        setAgents(normalizeAgents([], settings.session))
        setTeamTree(null)
      }
      // on a silent poll failure keep the current roster — don't wipe it
    } finally {
      if (!silent) setAgentsLoading(false)
    }
  }, [settings])

  useEffect(() => { loadBrokerAgents() }, [loadBrokerAgents])
  useEffect(() => {
    const onFocus = () => loadBrokerAgents(true)
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(() => loadBrokerAgents(true), 10000)
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(timer) }
  }, [loadBrokerAgents])
  useEffect(() => {
    // only reset a stale active agent AFTER the broker list has loaded once,
    // so a restored activeId isn't clobbered during the initial fetch
    if (loadedRef.current && !agents.some((a) => a.id === activeId)) setActiveId(ORCH_ID)
  }, [agents, activeId])

  // Cross-device resume: pull a session's history from the broker the first time
  // it's opened, and adopt it when it's more complete than local. Keyed by session
  // so a New chat (fresh session) starts empty instead of reloading the old one.
  const loadHistory = useCallback(
    async (agentId) => {
      if (settings.demo || !settings.base) return
      const agent = agentsById[agentId]
      if (!agent && agentId !== ORCH_ID) return // wait until the agent list has loaded
      const sk = currentSessionKey(agentId)
      if (historyLoadedRef.current.has(sk)) return
      historyLoadedRef.current.add(sk)
      try {
        const msgs = await Api.chatHistory(sk)
        if (msgs && msgs.length) dispatch({ type: 'thread.set', agent: agentId, messages: msgs })
      } catch {
        historyLoadedRef.current.delete(sk) // allow a later retry
      }
    },
    [settings, agentsById, currentSessionKey],
  )
  useEffect(() => { loadHistory(activeId) }, [activeId, loadHistory])

  const catchUpHistory = useCallback(
    async (agentId) => {
      if (settings.demo || !settings.base) return
      const agent = agentsById[agentId]
      if (!agent && agentId !== ORCH_ID) return
      try {
        const msgs = await Api.chatHistory(currentSessionKey(agentId))
        if (msgs && msgs.length) dispatch({ type: 'thread.catchup', agent: agentId, messages: msgs })
      } catch {
        // keep the local stream; the next poll or SSE event can still complete it
      }
    },
    [settings, agentsById, currentSessionKey],
  )

  useEffect(() => {
    if (!anyRunning || settings.demo || !settings.base) return
    const runningIds = Object.entries(state.threads).filter(([, t]) => t.running).map(([id]) => id)
    if (!runningIds.length) return

    const poll = () => {
      for (const id of runningIds) catchUpHistory(id)
    }
    const initial = window.setTimeout(poll, 2500)
    const timer = window.setInterval(poll, 3500)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [anyRunning, state.threads, settings.demo, settings.base, catchUpHistory])

  // Snapshot an agent's current conversation into "Recent" (so it isn't lost).
  const archiveCurrent = useCallback(
    (id) => {
      const cur = getT(state, id)
      if (!cur.messages.length) return
      const agent = agentsById[id]
      const last = cur.messages[cur.messages.length - 1]
      const snapshot = {
        cid: 'c_' + id + '_' + Date.now().toString(36),
        sessionKey: currentSessionKey(id),
        agentId: id,
        name: agent?.name || id,
        icon: agent?.icon || null,
        messages: cur.messages.map((m) => ({ id: m.id, role: m.role, text: m.text, ts: m.ts })),
        ts: last?.ts || Date.now(),
      }
      setSavedChats((prev) => [snapshot, ...prev.filter((c) => c.sessionKey !== snapshot.sessionKey)].slice(0, 60))
    },
    [state, agentsById, currentSessionKey],
  )

  // New chat: archive the current conversation, then point the agent at a fresh session.
  const newChat = useCallback(
    (agentId) => {
      const id = agentId || activeId
      archiveCurrent(id)
      const base = normalizeSession(sessionKeyFor(agentsById[id] || (id === ORCH_ID ? { id: ORCH_ID, kind: 'main' } : { id }), settings.session))
      const key = formatSessionKey(id, base + '__' + Date.now().toString(36))
      historyLoadedRef.current.add(key) // fresh session — nothing to fetch
      setSessionOverrides((o) => ({ ...o, [id]: key }))
      dispatch({ type: 'reset.thread', agent: id })
    },
    [activeId, agentsById, settings.session, archiveCurrent],
  )

  // Resume a saved conversation from Recent (archives the agent's current one first).
  const resumeChat = useCallback(
    (saved) => {
      const id = saved.agentId === 'orchestrator' ? ORCH_ID : saved.agentId
      const savedKey = String(saved.sessionKey || '').startsWith('agent:')
        ? String(saved.sessionKey)
        : formatSessionKey(id, saved.sessionKey || (id === ORCH_ID ? settings.session : 'agent_' + id))
      const curKey = currentSessionKey(id)
      if (curKey !== savedKey) archiveCurrent(id)
      setSavedChats((prev) => prev.filter((c) => c.cid !== saved.cid))
      setSessionOverrides((o) => ({ ...o, [id]: savedKey }))
      historyLoadedRef.current.add(savedKey)
      dispatch({ type: 'thread.restore', agent: id, messages: (saved.messages || []).map((m) => ({ ...m, streaming: false })) })
      setActiveId(id)
    },
    [settings.session, currentSessionKey, archiveCurrent],
  )

  const deleteConversation = useCallback((entry) => {
    if (!entry) return
    if (entry.kind === 'saved' || entry.saved) {
      const cid = entry.cid || entry.saved?.cid
      setSavedChats((prev) => prev.filter((c) => c.cid !== cid))
      return
    }
    const id = entry.agentId === 'orchestrator' ? ORCH_ID : entry.agentId
    if (id) dispatch({ type: 'reset.thread', agent: id })
  }, [])

  useEffect(() => {
    if (clientRef.current) { clientRef.current.close(true); clientRef.current = null }
    if (settings.demo) { dispatch({ type: 'conn', status: 'demo' }); return }
    if (!settings.base) { dispatch({ type: 'conn', status: 'off' }); return }
    const mainSessionKey = formatSessionKey(ORCH_ID, settings.session)
    const client = new BrokerClient(
      {
        base: settings.base, secret: settings.secret, session: mainSessionKey, orchId: ORCH_ID,
        resolveAgent: (sk) => resolveAgentId(sessionMapRef.current, sk),
      },
      dispatch,
    )
    clientRef.current = client
    client.connect(mainSessionKey)
    return () => client.close(true)
  }, [settings.demo, settings.base, settings.secret, settings.session])

  // Safety net only — runs can take several minutes; the timer resets on every
  // streamed event (state.threads changes), so this fires only after a long silence.
  useEffect(() => {
    if (!anyRunning) return
    const t = setTimeout(() => {
      const stuck = Object.entries(state.threads).find(([, v]) => v.running)
      if (stuck) {
        dispatch({ type: 'node', node: { cls: 'error', head: 'No response in 10 minutes', sub: 'The run may still be active on the agent. Check the raw log or refresh.' } })
        dispatch({ type: 'run.end', agent: stuck[0] })
      }
    }, 600000)
    return () => clearTimeout(t)
  }, [anyRunning, state.threads])

  const sendText = useCallback(
    (text, toId) => {
      const id = toId || activeId
      text = (text || '').trim()
      if (!text || getT(state, id).running) return
      const agent = agentsById[id]
      const sessionKey = currentSessionKey(id)
      dispatch({ type: 'user', agent: id, text })
      if (settings.demo) {
        runDemo(text, dispatch, { agent, agents })
      } else if (!settings.base) {
        dispatch({ type: 'assistant.note', agent: id, text: 'No broker is configured. Set VITE_BROKER_URL and restart the UI.' })
      } else if (clientRef.current) {
        clientRef.current.sendMessage(text, { agentId: id, sessionKey, agents, label: (agent?.name || id) + ' / ' + sessionKey })
      }
    },
    [state, activeId, settings, agents, agentsById, currentSessionKey],
  )

  const reconnect = useCallback(() => {
    if (!settings.demo && settings.base && clientRef.current) clientRef.current.connect()
  }, [settings])

  const clearThread = useCallback((id) => dispatch({ type: 'reset.thread', agent: id || activeId }), [activeId])

  const saveAgent = useCallback(
    async (agent, mode) => {
      const isNew = mode === 'new'
      const localId = agent.id || slugAgentId(agent.name)
      const payload = {
        ...agent,
        name: (agent.name || '').trim(),
        role: (agent.role || '').trim(),
        instructions: (agent.instructions || '').trim(),
      }
      if (isNew) {
        delete payload.id
        delete payload.sessionKey
      } else {
        payload.id = agent.id
      }
      if (settings.demo) {
        setAgents((prev) =>
          normalizeAgents(
            prev.some((a) => a.id === localId) ? prev.map((a) => (a.id === localId ? { ...payload, id: localId } : a)) : prev.concat({ ...payload, id: localId }),
            settings.session,
          ),
        )
        setActiveId(localId)
        return { ...payload, id: localId }
      }
      setAgentSaving(true)
      setAgentStatus({ tone: 'pending', text: (isNew ? 'Creating' : 'Saving') + ' agent in broker...' })
      try {
        const saved = isNew ? await createBrokerAgent(settings, payload) : await updateBrokerAgent(settings, payload.id, payload)
        await loadBrokerAgents()
        setActiveId(saved?.id || payload.id || localId)
        setAgentStatus({ tone: 'ok', text: (saved?.name || payload.name) + ' saved in broker.' })
        return saved || { ...payload, id: localId }
      } catch (err) {
        setAgentStatus({ tone: 'error', text: err.message || String(err) })
        dispatch({ type: 'node', node: { cls: 'error', head: 'Agent save failed', sub: err.message || String(err) } })
        throw err
      } finally {
        setAgentSaving(false)
      }
    },
    [settings, loadBrokerAgents],
  )

  const deleteAgent = useCallback(
    async (id) => {
      if (id === ORCH_ID) return false
      const agent = agentsById[id]
      const confirmed =
        typeof window === 'undefined' ||
        window.confirm(
          `Delete agent "${agent?.name || id}"?\n\nThis permanently removes it from the Cognio backend — its session and memory files — not just this screen. This cannot be undone.`,
        )
      if (!confirmed) return false

      if (settings.demo) {
        setAgents((prev) => normalizeAgents(prev.filter((a) => a.id !== id), settings.session))
        if (activeId === id) setActiveId(ORCH_ID)
        dispatch({ type: 'reset.thread', agent: id })
        return true
      }
      setAgentStatus({ tone: 'pending', text: 'Deleting agent from the Cognio backend…' })
      try {
        await deleteBrokerAgent(settings, id) // DELETE /agents/{id} on the broker
        await loadBrokerAgents()
        if (activeId === id) setActiveId(ORCH_ID)
        dispatch({ type: 'reset.thread', agent: id })
        setAgentStatus({ tone: 'ok', text: 'Agent deleted from the backend.' })
        return true
      } catch (err) {
        setAgentStatus({ tone: 'error', text: err.message || String(err) })
        dispatch({ type: 'node', node: { cls: 'error', head: 'Agent delete failed', sub: err.message || String(err) } })
        return false
      }
    },
    [settings, activeId, loadBrokerAgents, agentsById],
  )

  const value = {
    settings, agents, agentsById, orchestrator: orchestrator || fallbackOrchestrator(), roster, managed, teams,
    activeId, setActiveId, state, dispatch, anyRunning,
    agentsLoading, agentsError, agentStatus, agentSaving,
    loadBrokerAgents, sendText, reconnect, clearThread, saveAgent, deleteAgent,
    newChat, currentSessionKey, savedChats, resumeChat, deleteConversation,
    getThread: (id) => getT(state, id),
  }

  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>
}

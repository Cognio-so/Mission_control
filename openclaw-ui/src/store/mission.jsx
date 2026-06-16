import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  BrokerClient,
  fetchBrokerAgents, createBrokerAgent, updateBrokerAgent, deleteBrokerAgent,
} from '../broker.js'
import { runDemo } from '../demo.js'
import { Api } from '../lib/api.js'
import {
  ORCH_ID, fallbackOrchestrator, normalizeAgents, sessionKeyFor,
  buildSessionMap, resolveAgentId, slugAgentId,
} from '../agents.js'
import { reducer, initial, getT, dedupeMessages } from './reducer.js'

const DEFAULT_BROKER = import.meta.env.VITE_BROKER_URL || 'https://am-broker.cognio.so'
const DEFAULT_SECRET = import.meta.env.VITE_BROKER_SECRET || ''
const DEFAULT_SESSION = import.meta.env.VITE_ORCHESTRATOR_SESSION || 'main'
const DEFAULT_DEMO = import.meta.env.VITE_DEMO === '1'

function loadSettings() {
  return { demo: DEFAULT_DEMO, base: DEFAULT_BROKER, secret: DEFAULT_SECRET, session: DEFAULT_SESSION }
}

// --- conversation persistence (resume across refresh) ---
const THREADS_KEY = 'oc_threads_v1'
const ACTIVE_KEY = 'oc_active_v1'

function loadThreads() {
  try {
    const parsed = JSON.parse(localStorage.getItem(THREADS_KEY) || '{}')
    const out = {}
    for (const [id, t] of Object.entries(parsed)) {
      const msgs = Array.isArray(t?.messages) ? t.messages : []
      if (msgs.length) out[id] = { messages: dedupeMessages(msgs.map((m) => ({ ...m, streaming: false }))), running: false, curAssistant: null }
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
    try { return localStorage.getItem(ACTIVE_KEY) || ORCH_ID } catch { return ORCH_ID }
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

  const clientRef = useRef(null)
  const sessionMapRef = useRef({})
  const loadedRef = useRef(false)
  const historyLoadedRef = useRef(new Set())

  // Persist conversations + active agent so a page refresh resumes where you left off.
  useEffect(() => { saveThreads(state.threads) }, [state.threads])
  useEffect(() => { try { localStorage.setItem(ACTIVE_KEY, activeId) } catch { /* ignore */ } }, [activeId])

  const agentsById = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a])), [agents])
  const orchestrator = agentsById[ORCH_ID]
  const roster = useMemo(() => agents.filter((a) => a.id !== ORCH_ID), [agents])
  const managed = useMemo(() => roster.filter((a) => a.managedByOrchestrator), [roster])
  const anyRunning = Object.values(state.threads).some((t) => t.running)

  useEffect(() => { sessionMapRef.current = buildSessionMap(agents, settings.session) }, [agents, settings.session])

  // silent = background poll (no loading UI, keep existing roster on failure)
  const loadBrokerAgents = useCallback(async (silent = false) => {
    if (settings.demo || !settings.base) {
      setAgents(normalizeAgents([], settings.session))
      loadedRef.current = true
      return
    }
    if (!silent) setAgentsLoading(true)
    setAgentsError('')
    try {
      const list = await fetchBrokerAgents(settings)
      setAgents(normalizeAgents(list, settings.session))
      loadedRef.current = true
    } catch (err) {
      if (!silent) {
        setAgentsError(err.message || 'Could not load agents')
        setAgents(normalizeAgents([], settings.session))
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

  // Cross-device resume: pull each agent's conversation history from the broker
  // the first time it's opened, and adopt it when it's more complete than local.
  const loadHistory = useCallback(
    async (agentId) => {
      if (settings.demo || !settings.base) return
      if (historyLoadedRef.current.has(agentId)) return
      const agent = agentsById[agentId]
      if (!agent && agentId !== ORCH_ID) return // wait until the agent list has loaded
      historyLoadedRef.current.add(agentId)
      try {
        const msgs = await Api.chatHistory(sessionKeyFor(agent, settings.session))
        if (msgs && msgs.length) dispatch({ type: 'thread.set', agent: agentId, messages: msgs })
      } catch {
        historyLoadedRef.current.delete(agentId) // allow a later retry
      }
    },
    [settings, agentsById],
  )
  useEffect(() => { loadHistory(activeId) }, [activeId, loadHistory])

  useEffect(() => {
    if (clientRef.current) { clientRef.current.close(true); clientRef.current = null }
    if (settings.demo) { dispatch({ type: 'conn', status: 'demo' }); return }
    if (!settings.base) { dispatch({ type: 'conn', status: 'off' }); return }
    const client = new BrokerClient(
      {
        base: settings.base, secret: settings.secret, session: settings.session, orchId: ORCH_ID,
        resolveAgent: (sk) => resolveAgentId(sessionMapRef.current, sk),
      },
      dispatch,
    )
    clientRef.current = client
    client.connect()
    return () => client.close(true)
  }, [settings.demo, settings.base, settings.secret, settings.session])

  useEffect(() => {
    if (!anyRunning) return
    const t = setTimeout(() => {
      const stuck = Object.entries(state.threads).find(([, v]) => v.running)
      if (stuck) {
        dispatch({ type: 'node', node: { cls: 'error', head: 'No completion in 180s', sub: 'The run may still be active. Check the raw log.' } })
        dispatch({ type: 'run.end', agent: stuck[0] })
      }
    }, 180000)
    return () => clearTimeout(t)
  }, [anyRunning, state.threads])

  const sendText = useCallback(
    (text, toId) => {
      const id = toId || activeId
      text = (text || '').trim()
      if (!text || getT(state, id).running) return
      const agent = agentsById[id]
      const sessionKey = sessionKeyFor(agent, settings.session)
      dispatch({ type: 'user', agent: id, text })
      if (settings.demo) {
        runDemo(text, dispatch, { agent, agents })
      } else if (!settings.base) {
        dispatch({ type: 'assistant.note', agent: id, text: 'No broker is configured. Set VITE_BROKER_URL and restart the UI.' })
      } else if (clientRef.current) {
        clientRef.current.sendMessage(text, { agentId: id, sessionKey, agents, label: agent.name + ' / ' + sessionKey })
      }
    },
    [state, activeId, settings, agents, agentsById],
  )

  const reconnect = useCallback(() => {
    if (!settings.demo && settings.base && clientRef.current) clientRef.current.connect()
  }, [settings])

  const clearThread = useCallback((id) => dispatch({ type: 'reset.thread', agent: id || activeId }), [activeId])

  const saveAgent = useCallback(
    async (agent, mode) => {
      const isNew = mode === 'new'
      const payload = { ...agent, id: isNew ? slugAgentId(agent.name) : agent.id, sessionKey: isNew ? '' : agent.sessionKey }
      if (settings.demo) {
        setAgents((prev) =>
          normalizeAgents(
            prev.some((a) => a.id === payload.id) ? prev.map((a) => (a.id === payload.id ? payload : a)) : prev.concat(payload),
            settings.session,
          ),
        )
        setActiveId(payload.id)
        return payload
      }
      setAgentSaving(true)
      setAgentStatus({ tone: 'pending', text: (isNew ? 'Creating' : 'Saving') + ' agent in broker...' })
      try {
        const saved = isNew ? await createBrokerAgent(settings, payload) : await updateBrokerAgent(settings, payload.id, payload)
        await loadBrokerAgents()
        setActiveId(saved?.id || payload.id)
        setAgentStatus({ tone: 'ok', text: (saved?.name || payload.name) + ' saved in broker.' })
        return saved || payload
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
          `Delete agent "${agent?.name || id}"?\n\nThis permanently removes it from the OpenClaw backend — its session and memory files — not just this screen. This cannot be undone.`,
        )
      if (!confirmed) return false

      if (settings.demo) {
        setAgents((prev) => normalizeAgents(prev.filter((a) => a.id !== id), settings.session))
        if (activeId === id) setActiveId(ORCH_ID)
        dispatch({ type: 'reset.thread', agent: id })
        return true
      }
      setAgentStatus({ tone: 'pending', text: 'Deleting agent from the OpenClaw backend…' })
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
    settings, agents, agentsById, orchestrator: orchestrator || fallbackOrchestrator(), roster, managed,
    activeId, setActiveId, state, dispatch, anyRunning,
    agentsLoading, agentsError, agentStatus, agentSaving,
    loadBrokerAgents, sendText, reconnect, clearThread, saveAgent, deleteAgent,
    getThread: (id) => getT(state, id),
  }

  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>
}

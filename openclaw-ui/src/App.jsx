import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  BrokerClient, brokerHost as host,
  fetchBrokerAgents, createBrokerAgent, updateBrokerAgent, deleteBrokerAgent,
} from './broker.js'
import { runDemo } from './demo.js'
import {
  ORCH_ID, ICONS,
  fallbackOrchestrator, normalizeAgents, sessionKeyFor, buildSessionMap, resolveAgentId, newAgentTemplate,
} from './agents.js'

let _seq = 0
const rid = () => 'x' + (++_seq)

const DEFAULT_BROKER = import.meta.env.VITE_BROKER_URL || 'https://am-broker.cognio.so'
const DEFAULT_SECRET = import.meta.env.VITE_BROKER_SECRET || '63b606b9f2df86f6b30b560995afe9347c9e4ebe72f128ae'
const DEFAULT_SESSION = import.meta.env.VITE_ORCHESTRATOR_SESSION || 'main'
const DEFAULT_DEMO = import.meta.env.VITE_DEMO === '1'

function loadSettings() {
  return {
    demo: DEFAULT_DEMO,
    base: DEFAULT_BROKER,
    secret: DEFAULT_SECRET,
    session: DEFAULT_SESSION,
  }
}

const initial = { conn: 'off', threads: {}, timeline: [], subIndex: {}, raw: [] }
const blank = () => ({ messages: [], running: false, curAssistant: null })
const getT = (s, id) => s.threads[id] || blank()
const withT = (s, id, t) => ({ ...s, threads: { ...s.threads, [id]: t } })

function reducer(s, a) {
  const aid = a.agent || ORCH_ID
  switch (a.type) {
    case 'conn':
      return { ...s, conn: a.status }
    case 'raw': {
      const raw = s.raw.concat({ id: rid(), kind: a.kind, line: a.line })
      if (raw.length > 300) raw.splice(0, raw.length - 300)
      return { ...s, raw }
    }
    case 'reset.thread':
      return withT(s, aid, blank())
    case 'reset.all':
      return { ...initial, conn: s.conn, raw: s.raw }

    case 'run.start': {
      const t = { ...getT(s, aid), running: true }
      return {
        ...withT(s, aid, t),
        timeline: s.timeline.concat({ id: rid(), kind: 'divider', text: a.title || 'run started' }),
      }
    }
    case 'run.end': {
      const t = { ...getT(s, aid), running: false, curAssistant: null }
      return {
        ...withT(s, aid, t),
        timeline: s.timeline.concat({ id: rid(), kind: 'divider', text: a.status === 'error' ? 'run failed' : 'run complete' }),
      }
    }
    case 'user': {
      const t = getT(s, aid)
      return withT(s, aid, { ...t, messages: t.messages.concat({ id: rid(), role: 'user', text: a.text }) })
    }
    case 'assistant.start': {
      const t = getT(s, aid)
      const id = rid()
      return withT(s, aid, {
        ...t,
        curAssistant: id,
        messages: t.messages.concat({ id, role: 'assistant', text: '', streaming: true }),
      })
    }
    case 'assistant.delta': {
      const t = getT(s, aid)
      let cur = t.curAssistant
      let messages = t.messages
      if (!cur) {
        cur = rid()
        messages = messages.concat({ id: cur, role: 'assistant', text: '', streaming: true })
      }
      messages = messages.map(m => (
        m.id === cur
          ? { ...m, streaming: true, text: a.replace ? a.text : (m.text + a.text) }
          : m
      ))
      return withT(s, aid, { ...t, curAssistant: cur, messages })
    }
    case 'assistant.final': {
      const t = getT(s, aid)
      let cur = t.curAssistant
      let messages = t.messages
      if (!cur) {
        if (!a.text) return s
        return withT(s, aid, { ...t, messages: messages.concat({ id: rid(), role: 'assistant', text: a.text }) })
      }
      messages = messages.map(m => (
        m.id === cur
          ? { ...m, streaming: false, text: (a.text && a.text.length > m.text.length) ? a.text : m.text }
          : m
      ))
      return withT(s, aid, { ...t, curAssistant: null, messages })
    }
    case 'assistant.note': {
      const t = getT(s, aid)
      return withT(s, aid, { ...t, messages: t.messages.concat({ id: rid(), role: 'assistant', text: a.text }) })
    }

    case 'node':
      return { ...s, timeline: s.timeline.concat({ id: a.id || rid(), kind: 'node', ...a.node }) }
    case 'node.status':
      return {
        ...s,
        timeline: s.timeline.map(t => t.id === a.id ? { ...t, status: a.status, pre: a.pre != null ? a.pre : t.pre } : t),
      }
    case 'sub.spawn': {
      const id = rid()
      return {
        ...s,
        subIndex: { ...s.subIndex, [a.key]: id },
        timeline: s.timeline.concat({
          id,
          kind: 'sub',
          key: a.key,
          title: a.name || a.key,
          icon: a.icon,
          parent: a.parent,
          sub: a.task || '',
          badge: 'queued',
          stream: '',
        }),
      }
    }
    case 'sub.delta': {
      const ex = s.subIndex[a.key]
      if (ex) {
        return {
          ...s,
          timeline: s.timeline.map(t => (
            t.id === ex ? { ...t, badge: 'running', stream: a.replace ? a.text : ((t.stream || '') + a.text) } : t
          )),
        }
      }
      const id = rid()
      return {
        ...s,
        subIndex: { ...s.subIndex, [a.key]: id },
        timeline: s.timeline.concat({
          id,
          kind: 'sub',
          key: a.key,
          title: a.key,
          parent: a.parent,
          sub: 'delegated run',
          badge: 'running',
          stream: a.text,
        }),
      }
    }
    case 'sub.status': {
      const ex = s.subIndex[a.key]
      if (!ex) return s
      return { ...s, timeline: s.timeline.map(t => t.id === ex ? { ...t, badge: a.status } : t) }
    }
    case 'sub.result': {
      const ex = s.subIndex[a.key]
      if (!ex) return s
      return {
        ...s,
        timeline: s.timeline.map(t => (
          t.id === ex ? { ...t, badge: a.status || 'done', result: a.summary } : t
        )),
      }
    }
    default:
      return s
  }
}

function connDisplay(c) {
  if (c === 'demo') return { cls: 'demo', txt: 'demo' }
  if (c === 'live') return { cls: 'on', txt: 'live' }
  if (c === 'connecting') return { cls: 'connecting', txt: 'connecting' }
  return { cls: 'off', txt: 'offline' }
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A'
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

function cleanIcon(icon, fallback) {
  return icon && icon.length <= 4 ? icon : fallback
}

export default function App() {
  const [settings] = useState(loadSettings)
  const [agents, setAgents] = useState(() => normalizeAgents([], loadSettings().session))
  const [activeId, setActiveId] = useState(ORCH_ID)
  const [state, dispatch] = useReducer(reducer, initial, init => ({
    ...init,
    conn: settings.demo ? 'demo' : (settings.base ? 'connecting' : 'off'),
  }))
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentsError, setAgentsError] = useState('')
  const [agentModal, setAgentModal] = useState(null)
  const [rawOpen, setRawOpen] = useState(false)
  const [composer, setComposer] = useState('')

  const clientRef = useRef(null)
  const sessionMapRef = useRef({})
  const chatRef = useRef(null)
  const tlRef = useRef(null)
  const rawRef = useRef(null)
  const taRef = useRef(null)

  const agentsById = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents])
  const active = agentsById[activeId] || agents[0] || fallbackOrchestrator()
  const orchestrator = agentsById[ORCH_ID]
  const roster = agents.filter(a => a.id !== ORCH_ID)
  const managed = roster.filter(a => a.managedByOrchestrator)
  const thread = getT(state, activeId)
  const anyRunning = Object.values(state.threads).some(t => t.running)

  useEffect(() => { sessionMapRef.current = buildSessionMap(agents, settings.session) }, [agents, settings.session])

  const loadBrokerAgents = useCallback(async () => {
    if (settings.demo || !settings.base) {
      setAgents(normalizeAgents([], settings.session))
      return
    }
    setAgentsLoading(true)
    setAgentsError('')
    try {
      const list = await fetchBrokerAgents(settings)
      setAgents(normalizeAgents(list, settings.session))
    } catch (err) {
      setAgentsError(err.message || 'Could not load agents')
      setAgents(normalizeAgents([], settings.session))
    } finally {
      setAgentsLoading(false)
    }
  }, [settings])

  useEffect(() => { loadBrokerAgents() }, [loadBrokerAgents])
  useEffect(() => {
    if (!agents.some(a => a.id === activeId)) setActiveId(ORCH_ID)
  }, [agents, activeId])

  useEffect(() => {
    if (clientRef.current) {
      clientRef.current.close(true)
      clientRef.current = null
    }
    if (settings.demo) {
      dispatch({ type: 'conn', status: 'demo' })
      return
    }
    if (!settings.base) {
      dispatch({ type: 'conn', status: 'off' })
      return
    }
    const client = new BrokerClient(
      {
        base: settings.base,
        secret: settings.secret,
        session: settings.session,
        orchId: ORCH_ID,
        resolveAgent: sk => resolveAgentId(sessionMapRef.current, sk),
      },
      dispatch,
    )
    clientRef.current = client
    client.connect()
    return () => { client.close(true) }
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

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [thread.messages, activeId])
  useEffect(() => { if (tlRef.current) tlRef.current.scrollTop = tlRef.current.scrollHeight }, [state.timeline])
  useEffect(() => { if (rawRef.current) rawRef.current.scrollTop = rawRef.current.scrollHeight }, [state.raw])
  useEffect(() => {
    const el = taRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 160) + 'px'
    }
  }, [composer, activeId])

  const sendText = useCallback((text) => {
    text = (text || '').trim()
    if (!text || getT(state, activeId).running) return
    const agent = agentsById[activeId]
    const sessionKey = sessionKeyFor(agent, settings.session)
    dispatch({ type: 'user', agent: activeId, text })
    if (settings.demo) {
      runDemo(text, dispatch, { agent, agents })
    } else if (!settings.base) {
      dispatch({ type: 'assistant.note', agent: activeId, text: 'No broker is configured. Set VITE_BROKER_URL and restart the UI.' })
    } else if (clientRef.current) {
      clientRef.current.sendMessage(text, {
        agentId: activeId,
        sessionKey,
        agents,
        label: agent.name + ' / ' + sessionKey,
      })
    }
  }, [state, activeId, settings, agents, agentsById])

  const send = () => {
    const t = composer.trim()
    if (!t) return
    setComposer('')
    sendText(t)
  }
  const onComposerKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }
  const insertMention = id => {
    setComposer(c => (c ? c.replace(/\s*$/, ' ') : '') + '@' + id + ' ')
    if (taRef.current) taRef.current.focus()
  }
  const clearThread = () => dispatch({ type: 'reset.thread', agent: activeId })
  const connClick = () => {
    if (!settings.demo && settings.base && clientRef.current) clientRef.current.connect()
  }

  const saveAgent = async agent => {
    if (settings.demo) {
      setAgents(prev => normalizeAgents(
        prev.some(a => a.id === agent.id)
          ? prev.map(a => a.id === agent.id ? agent : a)
          : prev.concat(agent),
        settings.session,
      ))
      setActiveId(agent.id)
      setAgentModal(null)
      return
    }

    try {
      const saved = agentModal?.mode === 'new'
        ? await createBrokerAgent(settings, agent)
        : await updateBrokerAgent(settings, agent.id, agent)
      await loadBrokerAgents()
      setActiveId(saved?.id || agent.id)
      setAgentModal(null)
    } catch (err) {
      dispatch({ type: 'node', node: { cls: 'error', head: 'Agent save failed', sub: err.message || String(err) } })
    }
  }

  const deleteAgent = async id => {
    if (id === ORCH_ID) return
    if (settings.demo) {
      setAgents(prev => normalizeAgents(prev.filter(a => a.id !== id), settings.session))
      if (activeId === id) setActiveId(ORCH_ID)
      dispatch({ type: 'reset.thread', agent: id })
      return
    }

    try {
      await deleteBrokerAgent(settings, id)
      await loadBrokerAgents()
      if (activeId === id) setActiveId(ORCH_ID)
      dispatch({ type: 'reset.thread', agent: id })
    } catch (err) {
      dispatch({ type: 'node', node: { cls: 'error', head: 'Agent delete failed', sub: err.message || String(err) } })
    }
  }

  const ci = connDisplay(state.conn)
  const activeSession = sessionKeyFor(active, settings.session)

  return (
    <div className="app">
      <header className="bar">
        <div className="brandmark">OC</div>
        <div className="title">
          <span>OpenClaw</span>
          <b>Mission Control</b>
        </div>
        <button className={'conn ' + ci.cls} onClick={connClick} title="Reconnect broker">
          <span className={'dot ' + ci.cls}></span>
          <span>{ci.txt}</span>
        </button>
        <div className="userchip">
          <span>{settings.demo ? 'Demo workspace' : (settings.base ? host(settings.base) : 'No broker')}</span>
        </div>
        <button className="ghost" onClick={loadBrokerAgents} disabled={agentsLoading}>Refresh agents</button>
      </header>

      <main className="grid">
        <aside className="col left">
          <button className="newagent" onClick={() => setAgentModal({ mode: 'new', agent: newAgentTemplate() })}>
            <span className="plus">+</span>
            New agent
          </button>

          <div className="roster-summary">
            <Metric label="Agents" value={roster.length} />
            <Metric label="Managed" value={managed.length} />
          </div>
          {agentsLoading && <div className="empty-mini">Loading broker agents...</div>}
          {agentsError && <div className="empty-mini error-mini">{agentsError}</div>}

          <div className="sect-h">Orchestrator</div>
          {orchestrator && (
            <AgentCard
              a={orchestrator}
              active={activeId === ORCH_ID}
              running={getT(state, ORCH_ID).running}
              hasMsgs={getT(state, ORCH_ID).messages.length > 0}
              orchestrator
              meta={managed.length + ' managed'}
              onSelect={() => setActiveId(ORCH_ID)}
              onEdit={() => setAgentModal({ mode: 'edit', agent: orchestrator })}
            />
          )}

          <div className="sect-h">Agents <span>{roster.length}</span></div>
          <div className="agentlist">
            {roster.length === 0 && <div className="empty-mini">Create a specialist to start delegation.</div>}
            {roster.map(a => (
              <AgentCard
                key={a.id}
                a={a}
                active={activeId === a.id}
                running={getT(state, a.id).running}
                hasMsgs={getT(state, a.id).messages.length > 0}
                meta={a.managedByOrchestrator ? 'managed' : 'standalone'}
                onSelect={() => setActiveId(a.id)}
                onEdit={() => setAgentModal({ mode: 'edit', agent: a })}
                onDelete={() => deleteAgent(a.id)}
              />
            ))}
          </div>

          <div className="scope-note">
            Orchestrator controls managed agents. Direct chats stay scoped to the selected session.
          </div>
        </aside>

        <section className="col mid">
          <div className="chat-head">
            <div className="ch-ic">{cleanIcon(active?.icon, initials(active?.name))}</div>
            <div className="ch-meta">
              <div className="ch-nm">
                {active?.name}
                {active?.id === ORCH_ID && <span className="tagchip orch">orchestrator</span>}
                {active?.id !== ORCH_ID && active?.managedByOrchestrator && <span className="tagchip">managed</span>}
              </div>
              <div className="ch-sub">
                <span>{active?.role || 'agent'}</span>
                <span>{activeSession}</span>
              </div>
            </div>
            <button className="ghost sm" onClick={clearThread}>Clear</button>
            <button className="ghost sm" onClick={() => setAgentModal({ mode: 'edit', agent: active })}>Edit</button>
            {active?.id !== ORCH_ID && <button className="ghost sm danger" onClick={() => deleteAgent(active.id)}>Delete</button>}
          </div>

          <div className="chat-scroll" ref={chatRef}>
            {thread.messages.length === 0 ? (
              <EmptyState active={active} onPick={sendText} />
            ) : thread.messages.map(m => (
              <div key={m.id} className={'msg ' + m.role + ' fade'}>
                <div className="av">
                  {m.role === 'user' ? 'You' : cleanIcon(active?.icon, initials(active?.name))}
                </div>
                <div className="body">
                  <div className="who">{m.role === 'user' ? 'You' : active?.name}</div>
                  <div className="txt">{m.text}{m.streaming && <span className="caret"></span>}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="composer-wrap">
            {active?.id === ORCH_ID && managed.length > 0 && (
              <div className="mentionbar">
                <span className="mb-l">Delegate</span>
                {managed.map(a => (
                  <button key={a.id} className="mchip" onClick={() => insertMention(a.id)} title={'@' + a.id}>
                    <span>{cleanIcon(a.icon, initials(a.name))}</span>
                    {a.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
            <div className="composer">
              <textarea
                id="composer"
                ref={taRef}
                rows={1}
                value={composer}
                onChange={e => setComposer(e.target.value)}
                onKeyDown={onComposerKey}
                placeholder={active?.id === ORCH_ID ? 'Ask the Orchestrator to coordinate your agents' : 'Message ' + (active?.name || 'agent')}
              />
              <button className="send" onClick={send} disabled={thread.running}>Run</button>
            </div>
            <div className="hint">
              {settings.demo
                ? 'Demo mode'
                : <>Broker <span>{settings.base}</span> / session <b>{activeSession}</b></>}
            </div>
          </div>
        </section>

        <aside className="col right">
          <div className={'mc-head' + (anyRunning ? ' running' : '')}>
            <div>
              <span className="t">Mission Control</span>
              <small>{anyRunning ? 'Run in progress' : 'Idle'}</small>
            </div>
            <button className={'ghost raw' + (rawOpen ? ' on' : '')} onClick={() => setRawOpen(o => !o)}>Raw</button>
          </div>

          <FlowPanel
            orchestrator={orchestrator}
            agents={managed}
            timeline={state.timeline}
            running={anyRunning}
            conn={state.conn}
          />

          <div className="tl" ref={tlRef}>
            {state.timeline.length === 0 ? (
              <div className="tl-empty">
                <div className="empty-ring">MC</div>
                Activity appears here when an agent plans, calls tools, or delegates work.
              </div>
            ) : state.timeline.map(t => <TimelineItem key={t.id} t={t} agentsById={agentsById} />)}
          </div>
          <div className={'rawlog' + (rawOpen ? ' show' : '')} ref={rawRef}>
            {state.raw.map(r => <div key={r.id} className={'r ' + r.kind}>{r.line}</div>)}
          </div>
        </aside>
      </main>

      {agentModal && (
        <AgentModal
          entry={agentModal}
          onSave={saveAgent}
          onDelete={agentModal.mode === 'edit' && agentModal.agent.id !== ORCH_ID ? () => { deleteAgent(agentModal.agent.id); setAgentModal(null) } : null}
          onClose={() => setAgentModal(null)}
        />
      )}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

function AgentCard({ a, active, running, hasMsgs, orchestrator, meta, onSelect, onEdit, onDelete }) {
  const dot = running ? 'running' : (hasMsgs ? 'ready' : 'idle')
  return (
    <div className={'sa' + (active ? ' active' : '') + (orchestrator ? ' orch' : '')} onClick={onSelect} title={'@' + a.id}>
      <div className="ic">{cleanIcon(a.icon, initials(a.name))}</div>
      <div className="meta">
        <div className="nm">{a.name}</div>
        <div className="ds">{a.role || meta}</div>
      </div>
      <div className="right-col">
        <span className={'sdot ' + dot} title={dot}></span>
        <div className="rowact">
          {onEdit && <button className="iact" onClick={e => { e.stopPropagation(); onEdit() }} title="Edit">Edit</button>}
          {onDelete && <button className="iact danger" onClick={e => { e.stopPropagation(); onDelete() }} title="Delete">Del</button>}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ active, onPick }) {
  const isOrch = active?.id === ORCH_ID
  const sugg = isOrch
    ? ['Plan a launch with research and content', 'Compare competitors and brief the team', 'Create an SEO content sprint']
    : [(active?.role ? ('Help with ' + active.role) : ('What can you do, ' + (active?.name || 'agent') + '?')), 'Give me a useful example']
  return (
    <div className="empty">
      <div className="empty-ring">{cleanIcon(active?.icon, initials(active?.name))}</div>
      <h2>{isOrch ? 'Orchestrator ready' : (active?.name + ' ready')}</h2>
      <p>{isOrch
        ? 'Start with a goal. Managed agents will appear in the flow panel as work is delegated.'
        : 'Start a direct thread with this specialist.'}</p>
      <div className="suggest">
        {sugg.map((s, i) => <button key={i} onClick={() => onPick(s)}>{s}</button>)}
      </div>
    </div>
  )
}

function FlowPanel({ orchestrator, agents, timeline, running, conn }) {
  const delegated = timeline.filter(t => t.kind === 'sub')
  const latestByName = new Map()
  for (const item of delegated) latestByName.set(item.title, item)
  const recent = delegated.slice(-3).reverse()
  const shown = agents.slice(0, 6)

  const stateFor = agent => {
    const event = latestByName.get(agent.name)
    if (!event) return 'idle'
    if (event.badge === 'done') return 'done'
    if (event.badge === 'error') return 'error'
    return 'running'
  }

  return (
    <section className="flow-card">
      <div className="flow-header">
        <div>
          <h3>Run Graph</h3>
          <p>{running ? 'Live delegation map' : 'Ready for the next run'}</p>
        </div>
        <span className={'flow-status ' + conn}>{conn}</span>
      </div>

      <div className="flow-map">
        <div className={'flow-node main' + (running ? ' running' : '')}>
          <span>{cleanIcon(orchestrator?.icon, 'OC')}</span>
          <b>{orchestrator?.name || 'Orchestrator'}</b>
        </div>
        <div className="flow-rail"></div>
        <div className="flow-agents">
          {shown.length === 0 ? (
            <div className="flow-empty">No managed agents yet.</div>
          ) : shown.map(agent => {
            const status = stateFor(agent)
            return (
              <div key={agent.id} className={'flow-agent ' + status}>
                <span>{cleanIcon(agent.icon, initials(agent.name))}</span>
                <div>
                  <b>{agent.name}</b>
                  <small>{status}</small>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flow-recent">
        {recent.length === 0 ? (
          <span>No delegated runs yet.</span>
        ) : recent.map(item => (
          <span key={item.id}>{item.title}: {item.badge || 'queued'}</span>
        ))}
      </div>
    </section>
  )
}

function TimelineItem({ t, agentsById }) {
  if (t.kind === 'divider') return <div className="run-div">{t.text}</div>
  if (t.kind === 'sub') {
    const parent = t.parent && agentsById[t.parent]
    return (
      <div className="node sub fade">
        <div className="knob"></div>
        <div className="sub-card">
          <div className="top">
            <div className="sic">{cleanIcon(t.icon, 'A')}</div>
            <div className="submeta">
              <div className="snm">{t.title}</div>
              <div className="stask">{parent ? (parent.name + ' / ') : ''}{t.sub}</div>
            </div>
            <div className={'badge ' + (t.badge || 'queued')}><span>{t.badge || 'queued'}</span></div>
          </div>
          {t.stream ? <div className="substream">{t.stream}</div> : null}
          {t.result ? <div className="result">{t.result}</div> : null}
        </div>
      </div>
    )
  }
  return (
    <div className={'node ' + (t.cls || '') + ' fade'}>
      <div className="knob"></div>
      <div className="head">
        {t.head} {t.tag ? <span className="tag">{t.tag}</span> : null}
        <span className="status">{t.status || ''}</span>
      </div>
      {t.sub ? <div className="sub">{t.sub}</div> : null}
      {t.pre ? <div className="pre">{t.pre}</div> : null}
    </div>
  )
}

function AgentModal({ entry, onSave, onDelete, onClose }) {
  const isOrch = entry.agent.id === ORCH_ID
  const [f, setF] = useState(entry.agent)
  const up = k => e => setF(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const valid = (f.name || '').trim().length > 0
  const save = () => {
    if (!valid) return
    const agent = {
      ...f,
      name: f.name.trim(),
      role: (f.role || '').trim(),
      instructions: (f.instructions || '').trim(),
      sessionKey: isOrch ? '' : ((f.sessionKey || '').trim() || ('agent_' + f.id)),
    }
    onSave(agent)
  }
  return (
    <div className="overlay show" onMouseDown={e => { if (e.target.classList.contains('overlay')) onClose() }}>
      <div className="login-card wide">
        <div className="brand">
          <div className="modal-icon">{cleanIcon(f.icon, initials(f.name || 'Agent'))}</div>
          <div>
            <h1>{entry.mode === 'new' ? 'New agent' : 'Edit agent'}</h1>
            <small>{isOrch ? 'Main coordinator' : 'Specialist profile'}</small>
          </div>
        </div>

        <label className="fld"><span>Name</span>
          <input className="input" autoFocus value={f.name} onChange={up('name')} placeholder="Marketing Strategist" /></label>

        <label className="fld"><span>Role</span>
          <input className="input" value={f.role} onChange={up('role')} placeholder="GTM, campaigns, positioning" /></label>

        <div className="fld"><span>Icon</span>
          <div className="iconpick">
            {ICONS.map(ic => (
              <button key={ic} className={'ipk' + (f.icon === ic ? ' on' : '')} onClick={() => setF(s => ({ ...s, icon: ic }))}>{cleanIcon(ic, 'A')}</button>
            ))}
          </div>
        </div>

        <label className="fld"><span>Instructions</span>
          <textarea className="input ta" value={f.instructions} onChange={up('instructions')} rows={4}
            placeholder="What is this agent responsible for?" /></label>

        {!isOrch && (
          <label className="demo-row"><input type="checkbox" checked={!!f.managedByOrchestrator} onChange={up('managedByOrchestrator')} /> Managed by Orchestrator</label>
        )}
        {!isOrch && (
          <div className="scope-note modal-note">
            Session <span>{(f.sessionKey || ('agent_' + f.id))}</span>
          </div>
        )}

        <div className="modal-actions">
          {onDelete && <button className="ghost danger" onClick={onDelete}>Delete</button>}
          <div />
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={!valid}>{entry.mode === 'new' ? 'Create agent' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}

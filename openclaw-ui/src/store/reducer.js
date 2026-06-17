import { ORCH_ID } from '../agents.js'

let _seq = 0
export const rid = () => 'x' + (++_seq)

export const initial = { conn: 'off', threads: {}, timeline: [], subIndex: {}, raw: [] }
export const blank = () => ({ messages: [], running: false, curAssistant: null })
export const getT = (s, id) => s.threads[id] || blank()
const withT = (s, id, t) => ({ ...s, threads: { ...s.threads, [id]: t } })

// True if `text` is identical to the most recent assistant message — used to drop
// duplicate finals the broker sometimes emits twice.
const dupOfLastAssistant = (messages, text) => {
  const last = messages[messages.length - 1]
  return !!last && last.role === 'assistant' && (last.text || '') === (text || '')
}

// Collapse consecutive identical assistant messages (duplicate broker finals).
// Used at render time as a hard guarantee the UI never shows a doubled reply.
export function dedupeMessages(messages) {
  const out = []
  for (const m of messages || []) {
    const last = out[out.length - 1]
    if (last && last.role === 'assistant' && m.role === 'assistant' && (last.text || '') === (m.text || '') && (m.text || '') !== '') continue
    out.push(m)
  }
  return out
}

export function reducer(s, a) {
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
    case 'thread.restore': {
      // unconditionally load a saved conversation's messages into the agent's thread
      const t = getT(s, aid)
      return withT(s, aid, { ...t, messages: a.messages || [], running: false, curAssistant: null })
    }
    case 'thread.set': {
      const t = getT(s, aid)
      if (t.running) return s // never clobber an in-flight run
      const server = dedupeMessages(a.messages || [])
      // adopt the server history when it's at least as complete as the local copy
      if (server.length >= t.messages.length) return withT(s, aid, { ...t, messages: server })
      return s
    }
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
      return withT(s, aid, { ...t, messages: t.messages.concat({ id: rid(), role: 'user', text: a.text, ts: Date.now() }) })
    }
    case 'assistant.start': {
      const t = getT(s, aid)
      const id = rid()
      return withT(s, aid, {
        ...t,
        curAssistant: id,
        messages: t.messages.concat({ id, role: 'assistant', text: '', streaming: true, ts: Date.now() }),
      })
    }
    case 'assistant.delta': {
      const t = getT(s, aid)
      let cur = t.curAssistant
      let messages = t.messages
      if (!cur) {
        cur = rid()
        messages = messages.concat({ id: cur, role: 'assistant', text: '', streaming: true, ts: Date.now() })
      }
      messages = messages.map((m) =>
        m.id === cur ? { ...m, streaming: true, text: a.replace ? a.text : m.text + a.text } : m,
      )
      return withT(s, aid, { ...t, curAssistant: cur, messages })
    }
    case 'assistant.final': {
      const t = getT(s, aid)
      let cur = t.curAssistant
      let messages = t.messages
      if (!cur) {
        if (!a.text) return s
        if (dupOfLastAssistant(messages, a.text)) return s // drop duplicate broker final
        return withT(s, aid, { ...t, messages: messages.concat({ id: rid(), role: 'assistant', text: a.text, ts: Date.now() }) })
      }
      const idx = messages.findIndex((m) => m.id === cur)
      const curMsg = idx >= 0 ? messages[idx] : null
      const resolved = curMsg ? (a.text && a.text.length > curMsg.text.length ? a.text : curMsg.text) : ''
      const prev = idx > 0 ? messages[idx - 1] : null
      // If this streamed bubble ends up identical to the one before it, it's a
      // duplicate run — drop it instead of finalizing.
      if (resolved && prev && prev.role === 'assistant' && (prev.text || '') === resolved) {
        return withT(s, aid, { ...t, curAssistant: null, messages: messages.filter((m) => m.id !== cur) })
      }
      messages = messages.map((m) => (m.id === cur ? { ...m, streaming: false, text: resolved } : m))
      return withT(s, aid, { ...t, curAssistant: null, messages })
    }
    case 'assistant.note': {
      const t = getT(s, aid)
      if (dupOfLastAssistant(t.messages, a.text)) return s
      return withT(s, aid, { ...t, messages: t.messages.concat({ id: rid(), role: 'assistant', text: a.text, ts: Date.now() }) })
    }

    case 'node':
      return { ...s, timeline: s.timeline.concat({ id: a.id || rid(), kind: 'node', ...a.node }) }
    case 'node.status':
      return {
        ...s,
        timeline: s.timeline.map((t) => (t.id === a.id ? { ...t, status: a.status, pre: a.pre != null ? a.pre : t.pre } : t)),
      }
    case 'sub.spawn': {
      const id = rid()
      return {
        ...s,
        subIndex: { ...s.subIndex, [a.key]: id },
        timeline: s.timeline.concat({
          id, kind: 'sub', key: a.key, title: a.name || a.key, icon: a.icon,
          parent: a.parent, sub: a.task || '', badge: 'queued', stream: '',
        }),
      }
    }
    case 'sub.delta': {
      const ex = s.subIndex[a.key]
      if (ex) {
        return {
          ...s,
          timeline: s.timeline.map((t) =>
            t.id === ex ? { ...t, badge: 'running', stream: a.replace ? a.text : (t.stream || '') + a.text } : t,
          ),
        }
      }
      const id = rid()
      return {
        ...s,
        subIndex: { ...s.subIndex, [a.key]: id },
        timeline: s.timeline.concat({
          id, kind: 'sub', key: a.key, title: a.key, parent: a.parent,
          sub: 'delegated run', badge: 'running', stream: a.text,
        }),
      }
    }
    case 'sub.status': {
      const ex = s.subIndex[a.key]
      if (!ex) return s
      return { ...s, timeline: s.timeline.map((t) => (t.id === ex ? { ...t, badge: a.status } : t)) }
    }
    case 'sub.result': {
      const ex = s.subIndex[a.key]
      if (!ex) return s
      return {
        ...s,
        timeline: s.timeline.map((t) => (t.id === ex ? { ...t, badge: a.status || 'done', result: a.summary } : t)),
      }
    }
    default:
      return s
  }
}

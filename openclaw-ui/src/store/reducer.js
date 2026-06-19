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
    case 'thread.catchup': {
      const t = getT(s, aid)
      const server = dedupeMessages(a.messages || []).map((m) => ({ ...m, streaming: false }))
      if (!server.length) return s

      const local = t.messages || []
      const lastServer = server[server.length - 1]
      const hasFinalAssistant = lastServer?.role === 'assistant' && String(lastServer.text || '').trim()

      if (t.running) {
        const localWithoutEmptyPlaceholder = local.filter((m) => !(m.id === t.curAssistant && m.role === 'assistant' && !String(m.text || '').trim()))
        // Only finish a running thread when server history has advanced through a
        // real assistant answer. This fixes missed SSE finals without replacing a
        // still-generating local stream with stale history.
        if (hasFinalAssistant && server.length >= localWithoutEmptyPlaceholder.length) {
          return {
            ...withT(s, aid, { messages: server, running: false, curAssistant: null }),
            timeline: s.timeline.concat({ id: rid(), kind: 'divider', text: 'run complete' }),
          }
        }
        return s
      }

      if (server.length >= local.length) return withT(s, aid, { ...t, messages: server, running: false, curAssistant: null })
      return s
    }
    case 'reset.all':
      return { ...initial, conn: s.conn, raw: s.raw }

    case 'run.start': {
      const t = { ...getT(s, aid), running: true }
      return {
        ...withT(s, aid, t),
        // Stamp the run divider with the query + agent so the artifact can show a
        // separate, labelled entry per query (run history). runId is filled in by
        // 'run.tag' once the broker's /chat response returns it (for cross-device dedup).
        timeline: s.timeline.concat({ id: rid(), kind: 'divider', text: a.title || 'run started', query: a.query || '', agent: aid, ts: Date.now(), runId: a.runId || null }),
      }
    }
    case 'run.tag': {
      // Attach the broker runId to this agent's most recent (untagged) run divider, so a
      // server-loaded copy of the same run dedups against it instead of duplicating.
      const tl = [...s.timeline]
      for (let i = tl.length - 1; i >= 0; i--) {
        const it = tl[i]
        if (it.kind === 'divider' && it.agent === aid && !it.runId && !/^run (complete|failed|stopped)$/i.test(String(it.text || '').trim())) {
          tl[i] = { ...it, runId: a.runId }
          return { ...s, timeline: tl }
        }
      }
      return s
    }
    case 'timeline.merge': {
      // Merge server-stored runs in, skipping any whose runId is already present.
      const have = new Set(s.timeline.filter((t) => t.kind === 'divider' && t.runId).map((t) => t.runId))
      const add = []
      for (const r of a.runs || []) if (r.runId && !have.has(r.runId)) add.push(...(r.items || []))
      return add.length ? { ...s, timeline: s.timeline.concat(add) } : s
    }
    case 'run.end': {
      const current = getT(s, aid)
      // A user stop always proceeds (even with no running parent) so it can settle
      // background subs and drop the divider.
      if (!current.running && !current.curAssistant && a.status !== 'stopped') return s
      // Drop any trailing empty assistant placeholder. A fully-delegated run can end
      // without the parent ever streaming its own text; leaving the empty bubble would
      // keep the UI stuck "working" forever (awaitingAnswer never clears).
      let messages = current.messages
      while (messages.length && messages[messages.length - 1].role === 'assistant' && !String(messages[messages.length - 1].text || '').trim()) {
        messages = messages.slice(0, -1)
      }
      const t = { ...current, running: false, curAssistant: null, messages }
      // On an explicit user stop, settle still-running delegated subs right away so the
      // spinner/map clears instantly (the broker cascade-aborts them server-side too).
      const base = a.status === 'stopped'
        ? s.timeline.map((it) => (it.kind === 'sub' && it.badge !== 'done' && it.badge !== 'error' ? { ...it, badge: 'done' } : it))
        : s.timeline
      return {
        ...withT(s, aid, t),
        timeline: base.concat({ id: rid(), kind: 'divider', text: a.status === 'error' ? 'run failed' : a.status === 'stopped' ? 'run stopped' : 'run complete' }),
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
      const ex = s.subIndex[a.key]
      if (ex) {
        return {
          ...s,
          timeline: s.timeline.map((t) =>
            t.id === ex
              ? { ...t,
                  title: a.name && (!t.title || t.title === t.key) ? a.name : t.title,
                  parent: a.parent || t.parent,
                  sub: a.task || t.sub,
                  badge: a.status || t.badge }
              : t,
          ),
        }
      }
      const id = rid()
      return {
        ...s,
        subIndex: { ...s.subIndex, [a.key]: id },
        timeline: s.timeline.concat({
          id, kind: 'sub', key: a.key, title: a.name || a.key, icon: a.icon,
          parent: a.parent, sub: a.task || '', badge: a.status || 'queued', stream: '',
        }),
      }
    }
    case 'sub.delta': {
      const ex = s.subIndex[a.key]
      if (ex) {
        return {
          ...s,
          timeline: s.timeline.map((t) =>
            t.id === ex
              ? { ...t,
                  // New output means the agent is alive: recover from a stale/transient
                  // 'error' back to 'running'. Only a real 'done' final stays terminal.
                  badge: t.badge === 'done' ? 'done' : 'running',
                  title: a.name && (!t.title || t.title === t.key) ? a.name : t.title,
                  // On replace, keep whichever text is longer — a terminal 'final' carrying
                  // the full output replaces streamed deltas, but a short final can't wipe them.
                  stream: a.replace ? (String(a.text || '').length >= String(t.stream || '').length ? a.text : t.stream) : (t.stream || '') + a.text }
              : t,
          ),
        }
      }
      const id = rid()
      return {
        ...s,
        subIndex: { ...s.subIndex, [a.key]: id },
        timeline: s.timeline.concat({
          id, kind: 'sub', key: a.key, title: a.name || a.key, parent: a.parent,
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

// =============================================================================
//  Gateway WebSocket client (direct browser connection, testing).
//  Speaks the native control-plane protocol the built-in dashboard uses.
//  Reverse-engineered from packages/gateway-protocol/src/schema.
//
//  Frames:   { type:"req",  id, method, params }
//            { type:"res",  id, ok, payload?, error? }
//            { type:"event", event, payload?, seq? }
//  Handshake: server event "connect.challenge" -> client req "connect" -> hello-ok
//  Send:     "chat.send" {sessionKey,message,idempotencyKey} | "sessions.send" {key,message}
//  Stream:   event payload.state = delta|final|aborted|error ; deltaText/message ;
//            spawnedBy set => the run is a subagent/child of the main session.
//
//  NOTE: the app talks to the broker (broker.js), not this client. This file is
//  kept for direct-gateway testing and protocol reference.
// =============================================================================

export function wsify(u) {
  u = (u || '').trim().replace(/\/+$/, '')
  if (!u) return ''
  if (u.indexOf('https://') === 0) return 'wss://' + u.slice(8)
  if (u.indexOf('http://') === 0) return 'ws://' + u.slice(7)
  if (u.indexOf('wss://') === 0 || u.indexOf('ws://') === 0) return u
  return 'wss://' + u
}

export function host(u) { try { return new URL(u).host } catch { return u } }

const uid = () => Math.random().toString(36).slice(2, 9)

function textOf(m) {
  if (m == null) return ''
  if (typeof m === 'string') return m
  if (Array.isArray(m)) return m.map(textOf).filter(Boolean).join('')
  if (typeof m === 'object') {
    if (typeof m.text === 'string') return m.text
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) return m.content.map(c => (typeof c === 'string' ? c : (c && c.text) || '')).join('')
  }
  return ''
}
function shortJson(v) { try { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 600 ? s.slice(0, 600) + '…' : s } catch { return String(v) } }
function humanize(n) { return n.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

export class GatewayClient {
  constructor(cfg, dispatch) {
    this.cfg = cfg                 // { base, token, pass, session, method }
    this.d = dispatch
    this.ws = null
    this.reqId = 0
    this.pending = {}
    this.connected = false
    this.connectSent = false
    this.method = cfg.method || 'chat.send'
  }

  raw(kind, line) { this.d({ type: 'raw', kind, line }) }
  status(s) { this.d({ type: 'conn', status: s }) }

  connect() {
    this.close(true)
    const url = wsify(this.cfg.base)
    if (!url) { this.status('off'); return }
    this.status('connecting')
    this.raw('sys', 'connecting → ' + url)
    let ws
    try { ws = new WebSocket(url) }
    catch (err) { this.raw('err', 'WebSocket failed: ' + err.message); this.status('off'); return }
    this.ws = ws
    ws.onopen = () => { this.raw('sys', 'socket open — awaiting connect.challenge'); setTimeout(() => { if (!this.connectSent) this.sendConnect() }, 700) }
    ws.onmessage = e => this.onFrame(e.data)
    ws.onerror = () => { this.raw('err', 'socket error (origin not allowed, wrong URL, or Access blocking the WS)') }
    ws.onclose = ev => {
      this.connected = false; this.connectSent = false
      this.status('off')
      this.raw('err', 'socket closed · code ' + ev.code + (ev.reason ? (' · ' + ev.reason) : ''))
      this.d({ type: 'run.end' })
    }
  }

  close(silent) {
    try { if (this.ws) { this.ws.onclose = null; this.ws.close() } } catch {}
    this.ws = null; this.connected = false; this.connectSent = false
    if (!silent) this.status('off')
  }

  send(obj) { try { const s = JSON.stringify(obj); this.raw('out', '▶ ' + s.slice(0, 500)); this.ws.send(s) } catch (err) { this.raw('err', 'send failed: ' + err.message) } }

  rpc(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) { reject(new Error('socket not open')); return }
      const id = 'r' + (++this.reqId)
      this.pending[id] = { resolve, reject }
      this.send({ type: 'req', id, method, params })
      setTimeout(() => { if (this.pending[id]) { delete this.pending[id]; reject(new Error('timeout: ' + method)) } }, 30000)
    })
  }

  sendConnect() {
    if (this.connectSent) return
    this.connectSent = true
    const params = {
      minProtocol: 3, maxProtocol: 4,
      client: { id: 'cli', version: '0.1.0', platform: 'web', mode: 'cli' },
      caps: ['tool-events'],
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
    }
    const auth = {}
    if (this.cfg.token) auth.token = this.cfg.token
    if (this.cfg.pass) auth.password = this.cfg.pass
    if (Object.keys(auth).length) params.auth = auth
    this.raw('sys', 'sending connect handshake')
    this.rpc('connect', params).then(p => this.onHello(p)).catch(err => {
      this.raw('err', 'connect rejected: ' + err.message)
      this.status('off')
      this.d({ type: 'assistant.note', text: 'Could not authenticate to the gateway: ' + err.message + '. Check token/password, and that the gateway allows this origin.' })
    })
  }

  async onHello(payload) {
    this.connected = true
    this.status('live')
    const auth = (payload && payload.auth) || {}
    this.raw('sys', 'hello-ok · protocol ' + (payload && payload.protocol) + ' · granted role=' + (auth.role || '?') + ' scopes=' + JSON.stringify(auth.scopes || []))
    try { await this.rpc('sessions.messages.subscribe', { key: this.cfg.session }); this.raw('sys', 'subscribed to session "' + this.cfg.session + '"') }
    catch (e) { this.raw('err', 'subscribe failed: ' + e.message + ' (will still try to send)') }
  }

  onFrame(data) {
    let f
    try { f = JSON.parse(data) } catch { this.raw('err', 'non-JSON frame'); return }
    this.raw('in', '◀ ' + String(data).slice(0, 500))
    if (f.type === 'res') {
      const p = this.pending[f.id]
      if (p) { delete this.pending[f.id]; f.ok ? p.resolve(f.payload) : p.reject(new Error((f.error && (f.error.message || f.error.code)) || 'request failed')) }
      return
    }
    if (f.type === 'event') this.onEvent(f.event || '', f.payload || {})
  }

  onEvent(name, p) {
    if (name === 'connect.challenge') { this.sendConnect(); return }
    if (name === 'tick') return
    if (name === 'shutdown') { this.raw('sys', 'gateway shutdown: ' + (p && p.reason || '')); return }
    if (p && (p.state === 'delta' || p.state === 'final' || p.state === 'aborted' || p.state === 'error')) { this.onChat(name, p); return }
    if (/tool/i.test(name)) { this.onTool(name, p); return }
    if (/operation|run|session|agent/i.test(name)) { this.d({ type: 'node', node: { cls: 'think', head: humanize(name), tag: 'event', sub: shortJson(p) } }); return }
    this.raw('sys', 'unhandled event ' + name)
  }

  isChild(p) { return !!p.spawnedBy || (p.sessionKey && p.sessionKey !== this.cfg.session) }

  onChat(name, p) {
    if (this.isChild(p)) {
      const key = p.sessionKey || ('child_' + (p.runId || uid()))
      if (p.state === 'delta') this.d({ type: 'sub.delta', key, parent: p.spawnedBy, text: p.deltaText || '', replace: p.replace === true })
      else if (p.state === 'final') this.d({ type: 'sub.status', key, status: 'done' })
      else this.d({ type: 'sub.status', key, status: 'error' })
      return
    }
    if (p.state === 'delta') this.d({ type: 'assistant.delta', text: p.deltaText || '', replace: p.replace === true })
    else if (p.state === 'final') { this.d({ type: 'assistant.final', text: textOf(p.message) }); this.d({ type: 'run.end', status: 'ok' }) }
    else if (p.state === 'aborted') { this.d({ type: 'assistant.final', text: textOf(p.message) }); this.d({ type: 'node', node: { cls: 'error', head: 'Run aborted', sub: p.stopReason || '' } }); this.d({ type: 'run.end' }) }
    else if (p.state === 'error') { this.d({ type: 'assistant.final', text: textOf(p.message) }); this.d({ type: 'node', node: { cls: 'error', head: 'Error', sub: p.errorMessage || 'chat error' } }); this.d({ type: 'run.end', status: 'error' }) }
  }

  onTool(name, p) {
    const tool = p.tool || p.name || p.toolName || name
    const phase = p.phase || p.state || p.status || ''
    if (/result|end|final|done/i.test(phase)) this.d({ type: 'node', node: { cls: 'tool', head: 'Tool · ' + tool, tag: 'result', sub: p.result != null ? shortJson(p.result) : '', status: '✓' } })
    else if (/error/i.test(phase)) this.d({ type: 'node', node: { cls: 'error', head: 'Tool error · ' + tool, sub: shortJson(p.error || p) } })
    else this.d({ type: 'node', node: { cls: 'tool', head: 'Tool · ' + tool, tag: 'call', sub: p.args != null ? ('args ' + shortJson(p.args)) : '', status: '…' } })
  }

  async sendMessage(text) {
    if (!this.connected) { this.connect(); await new Promise(r => setTimeout(r, 1200)) }
    if (!this.connected) { this.d({ type: 'assistant.note', text: 'Not connected yet — open the “raw” panel to see why.' }); return false }
    this.d({ type: 'run.start', title: host(wsify(this.cfg.base)) + ' · ' + this.cfg.session })
    this.d({ type: 'assistant.start' })
    let ok = await this.trySend(this.method, text)
    if (!ok) {
      const alt = this.method === 'chat.send' ? 'sessions.send' : 'chat.send'
      this.raw('sys', 'retrying with ' + alt)
      ok = await this.trySend(alt, text)
      if (ok) this.method = alt
    }
    if (!ok) { this.d({ type: 'node', node: { cls: 'error', head: 'Send failed', sub: 'Both chat.send and sessions.send failed — see raw log.' } }); this.d({ type: 'run.end', status: 'error' }) }
    return ok
  }

  async trySend(method, text) {
    try {
      if (method === 'sessions.send') await this.rpc('sessions.send', { key: this.cfg.session, message: text })
      else await this.rpc('chat.send', { sessionKey: this.cfg.session, message: text, idempotencyKey: 'idem_' + uid() })
      this.raw('sys', method + ' accepted')
      return true
    } catch (err) { this.raw('err', method + ' failed: ' + err.message); return false }
  }
}

import { useEffect, useState } from 'react'
import { Server, KeyRound, Hash, FlaskConical, Plus, Trash2, Lock } from 'lucide-react'
import { useMission } from '../store/mission.jsx'
import { Api } from '../lib/api.js'
import { PageLayout } from '../components/layout/PageLayout.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'

function CredentialsCard() {
  const [file, setFile] = useState('global.env')
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setLoading(true)
    setErr('')
    try {
      const r = await Api.secrets.list()
      setFile(r.file)
      setKeys(r.keys)
    } catch (e) {
      setErr(e.message || 'Failed to load credentials')
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  async function add(e) {
    e.preventDefault()
    if (!name.trim() || !value) return
    setBusy(true)
    setErr('')
    try {
      await Api.secrets.add(name.trim(), value)
      setName('')
      setValue('')
      await refresh()
    } catch (error) {
      setErr(error.message || 'Failed to save')
    }
    setBusy(false)
  }

  async function remove(k) {
    if (!window.confirm(`Remove ${k}? Agents will lose access to it.`)) return
    setBusy(true)
    setErr('')
    try {
      await Api.secrets.remove(k)
      await refresh()
    } catch (error) {
      setErr(error.message || 'Failed to remove')
    }
    setBusy(false)
  }

  return (
    <Card className="mt-4 p-0">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-strong">Agent credentials</h3>
          <Badge variant="outline" className="font-mono">{file}</Badge>
        </div>
        <span className="text-xs text-slate-400">{keys.length} set</span>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="secret-name">
            Name
          </label>
          <Input
            id="secret-name"
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            placeholder="DATAFORSEO_LOGIN"
            className="font-mono"
            autoComplete="off"
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="secret-value">
            Value
          </label>
          <Input
            id="secret-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="********"
            type="password"
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" disabled={busy || !name.trim() || !value}>
          <Plus className="mr-1 h-4 w-4" />
          Save
        </Button>
      </form>

      {err && <div className="px-5 py-2 text-sm text-rose-600">{err}</div>}

      <div className="divide-y divide-slate-100">
        {loading ? (
          <div className="px-5 py-4 text-sm text-slate-400">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="px-5 py-4 text-sm text-slate-400">No credentials yet. Add one above.</div>
        ) : keys.map((k) => (
          <div key={k} className="flex items-center gap-4 px-5 py-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500">
              <Lock className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="font-mono text-sm text-strong">{k}</div>
              <div className="font-mono text-xs text-slate-400">************</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(k)} disabled={busy} title="Remove">
              <Trash2 className="h-4 w-4 text-slate-400" />
            </Button>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
        Stored server-side in the agent credentials store and loaded into every agent&apos;s environment.
        Values are write-only - once saved they are never sent back to the browser.
      </div>
    </Card>
  )
}

export default function SettingsPage() {
  const { settings, state } = useMission()
  const rows = [
    { icon: Server, label: 'Broker URL', value: settings.base || '-', mono: true },
    { icon: Hash, label: 'Main session', value: settings.session, mono: true },
    { icon: KeyRound, label: 'Broker secret', value: settings.secret ? '********' + settings.secret.slice(-4) : 'not set', mono: true },
    { icon: FlaskConical, label: 'Demo mode', value: settings.demo ? 'on' : 'off' },
  ]

  return (
    <PageLayout kicker="Administration" title="Settings" description="Connection configuration for this Mission Control instance.">
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-strong">Broker connection</h3>
          <Badge variant={state.conn === 'live' ? 'success' : state.conn === 'connecting' ? 'warning' : 'outline'}>{state.conn}</Badge>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-4 px-5 py-4">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <r.icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{r.label}</div>
                <div className={r.mono ? 'font-mono text-sm text-strong' : 'text-sm text-strong'}>{r.value}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <CredentialsCard />
    </PageLayout>
  )
}

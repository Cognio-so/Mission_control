import { useState } from 'react'
import { Lock } from 'lucide-react'
import { useAdminUnlocked, unlockAdmin } from '../../lib/adminLock.js'
import { Button } from '../ui/button.jsx'

// Guards admin routes (Gateways / Organization / Settings). Until the admin passcode is
// entered, the page is replaced by this prompt — so direct URL access is blocked too.
export function AdminGate({ children }) {
  const unlocked = useAdminUnlocked()
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')

  if (unlocked) return children

  const submit = (e) => {
    e.preventDefault()
    if (unlockAdmin(pass)) { setPass(''); setError('') }
    else setError('Incorrect passcode')
  }

  return (
    <div className="grid min-h-full place-items-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow-pop)]"
      >
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]">
          <Lock className="h-5 w-5" />
        </div>
        <h2 className="font-heading text-lg font-semibold text-strong">Administration</h2>
        <p className="mt-1 text-sm text-muted">Enter the admin passcode to open Gateways, Organization, and Settings.</p>
        <input
          type="password"
          autoFocus
          value={pass}
          onChange={(e) => { setPass(e.target.value); setError('') }}
          placeholder="Admin passcode"
          className="mt-4 h-11 w-full rounded-xl border border-[color:var(--border)] bg-white/80 px-3 text-sm text-strong outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
        />
        {error && <div className="mt-2 text-xs font-medium text-[color:var(--danger)]">{error}</div>}
        <Button type="submit" className="mt-4 w-full">Unlock</Button>
      </form>
    </div>
  )
}

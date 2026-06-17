import { useEffect, useState } from 'react'
import { LockKeyhole, LogIn } from 'lucide-react'
import { authenticate, isAuthenticated, isLoginEnabled } from '../../lib/auth.js'
import { Button } from '../ui/button.jsx'
import { Input } from '../ui/input.jsx'

export function LoginGate({ children }) {
  const [authed, setAuthed] = useState(() => isAuthenticated())
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const onAuthChange = () => setAuthed(isAuthenticated())
    window.addEventListener('cognio-auth-change', onAuthChange)
    window.addEventListener('storage', onAuthChange)
    return () => {
      window.removeEventListener('cognio-auth-change', onAuthChange)
      window.removeEventListener('storage', onAuthChange)
    }
  }, [])

  if (!isLoginEnabled() || authed) return children

  const submit = (event) => {
    event.preventDefault()
    setError('')
    if (authenticate(username.trim(), password)) {
      setAuthed(true)
      window.dispatchEvent(new Event('cognio-auth-change'))
      return
    }
    setPassword('')
    setError('Invalid username or password.')
  }

  return (
    <main className="grid min-h-screen place-items-center bg-app px-4 py-8">
      <section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-600 text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.26em] text-strong">COGNIO</div>
            <div className="text-xs font-medium text-quiet">Mission Control</div>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-quiet" htmlFor="login-username">
              Username
            </label>
            <Input
              id="login-username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-quiet" htmlFor="login-password">
              Password
            </label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full">
            <LogIn className="h-4 w-4" />
            Sign in
          </Button>
        </form>
      </section>
    </main>
  )
}

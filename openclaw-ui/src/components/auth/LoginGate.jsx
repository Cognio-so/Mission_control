import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { getSession, isLoginEnabled, login } from '../../lib/auth.js'
import { Button } from '../ui/button.jsx'
import { Input } from '../ui/input.jsx'

export function LoginGate({ children }) {
  const [status, setStatus] = useState(() => (isLoginEnabled() ? 'checking' : 'authed'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function check() {
      if (!isLoginEnabled()) {
        setStatus('authed')
        return
      }
      try {
        const session = await getSession()
        if (alive) setStatus(session.authenticated ? 'authed' : 'login')
      } catch {
        if (alive) setStatus('login')
      }
    }
    check()

    const onAuthChange = () => check()
    window.addEventListener('cognio-auth-change', onAuthChange)
    return () => {
      alive = false
      window.removeEventListener('cognio-auth-change', onAuthChange)
    }
  }, [])

  if (status === 'authed') return children

  const submit = async (event) => {
    event.preventDefault()
    if (status === 'submitting') return
    setError('')
    setStatus('submitting')
    try {
      const session = await login(username.trim(), password)
      setStatus(session.authenticated ? 'authed' : 'login')
      if (!session.authenticated) setError('Invalid username or password.')
    } catch (err) {
      setPassword('')
      setError(err.message || 'Invalid username or password.')
      setStatus('login')
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(135deg,#fbf5e8_0%,#f6efdf_44%,#e5f4ee_100%)] text-[#0f2827]">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-5 py-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,440px)] lg:px-8">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="hidden lg:block"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#154f4c] text-xs font-semibold text-[#f7f1e4] shadow-sm">
              CG
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.28em] text-[#102f2d]">COGNIO</div>
              <div className="text-xs font-medium text-[#64817c]">Mission Control</div>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#b7ded4] bg-[#eef8f4] px-3 py-1 text-xs font-semibold text-[#12524c]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure workspace
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#102f2d]">
              Sign in to coordinate your agent workspace.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[#5f756f]">
              Your dashboard opens only after the broker validates this session on the server.
            </p>
          </div>

          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {['Agents', 'Boards', 'Credentials'].map((item, index) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + index * 0.08, duration: 0.35 }}
                className="rounded-lg border border-[#d9e8e1] bg-[#fffaf0]/85 px-4 py-3 shadow-sm backdrop-blur"
              >
                <div className="text-xs font-semibold uppercase text-[#7d9790]">{item}</div>
                <div className="mt-2 h-1.5 rounded-full bg-[#e7ddd0]">
                  <div className="h-full rounded-full bg-[#45a895]" style={{ width: `${72 - index * 12}%` }} />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.38, ease: 'easeOut' }}
          className="w-full rounded-[28px] border border-[#d4e4dd] bg-[#fffaf0]/95 p-6 shadow-[0_24px_80px_rgba(9,63,59,0.16)] backdrop-blur sm:p-7"
        >
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#154f4c] text-xs font-semibold text-[#f7f1e4]">
                CG
              </div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.24em] text-[#102f2d]">COGNIO</div>
                <div className="text-xs font-medium text-[#64817c]">Mission Control</div>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="text-sm font-semibold text-[#102f2d]">Sign in</div>
              <div className="text-xs text-[#6f8881]">Session required</div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#eef8f4] text-[#12524c]">
              <LockKeyhole className="h-5 w-5" />
            </div>
          </div>

          <div className="mb-6 rounded-[22px] border border-[#d5e9df] bg-[#eef8f4] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#3d8d7e]">
              <Sparkles className="h-3.5 w-3.5" />
              Private operations console
            </div>
            <div className="mt-2 text-sm leading-5 text-[#47645f]">
              Continue with your workspace credentials to unlock the live dashboard.
            </div>
          </div>

          <AnimatePresence mode="wait">
            {status === 'checking' ? (
              <motion.div
                key="checking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="h-11 animate-pulse rounded-xl bg-[#ecdfcf]" />
                <div className="h-11 animate-pulse rounded-xl bg-[#ecdfcf]" />
                <div className="h-11 animate-pulse rounded-full bg-[#c7e8df]" />
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
                onSubmit={submit}
              >
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase text-[#7b948d]" htmlFor="login-username">
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
                  <label className="mb-1.5 block text-xs font-semibold uppercase text-[#7b948d]" htmlFor="login-password">
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
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
                  >
                    {error}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  className="h-12 w-full rounded-full bg-[linear-gradient(90deg,#45a895_0%,#0f4b49_100%)] text-[#fffaf0] shadow-[0_14px_34px_rgba(15,75,73,0.24)] hover:opacity-95"
                  disabled={status === 'submitting' || !username.trim() || !password}
                >
                  {status === 'submitting' ? 'Signing in...' : 'Continue'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.section>
      </div>
    </main>
  )
}

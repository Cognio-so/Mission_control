import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { getSession, isLoginEnabled, login } from '../../lib/auth.js'
import { ThemeToggle } from '../atoms/ThemeToggle.jsx'
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
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--bg)] text-strong">
      <AuroraBackdrop />

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,432px)] lg:px-8">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="hidden lg:block"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-2xl text-sm font-semibold text-white shadow-[0_14px_40px_var(--accent-glow)] [background-image:var(--grad-brand)]">
              <span className="pointer-events-none absolute -inset-2 animate-glow-pulse bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.5),transparent_60%)]" />
              <span className="relative tracking-[0.16em]">CG</span>
            </div>
            <div>
              <div className="font-heading text-base font-semibold uppercase tracking-[0.28em] text-strong">COGNIO</div>
              <div className="text-xs font-medium text-muted">Mission Control</div>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[color:var(--border-accent)] bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--accent-strong)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure workspace
            </div>
            <h1 className="font-heading text-[2.6rem] font-semibold leading-[1.08] tracking-tight text-strong">
              Coordinate your agent teams from one&nbsp;
              <span className="bg-[linear-gradient(100deg,var(--accent),var(--accent-strong))] bg-clip-text text-transparent">command center.</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted">
              Sign in to orchestrate runs, watch agents collaborate in real time, and keep every board, skill, and
              credential in sync. Your dashboard opens only after the broker validates this session.
            </p>
          </div>

          <CoordinationPreview />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
          className="surface-glass w-full rounded-[28px] p-6 shadow-[var(--shadow-pop)] sm:p-7"
        >
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl text-xs font-semibold text-white [background-image:var(--grad-brand)]">
                CG
              </div>
              <div>
                <div className="font-heading text-sm font-semibold uppercase tracking-[0.24em] text-strong">COGNIO</div>
                <div className="text-xs font-medium text-muted">Mission Control</div>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="font-heading text-base font-semibold text-strong">Sign in</div>
              <div className="text-xs text-muted">Session required</div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--border-accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]">
              <LockKeyhole className="h-5 w-5" />
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-[color:var(--border-accent)] bg-[color:var(--surface-tint)] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--accent-strong)]">
              <Sparkles className="h-3.5 w-3.5" />
              Private operations console
            </div>
            <div className="mt-2 text-sm leading-5 text-muted">
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
                <div className="h-11 animate-pulse rounded-xl bg-[color:var(--surface-muted)]" />
                <div className="h-11 animate-pulse rounded-xl bg-[color:var(--surface-muted)]" />
                <div className="h-12 animate-pulse rounded-full bg-[color:var(--accent-soft)]" />
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
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-quiet)]" htmlFor="login-username">
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
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-quiet)]" htmlFor="login-password">
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
                    className="rounded-xl border border-transparent bg-[color:var(--danger-soft)] px-3 py-2 text-sm font-medium text-[color:var(--danger)]"
                  >
                    {error}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  className="h-12 w-full"
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

// Full-bleed animated backdrop: aurora wash + drifting orbs + a faint node network.
function AuroraBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="animate-aurora absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            'radial-gradient(60% 60% at 15% 20%, var(--accent-soft), transparent 60%), radial-gradient(55% 55% at 85% 25%, rgba(201,154,85,0.16), transparent 60%), radial-gradient(60% 60% at 50% 100%, var(--accent-soft), transparent 60%)',
        }}
      />
      <div className="absolute -left-24 top-10 h-72 w-72 animate-orb-float rounded-full bg-[color:var(--accent)] opacity-[0.16] blur-3xl" />
      <div className="absolute right-[-6rem] top-1/3 h-80 w-80 animate-orb-float rounded-full bg-[color:var(--accent-strong)] opacity-[0.14] blur-3xl" style={{ animationDelay: '-6s' }} />
      <div className="absolute bottom-[-5rem] left-1/3 h-72 w-72 animate-orb-float rounded-full bg-[color:var(--accent)] opacity-[0.12] blur-3xl" style={{ animationDelay: '-11s' }} />
      <svg className="absolute inset-0 h-full w-full opacity-[0.10]" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 600" fill="none">
        <g stroke="var(--accent-strong)" strokeWidth="1">
          <line className="animate-edge-flow" x1="120" y1="140" x2="360" y2="300" />
          <line className="animate-edge-flow" x1="360" y1="300" x2="640" y2="180" />
          <line className="animate-edge-flow" x1="360" y1="300" x2="520" y2="470" />
          <line className="animate-edge-flow" x1="120" y1="140" x2="220" y2="430" />
        </g>
        <g fill="var(--accent-strong)">
          <circle cx="120" cy="140" r="5" />
          <circle cx="360" cy="300" r="7" />
          <circle cx="640" cy="180" r="5" />
          <circle cx="520" cy="470" r="5" />
          <circle cx="220" cy="430" r="4" />
        </g>
      </svg>
    </div>
  )
}

// On-brand "moving" centerpiece — a central controller delegating to specialists,
// with edges and nodes lighting up in sequence.
function CoordinationPreview() {
  const agents = [
    { label: 'Research', x: 78, delay: 0 },
    { label: 'Content', x: 50, delay: 0.6 },
    { label: 'SEO', x: 22, delay: 1.2 },
  ]
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.5 }}
      className="surface-glass mt-10 max-w-xl rounded-2xl p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Live coordination</div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--accent-strong)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--accent)] opacity-70" />
            <span className="relative h-2 w-2 rounded-full bg-[color:var(--accent)]" />
          </span>
          3 agents
        </div>
      </div>

      <div className="relative h-28">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 56" preserveAspectRatio="none" fill="none">
          {agents.map((a) => (
            <line
              key={a.label}
              x1="50" y1="8" x2={a.x} y2="48"
              stroke="var(--accent)" strokeWidth="0.6" strokeLinecap="round"
              className="animate-edge-flow"
            />
          ))}
        </svg>

        <div className="absolute left-1/2 top-0 -translate-x-1/2">
          <div className="grid h-9 w-9 place-items-center rounded-xl text-[10px] font-bold text-white shadow-[0_8px_20px_var(--accent-glow)] [background-image:var(--grad-brand)]">CG</div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-1">
          {agents.map((a) => (
            <motion.div
              key={a.label}
              className="flex flex-col items-center gap-1"
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: a.delay }}
            >
              <motion.span
                className="grid h-8 w-8 place-items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--accent-strong)]"
                animate={{ boxShadow: ['0 0 0 0 rgba(47,158,138,0)', '0 0 0 5px var(--accent-soft)', '0 0 0 0 rgba(47,158,138,0)'] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: a.delay }}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </motion.span>
              <span className="text-[10px] font-medium text-muted">{a.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

const BASE = (import.meta.env.VITE_BROKER_URL || '/api').replace(/\/+$/, '')
const LOGIN_ENABLED = import.meta.env.VITE_LOGIN_ENABLED !== '0'

async function readAuthResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || 'Authentication failed')
  }
  return data
}

export function isLoginEnabled() {
  return LOGIN_ENABLED
}

export async function getSession() {
  if (!LOGIN_ENABLED) return { authenticated: true }
  const response = await fetch(BASE + '/session', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (response.status === 401) return { authenticated: false }
  return readAuthResponse(response)
}

export async function login(username, password) {
  if (!LOGIN_ENABLED) return { authenticated: true }
  const response = await fetch(BASE + '/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  await readAuthResponse(response)
  return getSession()
}

export async function signOut() {
  if (LOGIN_ENABLED) {
    await fetch(BASE + '/logout', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => {})
  }
  window.dispatchEvent(new Event('cognio-auth-change'))
}

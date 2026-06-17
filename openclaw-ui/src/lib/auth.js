export const AUTH_STORAGE_KEY = 'cognio_auth_v1'

const LOGIN_ENABLED = import.meta.env.VITE_LOGIN_ENABLED !== '0'
const LOGIN_USERNAME = import.meta.env.VITE_LOGIN_USERNAME || ''
const LOGIN_PASSWORD = import.meta.env.VITE_LOGIN_PASSWORD || ''

export function isLoginEnabled() {
  return LOGIN_ENABLED
}

export function isAuthenticated() {
  if (!LOGIN_ENABLED) return true
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'authenticated'
  } catch {
    return false
  }
}

export function authenticate(username, password) {
  if (!LOGIN_ENABLED) return true
  if (!LOGIN_USERNAME || !LOGIN_PASSWORD) return false
  const ok = String(username) === LOGIN_USERNAME && String(password) === LOGIN_PASSWORD
  if (ok) {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, 'authenticated')
    } catch { /* ignore storage failures */ }
  }
  return ok
}

export function signOut() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch { /* ignore storage failures */ }
  window.dispatchEvent(new Event('cognio-auth-change'))
}

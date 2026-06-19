import { useEffect, useState } from 'react'

// Theme controller — light / dark / system, persisted in localStorage.
// The actual `dark` class is applied to <html>. An inline script in index.html
// applies it before first paint (no flash); this module keeps it in sync at runtime.

const STORAGE_KEY = 'oc_theme'
const EVENT = 'oc-theme-change'
export const THEMES = ['light', 'dark', 'system']

const mql = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function systemPrefersDark() {
  const m = mql()
  return m ? m.matches : false
}

// 'system' resolves to the OS preference; 'light'/'dark' resolve to themselves.
export function resolveTheme(theme = getStoredTheme()) {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
}

export function applyTheme(theme = getStoredTheme()) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(theme)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  root.dataset.theme = resolved
}

export function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* storage disabled — still apply for this session */
  }
  applyTheme(theme)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: { theme } }))
}

// Flip between explicit light/dark based on what's currently shown.
export function toggleTheme() {
  setTheme(resolveTheme() === 'dark' ? 'light' : 'dark')
}

// Keep the document in sync with OS changes while in `system` mode, and across tabs.
let wired = false
export function initTheme() {
  if (typeof window === 'undefined' || wired) return
  wired = true
  applyTheme()
  const m = mql()
  const onSystem = () => { if (getStoredTheme() === 'system') applyTheme('system') }
  m?.addEventListener?.('change', onSystem)
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) applyTheme() })
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme)
  const [resolved, setResolved] = useState(() => resolveTheme())

  useEffect(() => {
    const sync = () => {
      setThemeState(getStoredTheme())
      setResolved(resolveTheme())
    }
    sync()
    window.addEventListener(EVENT, sync)
    const m = mql()
    m?.addEventListener?.('change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      m?.removeEventListener?.('change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return {
    theme,
    resolved,
    isDark: resolved === 'dark',
    setTheme,
    toggle: toggleTheme,
  }
}

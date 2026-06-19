import { useEffect, useState } from 'react'

// Admin section passcode gate. This is a soft, client-side gate (it hides/guards the admin
// pages in the UI); the underlying broker APIs are still protected by the normal session
// auth. Set the passcode at build time with VITE_ADMIN_PASSCODE; falls back to a default.
const PASSCODE = String(import.meta.env.VITE_ADMIN_PASSCODE || 'admin')
const KEY = 'oc_admin_unlocked_v1'
const EVENT = 'oc-admin-lock-change'

export function isAdminUnlocked() {
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}

export function unlockAdmin(passcode) {
  if (String(passcode || '') !== PASSCODE) return false
  try { sessionStorage.setItem(KEY, '1') } catch { /* storage disabled — stay locked */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
  return true
}

export function lockAdmin() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

// Reactive unlock state — re-renders when the admin lock changes (this tab or another).
export function useAdminUnlocked() {
  const [unlocked, setUnlocked] = useState(isAdminUnlocked)
  useEffect(() => {
    const sync = () => setUnlocked(isAdminUnlocked())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return unlocked
}

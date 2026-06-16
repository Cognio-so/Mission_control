import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A'
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

export function cleanIcon(icon, fallback) {
  return icon && icon.length <= 4 ? icon : fallback
}

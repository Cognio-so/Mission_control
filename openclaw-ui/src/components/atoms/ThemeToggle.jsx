import { AnimatePresence, motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../lib/theme.js'
import { cn } from '../../lib/utils.js'

// Animated light/dark switch. Reads + flips the global theme (lib/theme.js).
export function ThemeToggle({ className }) {
  const { resolved, toggle } = useTheme()
  const isDark = resolved === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle color theme"
      className={cn(
        'relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent-strong)]',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            initial={{ y: 14, opacity: 0, rotate: -45 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: -14, opacity: 0, rotate: 45 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <Moon className="h-4 w-4" />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ y: 14, opacity: 0, rotate: 45 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: -14, opacity: 0, rotate: -45 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <Sun className="h-4 w-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

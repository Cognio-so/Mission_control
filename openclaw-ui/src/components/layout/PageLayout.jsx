import { motion } from 'framer-motion'

export function PageLayout({ kicker, title, description, actions, children, wide = false }) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-[1500px]' : 'max-w-[1200px]'} px-4 py-6 md:px-8 md:py-8`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          {kicker && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--accent-strong)]">
              {kicker}
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-strong md:text-3xl">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </motion.div>
      {children}
    </div>
  )
}

export function EmptyPanel({ icon: Icon, title, hint, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h3 className="text-base font-semibold text-strong">{title}</h3>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

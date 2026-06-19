import { Link } from 'react-router-dom'

export function BrandMark() {
  return (
    <Link to="/" className="group flex items-center gap-3">
      <div className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl text-xs font-semibold text-white shadow-[0_10px_30px_var(--accent-glow)] [background-image:var(--grad-brand)] transition-transform duration-300 group-hover:scale-105">
        <span className="pointer-events-none absolute -inset-2 animate-glow-pulse bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_60%)]" />
        <span className="relative tracking-[0.2em]">CG</span>
      </div>
      <div className="leading-tight">
        <div className="font-heading text-sm font-semibold uppercase tracking-[0.26em] text-strong">COGNIO</div>
        <div className="text-[11px] font-medium text-quiet">Mission Control</div>
      </div>
    </Link>
  )
}

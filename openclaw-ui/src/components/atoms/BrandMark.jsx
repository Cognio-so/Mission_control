import { Link } from 'react-router-dom'

export function BrandMark() {
  return (
    <Link to="/" className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 text-xs font-semibold text-white shadow-sm">
        <span className="tracking-[0.2em]">CG</span>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold uppercase tracking-[0.26em] text-strong">COGNIO</div>
        <div className="text-[11px] font-medium text-quiet">Mission Control</div>
      </div>
    </Link>
  )
}

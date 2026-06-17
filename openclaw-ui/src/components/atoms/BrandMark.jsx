import { Link } from 'react-router-dom'

export function BrandMark() {
  return (
    <Link to="/" className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-[linear-gradient(135deg,#154f4c_0%,#0f4b49_100%)] text-xs font-semibold text-[#fffaf0] shadow-[0_10px_30px_rgba(15,75,73,0.18)]">
        <span className="tracking-[0.2em]">CG</span>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold uppercase tracking-[0.26em] text-strong">COGNIO</div>
        <div className="text-[11px] font-medium text-quiet">Mission Control</div>
      </div>
    </Link>
  )
}

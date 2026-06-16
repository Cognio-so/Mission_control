import { Badge } from '../ui/badge.jsx'

const STATUS_STYLES = {
  inbox: 'outline', assigned: 'accent', in_progress: 'warning', testing: 'accent',
  review: 'accent', done: 'success', online: 'success', busy: 'warning',
  provisioning: 'warning', offline: 'outline', deleting: 'danger', updating: 'accent',
  running: 'success', ready: 'accent', idle: 'outline', error: 'danger',
  installed: 'success', available: 'outline', published: 'success', draft: 'warning',
}

export function StatusPill({ status }) {
  const s = String(status || '')
  return <Badge variant={STATUS_STYLES[s] ?? 'default'}>{s.replaceAll('_', ' ')}</Badge>
}

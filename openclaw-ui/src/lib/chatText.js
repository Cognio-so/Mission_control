const HIDDEN_TEAM_BLOCK = /\[team[^\]]*do not echo[^\]]*\][\s\S]*?\[end team\]\s*/gi

export function cleanChatText(text, role) {
  let out = String(text || '')
  if (role === 'user') {
    out = out.replace(HIDDEN_TEAM_BLOCK, '').trim()
  }
  return out
}

# VPS work order #6 — support "New chat" (fresh session per agent)

Hand to the Claude Code on the VPS. The UI now has a **New chat** button: it points
an agent at a brand-new session id and starts a clean conversation. The session key
format is:

- Orchestrator → `main__<suffix>`
- agent       → `agent_<id>__<suffix>`

(`<suffix>` is a short base-36 timestamp; the `__` double-underscore is the marker.)

`chat.send` already auto-creates these sessions, so a new chat starts empty — good.
**One thing to confirm on `/chat`:**

## Resolve the agent persona from `body.agentId`, not the exact session key

The UI sends `agentId` in the `/chat` body on every turn. When injecting the agent's
persona (`AGENT.md`) / memory at session start, key it off **`body.agentId`** (or, if
you currently parse it from the session key, **strip the `__<suffix>`** →
`agent_<id>__x9f3` ⇒ agent `<id>`). Otherwise a New-chat session like
`agent_<id>__x9f3` won't be recognized as that agent and will run without its persona.

So:
- ✅ New chat = fresh **history** (new session id, empty transcript).
- ✅ Same **persona + memory** (resolved from `agentId` / the stripped base id).

`GET /chat/history?sessionKey=agent_<id>__x9f3` should likewise return just that
new session's transcript (empty until the first turn) — no change needed if it
passes the key straight through to `chat.history`.

## Verify
```bash
# new chat session is empty, then has its own turns
curl -s -H "$H" "$BASE/chat/history?sessionKey=agent_<id>__x9f3" | jq '.messages | length'   # 0 before first turn
# after sending one message to that session, the agent still answers in-persona
```

## Report back
- Does `/chat` resolve persona from `agentId` (so New-chat sessions keep persona)?
  If not, add the `__<suffix>` strip.

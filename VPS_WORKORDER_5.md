# VPS work order #5 — server-side conversation history (cross-device resume)

Hand to the Claude Code on the VPS. The UI now loads each agent's conversation
**from the broker** so chats follow the user across devices/browsers (not just
localStorage). It needs **one read endpoint**, backed by the gateway's existing
`chat.history` RPC. Same Bearer auth + global CORS.

---

## `GET /chat/history?sessionKey=<key>`

Return the stored messages for a session.

- `sessionKey` is the session the UI uses:
  - Orchestrator → `main`
  - each agent → `agent_<id>` (the stable per-agent session you already use for `chat.send`)
- Map the gateway `chat.history { sessionKey, limit }` output to:

```json
{
  "messages": [
    { "role": "user",      "content": "create a web designer agent", "created_at": "2026-06-16T10:01:00Z" },
    { "role": "assistant", "content": "✅ Created 'Web Designer' …",  "created_at": "2026-06-16T10:01:08Z" }
  ]
}
```

Field notes (the UI is tolerant):
- `role`: `"user"` for the human; anything else is treated as assistant.
- `content`: the message text (the UI also accepts `text`).
- `created_at`: ISO string or ms timestamp (or send `ts` as ms). Used only for
  ordering/labels — optional.
- Accept a bare array or `{ "messages": [...] }` / `{ "items": [...] }`.
- A reasonable default `limit` (e.g. last 100) is fine; add `?limit=` if you like.

That's it. The UI fetches this the first time each agent is opened and adopts it
when it's at least as complete as the local copy (it never overwrites an in-flight
run, and never loses newer un-synced local messages).

## Why this completes persistence
- **localStorage** (already shipped) = instant resume on the same browser.
- **`GET /chat/history`** (this) = the **authoritative server copy**, so opening
  Mission Control on another device/browser shows the same conversations.

## Verify
```bash
curl -s -H "$H" "$BASE/chat/history?sessionKey=main" | jq '.messages | length'
curl -s -H "$H" "$BASE/chat/history?sessionKey=agent_<id>" | jq '.[0] // .messages[0]'
```
Then open Mission Control in a different browser → the Orchestrator and each agent
show their prior conversation.

## Report back
- Endpoint live? Which envelope you used.
- Does `chat.history` return both user + assistant turns under operator scope, or
  only one side (so I can adjust the mapping)?

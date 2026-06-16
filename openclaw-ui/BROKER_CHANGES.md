# Broker changes to make Skills, Marketplace & Boards go live

This Mission Control UI talks to your broker (`am-broker.cognio.so`). Today the
broker only exposes the **agent-run** surface:

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| `GET`  | `/health` | gateway health | ✅ exists |
| `GET`  | `/agents` | list agents | ✅ exists |
| `POST` | `/agents` | create agent | ✅ exists |
| `PATCH`| `/agents/{id}` | update agent | ✅ exists |
| `DELETE`| `/agents/{id}` | delete agent | ✅ exists |
| `POST` | `/chat` | send a message / start a run | ✅ exists |
| `GET`  | `/stream?token=…` | SSE run stream | ✅ exists |

The **Skills**, **Marketplace**, **Packs**, **Boards** and **Tasks** pages are
already built in the UI, but the broker has no data for them yet — so the UI
falls back to bundled **demo data** (you'll see an amber **"Demo data"** badge on
those pages). Add the endpoints below and the badge flips to green **"Live"**
automatically. No frontend changes needed.

> **Auth:** every endpoint uses the same auth as today —
> `Authorization: Bearer <VITE_BROKER_SECRET>`. Reuse your existing middleware.

> The UI is tolerant about envelopes: it accepts either a bare array `[...]`
> **or** `{ "skills": [...] }` / `{ "boards": [...] }` / `{ "items": [...] }` /
> `{ "data": [...] }`. Pick whichever your broker already uses.

---

## 0. Make created agents persistent (own id, memory file, focus)

**Symptom:** creating an agent and chatting just replays its persona — the agent
has no memory, no id of its own, and every agent shares one session.

**Cause:** on `POST /agents` the broker stores metadata only, and on `POST /chat`
it injects the persona as a system prompt into a shared session. No real OpenClaw
agent is provisioned.

**Fix:** OpenClaw natively supports persistent agents. Use these gateway RPCs:

| Gateway RPC | Purpose |
|-------------|---------|
| `agents.create` / `agents.update` / `agents.delete` / `agents.list` | real agents, each with its own id + workspace |
| `agents.files.list` / `agents.files.get` / `agents.files.set` | per-agent files: **memory.md**, AGENT.md, notes |
| `agent.identity.get` | per-agent identity |
| `ensure_session(sessionKey)` + `chat.send {sessionKey, agentId}` | bind a session to an agent → focus + persistent history |

Wire it into the existing endpoints:

```jsonc
// POST /agents  (create)
const { agentId } = await gw("agents.create", { name, instructions, model });
await gw("agents.files.set", { agentId, path: "AGENT.md",  content: instructions });
await gw("agents.files.set", { agentId, path: "memory.md", content: "# Memory\n" });
// persist mapping: brokerSlug <-> agentId

// POST /chat  (run)  — route to the agent's OWN session, do NOT inject persona
await ensure_session(sessionKey);                 // sessionKey = "agent_<id>" (UI already sends this)
await gw("chat.send", { sessionKey, agentId, message });

// PATCH /agents/{id} -> agents.update ; DELETE /agents/{id} -> agents.delete
```

**OpenClaw config (VPS):** give each agent its own `workspace` (e.g.
`workspace/agents/<id>`) so `memoryFlush` writes an isolated `memory/YYYY-MM-DD.md`
per agent. `agents.create` typically provisions this for you.

> The frontend already sends a unique `agentId` + `sessionKey` per agent and keeps
> a separate chat thread per agent, so no UI change is required for persistence.
> (Optional UI add-on: an agent "Memory / Files" tab backed by `agents.files.*`.)

---

## 1. Skills marketplace

### `GET /skills/marketplace`
Returns the catalog of installable skills.

```json
{
  "skills": [
    {
      "id": "deep-research",
      "name": "Deep Research",
      "category": "Research",
      "summary": "Fan-out web search, fetch sources, verify, synthesize a cited report.",
      "tags": ["web", "research", "citations"],
      "author": "openclaw",
      "installs": 1284,
      "rating": 4.8,
      "status": "available",          // "available" | "installed"
      "sourceUrl": "https://github.com/openclaw/skills/tree/main/deep-research"
    }
  ]
}
```

Field notes:
- `status` drives the Install/Manage button. Return `"installed"` if the skill is
  already on at least one gateway.
- `category` powers the filter pills (any string; the UI builds the list from
  whatever categories appear).
- `installs` / `rating` are display-only — send `0` / omit if you don't track them.

### `POST /skills/marketplace/{id}/install`
Body: `{ "gatewayId": "am-broker" }`. Installs/uninstalls the skill on a gateway.
Return `{ "ok": true }` (any 2xx is treated as success). Map this to however
OpenClaw installs a skill onto the connected gateway (e.g. clone the `sourceUrl`
pack into the gateway's skills dir, or call the gateway's skill-install RPC).

---

## 2. Skill packs

### `GET /skills/packs`
A pack = a repo containing several skills.

```json
{
  "packs": [
    {
      "id": "openclaw-core",
      "name": "OpenClaw Core",
      "packLabel": "openclaw/skills",     // owner/repo, shown as a chip
      "description": "Official starter pack — research, review, data skills.",
      "sourceUrl": "https://github.com/openclaw/skills",
      "skillCount": 12,
      "status": "published"               // "published" | "draft"
    }
  ]
}
```

---

## 3. Boards & tasks (kanban)

### `GET /boards`
```json
{
  "boards": [
    {
      "id": "launch-q3",
      "name": "Q3 Product Launch",
      "group": "Marketing",
      "description": "Coordinate research, content, and GTM for the Q3 launch.",
      "counts": { "inbox": 3, "in_progress": 2, "review": 1, "done": 4 }
    }
  ]
}
```
`counts` is optional (used for the dots on the board card). If omitted, the card
shows zeros until the board is opened.

### `GET /boards/{id}`  (or `GET /boards/{id}/tasks`)
Return the board plus its tasks. The UI accepts either:
```json
{ "board": { "id": "launch-q3", "name": "Q3 Product Launch", "description": "…" },
  "tasks": [ … ] }
```
…or a bare `{ "tasks": [ … ] }` from `/boards/{id}/tasks`.

Task shape (mirrors the reference `TaskCard`):
```json
{
  "id": "t1",
  "title": "Competitive landscape research",
  "status": "inbox",                 // "inbox" | "in_progress" | "review" | "done"
  "priority": "high",                // "high" | "medium" | "low"
  "assignee": "Research",            // agent name or person; null => "Unassigned"
  "due": "Jun 20",                   // display string, optional
  "isOverdue": false,                // optional
  "approvalsPendingCount": 0,        // >0 shows an amber "Approval needed" flag
  "isBlocked": false,                // shows a red "Blocked" flag
  "blockedByCount": 0,
  "tags": [{ "id": "a", "name": "research", "color": "2563eb" }]  // color = hex w/o '#'
}
```

### `PATCH /boards/{id}/tasks/{taskId}`
Body: `{ "status": "in_progress" }`. Called when a card is dragged to another
column (optimistic in the UI — return any 2xx). This is where you'd notify the
assigned OpenClaw agent that a task moved into its lane.

---

## 4. Gateways (optional but recommended)

### `GET /gateways`
Used by the **Gateways** page and the marketplace **Install** dialog (to pick a
target). If absent, the UI shows a single synthetic gateway derived from the
broker URL.
```json
{
  "gateways": [
    {
      "id": "am-broker",
      "name": "AM Broker (cognio)",
      "url": "wss://am-broker.cognio.so",
      "connected": true,
      "scopes": ["operator.read", "operator.write"]
    }
  ]
}
```

---

## Suggested implementation order

1. `GET /gateways` — trivial, unblocks the install dialog target list.
2. `GET /skills/marketplace` + `GET /skills/packs` — read-only, biggest visual win.
3. `POST /skills/marketplace/{id}/install` — wire to the gateway skill install path.
4. `GET /boards` + `GET /boards/{id}` — read-only kanban.
5. `PATCH /boards/{id}/tasks/{taskId}` — task moves.

Where to model these in your broker: the reference backend in
`.repo-ref/openclaw-mission-control/backend/app/api/` has the canonical Pydantic
shapes —
[`skills_marketplace.py`](../.repo-ref/openclaw-mission-control/backend/app/api/skills_marketplace.py),
[`boards.py`](../.repo-ref/openclaw-mission-control/backend/app/api/boards.py),
[`tasks.py`](../.repo-ref/openclaw-mission-control/backend/app/api/tasks.py),
[`gateways.py`](../.repo-ref/openclaw-mission-control/backend/app/api/gateways.py).
The JSON above is the trimmed subset this UI actually consumes.

> Unrelated reminder: the `auth refresh request timed out after 10s` errors are a
> **separate** OpenClaw-agent-side problem (the agent can't refresh its model
> provider token on the VPS) — not a Mission Control or broker-endpoint issue.
> Run `openclaw logs --follow` on the VPS to see the failing auth host.

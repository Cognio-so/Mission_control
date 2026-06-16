# VPS work order #2 — back the Boards / Marketplace / Packs / Gateways pages with real broker endpoints

Hand this to the Claude Code on the VPS. The Mission Control UI **already calls and
renders these endpoints** — it just shows "not connected" empty states until they
exist. Implement them and the pages fill in automatically. **No frontend change is
needed**; just match the JSON shapes below exactly.

- All endpoints: same Bearer auth as the existing broker routes.
- Response envelope is flexible: the UI accepts a **bare array** `[...]` **or**
  `{ "skills": [...] }` / `{ "packs": [...] }` / `{ "boards": [...] }` /
  `{ "items": [...] }` / `{ "data": [...] }`. Pick whatever's convenient.
- Date/number fields are display-only; send `0`/omit if you don't track them.

---

## Part A — Skills (REAL data, from the gateway `skills.*` RPCs)

The gateway already exposes `skills.status`, `skills.bins`, `skills.install`,
`skills.update`. **First confirm which are allowed under the broker's operator
scope** (agents.* were admin-denied; skills *reads* may be allowed). Strategy:

- If `skills.status` / `skills.bins` are operator-allowed → map their output to the
  UI shapes below (preferred — fully live).
- If they're admin-denied → read a small broker-side `skills.json` the operator
  maintains (still real/curated, not random). Note which path you used.

### `GET /skills/marketplace`
Map each available/installed skill to:
```json
{
  "id": "deep-research",
  "name": "Deep Research",
  "category": "Research",                 // any string; UI builds filter pills from these
  "summary": "One-line description.",
  "tags": ["web", "research"],
  "author": "openclaw",
  "installs": 0,                           // optional
  "rating": 0,                            // optional
  "status": "installed",                  // "installed" if on a gateway, else "available"
  "sourceUrl": "https://github.com/owner/repo/tree/main/deep-research"
}
```

### `POST /skills/marketplace/{id}/install`
Body `{ "gatewayId": "..." }`. Call `skills.install` (confirm scope — may be admin;
if denied, shell out to the local CLI or return `{ "ok": false, "error": "..." }`).
Return any 2xx on success.

### `GET /skills/packs`
A pack = a repo of skills. Derive by grouping `sourceUrl`s by repo (owner/repo), or
from `skills.bins`:
```json
{
  "id": "openclaw-core",
  "name": "OpenClaw Core",
  "packLabel": "openclaw/skills",         // owner/repo
  "description": "…",
  "sourceUrl": "https://github.com/openclaw/skills",
  "skillCount": 12,
  "status": "published"                   // "published" | "draft"
}
```

---

## Part B — Boards / Tasks (broker-local store)

Boards/tasks are NOT an OpenClaw concept — the broker owns them. Use a tiny store:
a JSON file (`boards.json`) or a SQLite table. Tasks reference agents by name/id so
they tie into the real agents you already manage.

### `GET /boards`
```json
{ "boards": [
  { "id": "launch-q3", "name": "Q3 Product Launch", "group": "Marketing",
    "description": "…",
    "counts": { "inbox": 3, "in_progress": 2, "review": 1, "done": 4 } }
]}
```
`counts` optional (the card shows zeros without it).

### `GET /boards/{id}`   (or `GET /boards/{id}/tasks`)
Return the board + its tasks (the UI accepts `{ board, tasks }` or bare `{ tasks }`):
```json
{ "board": { "id": "launch-q3", "name": "Q3 Product Launch", "description": "…" },
  "tasks": [
    { "id": "t1", "title": "Competitive research", "status": "inbox",
      "priority": "high", "assignee": "Research",
      "due": "Jun 20", "isOverdue": false,
      "approvalsPendingCount": 0, "isBlocked": false, "blockedByCount": 0,
      "tags": [ { "id": "a", "name": "research", "color": "2563eb" } ] }
  ] }
```
- `status` ∈ `"inbox" | "in_progress" | "review" | "done"` (the 4 kanban columns).
- `priority` ∈ `"high" | "medium" | "low"`. `tags[].color` is hex **without** `#`.
- `assignee` = agent name (or null → "Unassigned").

### `PATCH /boards/{id}/tasks/{taskId}`
Body `{ "status": "in_progress" }` — persist the move (UI is optimistic; return 2xx).

### (Nice to have) `POST /boards`, `POST /boards/{id}/tasks`, `DELETE …`
So the UI's "Add task" / board creation can write back. Same shapes as above.

---

## Part C — Gateways

### `GET /gateways`
Return the gateway(s) the broker actually connects to (the broker already holds this
config + live connection state — real data, no invention):
```json
{ "gateways": [
  { "id": "am-broker", "name": "AM Broker (cognio)",
    "url": "wss://am-broker.cognio.so", "connected": true,
    "scopes": ["operator.read", "operator.write"] }
]}
```
(The UI already falls back to a synthetic entry from the broker URL, so this just
makes it precise.)

---

## Verify

```bash
curl -s -H "Authorization: Bearer $SECRET" $BASE/skills/marketplace | jq '.[0] // .skills[0]'
curl -s -H "Authorization: Bearer $SECRET" $BASE/boards            | jq '.boards // .'
curl -s -H "Authorization: Bearer $SECRET" $BASE/gateways          | jq '.'
```
Then open Mission Control:
- **Marketplace / Packs** show real skills (no "not connected" panel).
- **Boards** lists boards; opening one shows the kanban with your tasks, the live
  **AGENTS** panel (already real), and the board chat/feed.
- Each page's badge reads **Live** (green), not "Demo data".

## Report back
1. Which skills path you used (live `skills.*` RPC vs broker `skills.json`), and the
   scope result for `skills.status` / `skills.bins` / `skills.install`.
2. The store you chose for boards (JSON vs SQLite).
3. Any field you couldn't populate, so I can adjust the UI to hide it gracefully.

# VPS work order — make UI-created agents persistent (stable id, own memory, no new session each time)

Hand this whole file to the Claude Code instance running on the VPS. It has the
broker source + the OpenClaw runtime/config locally; this conversation does not.

---

## ⚠️ UPDATE — broker has OPERATOR scope only. Implement "Option 1" below.

The broker's device is **not** admin, so the admin-only control-plane RPCs
(`agents.create`, `agents.update`, `agents.delete`, `agents.files.*`,
`sessions.patch`) are **denied**. Do **NOT** use them. The "Broker changes" section
further down that calls those RPCs is **superseded** by **Option 1 (broker-only
hardening)** here. Operator-scoped `chat.send` / `chat.history` are allowed and are
all we need.

### Option 1 — broker-only hardening (the chosen approach)

Goal unchanged: each UI-created agent behaves as a **persistent, focused agent**
with its own memory — achieved entirely with operator scope + broker-local storage.

**A. Stable top-level session (fixes "new session every chat/refresh").**
- Derive a deterministic key from the agent id: `sessionKey = "agent_" + agent_id`.
- On `/chat`, call **`chat.send { sessionKey, message, deliver:false, idempotencyKey }`**
  with that SAME key every turn. `chat.send` auto-creates/resumes the session — no
  `sessions.patch` needed.
- It must be a **top-level** session. Do **NOT** route through the Orchestrator
  `main` session and do **NOT** let it become `agent:main:subagent:<uuid>`.

**B. Harden the persona prime (fixes "just echoes the persona" + wandering).**
- Inject the agent's persona as the session's **system prime at session start**
  (first turn only — rely on session history afterward; don't re-inject every turn).
- The prime must instruct the model to **answer AS the agent** and to **never call
  `sessions_spawn` / `skill_workshop` / create subagents.** That's what stops the
  random-subagent behavior and keeps it focused.

**C. Broker-local per-agent files (gives "own memory file", no admin needed).**
- On `POST /agents`: store an agent record + write **`AGENT.md`** (persona) and
  **`memory.md`** in broker-local storage keyed by agent id (DB row or
  `./agents/<id>/`). No gateway call required at create time.
- At session start, prepend `AGENT.md` + current `memory.md` into the prime so the
  agent loads its memory.

**D. Memory write-back (so memory actually grows).** Pick one and tell me which:
- after each run, the broker extracts durable facts (a short summarization turn)
  and appends them to `memory.md`; **or**
- the prime tells the agent to end with a `MEMORY:` block the broker parses and
  appends. Conversation continuity already comes free from the stable session (A).

**E. REST passthrough for the Mission Control memory tab.**
- `GET /agents/{id}/files`, `GET/PUT /agents/{id}/files/{path}` reading/writing the
  broker-local files from **C**. The frontend tab is ready to wire to this.
- **Report back the exact request/response JSON shape you expose** so I match the UI to it.

> The OpenClaw **config** section below (model id, per-agent memory note, auth fix,
> restart) still applies as written. Only the admin-RPC "Broker changes" section is
> replaced by Option 1.

---

## The problem (observed)

When a user creates an agent in Mission Control and chats with it, the broker is
**asking the Orchestrator LLM (the `main` session) to "create an agent."** The LLM
improvises by spawning a throwaway subagent and replies:

> "Done. I created a dedicated `marketing-agent` session.
> Session key: `agent:main:subagent:46307787-35be-4f24-8e09-858a3e8c49ad`"

Every subsequent chat / refresh spawns **another random `agent:main:subagent:<uuid>`
session**, so there is:
- ❌ no stable agent **id**
- ❌ no per-agent **memory / files**
- ❌ no **focus** — each turn is a new ephemeral subagent under `main`

## The goal

Each UI-created agent must be a **real persistent OpenClaw agent**:
- stable id + its own workspace,
- its own files (`AGENT.md`, `memory.md`),
- chats always route to the **same** session, so history + memory persist.

The OpenClaw gateway already exposes the control-plane RPCs for this. The broker
must **call them directly** instead of prompting the Orchestrator.

---

## Gateway RPCs to use (already whitelisted in the gateway)

| RPC | Params (confirmed) | Use |
|-----|--------------------|-----|
| `agents.create` | `{ name, instructions, model? }` → returns agent id *(confirm exact field names against the running gateway / `openclaw agents create --help`)* | provision a real agent |
| `agents.update` / `agents.delete` | `{ agentId, ... }` | edit / remove |
| `agents.list` | `{}` | list real agents |
| `agents.files.list` / `agents.files.get` / `agents.files.set` | `{ agentId, path, content? }` | per-agent memory & files |
| `agent.identity.get` | `{ agentId }` | identity |
| `sessions.patch` | `{ key, label? }` | ensure/bind a session (this is `ensure_session`) |
| `chat.send` | `{ sessionKey, message, deliver, idempotencyKey }` | run a turn in a session |
| `chat.history` | `{ sessionKey, limit? }` | load prior turns |

> Confirm the exact `agents.create` / `agents.files.set` param names against the
> live gateway before wiring (run `openclaw agents list`, inspect the gateway
> schema, or `openclaw agents create --help`). Everything else is confirmed.

---

## Broker changes

### 1. `POST /agents` (create) — STOP prompting the Orchestrator

Currently this sends a natural-language "create an agent" message to the `main`
session. Replace it with a direct control-plane call:

```python
# pseudo — adapt to the broker's gateway client
created = await gateway.call("agents.create", {
    "name": body.name,
    "instructions": body.instructions,
    "model": body.model,            # optional
})
agent_id = created["id"]            # stable, real agent id

# seed its own files (this is the "own memory file and other files")
await gateway.call("agents.files.set", {"agentId": agent_id, "path": "AGENT.md",  "content": body.instructions})
await gateway.call("agents.files.set", {"agentId": agent_id, "path": "memory.md", "content": "# Memory\n"})

# persist mapping  ui_slug <-> agent_id  in the broker DB
save_agent_mapping(ui_id=slug(body.name), agent_id=agent_id, session_key=f"agent_{agent_id}")
```

### 2. `POST /chat` (run) — use a STABLE session key, never a random subagent

The UI already sends `agentId` and `sessionKey` (`agent_<id>`) in the body. Use
them directly. **Do not** route through the Orchestrator, **do not** generate a
new `agent:main:subagent:<uuid>` per call, **do not** just inject the persona.

```python
session_key = body.sessionKey or f"agent_{agent_id}"   # DETERMINISTIC, same every time

await gateway.call("sessions.patch", {"key": session_key, "label": agent_name})  # ensure_session
await gateway.call("chat.send", {
    "sessionKey": session_key,        # same key on every turn => persistent history
    "message": body.message,
    "deliver": False,
    "idempotencyKey": uuid4().hex,
    # if the gateway binds an agent to a session, also pass its agent id here
    # (confirm the param name, e.g. "agentId": agent_id) so the run loads the
    # agent's files/memory and runs AS that agent.
})
```

The decisive change: **the session key must be derived from the agent id and stay
constant**, so the same agent always resumes the same session (memory + history),
instead of getting a fresh subagent every chat/refresh.

### 3. `PATCH /agents/{id}` → `agents.update`; `DELETE /agents/{id}` → `agents.delete`.

### 4. (Optional) expose `agents.files.*` as REST passthroughs

`GET /agents/{id}/files`, `GET/PUT /agents/{id}/files/{path}` → so Mission Control
can show/edit each agent's `memory.md`. The frontend tab for this is ready to wire.

---

## OpenClaw config (`~/.openclaw/openclaw.json`) — config only, no code

```bash
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak
```

1. **Primary model** (required — empty `primary` means no model runs):
   ```jsonc
   "agents": { "defaults": { "model": { "primary": "openai-codex/gpt-5.5", "fallbacks": [] } } }
   ```
   Confirm the exact id with `openclaw models` (don't hardcode a guess).
2. **Per-agent memory isolation:** verify `agents.create` gives each agent its own
   workspace (`openclaw agents list` → check each agent's `agents.files.list`).
   If they share `agents.defaults.workspace`, set a per-agent
   `workspace: workspace/agents/<id>` so `memoryFlush` writes isolated
   `memory/YYYY-MM-DD.md` files.
3. **Fix auth** — if `openclaw logs --follow` shows `auth refresh timed out`,
   re-auth the model provider (`openclaw login`) before testing; agents can't run
   otherwise.
4. `openclaw restart`.

---

## Verify (do these read-only checks first, and again after)

```bash
openclaw --version
openclaw agents list                      # before: probably empty; after create: shows the agent
jq '.agents.defaults.model' ~/.openclaw/openclaw.json
```

Then end-to-end (Option 1):
1. Create an agent in the UI → broker stores a record + `AGENT.md` + `memory.md`
   (in its DB / `./agents/<id>/`). (It will NOT appear in `openclaw agents list` —
   that's expected; these are broker-local, not gateway-native agents.)
2. Chat once, then **refresh and chat again** → broker logs must show the **same
   top-level `sessionKey` (`agent_<id>`)** both times — NOT a new
   `agent:main:subagent:<uuid>`, and NOT routed through the Orchestrator `main`.
3. Ask the agent to remember a fact, refresh, ask for it back → it recalls it
   (from session history and/or `memory.md`).
4. Confirm it answers **as the agent** (does the actual task) instead of replaying
   its persona text.

If step 2 still shows a new random subagent key, the `/chat` handler is still
routing through the Orchestrator / spawning subagents — that's the line to fix.

# VPS work order #3 — board automation, scheduled jobs, multi-agent stream, add-skill

Hand to the Claude Code on the VPS. The Mission Control UI already has all the UI
for these; this work order makes them fully real/robust on the broker. Same Bearer
auth + flexible response envelope as before. **Apply the broker's CORS headers to
every new route** (the browser fetch is blocked otherwise even when curl works).

---

## 1. Board automation — task → agent run → auto-move (robust, broker-side)

The UI already does a **front-end** version (assign an agent on a task → it sends
the task to that agent and moves the card In Progress → Review when the run ends).
That only works while the page is open. Make it **robust on the broker** so it
survives refresh and runs headless:

- Tasks carry `assigned_agent_id` (the UI sends it on create).
- When a task is created/updated with `assigned_agent_id` **and** a run is requested
  (the UI will POST `{ "run": true }` or hit `POST /boards/{id}/tasks/{taskId}/run`),
  the broker:
  1. `chat.send` to that agent's stable session (`agent_<id>`) with a prompt like
     *"You are assigned board task '<title>'. Work on it now; summarize the result."*
  2. moves the task to `in_progress`,
  3. records the run/session id against the task.
- When that run finishes (the gateway emits the `final` / `error` chat event for that
  session), the broker:
  - moves the task to `review` (success) and appends the agent's summary as a task
    comment/result; on error, leaves it `in_progress` and notes the error.

Add `POST /boards/{id}/tasks/{taskId}/run` → starts the run for an existing task
(the UI's per-card **Run** button calls this path or re-creates via the assign flow —
expose whichever; the UI currently drives runs through chat, so this endpoint is the
robust upgrade). Return `{ "ok": true }`.

---

## 2. Scheduled jobs (cron) — REAL via the gateway `cron.*` RPCs

The gateway exposes `cron.list`, `cron.status`, `cron.add`, `cron.update`,
`cron.remove`, `cron.run`, `cron.runs`. Confirm operator scope (reads likely allowed).

### `GET /cron`
Map `cron.list` output to:
```json
{ "jobs": [
  { "id": "daily-seo", "name": "Daily SEO audit", "schedule": "0 9 * * *",
    "agent": "seo marketing agent", "status": "active",   // "active" | "paused"
    "nextRun": "Tomorrow 09:00", "lastRun": "Today 09:00" }
]}
```
`nextRun`/`lastRun` are display strings — format however the RPC gives them.

### `POST /cron/{id}/run`  → `cron.run` (run now). Return any 2xx.
### (Optional) `POST /cron` → `cron.add`, `DELETE /cron/{id}` → `cron.remove` so the UI can create/delete schedules later.

---

## 3. Multi-agent output — make sure child-run events reach the SSE stream

The UI already renders multi-agent delegation (a **Run Graph** + per-sub-agent
streaming cards) — it just needs the events. On `GET /stream` (SSE), the broker must
forward the gateway's **child/subagent** chat events, not only the main session:

- Forward `chat` events where `payload.spawnedBy` is set (a delegated sub-run), with
  `sessionKey`, `deltaText`/`message`, and `state` (`delta`/`final`/`error`).
- Also forward `tool` events.

The UI keys sub-agents by `spawnedBy` + `sessionKey`; if those events arrive, the
orchestrator's delegations light up automatically. If today only the main session's
events are forwarded, that's the fix.

---

## 4. Add skill — `POST /skills/add` (from source / file / description)

The Marketplace has an **Add skill** dialog that POSTs one of three payloads.
Implement `POST /skills/add`, returning `{ "ok": true, "message": "…" }` or
`{ "ok": false, "error": "…" }`:

```jsonc
// a) from a repo / skill URL
{ "type": "source", "url": "https://github.com/owner/skills/tree/main/my-skill" }
//   → `openclaw skills install <url>` (CLI) or skills.install RPC (needs admin —
//      if denied, shell out to the CLI which runs as root on the box)

// b) paste a skill file
{ "type": "file", "name": "my-skill", "content": "---\nname: my-skill\n..." }
//   → write into the gateway's skills dir (e.g. ~/.openclaw/skills/<name>/SKILL.md),
//      then skills.update / re-scan so it registers

// c) natural-language description
{ "type": "describe", "prompt": "A skill that audits a site's on-page SEO…" }
//   → use the skill-workshop / wizard.* RPCs (or run the orchestrator) to GENERATE
//      the skill from the prompt, write it, then register it
```

After a successful add, the new skill should appear in `GET /skills/marketplace`
(the UI reloads the list automatically).

---

## Verify
```bash
curl -s -H "$H" $BASE/cron | jq '.jobs // .'
curl -s -H "$H" -X POST $BASE/skills/add -d '{"type":"source","url":"https://github.com/openclaw/skills"}' | jq
# board automation: create a task with assigned_agent_id + run, watch it go
#   in_progress → review and a result comment appear; refresh mid-run and confirm it persists.
# multi-agent: send the Orchestrator a query that needs a specialist; confirm the
#   sub-agent streaming events arrive on /stream (the UI Run Graph lights up).
```

## Report back
1. Cron scope result + whether create/delete (`cron.add`/`remove`) are allowed.
2. Which add-skill paths work under operator scope (source via CLI? file write? describe via wizard?).
3. Whether child-run SSE events were already forwarded or you had to add them.
4. The board-automation run endpoint shape you settled on, so I match the UI's Run button to it.

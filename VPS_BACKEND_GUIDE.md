# OpenClaw backend enhancement guide

Hand to the Claude Code on the VPS. This is a **best‑practice guide**, not a strict
work order — evaluate each item against the live system (you have the broker source
+ `~/.openclaw/openclaw.json` + the running gateway) and apply what improves it.
Report what you changed and why. Two parts: **agent behavior** (prompts) and
**infra/config**.

---

## Part A — Agent behavior (prompting / guides)

These make the agents *smarter and more consistent*. They go into the system prime
and each agent's `AGENT.md`.

### A1. Orchestrator delegation guide (into the Orchestrator's prime)
Add rules so the lead agent coordinates well:
- Decompose the user goal into concrete sub‑tasks.
- For each sub‑task, **delegate to the right registered specialist** by routing to
  that agent's stable session — do **not** spawn anonymous `subagent:<uuid>` runs.
- Pass each specialist clear context + the specific deliverable expected.
- **Synthesize** the specialists' outputs into one answer, **attributing** which
  agent produced what.
- Answer directly (no delegation) for trivial/clarifying questions.

### A2. Specialist persona template (each agent's `AGENT.md`)
Standardize so personas are crisp and useful:
```
# <Agent name>
Role: <one line>
Scope: what it DOES / what it does NOT do
Skills/tools it relies on: <…>
Output format: <markdown, sections, cite sources, deliverable shape>
Memory rules: what to remember (decisions, user prefs, project facts) vs ignore
```

### A3. Memory hygiene (the D1 extraction prompt)
Tighten what gets written to `memory.md`: durable facts only — user preferences,
decisions, project constraints, named entities, URLs. Explicitly exclude transient
chit‑chat. Dedupe. Keep it short and skimmable.

### A4. Output discipline
Consistent markdown, concrete deliverables, cite sources/URLs when used, and a short
summary line first. For multi‑agent answers, label sections by contributing agent.

### A5. Guardrails
Keep the anti‑spawn guard, but also: no destructive actions without confirmation,
respect scopes, don't fabricate tool results.

---

## Part B — Infra / config

### B1. Model routing + resilience
In `~/.openclaw/openclaw.json` → `agents.defaults.model`:
- `primary`: keep the **working** id (`openai/gpt-5.5` — confirmed usable). Do NOT
  switch to an unverified id.
- `fallbacks`: add 1–2 backup model ids so a primary outage doesn't kill all runs.
- Verify with `openclaw models`.

### B2. Context pruning / compaction / memory flush
The baseline already sets `contextPruning` (cache‑ttl), `compaction` (safeguard),
and `memoryFlush`. Verify they're active and tune for your workloads:
- raise `keepLastAssistants` if agents lose recent context;
- adjust `compaction.reserveTokensFloor` / `memoryFlush.softThresholdTokens` if runs
  hit limits. Goal: long sessions stay coherent without context exhaustion.

### B3. Security & scopes (least privilege)
- Keep the **public** broker device **operator‑scoped** (read/write) — do NOT grant
  it `operator.admin`. If that leaks, admin = whole control plane.
- For admin‑only actions (e.g. `skills.install`), run them via the **local CLI as
  root** from the broker host instead of exposing admin over the network.
- Treat `BROKER_SECRET` as sensitive; rotate if ever logged.

### B4. CORS on ALL routes  ← recurring gotcha
Every new route (`/skills*`, `/boards*`, `/cron*`, `/agents/*/files`, `/skills/add`)
must send the **same `Access-Control-Allow-Origin` (and preflight) headers** as
`/agents`. Symptom of missing CORS: `curl` works on the box but the browser UI shows
empty/blocked. Apply the CORS middleware globally.

### B5. Public routing
Ensure `am-broker.cognio.so` actually routes to the broker (the Cloudflare/NXDOMAIN
item). The UI already works for agents via that host, so confirm the **new paths**
are served by the same process/tunnel.

### B6. Observability
- Structured request logs (method, path, status, latency, agent/session id).
- Keep `/health` accurate (gateway connected + version).
- `openclaw logs --follow` should surface auth/model errors clearly.

### B7. Robustness
- Idempotency keys on `chat.send` (already used) and on task/skill mutations.
- Uniform error shape `{ "ok": false, "error": "…" }` (you already do this).
- Atomic file writes for `agents.json` / `boards.json` (already used) — keep it.
- Light rate‑limiting on public mutating routes.

### B8. Scheduled jobs hardening
If you expose `/cron`, make `cron.run` idempotent and log each run's outcome so the
UI's "last run" reflects reality.

---

## Verify / report
1. Which Part A prompts you added (orchestrator guide, persona template, memory rules).
2. Model `primary` + `fallbacks` after the change (`openclaw models` output).
3. Whether CORS is now global (list routes covered).
4. Public routing status for the new paths.
5. Anything you intentionally skipped and why.

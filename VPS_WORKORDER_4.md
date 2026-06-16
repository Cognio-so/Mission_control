# VPS work order #4 — LLM-native agent creation (any language) + skills/tools + AI-drafted instructions

Hand to the Claude Code on the VPS. The frontend's brittle keyword matching for
"create an agent" has been **removed** — understanding that intent in any language
is the LLM's job, so it belongs here. Same Bearer auth + global CORS.

---

## 1. Orchestrator `create_agent` tool (the real fix — multilingual & conversational)

Give the Orchestrator a tool so it can create **real registered agents** itself.

**Tool:** `create_agent({ name, instructions, skills?: string[], tools?: string[] })`
→ registers the agent via the broker's existing `/agents` create path (record +
`AGENT.md` + `memory.md` + stable session), returns the new agent id.

**Orchestrator prompt guidance (add to its prime):**
- When the user asks — *in any language* — to create/add an agent, drive a short
  **conversational flow**:
  1. Determine the **name** and **purpose**; if unclear, ask one concise question.
  2. Ask whether to add any **skills** (offer relevant ones from `skills.status`)
     or **tools**, or offer to choose sensible defaults.
  3. **Draft the instructions** yourself (a crisp persona) unless the user supplies them.
  4. Call `create_agent(...)` and **confirm**: "✅ Created '<name>' with skills X, Y."
- Do **not** spawn anonymous `subagent:<uuid>` runs for this — use the tool.

The new agent then appears in Mission Control automatically (the UI re-polls
`/agents`). No frontend change needed.

---

## 2. `POST /agents` — accept `skills` and `tools`

The New-agent builder now sends:
```json
{ "name": "Web Designer", "role": "layouts, UI/UX", "instructions": "…",
  "skills": ["deep-research", "pr-reviewer"], "tools": ["browser", "web_search"] }
```
- Persist `skills` + `tools` on the agent record.
- **Attach** the skills to the agent so its runs can call them (enable them on the
  agent's session/workspace via the gateway's skill mechanism).
- Allow the listed tools for that agent.
- Echo `skills`/`tools` back in `GET /agents` so the UI shows them.

---

## 3. `POST /agents/draft-instructions` — LLM writes the persona

For the builder's **"Write with AI"** button:
```json
// request
{ "name": "Web Designer", "role": "layouts, UI/UX", "brief": "<optional user text>" }
// response
{ "instructions": "You are Web Designer, a specialist in … <crisp persona>" }
```
Implement with a hidden one-shot LLM turn (reuse the `memextract`-style hidden
session pattern). Keep it concise and follow the persona template from
`VPS_BACKEND_GUIDE.md` (Role / Scope / Output format / Memory rules).

---

## 4. (Optional) `GET /tools` — list available tools

So the builder's Tools field can offer real choices instead of free text:
```json
{ "tools": [ { "id": "browser", "name": "Browser" }, { "id": "web_search", "name": "Web search" } ] }
```
Source from the gateway's tool registry if exposed; otherwise skip (the UI accepts
free-text tools).

---

## 0. FIX the Orchestrator prime — it's leaking AND it over-blocks delegation

Two bugs the user is hitting when chatting through the Orchestrator:

**(a) The prime is visible / repeated.** The persona + operating-rules block
(`[System persona for Orchestrator] … Operating rules …`) is showing up as a chat
message every turn. It must be:
- a **hidden `system`-role** instruction (never rendered as a user/assistant message),
- injected **once at session start** (you reported first-turn-only — verify it isn't
  also being echoed into the response or re-sent each turn).

**(b) The rules over-block.** The current prime says *"Never spawn, create, or
delegate to sub-agents… Never delegate."* That kills the Orchestrator's core job.
The intent was only to stop **anonymous ephemeral** `agent:main:subagent:<uuid>`
spawns. Rewrite the rules to **distinguish**:
- ❌ Do NOT spawn anonymous subagents / random sessions (no `sessions_spawn` of
  throwaway `subagent:<uuid>`).
- ✅ DO **delegate to the registered managed agents** (e.g. `seo marketing agent`,
  `Web Designer`) by routing the sub-task to that agent's **stable session
  (`agent_<id>`)**, then **synthesize** their results into one answer with attribution.
- ✅ DO the work directly for simple/clarifying requests.

So: the Orchestrator both **performs** work and **manages/delegates** to the real
agents — it just never invents throwaway subagents.

---

## 5. `DELETE /agents/{id}` — full backend cleanup (not just the record)

The UI now confirms, then calls `DELETE /agents/{id}`. Make that delete **everything**
for the agent so nothing is orphaned in OpenClaw:
- remove the broker agent record,
- delete its files (`AGENT.md` + `memory.md` + its `agent-files/<id>/` dir) — you
  already prune these,
- **delete its session** so no history lingers: `sessions.delete { key: "agent_<id>" }`
  (or `sessions.reset`). This is the part to add if it's missing.

Return `{ "ok": true }`. The UI re-polls `/agents` and the agent is gone everywhere.

---

## Verify
```bash
# delete cleans up record + files + session
curl -s -H "$H" -X DELETE $BASE/agents/<id> | jq
# draft
curl -s -H "$H" -X POST $BASE/agents/draft-instructions -d '{"name":"Web Designer","role":"UI/UX"}' | jq
# create with skills/tools
curl -s -H "$H" -X POST $BASE/agents -d '{"name":"Web Designer","instructions":"...","skills":["deep-research"],"tools":["browser"]}' | jq
# conversational: in Mission Control chat, in ANY language, ask to create an agent →
#   the Orchestrator asks/clarifies, drafts instructions, calls create_agent, and the
#   new agent shows up in Specialists.
```

## Report back
1. `create_agent` tool wired? Confirm a non-English request creates a real agent.
2. Does `/agents` persist + attach skills/tools (and echo them in GET)?
3. `draft-instructions` working (which model/session)?
4. `/tools` available or skipped?

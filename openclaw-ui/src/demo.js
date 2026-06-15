import { ORCH_ID } from './agents.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const uid = () => Math.random().toString(36).slice(2, 9)

export async function runDemo(text, d, ctx = {}) {
  const agent = ctx.agent || { id: ORCH_ID, name: 'Orchestrator', icon: 'OC' }
  const agents = ctx.agents || []
  if (agent.id === ORCH_ID) return runOrchestrator(text, d, agent, agents)
  return runDirect(text, d, agent)
}

async function runOrchestrator(text, d, orch, agents) {
  const aid = orch.id
  const low = text.toLowerCase()
  const managed = agents.filter(a => a.id !== ORCH_ID && a.managedByOrchestrator)
  const mentioned = managed.filter(a => low.includes('@' + a.id) || low.includes('@' + a.name.toLowerCase().split(' ')[0]))
  let picks = mentioned

  if (!picks.length) {
    const want = re => managed.find(a => re.test((a.role + ' ' + a.name + ' ' + a.id).toLowerCase()))
    const set = new Set()
    if (/seo|keyword|rank|search/.test(low)) { const a = want(/seo|search/); if (a) set.add(a) }
    if (/market|gtm|launch|campaign|growth|saas|plan|positioning/.test(low)) { const a = want(/market|gtm/); if (a) set.add(a) }
    if (/research|find|competitor|evidence|source/.test(low)) { const a = want(/research/); if (a) set.add(a) }
    if (/write|article|copy|blog|email|content/.test(low)) { const a = want(/writ|content/); if (a) set.add(a) }
    if (/data|analy|metric|number|model|forecast/.test(low)) { const a = want(/analy|data/); if (a) set.add(a) }
    if (/code|script|integrat|api|automat|engineer/.test(low)) { const a = want(/engineer|code/); if (a) set.add(a) }
    picks = [...set]
    if (!picks.length) picks = managed.slice(0, 2)
  }

  const q = text.length > 48 ? text.slice(0, 48) + '...' : text
  d({ type: 'run.start', agent: aid, title: 'run_' + uid() + ' / orchestrator' })
  d({ type: 'assistant.start', agent: aid })
  await sleep(420)
  d({ type: 'node', node: { cls: 'think', head: 'Orchestrator planning', sub: 'Breaking the request into steps and choosing specialists.' } })
  await sleep(850)
  const cid = 'c_' + uid()
  d({ type: 'node', id: cid, node: { cls: 'tool', head: 'Tool / web_search', tag: 'call', sub: 'args {"query":"' + q + '"}', status: 'pending' } })
  await sleep(1150)
  d({ type: 'node.status', id: cid, status: 'done', pre: 'Found 8 sources. Shared context prepared for specialists.' })
  await sleep(450)

  if (!picks.length) {
    d({ type: 'node', node: { cls: 'think', head: 'No managed agents', sub: 'Answering directly. Add managed agents to enable delegation.' } })
    await streamInto(d, aid, finalNoDelegates(text))
    d({ type: 'run.end', agent: aid, status: 'ok' })
    return
  }

  d({ type: 'node', node: { cls: 'think', head: 'Delegating', sub: 'Spawning ' + picks.length + ' specialist' + (picks.length > 1 ? 's' : '') + ' in scoped sessions.' } })
  const subs = picks.map(p => ({ key: 's_' + uid(), a: p, task: taskFor(p) }))
  for (const su of subs) {
    await sleep(420)
    d({ type: 'sub.spawn', key: su.key, parent: aid, name: su.a.name, icon: su.a.icon, task: su.task })
  }
  await sleep(350)
  for (const su of subs) d({ type: 'sub.status', key: su.key, status: 'running' })
  for (let i = 0; i < subs.length; i++) {
    await sleep(1200 + i * 620)
    d({ type: 'sub.result', key: subs[i].key, status: 'done', summary: resultFor(subs[i].a) })
  }
  await sleep(500)
  d({ type: 'node', node: { cls: 'think', head: 'Synthesizing', sub: 'Specialist results are complete. Composing the final answer.' } })
  await sleep(700)
  await streamInto(d, aid, finalAnswer(picks))
  d({ type: 'run.end', agent: aid, status: 'ok' })
}

async function runDirect(text, d, agent) {
  const aid = agent.id
  d({ type: 'run.start', agent: aid, title: agent.name })
  d({ type: 'assistant.start', agent: aid })
  await sleep(380)
  d({ type: 'node', node: { cls: 'think', head: agent.name + ' thinking', sub: 'Working on: ' + (text.length > 60 ? text.slice(0, 60) + '...' : text) } })
  await sleep(700)
  await streamInto(d, aid, directReply(agent, text))
  d({ type: 'run.end', agent: aid, status: 'ok' })
}

async function streamInto(d, aid, full) {
  const tokens = full.split(/(\s+)/)
  let acc = ''
  for (let i = 0; i < tokens.length; i++) {
    acc += tokens[i]
    d({ type: 'assistant.delta', agent: aid, text: tokens[i] })
    if (i % 3 === 0) await sleep(28)
  }
  d({ type: 'assistant.final', agent: aid, text: acc })
}

function taskFor(a) {
  const id = a.id
  return ({
    marketing: 'Draft positioning and a phased go-to-market plan',
    seo: 'Build a keyword map and content outlines',
    research: 'Gather and verify supporting evidence',
    writer: 'Produce the written deliverables',
    analyst: 'Quantify the opportunity',
    engineer: 'Prototype the technical pieces',
  })[id] || (a.role ? a.role : 'Handle your part of the request')
}

function resultFor(a) {
  const id = a.id
  return ({
    marketing: 'Delivered a 3-phase GTM plan: positioning, launch channels, and a 30/60/90 timeline.',
    seo: 'Produced 20 target keywords by intent, plus 6 article outlines with internal links.',
    research: 'Verified 8 sources. Flagged 2 low-confidence sources and excluded them.',
    writer: 'Drafted 3 pieces around 1,500 words each, ready for review.',
    analyst: 'Modeled TAM, SAM, and a simple CAC to LTV scenario.',
    engineer: 'Scaffolded the integration script and a test harness.',
  })[id] || ('Completed: ' + (a.role || a.name) + '.')
}

function finalAnswer(picks) {
  const list = picks.map(p => '- ' + p.name + ': ' + taskFor(p).toLowerCase()).join('\n')
  return 'Done. I coordinated ' + picks.length + ' specialist' + (picks.length > 1 ? 's' : '') +
    ' and pulled the work together:\n\n' + list +
    '\n\nEverything ran inside scoped sessions. This is demo output. Connect your broker in Settings for real responses.'
}

function finalNoDelegates(text) {
  return 'Here is my take on "' + (text.length > 60 ? text.slice(0, 60) + '...' : text) + '". ' +
    'I do not have managed agents yet, so I handled this myself. Create agents and mark them managed by Orchestrator to delegate next time.'
}

function directReply(agent, text) {
  const q = text.length > 70 ? text.slice(0, 70) + '...' : text
  return 'As your ' + agent.name + ', here is how I would approach "' + q + '":\n\n' +
    '1. Clarify the goal and constraints.\n' +
    '2. ' + (agent.role || 'Do the core work for this request') + '.\n' +
    '3. Return a concrete deliverable you can use.\n\n' +
    'This is demo output for @' + agent.id + '. Connect your broker in Settings for real responses.'
}

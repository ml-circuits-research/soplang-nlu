// Static development comparison through the public reader, using frozen draft hints.
import {spawn} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {gunzipSync} from 'node:zlib'
import {performance} from 'node:perf_hooks'
import {createReader} from '../../../lib/reader.mjs'
import {hasCompleteSource} from '../../../lib/check-analysis.mjs'
import {renderGraph} from '../../../strategies/distilbert/graph.mjs'

const [dev, checkpoint, output] = process.argv.slice(2)
const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR
if (!dev || !checkpoint || !output || !knowledgeDir) {
  throw Error('Expected DEV.jsonl.gz CHECKPOINT OUTPUT.json with SOP_KNOWLEDGE_DIR set.')
}
const python = process.env.SOP_NLU_DISTILBERT_PYTHON ?? 'python3'
const rows = gunzipSync(readFileSync(dev)).toString().trim().split('\n').map(JSON.parse)
if (!rows.length || rows.some(row => !Array.isArray(row.nodes))) throw Error('Expected labeled development rows.')
const script = fileURLToPath(new URL('./infer.py', import.meta.url))
const start = performance.now()
const child = spawn(python, ['-u', script, checkpoint, '--device', 'cpu'],
  {stdio:['pipe','pipe','inherit']})
const closed = new Promise(resolve => {
  child.once('error', error => resolve(error.message))
  child.once('close', code => resolve('exit ' + code))
})
child.stdin.on('error', () => {})
const messages = createInterface({input:child.stdout})[Symbol.asyncIterator]()
async function read() {
  const next = await messages.next()
  if (next.done) throw Error('Repair worker closed its output: ' + await closed)
  return JSON.parse(next.value)
}
const durations = []
const counts = {draftGrounded:0, editGrounded:0, editRejected:0, editEmpty:0, draftComplete:0,
  editComplete:0, pairedComplete:0, completeGains:0, completeLosses:0, bothDistinct:0}
let draft
let edit
let pair
let proposal
const strategy = (name, getSops) => ({name, async open() {
  return {async analyse() { return {analyses:getSops().map(sop=>({sop}))} }, close() {}}
}})
try {
  const ready = await read()
  const startupMs = performance.now() - start
  if (!ready.ready) throw Error('Repair worker did not report readiness.')
  draft = await createReader({knowledgeDir, strategy:strategy('draft-dev', ()=>proposal.draft)})
  edit = await createReader({knowledgeDir, strategy:strategy('edit-dev', ()=>proposal.edit)})
  pair = await createReader({knowledgeDir, strategy:strategy('draft-pair-dev', ()=>
    [...new Set([...proposal.draft,...proposal.edit])])})
  for (const [id, {text, tokens, draftNodes, draftSop}] of rows.entries()) {
    const began = performance.now()
    child.stdin.write(JSON.stringify({id,text,tokens,draftNodes})+'\n')
    const response = await read()
    durations.push(performance.now() - began)
    if (response.error || response.id !== id || !Array.isArray(response.nodes)) {
      throw Error(response.error ?? 'Repair worker returned an invalid graph response.')
    }
    proposal = {draft:draftSop ? [draftSop] : [],
      edit:response.nodes.length ? [renderGraph(text,tokens,response.nodes)] : []}
    const [original, edited, paired] = await Promise.all([draft,edit,pair].map(reader=>reader.propose(text)))
    const baseComplete = original.candidates.some(candidate=>hasCompleteSource(candidate.check))
    const editComplete = edited.candidates.some(candidate=>hasCompleteSource(candidate.check))
    counts.draftGrounded += Number(original.candidates.length > 0)
    counts.editGrounded += Number(edited.candidates.length > 0)
    counts.editRejected += Number(edited.rejected.length > 0)
    counts.editEmpty += Number(proposal.edit.length === 0)
    counts.draftComplete += Number(baseComplete)
    counts.editComplete += Number(editComplete)
    counts.pairedComplete += Number(paired.candidates.some(candidate=>hasCompleteSource(candidate.check)))
    counts.completeGains += Number(!baseComplete && editComplete)
    counts.completeLosses += Number(baseComplete && !editComplete)
    counts.bothDistinct += Number(paired.candidates.length > 1)
  }
  const warm = durations.slice(1).sort((a,b)=>a-b)
  const summary = {rows:rows.length, checkpoint, python, startupMs, firstMs:durations[0],
    warmMedianMs:warm[Math.floor(warm.length*.5)], warmP95Ms:warm[Math.floor(warm.length*.95)],
    ...counts, elapsedMs:performance.now()-start}
  writeFileSync(output, JSON.stringify(summary,null,2)+'\n', {flag:'wx'})
} finally {
  await Promise.all([draft,edit,pair].filter(Boolean).map(reader=>reader.close()))
  child.stdin.end()
  await closed
}

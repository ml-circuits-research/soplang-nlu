import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync, gzipSync} from 'node:zlib'
import {matchReviewedReferences, nativeReferenceDigest, normalizeCircuit} from '../native-references.mjs'

const [run, output, singletonPath, confirmedDefectPath] = process.argv.slice(2)
if (!run || !output) {
  throw Error('Usage: node classify-native-sets.mjs RUN OUTPUT [SINGLETON.jsonl[.gz]] [VERIFIED_REFERENCE_DEFECTS.json]')
}
const source = join(run, 'source-review-v2')
const manifest = JSON.parse(readFileSync(join(source, 'manifest.json')))
const packetBytes = readFileSync(join(source, 'packets.json.gz'))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
if (manifest.packetsSha256 !== digest(packetBytes)) throw Error('Native review packets changed.')
const packets = JSON.parse(gunzipSync(packetBytes))
const textOf = path => {
  const bytes = readFileSync(path)
  return (path.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString()
}
const jsonl = path => textOf(path).split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
const engines = ['z3', 'prolog-worlds', 'prolog-example-transfer']
const reviewPath = join(source, 'native-judgments.jsonl.gz')
const inventoryPath = join(run, 'candidate-audit', 'candidate-inventory.jsonl.gz')
const settled = jsonl(reviewPath)
const rowKey = (rowIndex, engine) => rowIndex + ':' + engine
const byEngine = new Map(settled.map(row => [rowKey(row.rowIndex,row.engine),row]))
if (settled.length !== packets.length * engines.length || settled.length !== byEngine.size) {
  throw Error('Incomplete or repeated native v2 engine judgments.')
}
const circuit = (packet, index) => packet.circuits[index].map(line => packet.lines[line]).join('\n')
const identity = (text, sop) => JSON.stringify([text,normalizeCircuit(sop)])
const accepted = new Set(settled.filter(row => row.grade === 8).map(row => identity(row.text,row.sop)))
const inventory = new Map(jsonl(inventoryPath).map(row => [identity(row.text,row.sop),row]))
const singleton = new Map()
if (singletonPath) {
  for (const row of jsonl(singletonPath)) {
    const index = Number(row.group)
    const packet = packets[row.rowIndex]
    if (!packet || !Number.isSafeInteger(index) || !packet.circuits[index] ||
        !Number.isSafeInteger(row.grade) || row.grade < 0 || row.grade > 8 || row.grade === 2 ||
        (row.grade === 0 ? row.candidate !== null : row.candidate !== index)) {
      throw Error('Invalid independent singleton review for row ' + row.rowIndex)
    }
    const key = identity(packet.text, circuit(packet,index))
    if (singleton.has(key)) throw Error('Duplicate exact singleton judgment.')
    singleton.set(key,row)
  }
}

function classifyCandidate(packet, membership, index, hasSettledPass) {
  if (!membership.valid.includes(index)) return {status:'unacceptable', evidence:'static structure or grounding failure'}
  if (!packet.groups[membership.key].includes(index)) {
    return {status:'unacceptable', evidence:'static material source gap'}
  }
  if (!hasSettledPass) {
    return {status:'not individually adjudicated', evidence:'no accepted v2 whole-set witness'}
  }
  const key = identity(packet.text, circuit(packet,index))
  if (accepted.has(key)) return {status:'acceptable', evidence:'settled exact v2 witness for this source'}
  const review = singleton.get(key)
  if (review) return {status:review.grade === 8 ? 'acceptable' : 'unacceptable',
    evidence:'new independent literal singleton', reason:review.reason}
  const entry = inventory.get(key)
  if (!entry) return {status:'undetermined', evidence:'no exact inventory judgment'}
  const votes = new Set(entry.evidence.filter(vote => vote.kind === 'literal singleton').map(vote => vote.grade === 8))
  if (votes.size === 1) return {status:votes.has(true) ? 'acceptable' : 'unacceptable', evidence:'exact literal singleton inventory'}
  if (entry.disposition === 'independently supported') return {status:'acceptable', evidence:'independently supported exact inventory witness'}
  if (entry.disposition === 'below threshold') return {status:'unacceptable', evidence:'exact below-threshold inventory witness', reason:entry.reason}
  return {status:'undetermined', evidence:'conflicting exact judgments'}
}

function outcome(candidates) {
  if (candidates.some(candidate => candidate.status === 'unacceptable')) return 'mixed'
  if (candidates.some(candidate => candidate.status === 'undetermined')) return 'pending'
  return candidates.length ? 'all' : 'none'
}

const results = []
const needed = new Map()
let addedRawCandidates = 0
let rawClassificationChanges = 0
for (const packet of packets) {
  for (const engine of engines) {
    const membership = packet.memberships[engine]
    const previous = byEngine.get(rowKey(packet.rowIndex,engine))
    if (!previous) throw Error('Missing settled v2 judgment for ' + packet.id + ' ' + engine)
    const evidence = membership.original.map((index, ordinal) => ({index,
      scope:ordinal < membership.returned ? 'returned' : 'raw-rejection-record',
      ...classifyCandidate(packet,membership,index,previous.grade === 8)}))
    const publicCandidates = evidence.slice(0,membership.returned)
    const publicCandidateSops = publicCandidates.map(candidate => circuit(packet,candidate.index))
    addedRawCandidates += evidence.length - publicCandidates.length
    const hasAccepted = previous.grade === 8 && publicCandidates.some(candidate => candidate.status === 'acceptable')
    const publicOutcome = hasAccepted ? outcome(publicCandidates) : 'none'
    const rawOutcome = previous.grade === 8 && evidence.some(candidate => candidate.status === 'acceptable')
      ? outcome(evidence) : 'none'
    if (publicOutcome !== rawOutcome) rawClassificationChanges++
    if (publicOutcome === 'pending' || rawOutcome === 'pending') {
      const pending = publicOutcome === 'pending' ? publicCandidates : evidence
      for (const candidate of pending.filter(item => item.status === 'undetermined')) {
        const signature = identity(packet.text,circuit(packet,candidate.index))
        if (!needed.has(signature)) needed.set(signature,{packet,index:candidate.index})
      }
    }
    const grade = publicOutcome === 'all' ? 8 : publicOutcome === 'mixed' ? 7 :
      publicOutcome === 'none' ? (previous.grade === 8 ? 0 : Math.min(previous.grade,6)) : null
    results.push({id:packet.id, rowIndex:packet.rowIndex, engine, text:packet.text,
      grade, outcome:publicOutcome, rawOutcome, v2Grade:previous.grade,
      reason:previous.reason, witness:previous.sop, publicCandidateSops, candidates:evidence})
  }
}

mkdirSync(output,{recursive:true})
const pendingPackets = new Map()
for (const {packet,index} of needed.values()) {
  const selected = pendingPackets.get(packet.rowIndex) ?? {...packet,groups:{},staticJudgments:{}}
  selected.groups[String(index)] = [index]
  pendingPackets.set(packet.rowIndex,selected)
}
if (needed.size) {
  writeFileSync(join(output,'singleton-packets.json.gz'),gzipSync(JSON.stringify([...pendingPackets.values()])))
  console.log(JSON.stringify({requiresIndependentReview:needed.size, rows:pendingPackets.size}))
  process.exitCode = 2
} else {
  const environment = JSON.parse(readFileSync(join(run,'environment.json')))
  const referenceFile = join(run,'native-references.json.gz')
  const refs = existsSync(referenceFile) ? JSON.parse(textOf(referenceFile)) : []
  if ((environment.nativeReferenceTexts ?? 0) !== refs.length ||
      (environment.nativeReferenceSha256 && environment.nativeReferenceSha256 !== nativeReferenceDigest(refs))) {
    throw Error('Frozen native reference file does not match the run environment.')
  }
  const confirmedDefects = confirmedDefectPath ? JSON.parse(textOf(confirmedDefectPath)) : []
  const judged = matchReviewedReferences(results,refs,confirmedDefects)
  const fields = (keys, rows, select) => {
    const counts = Object.fromEntries(keys.map(key=>[key,0]))
    for (const row of rows) counts[select(row)]++
    const parts = keys.map((key,index) => {
      const numerator = counts[key] * 10000
      return {key,index,whole:Math.floor(numerator/rows.length), remainder:numerator%rows.length}
    })
    let remaining = 10000 - parts.reduce((sum,item)=>sum+item.whole,0)
    for (const item of [...parts].sort((a,b)=>b.remainder-a.remainder || a.index-b.index)) {
      if (remaining-- <= 0) break
      item.whole++
    }
    const percentages = Object.fromEntries(parts.map(item=>[item.key,item.whole/100]))
    return {counts, percentages}
  }
  const levels = Array.from({length:11},(_,grade)=>'L'+grade)
  const outcomes = ['all','mixed','none']
  const engineSummary = Object.fromEntries(engines.map(engine => {
    const rows = judged.filter(row=>row.engine===engine)
    return [engine,{sample:rows.length,
      outcomes:fields(outcomes,rows,row=>row.outcome),
      grades:fields(levels,rows,row=>'L'+row.grade),
      rawSensitivity:fields(outcomes,rows,row=>row.rawOutcome)}]
  }))
  const summary = {profile:'nlu-source-first-v3', sample:packets.length,
    scope:'public returned candidate list, order-independent', packetSha256:digest(packetBytes),
    v2JudgmentsSha256:digest(readFileSync(reviewPath)), inventorySha256:digest(readFileSync(inventoryPath)),
    singletonSha256:singletonPath ? digest(readFileSync(singletonPath)) : null,
    independentlyReviewedSingletons:singleton.size, frozenNativeReferenceTexts:refs.length,
    addedRawCandidates, rawClassificationChanges, engines:engineSummary}
  writeFileSync(join(output,'native-summary.json'),JSON.stringify(summary,null,2)+'\n')
  writeFileSync(join(output,'native-judgments.jsonl.gz'),gzipSync(judged.map(row=>JSON.stringify(row)).join('\n')))
  console.log(JSON.stringify(summary))
}

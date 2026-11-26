import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync} from 'node:fs'
import {gunzipSync, gzipSync} from 'node:zlib'
import {join} from 'node:path'

const [directory, primary, second] = process.argv.slice(2)
if (!directory || !primary) {
  throw Error('Usage: node summarize-native.mjs REVIEW_DIR PRIMARY.jsonl [SECOND.jsonl]')
}
const engines = ['z3', 'prolog-worlds', 'prolog-example-transfer']
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
const packed = readFileSync(join(directory, 'packets.json.gz'))
const sha = value => createHash('sha256').update(value).digest('hex')
if (manifest.profile !== 'nlu-source-first-v1' || manifest.packetsSha256 !== sha(packed)) {
  throw Error('Unexpected native review profile or incomplete packet file.')
}
const packets = JSON.parse(gunzipSync(packed))
const byRow = new Map(packets.map(packet => [packet.rowIndex, packet]))
const keyFor = ({rowIndex, group}) => rowIndex + ':' + group
const validEntry = entry => {
  const {rowIndex, group, grade, reason, candidate} = entry
  const allowed = byRow.get(rowIndex)?.groups[group]
  return Number.isSafeInteger(grade) && grade >= 0 && grade <= 8 &&
    typeof reason === 'string' && reason.trim().length > 0 && !entry.referenceIssue &&
    Array.isArray(allowed) &&
    (grade === 0 ? candidate === null : Number.isSafeInteger(candidate) && allowed.includes(candidate))
}
function readJudgments(path) {
  const bytes = readFileSync(path)
  const records = new Map()
  for (const text of bytes.toString().split('\n')) {
    if (!text.trim()) continue
    const entry = JSON.parse(text)
    const key = keyFor(entry)
    if (!validEntry(entry) || records.has(key)) throw Error('Invalid or repeated native review judgment: ' + key)
    records.set(key, entry)
  }
  return {records, sha256: sha(bytes)}
}
const {records: judgments, sha256: primarySha256} = readJudgments(primary)
const reviewedGroups = packets.reduce((sum, packet) => sum + Object.keys(packet.groups).length, 0)
if (judgments.size !== reviewedGroups) throw Error('Primary native review does not cover every group.')
const audit = second ? readJudgments(second) : undefined
for (const [key, review] of audit?.records ?? []) {
  if (!judgments.has(key)) throw Error('Second reviewer supplied an unknown key: ' + key)
  judgments.set(key, review)
}

// Groups can differ while sharing a candidate. An accepted whole circuit is
// positive evidence for every group that actually emitted it for this text.
const promotions = new Map()
const conflictingWitnesses = []
for (const packet of packets) {
  const accepted = []
  const independentlyRejected = new Set()
  for (const group of Object.keys(packet.groups)) {
    const key = keyFor({rowIndex: packet.rowIndex, group})
    const judgment = judgments.get(key)
    const audited = audit?.records.has(key) ?? false
    if (judgment.grade === 8) accepted.push({judgment, audited})
    else if (audited && judgment.candidate !== null) independentlyRejected.add(judgment.candidate)
  }
  for (const {judgment} of accepted) {
    if (independentlyRejected.has(judgment.candidate)) {
      conflictingWitnesses.push({rowIndex: packet.rowIndex, group: judgment.group, candidate: judgment.candidate})
    }
  }
  accepted.sort((a,b) => Number(b.audited) - Number(a.audited) || a.judgment.candidate - b.judgment.candidate)
  for (const [group, eligible] of Object.entries(packet.groups)) {
    const key = keyFor({rowIndex: packet.rowIndex, group})
    if (judgments.get(key).grade === 8) continue
    const shared = accepted.find(({judgment}) =>
      !independentlyRejected.has(judgment.candidate) && eligible.includes(judgment.candidate))
    if (shared) promotions.set(key, shared.judgment)
  }
}

const engineSummary = Object.fromEntries(engines.map(engine => [engine, {
  rows: 0, accepted: 0, engineErrors: 0, noEligibleCandidates: 0, sharedWitnessPromotions: 0,
  counts: Object.fromEntries(Array.from({length: 11}, (_, grade) => ['L' + grade, 0])),
  examples: {}
}]))
const rows = []
for (const packet of packets) {
  for (const engine of engines) {
    const {key, original, error, rejected} = packet.memberships[engine]
    const groupKey = keyFor({rowIndex: packet.rowIndex, group: key})
    const promoted = promotions.get(groupKey)
    const judgment = promoted ?? judgments.get(groupKey)
    if (!judgment) throw Error('Missing native review judgment: ' + packet.rowIndex + ':' + key)
    const {grade, candidate, reason} = judgment
    const emittedIndex = candidate === null ? null : original.indexOf(candidate)
    if (emittedIndex === -1) throw Error('Selected native witness was not emitted by ' + engine)
    const sop = candidate === null ? null : packet.circuits[candidate].map(index => packet.lines[index]).join('\n')
    const label = 'L' + grade
    const summary = engineSummary[engine]
    summary.rows++
    summary.counts[label]++
    if (grade === 8) summary.accepted++
    if (promoted) summary.sharedWitnessPromotions++
    if (error) summary.engineErrors++
    if (!packet.groups[key].length) summary.noEligibleCandidates++
    const detail = {id: packet.id, rowIndex: packet.rowIndex, engine, grade, text: packet.text,
      reason, emittedIndex, candidate, sop, check: candidate === null ? null : packet.checks[candidate],
      engineError: error, rejected, eligibleCandidates: packet.groups[key].length,
      ...(promoted ? {sharedWitnessFromGroup: promoted.group} : {})}
    rows.push(detail)
    const examples = summary.examples[label] ?? []
    if (examples.length < 3) examples.push({id: packet.id, text: packet.text, reason, sop})
    summary.examples[label] = examples
  }
}
for (const summary of Object.values(engineSummary)) {
  summary.acceptedPercent = 100 * summary.accepted / summary.rows
  summary.percent = Object.fromEntries(Object.entries(summary.counts).map(([level,count]) =>
    [level, 100 * count / summary.rows]))
}
const summary = {profile: manifest.profile, sample: packets.length, reviewedGroups,
  auditGroups: audit?.records.size ?? 0, primarySha256, auditSha256: audit?.sha256,
  sharedWitnessGroups: promotions.size, conflictingWitnesses, engines: engineSummary}
writeFileSync(join(directory, 'native-judgments.jsonl.gz'), gzipSync(rows.map(row => JSON.stringify(row)).join('\n')))
writeFileSync(join(directory, 'native-summary.json'), JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({profile: manifest.profile, sample: packets.length, reviewedGroups,
  auditGroups: summary.auditGroups, engines: Object.fromEntries(engines.map(engine => [
    engine, {accepted: engineSummary[engine].accepted, acceptedPercent: engineSummary[engine].acceptedPercent,
      counts: engineSummary[engine].counts}
  ]))}
))

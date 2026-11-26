import {createHash} from 'node:crypto'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'

const [priorPacketPath, priorReview, newPacketPath, output] = process.argv.slice(2)
if (!priorPacketPath || !priorReview || !newPacketPath || !output) {
  throw Error('Usage: node reuse-native.mjs PRIOR_PACKETS.gz PRIOR_REVIEW.jsonl NEW_PACKETS.gz SALVAGE_DIR')
}
const oldPackets = JSON.parse(gunzipSync(readFileSync(priorPacketPath)))
const newBytes = readFileSync(newPacketPath)
const newPackets = JSON.parse(gunzipSync(newBytes))
const normalized = (packet, index) => packet.circuits[index].map(line => packet.lines[line]).join('\n')
const signature = (packet, eligible) => JSON.stringify([packet.text, eligible.map(index => normalized(packet,index)).sort()])
const saved = new Map()
const conflicts = new Set()
const indices = new Map(oldPackets.map(packet => [packet.rowIndex, packet]))
const priorBytes = readFileSync(priorReview)
for (const line of priorBytes.toString().split('\n')) {
  if (!line.trim()) continue
  const row = JSON.parse(line)
  const packet = indices.get(row.rowIndex)
  const eligible = packet?.groups[row.group]
  if (!eligible?.length) continue
  if (!Number.isInteger(row.grade) || row.grade < 0 || row.grade > 8 || row.grade === 2 ||
      typeof row.reason !== 'string' || !row.reason.trim() ||
      (row.grade === 0 ? row.candidate !== null : !eligible.includes(row.candidate))) {
    throw Error('Invalid prior native model judgment for row ' + row.rowIndex)
  }
  const key = signature(packet, eligible)
  const witness = row.candidate === null ? null : normalized(packet, row.candidate)
  if (saved.has(key)) {
    const original = saved.get(key)
    if (original.grade !== row.grade || original.witness !== witness) conflicts.add(key)
  } else {
    saved.set(key, {grade: row.grade, reason: row.reason, witness})
  }
}

const results = []
let eligibleGroups = 0
for (const packet of newPackets) {
  for (const [group, eligible] of Object.entries(packet.groups)) {
    if (!eligible.length) continue
    eligibleGroups++
    const key = signature(packet, eligible)
    const old = saved.get(key)
    if (!old || conflicts.has(key)) continue
    const candidate = old.witness === null ? null : eligible.find(index => normalized(packet, index) === old.witness)
    if (candidate === undefined) throw Error('Identical source/candidate signature lost its original witness.')
    results.push({rowIndex: packet.rowIndex, group, candidate, grade: old.grade, reason: old.reason})
  }
}
const executionFingerprint = createHash('sha256').update(newBytes).update('native').digest('hex')
mkdirSync(output, {recursive: true})
writeFileSync(join(output, 'packet-sha256.txt'), executionFingerprint + '\n', {flag:'wx'})
writeFileSync(join(output, 'reused.json'), JSON.stringify({results}) + '\n', {flag:'wx'})
const provenance = {
  reusable: results.length, eligibleGroups, changedOrUnreviewed: eligibleGroups - results.length,
  conflictingRepeatedSourceSets: conflicts.size,
  priorReviewSha256: createHash('sha256').update(priorBytes).digest('hex'),
}
writeFileSync(join(output, 'reuse-log.json'), JSON.stringify(provenance,null,2)+'\n', {flag:'wx'})
console.log(JSON.stringify(provenance))

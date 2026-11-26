import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {join} from 'node:path'

const [directory, firstPath, secondPath] = process.argv.slice(2)
if (!directory || !firstPath || !secondPath) {
  throw Error('Usage: node compare-native-reviews.mjs REVIEW_DIR FIRST.jsonl SECOND.jsonl')
}
const packets = JSON.parse(gunzipSync(readFileSync(join(directory, 'packets.json.gz'))))
const key = (rowIndex, group) => rowIndex + ':' + group
const total = packets.reduce((n, packet) => n + Object.keys(packet.groups).length, 0)
function read(path) {
  const data = readFileSync(path)
  const records = new Map()
  for (const line of data.toString().split('\n')) {
    if (!line.trim()) continue
    const entry = JSON.parse(line)
    const identifier = key(entry.rowIndex, entry.group)
    if (records.has(identifier)) throw Error('Duplicate judgment in ' + path + ': ' + identifier)
    records.set(identifier, entry)
  }
  if (records.size !== total) throw Error('Expected complete native judgments in ' + path)
  return {records, sha256: createHash('sha256').update(data).digest('hex')}
}
const first = read(firstPath)
const second = read(secondPath)
const selection = []
const differences = []
let eligibleGroups = 0
let exactGradeAgreement = 0
let thresholdAgreement = 0
for (const packet of packets) {
  for (const [group, candidates] of Object.entries(packet.groups)) {
    const {rowIndex, id, text} = packet
    const identifier = key(rowIndex, group)
    const left = first.records.get(identifier)
    const right = second.records.get(identifier)
    if (!left || !right) throw Error('Missing dual-review group ' + identifier)
    if (!candidates.length) {
      if (left.grade !== right.grade || left.candidate !== right.candidate) {
        throw Error('Static judgment disagreement in group ' + identifier)
      }
      continue
    }
    eligibleGroups++
    if (left.grade === right.grade) exactGradeAgreement++
    const agreesOnAcceptance = (left.grade === 8) === (right.grade === 8)
    if (agreesOnAcceptance) thresholdAgreement++
    else selection.push({rowIndex, group})
    if (left.grade !== right.grade) differences.push({rowIndex, group, id, text, left, right})
  }
}
const report = {
  total, eligibleGroups, exactGradeAgreement, thresholdAgreement,
  thresholdDisagreement: selection.length, firstSha256: first.sha256, secondSha256: second.sha256,
  differences
}
writeFileSync(join(directory, 'review-agreement.json'), JSON.stringify(report,null,2)+'\n')
writeFileSync(join(directory, 'threshold-disagreements.json'), JSON.stringify(selection,null,2)+'\n')
console.log(JSON.stringify({...report, differences: differences.length}))

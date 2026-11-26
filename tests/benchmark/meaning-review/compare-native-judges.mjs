import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync, gzipSync} from 'node:zlib'

const [directory, output] = process.argv.slice(2)
if (!directory || !output) {
  throw Error('Usage: node compare-native-judges.mjs REVIEW_DIR COMPARISON_DIR')
}
const readJson = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
const packets = JSON.parse(gunzipSync(readFileSync(join(directory, 'packets.json.gz'))))
const keyOf = (rowIndex, group) => rowIndex + ':' + group
const readJudgments = name => {
  const map = new Map()
  for (const line of readFileSync(join(directory, name + '.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    const key = keyOf(row.rowIndex, row.group)
    if (map.has(key)) throw Error('Duplicate review group in ' + name + ': ' + key)
    map.set(key, row)
  }
  return map
}
const judges = ['luna', 'sol', 'terra']
const original = Object.fromEntries(judges.map(judge => [judge, readJudgments(judge)]))
const adjudicated = readJudgments('adjudicated')
const eligibleRows = packets.flatMap(packet => Object.entries(packet.groups).flatMap(([group, eligible]) => {
  if (!eligible.length) return []
  const key = keyOf(packet.rowIndex, group)
  const grades = Object.fromEntries(judges.map(judge => {
    const row = original[judge].get(key)
    const grade = row?.grade
    if (!Number.isSafeInteger(grade) || grade < 0 || grade > 8 || grade === 2 ||
        (grade > 0 ? !eligible.includes(row.candidate) : row.candidate !== null)) {
      throw Error('Missing or invalid ' + judge + ' judgment for ' + key)
    }
    return [judge, row]
  }))
  return [{packet, group, key, grades}]
}))
const pass = value => value === 8
function agreement(left, right, categorize) {
  const matrix = new Map()
  const leftCounts = new Map()
  const rightCounts = new Map()
  let equal = 0
  const add = (map,key) => map.set(key, (map.get(key) ?? 0) + 1)
  for (const {grades} of eligibleRows) {
    const x = categorize(grades[left].grade)
    const y = categorize(grades[right].grade)
    if (x === y) equal++
    add(leftCounts, x)
    add(rightCounts, y)
    if (!matrix.has(x)) matrix.set(x,new Map())
    add(matrix.get(x),y)
  }
  const sample = eligibleRows.length
  const observed = equal / sample
  const expected = [...leftCounts].reduce((sum, [key,count]) => sum + count * (rightCounts.get(key) ?? 0), 0) / sample ** 2
  return {sample, equal, observed, expected, kappa: expected === 1 ? null : (observed - expected)/(1 - expected),
    confusion: Object.fromEntries([...matrix].map(([label, counts]) => [label, Object.fromEntries(counts)]))}
}
const pairs = [['terra','sol'], ['luna','sol'], ['terra','luna']]
const pairwise = Object.fromEntries(pairs.map(([left, right]) => [
  left + '/' + right, {threshold: agreement(left,right,grade => pass(grade) ? 'pass' : 'fail'),
    exactGrade: agreement(left,right,grade => 'L' + grade)}
]))

function blankStratum() {
  return {groups:0, adjudicatedPass:0, reviewers: Object.fromEntries(judges.map(judge => [judge, {
    thresholdMatches:0, exactGradeMatches:0, passAgainstAdjudicatedFail:0, failAgainstAdjudicatedPass:0
  }]))}
}
const allThresholdDisagreements = blankStratum()
const strata = {lunaOnlyAccepted: blankStratum(), solOnlyAccepted: blankStratum()}
const cases = []
for (const {packet,group,key,grades} of eligibleRows) {
  if (pass(grades.luna.grade) === pass(grades.sol.grade)) continue
  const final = adjudicated.get(key)
  if (!final) throw Error('No adjudication for a true threshold disagreement: ' + key)
  const label = pass(grades.luna.grade) ? 'lunaOnlyAccepted' : 'solOnlyAccepted'
  for (const bucket of [allThresholdDisagreements, strata[label]]) {
    bucket.groups++
    if (pass(final.grade)) bucket.adjudicatedPass++
    for (const judge of judges) {
      const grade = grades[judge].grade
      const stat = bucket.reviewers[judge]
      if (pass(grade) === pass(final.grade)) stat.thresholdMatches++
      if (grade === final.grade) stat.exactGradeMatches++
      if (pass(grade) && !pass(final.grade)) stat.passAgainstAdjudicatedFail++
      if (!pass(grade) && pass(final.grade)) stat.failAgainstAdjudicatedPass++
    }
  }
  const withSop = review => ({
    ...review,
    sop: review.candidate === null ? null
      : packet.circuits[review.candidate].map(line => packet.lines[line]).join('\n')
  })
  cases.push({id:packet.id, text:packet.text, rowIndex:packet.rowIndex, group, stratum:label,
    ...Object.fromEntries(judges.map(judge => [judge,withSop(grades[judge])])),
    adjudication:withSop(final)})
}
for (const bucket of [allThresholdDisagreements, ...Object.values(strata)]) {
  for (const stat of Object.values(bucket.reviewers)) {
    stat.thresholdAgreementRate = bucket.groups ? stat.thresholdMatches / bucket.groups : null
    stat.exactGradeAgreementRate = bucket.groups ? stat.exactGradeMatches / bucket.groups : null
  }
}
const counts = Object.fromEntries(judges.map(judge => [
  judge, eligibleRows.filter(({grades}) => pass(grades[judge].grade)).length
]))
const report = {
  modelEligibleGroups: eligibleRows.length,
  acceptedCounts: counts,
  pairwise,
  adjudicatedDisagreements: {all:allThresholdDisagreements,strata},
  design: 'Whole literal circuit review of the final native eligibility set. Adjudication is a separate fresh model pass, not independently established human gold.'
}
mkdirSync(output,{recursive:true})
writeFileSync(join(output,'agreement.json'),JSON.stringify(report,null,2)+'\n')
writeFileSync(join(output,'disagreements.jsonl.gz'),gzipSync(cases.map(item => JSON.stringify(item)).join('\n')))
console.log(JSON.stringify(report))

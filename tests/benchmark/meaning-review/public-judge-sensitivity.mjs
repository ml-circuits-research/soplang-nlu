// Reclassify exactly the returned sets under each blind reviewer. Static
// failures stay failures for both. This does not change the protocol grades.
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {distribution} from './review-public-candidates.mjs'

const [directory,output] = process.argv.slice(2)
if (!output) throw Error('Usage: public-judge-sensitivity.mjs REVIEW_DIR OUTPUT_JSON')
function rows(name) {
  const bytes = gunzipSync(readFileSync(join(directory,name)))
  return bytes.toString().trim().split('\n').filter(Boolean).map(JSON.parse)
}
const key = (text,sop) => createHash('sha256').update(JSON.stringify([text,sop])).digest('hex')
const pairs = rows('candidate-decisions.jsonl.gz')
const byKey = new Map(pairs.map(pair => [pair.fingerprint,pair]))
if (byKey.size !== pairs.length) throw Error('Duplicate reviewed source and circuit')
const labels = ['none','some','all']
const grades = new Map()
for (const row of rows('public-set-judgments.jsonl.gz')) {
  const pairList = row.candidates.map(candidate => {
    if (!candidate.reviewed) return null
    const pair = byKey.get(key(row.text,candidate.sop))
    if (!pair || pair.grade !== candidate.grade) throw Error('Reviewed candidate mismatch at '+row.id)
    return pair
  })
  const item = {}
  for (const name of ['primary','independent','settled']) {
    const accepted = pairList.filter(pair => pair && (name==='settled' ? pair.grade : pair[name].grade)===8)
    item[name] = !accepted.length ? 'none' : accepted.length===pairList.length ? 'all' : 'some'
  }
  if (item.settled!==row.outcome) throw Error('Settled public list differs at '+row.id)
  if (!grades.has(row.engine)) grades.set(row.engine,[])
  grades.get(row.engine).push(item)
}
const report = {unit:'exact eligible source and circuit',uniquePairs:pairs.length,
  pairAgreement:distribution(['bothReject','primaryOnly','independentOnly','bothAccept'],pairs,pair =>
    ['bothReject','primaryOnly','independentOnly','bothAccept'][
      Number(pair.primary.grade===8)+2*Number(pair.independent.grade===8)]),byStrategy:{}}
for (const [name,items] of grades) {
  report.byStrategy[name] = Object.fromEntries(['primary','independent','settled'].map(judge =>
    [judge,distribution(labels,items,item=>item[judge])]))
}
writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'})

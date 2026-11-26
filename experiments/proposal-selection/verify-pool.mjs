import {readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {createAnalysisValidator,hasCompleteSource} from '../../lib/check-analysis.mjs'

const [cohort,knowledgeDir] = process.argv.slice(2)
if (!knowledgeDir) throw Error('Usage: verify-pool.mjs COHORT KNOWLEDGE_DIR')
const file=name=>readFileSync(join(cohort,name))
const jsonl=name=>gunzipSync(file(name)).toString().trim().split('\n').map(JSON.parse)
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const exactKey=(id,sop)=>JSON.stringify([id,sop])
const source=jsonl('sources.jsonl.gz')
const pool=jsonl('pool.jsonl.gz')
const sampleBytes=file('sample.json.gz')
const sample=JSON.parse(gunzipSync(sampleBytes))
const timing=JSON.parse(file('pool.jsonl.gz.timing.json'))
if (timing.sampleSha256!==hash(sampleBytes) || pool.length!==source.length || sample.length!==source.length ||
    pool.length!==timing.rows || !source.every(({id,text},i)=>sample[i].id===id && sample[i].text===text)) {
  throw Error('Collector manifest differs from sealed sources')
}
const validate=await createAnalysisValidator({knowledgeDir})
const known=new Set(['base-beam','adapted-beam','adapted-compact','neuro-prolog'])
const eligible=new Set()
const cache=new Map()
let total=0
for (const [i,row] of pool.entries()) {
  if (row.id!==source[i].id||row.text!==source[i].text) throw Error('Literal source differs for '+row.id)
  const ranks=new Map()
  for (const candidate of row.candidates) {
    const {family,rank,sop,eligible:recorded}=candidate
    if (!known.has(family) || rank!==(ranks.get(family)??0)) throw Error('Unexpected family or rank for '+row.id)
    ranks.set(family,rank+1)
    const key=exactKey(row.id,sop)
    if (!cache.has(key)) cache.set(key,hasCompleteSource(validate(row.text,sop)))
    if (recorded!==cache.get(key)) throw Error('Source coverage disagrees on '+row.id)
    if (recorded) eligible.add(key)
    total++
  }
}
if (existsSync(join(cohort,'votes.jsonl.gz'))) {
  const votes=jsonl('votes.jsonl.gz')
  for (const {id,sop,accepted} of votes) {
    if (typeof accepted!=='boolean'||!eligible.delete(exactKey(id,sop))) throw Error('Unexpected/repeated vote for '+id)
  }
  if (eligible.size) throw Error('Missing '+eligible.size+' exact candidate labels')
  console.log('Verified '+votes.length+' verdicts for all eligible exact source-ID/circuit pairs.')
}
console.log('Verified '+total+' source-grounding checks across '+pool.length+' exact inputs.')

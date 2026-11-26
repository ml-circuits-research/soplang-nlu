import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
const [rawFile,proposalsFile,slice,baseline,destination] = process.argv.slice(2)
const read = path => readFileSync(path)
const json = path => JSON.parse(read(path))
const unpack = path => JSON.parse(gunzipSync(read(path)))
const jsonl = path => gunzipSync(read(path)).toString().trim().split('\n').map(JSON.parse)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const indexed = rows => {
  const result = new Map(rows.map(row => [row.id,row]))
  assert.equal(result.size,rows.length)
  return result
}
const sampleBytes = read(join(slice,'sample.json.gz'))
const sample = JSON.parse(gunzipSync(sampleBytes))
assert.equal(sample.length,250)
const raw = indexed(unpack(rawFile))
const predictions = indexed(unpack(proposalsFile))
assert.equal(raw.size,sample.length)
assert.equal(predictions.size,sample.length)
const evidence = indexed(jsonl(join(baseline,'model-evidence.jsonl.gz')))
const official = indexed(jsonl(join(baseline,'spacy-direct.jsonl.gz')))
const verified = sample.map(({id,text}) => {
  const row = predictions.get(id)
  const graphs = raw.get(id)
  assert.equal(row.text,text)
  assert.equal(graphs.text,text)
  const graphSha256 = sha(JSON.stringify(graphs.base))
  const sourceSha256 = sha(text)
  assert.equal(graphSha256,evidence.get(id).graphSha256,'Different greedy dependency graph for '+id)
  assert.equal(sourceSha256,evidence.get(id).sourceSha256)
  const [greedy] = row.candidates
  assert.deepEqual([greedy.sop],official.get(id).candidates,'Different greedy SOP for '+id)
  const remaining = row.candidates.filter(item => item.prob !== null && item.complete)
    .sort((a,b) => b.prob-a.prob).slice(0,2)
  const selected = [...(greedy.complete ? [greedy] : []),...remaining]
  const publicSet = selected.length ? selected : [greedy]
  assert.ok(publicSet.length <= 3)
  assert.equal(new Set(publicSet.map(item => item.sop)).size,publicSet.length)
  return {id,text,graphSha256,sourceSha256,greedyMs:row.greedyMs,beamMs:row.beamMs,greedy,publicSet}
})
mkdirSync(destination,{recursive:true})
writeFileSync(join(destination,'selection.json.gz'),gzipSync(JSON.stringify(verified)))
writeFileSync(join(destination,'sample.json.gz'),sampleBytes)
const environment = json(join(slice,'environment.json'))
assert.equal(environment.sampleSha256,sha(sampleBytes))
const baselineEnvironment = json(join(baseline,'environment.json'))
assert.equal(environment.libraryRevision,baselineEnvironment.libraryRevision)
const {revision,libraryRevision,knowledgeRevision,sampleSha256,seed} = environment
writeFileSync(join(destination,'environment.json'),JSON.stringify({revision,libraryRevision,knowledgeRevision,sampleSha256,seed,
  sample:sample.length,workers:1,strategies:['spacy-direct'],evaluatedSchema:'nlu',model:baselineEnvironment.model,
  experiment:{candidateSelection:'greedy if complete followed by up to two ranked complete alternatives',rawSha256:sha(read(rawFile)),
    candidatesSha256:sha(read(proposalsFile)),greedyVerification:{sop:sample.length,graph:sample.length}}},null,2)+'\n')
const records = verified.map(({id,publicSet,greedyMs,beamMs}) => ({id,evaluatedSchema:'nlu',latencyMs:greedyMs+beamMs,
  candidates:publicSet.map(item => item.sop)}))
writeFileSync(join(destination,'spacy-direct.jsonl.gz'),gzipSync(records.map(JSON.stringify).join('\n')+'\n'))
console.log(JSON.stringify({rows:verified.length,greedyComplete:verified.filter(r => r.greedy.complete).length,
  beamComplete:verified.filter(r => r.publicSet[0].complete).length,candidates:records.reduce((n,r)=>n+r.candidates.length,0),
  alwaysUnique:records.filter(r=>r.candidates.length===1).length}))
const elapsed = records.map(({latencyMs}) => latencyMs).sort((a,b) => a-b)
writeFileSync(join(destination,'spacy-direct.json'),JSON.stringify({requests:elapsed.length,
  sumMs:elapsed.reduce((sum,value) => sum+value,0),medianMs:(elapsed[124]+elapsed[125])/2,
  p95Ms:elapsed[Math.ceil(elapsed.length*0.95)-1],
  timingNote:'Greedy pipeline and beam parsing only. Additional setup, projection and startup excluded.'},null,2)+'\n')
